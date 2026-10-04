export interface ChapterDraftRecord {
  content: string;
  baseContent?: string | null;
}

export interface ChapterSaveState {
  draft: string;
  savedContent: string | null;
  status: "idle" | "saving" | "saved" | "error";
  dirty: boolean;
  error: string | null;
  remoteContent: string | null | undefined;
}

interface ChapterSavePorts {
  content: string | null;
  cachedDraft?: ChapterDraftRecord | null;
  normalize: (content: string) => string;
  write: (content: string, expectedContent: string | null) => Promise<string | null>;
  persist: (draft: ChapterDraftRecord | null) => void;
}

/** One chapter's editor session. Every save, including explicit saves, uses one queue. */
export class ChapterSaveSession {
  private ports: ChapterSavePorts;
  private state: ChapterSaveState;
  private listeners = new Set<() => void>();
  private pending: string | undefined;
  private running: Promise<void> | null = null;

  constructor(ports: ChapterSavePorts) {
    this.ports = ports;
    const draft = ports.cachedDraft?.content ?? ports.normalize(ports.content ?? "");
    const conflict = ports.cachedDraft != null && draft !== ports.normalize(ports.content ?? "") && ports.cachedDraft.baseContent !== ports.content;
    this.state = {
      draft,
      savedContent: conflict ? ports.cachedDraft?.baseContent ?? null : ports.content,
      status: conflict ? "error" : "idle",
      dirty: draft !== ports.normalize(ports.content ?? ""),
      error: conflict ? "服务器正文与草稿底稿不同，请核对后选择要保留的版本。" : null,
      remoteContent: conflict ? ports.content : undefined,
    };
  }

  getSnapshot = (): ChapterSaveState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<ChapterSaveState>): void {
    const next = { ...this.state, ...patch };
    next.dirty = next.draft !== this.ports.normalize(next.savedContent ?? "");
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  private persist(): void {
    this.ports.persist(this.state.dirty
      ? { content: this.state.draft, baseContent: this.state.savedContent }
      : null);
  }

  setDraft(content: string): void {
    this.update({ draft: content, status: this.running ? "saving" : this.state.remoteContent !== undefined ? "error" : "idle" });
    this.persist();
  }

  receiveServer(content: string | null): void {
    if (content === this.state.savedContent) return;
    if (this.running || this.state.dirty || this.state.remoteContent !== undefined) {
      this.update({ remoteContent: content, status: "error", error: "章节正文已在其他位置更新，草稿已保留。" });
      return;
    }
    this.update({ savedContent: content, draft: this.ports.normalize(content ?? ""), status: "idle", error: null });
    this.persist();
  }

  /** Call only after the user chooses the local draft and the remote draft is backed up. */
  keepLocalVersion(backedUpContent: string | null): Promise<void> {
    if (this.state.remoteContent === undefined) return this.save();
    if (this.state.remoteContent !== backedUpContent) {
      return Promise.reject(new Error("服务器正文在备份期间发生了变化，请重新核对后保存。"));
    }
    this.update({ savedContent: this.state.remoteContent, remoteContent: undefined, error: null, status: "idle" });
    this.persist();
    return this.save();
  }

  save(): Promise<void> {
    if (this.state.remoteContent !== undefined) return Promise.reject(new Error(this.state.error ?? "请先核对正文版本。"));
    this.pending = this.state.draft;
    if (this.running) return this.running;
    this.running = this.drain().finally(() => { this.running = null; });
    return this.running;
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending !== undefined) {
        const content = this.pending;
        this.pending = undefined;
        if (content === this.ports.normalize(this.state.savedContent ?? "")) continue;
        const expected = this.state.savedContent;
        this.update({ status: "saving", error: null });
        const savedContent = await this.ports.write(content, expected);
        // A refetch may observe this same successful save before its response arrives.
        const remoteContent = this.state.remoteContent === savedContent ? undefined : this.state.remoteContent;
        this.update({ savedContent, remoteContent, status: remoteContent !== undefined ? "error" : this.state.draft === this.ports.normalize(savedContent ?? "") ? "saved" : "idle" });
        this.persist();
        if (remoteContent !== undefined) throw new Error("服务器正文已更新，请核对后再保存。");
      }
    } catch (error) {
      this.pending = undefined;
      this.update({ status: "error", error: error instanceof Error ? error.message : "章节保存失败，草稿已保留。" });
      this.persist();
      throw error;
    }
  }
}
