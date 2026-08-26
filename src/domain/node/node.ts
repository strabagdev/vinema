export type {
  Capture,
  CaptureOrganizationStatus,
  CaptureStatus,
  CaptureType,
} from "@/domain/capture/capture";

import type {
  Capture,
  CaptureOrganizationStatus,
  CaptureStatus,
  CaptureType,
} from "@/domain/capture/capture";

/** @deprecated Use CaptureType. Pending removal after terminology migration. */
export type NodeType = CaptureType;

/** @deprecated Use CaptureStatus. Pending removal after terminology migration. */
export type NodeStatus = CaptureStatus;

/** @deprecated Use CaptureOrganizationStatus. Pending removal after terminology migration. */
export type NodeOrganizationStatus = CaptureOrganizationStatus;

/** @deprecated Use Capture. Pending removal after terminology migration. */
export type Node = Capture;
