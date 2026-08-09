import type { CSSProperties, ReactNode } from "react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { EventListeners, OverlayScrollbars, PartialOptions } from "overlayscrollbars";
import { attachFvpnScrollbarButtons } from "./fvpn-scrollbar-buttons";

const OPTIONS: PartialOptions = {
  overflow: { x: "scroll", y: "scroll" },
  scrollbars: {
    theme: "os-theme-fvpn",
    visibility: "auto",
    autoHide: "never",
    clickScroll: true,
  },
};

const EVENTS: EventListeners = {
  initialized(instance: OverlayScrollbars) {
    attachFvpnScrollbarButtons(instance);
  },
  updated(instance: OverlayScrollbars) {
    // Re-attach if OverlayScrollbars rebuilt the scrollbar DOM.
    attachFvpnScrollbarButtons(instance);
  },
};

export interface FvpnScrollProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** When false, initialize immediately (useful for dialogs that open already overflowing). */
  defer?: boolean;
}

/** Themed OverlayScrollbars host — replaces native GTK/browser scrollbars on Linux Electron. */
export function FvpnScroll({ children, className, style, defer = true }: FvpnScrollProps) {
  return (
    <OverlayScrollbarsComponent
      defer={defer}
      className={className}
      style={style}
      options={OPTIONS}
      events={EVENTS}
    >
      {children}
    </OverlayScrollbarsComponent>
  );
}
