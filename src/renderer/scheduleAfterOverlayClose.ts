/**
 * Electron + MUI: closing a `Menu` / `Popover` in the same synchronous turn as opening
 * a `Dialog` (or focusing an input inside it) often leaves inputs non-interactive.
 * Always defer that handoff by at least one frame.
 */
export const OVERLAY_FOCUS_HANDOFF_MS = 50;

export function scheduleAfterOverlayClose(fn: () => void, delayMs: number = OVERLAY_FOCUS_HANDOFF_MS): number {
  return window.setTimeout(fn, delayMs);
}
