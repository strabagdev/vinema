import type { NodeOrganizationStatus } from "@/domain/node/node";

export const TITLE_MAX_LENGTH = 200;
export const CONTENT_MAX_LENGTH = 100_000;

export type EditableNodeInput = {
  title: string;
  content: string;
  organizationStatus: NodeOrganizationStatus;
};

export function validateEditableNode(input: EditableNodeInput) {
  const title = input.title.trim();
  const content = input.content;

  if (title.length > TITLE_MAX_LENGTH) {
    throw new Error("El titulo no puede superar 200 caracteres.");
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new Error("El contenido es demasiado largo.");
  }

  if (title.length === 0 && content.trim().length === 0) {
    throw new Error("Escribe un titulo o contenido antes de guardar.");
  }

  if (
    input.organizationStatus === "ORGANIZED" &&
    title.length === 0 &&
    content.trim().length === 0
  ) {
    throw new Error("Una nota necesita titulo o contenido.");
  }

  return {
    title,
    content,
  };
}
