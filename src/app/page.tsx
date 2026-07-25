"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { DevicePlatform, type Device } from "@/domain/device/device";
import { getOrCreateDevice } from "@/features/device/get-or-create-device";
import { detectPlatform } from "@/infrastructure/platform/detect-platform";
import { IndexedDbAdapter } from "@/infrastructure/storage/indexed-db-adapter";
import { LocalStorageAdapter } from "@/infrastructure/storage/local-storage-adapter";

export default function Home() {
  const [device, setDevice] = useState<Device | null>(null);
  const [platform, setPlatform] = useState<DevicePlatform>(DevicePlatform.UNKNOWN);
  const [storageLabel, setStorageLabel] = useState("Comprobando");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    async function loadDevice() {
      const hasIndexedDb = "indexedDB" in window;
      const storage = hasIndexedDb
        ? new IndexedDbAdapter()
        : new LocalStorageAdapter();
      const currentPlatform = detectPlatform();

      setStorageLabel(hasIndexedDb ? "IndexedDB" : "localStorage");
      setPlatform(currentPlatform);

      try {
        setDevice(await getOrCreateDevice(storage, currentPlatform));
      } catch {
        const fallbackStorage = new LocalStorageAdapter();
        setStorageLabel("localStorage");
        setDevice(await getOrCreateDevice(fallbackStorage, currentPlatform));
      }
    }

    loadDevice();
  }, []);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-4">
        <Badge variant="secondary">Solo local</Badge>
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-normal text-zinc-950 sm:text-5xl">
            Bienvenido a Vinema
          </h1>
          <p className="text-xl leading-8 text-zinc-600">Tu memoria viva</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatusPanel label="Dispositivo actual" value={device?.name ?? "Creando"} />
        <StatusPanel label="Plataforma detectada" value={platform} />
        <StatusPanel label="Almacenamiento local" value={storageLabel} />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <dl className="grid gap-5 text-sm sm:grid-cols-2">
          <InfoRow label="ID" value={device?.id ?? "Pendiente"} />
          <InfoRow label="Creado" value={formatDate(device?.createdAt)} />
          <InfoRow label="Ultima visita" value={formatDate(device?.lastSeenAt)} />
          <InfoRow label="Modo" value="Offline-first" />
        </dl>
      </div>
    </section>
  );
}

function StatusPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-3 break-words text-lg font-medium text-zinc-950">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-zinc-950">{value}</dd>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return "Pendiente";
  }

  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
