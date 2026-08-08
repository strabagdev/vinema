import type { Context } from "@/domain/context/context";

export type RecoveryMatchedField = "content" | "context";

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
};
