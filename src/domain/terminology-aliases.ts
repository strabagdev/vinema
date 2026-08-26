export const PENDING_TERMINOLOGY_ALIASES = [
  {
    legacy: "Node",
    canonical: "Capture",
    location: "@/domain/node/node",
  },
  {
    legacy: "Context",
    canonical: "Concept",
    location: "@/domain/context/context",
  },
  {
    legacy: "NodeContextRelation",
    canonical: "CaptureConceptRelation",
    location: "@/domain/context/node-context-relation",
  },
  {
    legacy: "NodeRepository",
    canonical: "CaptureRepository",
    location: "@/domain/node/node-repository",
  },
  {
    legacy: "ContextRepository",
    canonical: "ConceptRepository",
    location: "@/domain/context/context-repository",
  },
  {
    legacy: "NodeContextRelationRepository",
    canonical: "CaptureConceptRelationRepository",
    location: "@/domain/context/node-context-relation-repository",
  },
] as const;
