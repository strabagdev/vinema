import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";

export interface MemoryQuery {
  text: string;
  detectedConceptIds: string[];
  selectedConceptIds: string[];
  now: Date;
}

export interface DeriveMemoryResponseOptions {
  query: MemoryQuery;
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
}
