export const CAPTURE_CREATED_EVENT = "vinema:capture-created";
export const FOCUS_CAPTURE_EVENT = "vinema:focus-capture";

export function notifyCaptureCreated() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(CAPTURE_CREATED_EVENT));
}

export function requestFullCaptureFocus() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(FOCUS_CAPTURE_EVENT));
}
