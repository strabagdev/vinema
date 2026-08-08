import { useEffect, useRef, useState } from "react";

export const CANVAS_PROMPT_CATEGORIES = [
  "mixed",
  "capture",
  "reflection",
  "creativity",
  "work",
] as const;

export type CanvasPromptCategory = (typeof CANVAS_PROMPT_CATEGORIES)[number];

export const CANVAS_PROMPTS = {
  capture: [
    "Escribe lo que acaba de aparecer.",
    "Guarda una idea antes de que cambie de forma.",
    "Deja aqui una observacion concreta.",
  ],
  reflection: [
    "Que estas entendiendo distinto ahora?",
    "Que detalle merece volver despues?",
    "Que tension vale la pena mirar con calma?",
  ],
  creativity: [
    "Empieza por la imagen mas viva.",
    "Prueba una asociacion inesperada.",
    "Que posibilidad quiere tomar forma?",
  ],
  work: [
    "Que decision, pendiente o acuerdo necesitas recordar?",
    "Anota el siguiente movimiento claro.",
    "Que informacion operacional no debe perderse?",
  ],
} satisfies Record<Exclude<CanvasPromptCategory, "mixed">, string[]>;

const MIXED_PROMPTS = [
  ...CANVAS_PROMPTS.capture,
  ...CANVAS_PROMPTS.reflection,
  ...CANVAS_PROMPTS.creativity,
  ...CANVAS_PROMPTS.work,
];

export function getCanvasPrompts(category: CanvasPromptCategory) {
  return category === "mixed" ? MIXED_PROMPTS : CANVAS_PROMPTS[category];
}

export function selectCanvasPrompt(
  category: CanvasPromptCategory,
  seed = Date.now(),
) {
  const prompts = getCanvasPrompts(category);
  const index = Math.abs(Math.floor(seed)) % prompts.length;

  return prompts[index];
}

export function useStableCanvasPrompt({
  category,
  content,
}: {
  category: CanvasPromptCategory;
  content: string;
}) {
  const categoryRef = useRef(category);
  const [prompt, setPrompt] = useState(() => selectCanvasPrompt(category));

  useEffect(() => {
    if (content.trim()) {
      return;
    }

    if (categoryRef.current !== category) {
      categoryRef.current = category;
      setPrompt(selectCanvasPrompt(category));
    }
  }, [category, content]);

  return prompt;
}
