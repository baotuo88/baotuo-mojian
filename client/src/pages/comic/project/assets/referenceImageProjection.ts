interface ReferenceImageState {
  status: "idle" | "generating" | "done" | "error";
  revision?: string;
  previousImage?: ReferenceImageState;
}

export function parseReferenceImage<T extends ReferenceImageState>(raw: string | null | undefined): T {
  try {
    const state = JSON.parse(raw ?? "null");
    if (state && typeof state === "object" && ["idle", "generating", "done", "error"].includes(state.status)) return state as T;
  } catch { /* Corrupt state has no confirmed image. */ }
  return { status: "idle" } as T;
}

/** A saved attempt is not a browser request lock; only confirmed images can be displayed. */
export function confirmedReferenceImage<T extends ReferenceImageState>(state: T): T | null {
  if (state.status === "done") return state;
  return state.previousImage?.status === "done" ? state.previousImage as T : null;
}

export function referenceImageUrl(base: string, image: ReferenceImageState | null): string {
  return image?.revision ? `${base}?revision=${encodeURIComponent(image.revision)}` : base;
}
