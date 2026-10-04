import type { ChapterReviewResult } from "../../chapterPlanning.shared";

export interface ChapterReviewSource {
  novelId: string;
  chapterId: string;
  content: string | null;
}

export interface BoundChapterReview extends ChapterReviewResult {
  source: ChapterReviewSource;
}

export function bindChapterReview(result: ChapterReviewResult | null | undefined, source: ChapterReviewSource): BoundChapterReview | null {
  return result ? { ...result, source: { ...source } } : null;
}

export function reviewForChapter(review: BoundChapterReview | null, source: ChapterReviewSource): BoundChapterReview | null {
  return review?.source.novelId === source.novelId
    && review.source.chapterId === source.chapterId
    && review.source.content === source.content
    ? review : null;
}
