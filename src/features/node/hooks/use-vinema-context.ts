"use client";

import { useEffect, useState } from "react";
import type { Device } from "@/domain/device/device";
import type { Workspace } from "@/domain/workspace/workspace";
import { normalizePersistedConceptLabels } from "@/features/associations/concept-label-normalization";
import { useAuth } from "@/features/auth/auth-provider";
import { getOrCreateDevice } from "@/features/device/get-or-create-device";
import {
  contextRepository,
  nodeContextRelationRepository,
  nodeRepository,
  storageAdapter,
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
let cachedVinemaContextKey: string | null = null;
let pendingVinemaContextKey: string | null = null;

export async function resolveAuthenticatedVinemaContext({
  workspaceId,
  deviceId,
}: {
  workspaceId: string;
  deviceId: string;
}): Promise<VinemaContextReady> {
  const key = `${workspaceId}:${deviceId}`;

  if (cachedVinemaContext && cachedVinemaContextKey === key) {
    return cachedVinemaContext;
  }

  if (pendingVinemaContext && pendingVinemaContextKey === key) {
    return pendingVinemaContext;
  }

  pendingVinemaContextKey = key;
  pendingVinemaContext = Promise.all([
    getOrCreateDevice(storageAdapter),
  ])
    .then(async ([localDevice]) => {
      const now = new Date().toISOString();
      const workspace: Workspace = {
        id: workspaceId,
        name: "Personal",
        createdAt: now,
        updatedAt: now,
      };
      const device: Device = {
        ...localDevice,
        id: deviceId,
      };
      const diagnostics = await normalizePersistedConceptLabels({
        workspaceId: workspace.id,
        contextRepository,
        relationRepository: nodeContextRelationRepository,
        nodeRepository,
        storage: storageAdapter,
      });

      reportConceptLabelNormalizationDiagnostics(diagnostics);
      cachedVinemaContext = { device, workspace };
      cachedVinemaContextKey = key;
      return cachedVinemaContext;
    })
    .finally(() => {
      pendingVinemaContext = null;
      pendingVinemaContextKey = null;
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
  const auth = useAuth();
  const [state, setState] = useState<VinemaContextState>({
    status: "loading",
    device: null,
    workspace: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const workspaceId = auth.workspaceId;
    const deviceId = auth.deviceId;

    if (auth.isLoading) {
      queueMicrotask(() => {
        if (!cancelled) {
          setState({ status: "loading", device: null, workspace: null, error: null });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    if (!auth.isAuthenticated || !workspaceId || !deviceId) {
      queueMicrotask(() => {
        if (!cancelled) {
          setState({
            status: "error",
            device: null,
            workspace: null,
            error: "Vinema requiere una sesion autenticada para cargar el contexto local.",
          });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const authenticatedWorkspaceId = workspaceId;
    const authenticatedDeviceId = deviceId;

    async function loadContext() {
      try {
        const { device, workspace } = await resolveAuthenticatedVinemaContext({
          workspaceId: authenticatedWorkspaceId,
          deviceId: authenticatedDeviceId,
        });

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
  }, [auth.deviceId, auth.isAuthenticated, auth.isLoading, auth.workspaceId]);

  return state;
}
