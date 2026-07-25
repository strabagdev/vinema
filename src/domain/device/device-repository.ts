import type { Device } from "@/domain/device/device";

export interface DeviceRepository {
  get(): Promise<Device | null>;
  save(device: Device): Promise<void>;
  remove(): Promise<void>;
}
