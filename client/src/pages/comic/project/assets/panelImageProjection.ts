export interface PanelImageDisplay {
  status?: string;
  revision?: string;
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  retained?: boolean;
  referenceImages?: Array<{ kind: string; label: string; url: string }>;
}

/** The backend retains one confirmed image during a redraw; edits clear both versions. */
export function readPanelImage(raw: string | null | undefined): PanelImageDisplay {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    if (value.status !== "done" && value.previousImage?.status === "done") {
      return { ...value.previousImage, retained: true };
    }
    return value;
  } catch {
    return {};
  }
}
