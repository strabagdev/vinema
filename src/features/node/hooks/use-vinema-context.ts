"use client";

import { useEffect, useState } from "react";
import type { Device } from "@/domain/device/device";
import type { Workspace } from "@/domain/workspace/workspace";
import { normalizePersistedConceptLabels } from "@/features/associations/concept-label-normalization";
import { getOrCreateDevice } from "@/features/device/get-or-create-device";
import { getOrCreateDefaultWorkspace } from "@/features/workspace/get-or-create-default-workspace";
import {
  contextRepository,
  nodeContextRelationRepository,
  nodeRepository,
  storageAdapter,
  workspaceRepository,
} from "@/infrastructure/repositories";

export type VinemaContextState =
  | { status: "loading"; device: null; workspace: null; error: null }
  | { status: "ready"; device: Device; workspace: Workspace; error: null }
  | { status: "error"; device: null; workspace: null; error: string };

type VinemaContextReady = {
  device: Device;
  workspace: Workspace;
};

let cachedVinemaContext: VinemaContextReady | null = null;
let pendingVinemaContext: Promise<VinemaContextReady> | null = null;

async function resolveVinemaContext(): Promise<VinemaContextReady> {
  if (cachedVinemaContext) {
    return cachedVinemaContext;
  }

  pendingVinemaContext ??= Promise.all([
    getOrCreateDevice(storageAdapter),
    getOrCreateDefaultWorkspace(workspaceRepository),
  ])
    .then(async ([device, workspace]) => {
      const diagnostics = await normalizePersistedConceptLabels({
        workspaceId: workspace.id,
        contextRepository,
        relationRepository: nodeContextRelationRepository,
        nodeRepository,
        storage: storageAdapter,
      });

      reportConceptLabelNormalizationDiagnostics(diagnostics);
      cachedVinemaContext = { device, workspace };
      return cachedVinemaContext;
    })
    .finally(() => {
      pendingVinemaContext = null;
    });

  return pendingVinemaContext;
}

function reportConceptLabelNormalizationDiagnostics(diagnostics: unknown) {
  if (
    typeof window === "undefined" ||
    window.sessionStorage.getItem("vinema:association-diagnostics") !== "1"
  ) {
    return;
  }

  console.info("[vinema] concept label normalization", diagnostics);
}

export function useVinemaContext(): VinemaContextState {
  const [state, setState] = useState<VinemaContextState>({
    status: "loading",
    device: null,
    workspace: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      try {
        const { device, workspace } = await resolveVinemaContext();

        if (!cancelled) {
          setState({ status: "ready", device, workspace, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            device: null,
            workspace: null,
            error:
              error instanceof Error
                ? error.message
                : "No se pudo cargar el contexto local.",
          });
        }
      }
    }

    loadContext();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
