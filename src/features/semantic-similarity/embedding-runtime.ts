import {
  SEMANTIC_EMBEDDING_DIMENSIONS,
  SEMANTIC_EMBEDDING_MODEL_ID,
  SEMANTIC_EMBEDDING_MODEL_VERSION,
  SEMANTIC_EMBEDDING_RUNTIME_MODEL_ID,
  type EmbeddingRuntime,
  type EmbeddingRuntimeMetadata,
  type EmbeddingUsage,
} from "@/features/semantic-similarity/embedding-types";
import { applyE5Prefix } from "@/features/semantic-similarity/embedding-text";

type FeatureExtractionPipeline = (
  text: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<unknown>;

type TransformersModule = {
  pipeline: (
    task: "feature-extraction",
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<FeatureExtractionPipeline>;
};

export class EmbeddingRuntimeUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "EmbeddingRuntimeUnavailableError";
    this.cause = options?.cause;
  }
}

export class TransformersEmbeddingRuntime implements EmbeddingRuntime {
  readonly metadata: EmbeddingRuntimeMetadata = {
    modelId: SEMANTIC_EMBEDDING_MODEL_ID,
    modelVersion: SEMANTIC_EMBEDDING_MODEL_VERSION,
    dimensions: SEMANTIC_EMBEDDING_DIMENSIONS,
  };

  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  async embed(text: string, usage: EmbeddingUsage): Promise<Float32Array> {
    const pipeline = await this.getPipeline();
    const output = await pipeline(applyE5Prefix(text, usage), {
      pooling: "mean",
      normalize: true,
    });
    const vector = extractVector(output);

    if (vector.length === 0) {
      throw new EmbeddingRuntimeUnavailableError(
        "El runtime semantico no devolvio un vector.",
      );
    }

    return normalizeVector(vector);
  }

  private getPipeline() {
    this.pipelinePromise ??= import("@huggingface/transformers")
      .then((module) =>
        (module as TransformersModule).pipeline(
          "feature-extraction",
          SEMANTIC_EMBEDDING_RUNTIME_MODEL_ID,
          {
            dtype: "q8",
          },
        ),
      )
      .catch((error: unknown) => {
        this.pipelinePromise = null;
        throw new EmbeddingRuntimeUnavailableError(
          "No se pudo inicializar el runtime local de embeddings.",
          { cause: error },
        );
      });

    return this.pipelinePromise;
  }
}

export function createTransformersEmbeddingRuntime(): EmbeddingRuntime {
  return new TransformersEmbeddingRuntime();
}

export function normalizeVector(vector: Float32Array) {
  let magnitude = 0;

  for (const value of vector) {
    magnitude += value * value;
  }

  const norm = Math.sqrt(magnitude);

  if (norm === 0 || !Number.isFinite(norm)) {
    return new Float32Array(vector);
  }

  const normalized = new Float32Array(vector.length);

  for (let index = 0; index < vector.length; index += 1) {
    normalized[index] = vector[index] / norm;
  }

  return normalized;
}

function extractVector(output: unknown): Float32Array {
  if (output instanceof Float32Array) {
    return output;
  }

  if (Array.isArray(output) && output.every((value) => typeof value === "number")) {
    return new Float32Array(output);
  }

  if (
    typeof output === "object" &&
    output !== null &&
    "data" in output &&
    (output as { data: unknown }).data instanceof Float32Array
  ) {
    return (output as { data: Float32Array }).data;
  }

  if (
    typeof output === "object" &&
    output !== null &&
    "tolist" in output &&
    typeof (output as { tolist: unknown }).tolist === "function"
  ) {
    const values = (output as { tolist: () => unknown }).tolist();
    return flattenNumbers(values);
  }

  return new Float32Array();
}

function flattenNumbers(value: unknown): Float32Array {
  const numbers: number[] = [];

  function visit(item: unknown) {
    if (typeof item === "number") {
      numbers.push(item);
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(visit);
    }
  }

  visit(value);

  return new Float32Array(numbers);
}
