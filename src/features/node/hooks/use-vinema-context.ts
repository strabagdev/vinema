"use client";

import { useEffect, useState } from "react";
import type { Device } from "@/domain/device/device";
import type { Workspace } from "@/domain/workspace/workspace";
import { getOrCreateDevice } from "@/features/device/get-or-create-device";
import { getOrCreateDefaultWorkspace } from "@/features/workspace/get-or-create-default-workspace";
import {
  storageAdapter,
  workspaceRepository,
} from "@/infrastructure/repositories";

export type VinemaContextState =
  | { status: "loading"; device: null; workspace: null; error: null }
  | { status: "ready"; device: Device; workspace: Workspace; error: null }
  | { status: "error"; device: null; workspace: null; error: string };

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
        const [device, workspace] = await Promise.all([
          getOrCreateDevice(storageAdapter),
          getOrCreateDefaultWorkspace(workspaceRepository),
        ]);

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
