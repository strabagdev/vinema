export enum DevicePlatform {
  WEB = "WEB",
  PWA = "PWA",
  WINDOWS = "WINDOWS",
  LINUX = "LINUX",
  MACOS = "MACOS",
  UNKNOWN = "UNKNOWN",
}

export type Device = {
  id: string;
  name: string;
  platform: DevicePlatform;
  createdAt: string;
  lastSeenAt: string;
};
