import type { NodeOrganizationStatus } from "@/domain/node/node";

export const CONTENT_MAX_LENGTH = 100_000;

export type EditableNodeInput = {
  content: string;
  organizationStatus: NodeOrganizationStatus;
};

export function validateEditableNode(input: EditableNodeInput) {
  const content = input.content;

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new Error("El contenido es demasiado largo.");
  }

  if (content.trim().length === 0) {
    throw new Error("Escribe contenido antes de guardar.");
  }

  if (
    input.organizationStatus === "ORGANIZED" &&
    content.trim().length === 0
  ) {
    throw new Error("Una captura necesita contenido.");
  }

  return {
    content,
  };
}
