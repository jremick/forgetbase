import type { SearchResult } from "@forgetbase/schema";

export type ReaderSearchPageResult = {
  result: SearchResult;
  matchCount: number;
};

function compareSearchResults(left: SearchResult, right: SearchResult): number {
  return right.ranking.finalScore - left.ranking.finalScore
    || right.rank - left.rank
    || left.citation.chunkIndex - right.citation.chunkIndex
    || left.chunkId.localeCompare(right.chunkId)
    || left.sourceKind.localeCompare(right.sourceKind);
}

function compareSearchPages(left: ReaderSearchPageResult, right: ReaderSearchPageResult): number {
  return right.result.ranking.finalScore - left.result.ranking.finalScore
    || right.result.rank - left.result.rank
    || left.result.asset.stableId.localeCompare(right.result.asset.stableId);
}

export function groupReaderSearchResults(results: readonly SearchResult[]): ReaderSearchPageResult[] {
  const pages = new Map<string, ReaderSearchPageResult>();

  results.forEach((result) => {
    const stableId = result.asset.stableId;
    const current = pages.get(stableId);

    if (!current) {
      pages.set(stableId, { result, matchCount: 1 });
      return;
    }

    current.matchCount += 1;
    if (compareSearchResults(result, current.result) < 0) {
      current.result = result;
    }
  });

  return [...pages.values()]
    .sort(compareSearchPages);
}
