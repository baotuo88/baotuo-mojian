import { randomUUID } from "node:crypto";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { safeJsonParse } from "../utils/json";
import { ttsProviderRegistry } from "./TTSProviderPort";
import { assertCurrentStoryboard, withCurrentShot } from "../revisions";

export type DialogueAudioStatus = "idle" | "generating" | "done" | "error";

export interface DialogueAudioItem {
  lineIndex: number;
  speaker?: string;
  text: string;
  voiceId?: string;
  audioUrl: string;
  durationSec?: number;
  provider: string;
}

export interface DialogueAudioData {
  status: DialogueAudioStatus;
  generationId?: string;
  history?: Array<{ provider?: string; items: DialogueAudioItem[]; generatedAt?: string }>;
  provider?: string;
  items?: DialogueAudioItem[];
  generatedAt?: string;
  error?: string;
}

interface DialogueLine {
  lineIndex: number;
  speaker?: string;
  text: string;
}

interface CharacterVoice {
  name: string;
  voiceId?: string;
  emotion?: string;
  speed?: number;
}

function parseDialogueLines(raw: string | null | undefined): DialogueLine[] {
  return (raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = /^([^:：]{1,32})[:：]\s*(.+)$/.exec(line);
      if (!match) {
        return { lineIndex: index, text: line };
      }
      return {
        lineIndex: index,
        speaker: match[1]?.trim(),
        text: match[2]?.trim() || line,
      };
    })
    .filter((line) => line.text.length > 0);
}

function normalizeKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function readCharacterVoice(character: {
  name: string;
  voiceProfile?: string | null;
}): CharacterVoice {
  const raw = character.voiceProfile;
  if (!raw?.trim()) {
    return { name: character.name };
  }
  const parsed = safeJsonParse<Record<string, unknown> | null>(raw, null);
  if (parsed && typeof parsed === "object") {
    const voiceId = [parsed.voiceId, parsed.voice, parsed.id].find(
      (value) => typeof value === "string" && value.trim(),
    );
    const emotion = typeof parsed.emotion === "string" ? parsed.emotion.trim() : undefined;
    const speed = Number(parsed.speed);
    return {
      name: character.name,
      voiceId: typeof voiceId === "string" ? voiceId.trim() : undefined,
      emotion,
      speed: Number.isFinite(speed) && speed > 0 ? speed : undefined,
    };
  }
  return { name: character.name };
}

function buildVoiceMap(
  characters: Array<{ name: string; voiceProfile?: string | null }>,
): Map<string, CharacterVoice> {
  const map = new Map<string, CharacterVoice>();
  for (const character of characters) {
    const key = normalizeKey(character.name);
    if (key) {
      map.set(key, readCharacterVoice(character));
    }
  }
  return map;
}

export class DramaDialogueAudioService {
  async synthesizeShotDialogue(
    shotId: string,
    requestedProvider?: string,
  ): Promise<DialogueAudioData> {
    const provider =
      requestedProvider?.trim() ||
      ttsProviderRegistry.listProviders().find((item) => item.provider !== "mock")?.provider;
    if (!provider || (provider === "mock" && process.env.NODE_ENV !== "test")) {
      throw new AppError("请先配置并选择可用的配音通道。", 400);
    }
    const adapter = ttsProviderRegistry.resolve(provider);
    const shot = await prisma.dramaShot.findUnique({
      where: { id: shotId },
      include: {
        storyboard: {
          include: {
            project: { include: { characters: true } },
          },
        },
      },
    });
    if (!shot) {
      throw new AppError(`未找到短剧镜头：${shotId}`, 404);
    }

    await assertCurrentStoryboard(shot.storyboardId);
    const lines = parseDialogueLines(shot.dialogue);
    const generationId = randomUUID();
    const existing = safeJsonParse<DialogueAudioData>(shot.dialogueAudioData, { status: "idle" });
    if (existing.status === "generating")
      throw new AppError("本镜头的配音正在生成，请等待结果。", 409);
    let expectedJson = shot.dialogueAudioData;
    const saveState = async (data: DialogueAudioData) => {
      const serialized = JSON.stringify(data);
      await withCurrentShot(shotId, async (tx, current) => {
        if (current.dialogue !== shot.dialogue)
          throw new AppError("镜头对白发生变化，请重新生成配音。", 409);
        const saved = await tx.dramaShot.updateMany({
          where: { id: shotId, dialogueAudioData: expectedJson },
          data: { dialogueAudioData: serialized },
        });
        if (saved.count !== 1) throw new AppError("本镜头的配音任务有变化，请查看最新结果。", 409);
      });
      expectedJson = serialized;
    };
    if (!lines.length) {
      const idleData: DialogueAudioData = { ...existing, status: "idle", provider, generationId };
      await saveState(idleData);
      return idleData;
    }
    await saveState({
      ...existing,
      status: "generating",
      provider,
      generationId,
      error: undefined,
    });
    try {
      const voiceMap = buildVoiceMap(shot.storyboard.project.characters);
      const items: DialogueAudioItem[] = [];
      for (const line of lines) {
        // Do not keep spending on later lines after the script is replaced.
        await assertCurrentStoryboard(shot.storyboardId);
        const voice = line.speaker ? voiceMap.get(normalizeKey(line.speaker) ?? "") : undefined;
        const result = await adapter.synthesize({
          text: line.text,
          voiceId: voice?.voiceId,
          speed: voice?.speed,
          emotion: voice?.emotion,
        });
        items.push({
          lineIndex: line.lineIndex,
          speaker: line.speaker,
          text: line.text,
          voiceId: voice?.voiceId,
          audioUrl: result.audioUrl,
          durationSec: result.durationSec,
          provider,
        });
      }

      const doneData: DialogueAudioData = {
        status: "done",
        provider,
        generationId,
        history: [
          ...(existing.history ?? []),
          ...(existing.items?.length
            ? [
                {
                  provider: existing.provider,
                  items: existing.items,
                  generatedAt: existing.generatedAt,
                },
              ]
            : []),
        ],
        items,
        generatedAt: new Date().toISOString(),
      };
      await saveState(doneData);
      return doneData;
    } catch (error) {
      const errorData: DialogueAudioData = {
        ...existing,
        status: "error",
        provider,
        generationId,
        error: error instanceof Error ? error.message : String(error),
      };
      // A late error must not clear a replacement task or a newer script's data.
      try {
        await saveState(errorData);
      } catch (saveError) {
        if (!(saveError instanceof AppError && saveError.statusCode === 409)) throw saveError;
      }
      throw error;
    }
  }
}

export const dramaDialogueAudioService = new DramaDialogueAudioService();
