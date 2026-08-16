export type SemanticVectorDocument = {
  id: string;
  sourceType?: "capture" | "concept";
  vector: Float32Array;
  metadata?: Record<string, unknown>;
};

export type SemanticVectorMatch = {
  id: string;
  score: number;
  rank: number;
  marginToNext: number | null;
  metadata?: Record<string, unknown>;
};

export class SemanticVectorIndex {
  private readonly documents: SemanticVectorDocument[];

  constructor(documents: SemanticVectorDocument[]) {
    this.documents = documents.filter((document) => document.vector.length > 0);
  }

  search(input: {
    vector: Float32Array;
    topK: number;
    excludeIds?: Set<string>;
    sourceType?: SemanticVectorDocument["sourceType"];
  }): SemanticVectorMatch[] {
    const excludeIds = input.excludeIds ?? new Set<string>();
    const matches = this.documents
      .filter(
        (document) =>
          !excludeIds.has(document.id) &&
          (!input.sourceType || document.sourceType === input.sourceType),
      )
      .map((document) => ({
        id: document.id,
        score: dot(input.vector, document.vector),
        metadata: document.metadata,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return a.id.localeCompare(b.id);
      })
      .slice(0, Math.max(0, input.topK));

    return matches.map((match, index) => ({
      ...match,
      rank: index + 1,
      marginToNext:
        index < matches.length - 1 ? match.score - matches[index + 1].score : null,
    }));
  }
}

export function dot(a: Float32Array, b: Float32Array) {
  const length = Math.min(a.length, b.length);
  let score = 0;

  for (let index = 0; index < length; index += 1) {
    score += a[index] * b[index];
  }

  return score;
}
