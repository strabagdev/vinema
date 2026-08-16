import type { Context } from "@/domain/context/context";

export type RecoveryMatchedField =
  | "content"
  | "context"
  | "concept"
  | "alias"
  | "association"
  | "relationship"
  | "semantic";

export type RecoveryRankCategory =
  | "literal"
  | "canonical-concept"
  | "alias"
  | "explicit-association"
  | "backed-relationship";

export type RecoveryResultContext = Pick<
  Context,
  "id" | "name" | "type"
>;

export type RecoveryResult = {
  nodeId: string;
  preview: string;
  excerpt: string;
  matchedFields: RecoveryMatchedField[];
  contexts: RecoveryResultContext[];
  updatedAt: string;
  score: number;
  rankCategory?: RecoveryRankCategory;
  searchRank?: number;
  semantic?: {
    similarity: number;
    rank: number;
    marginToNext: number | null;
  };
};
