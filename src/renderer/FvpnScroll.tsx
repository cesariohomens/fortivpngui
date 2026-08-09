import type { CSSProperties, ReactNode } from "react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { PartialOptions } from "overlayscrollbars";

const OPTIONS: PartialOptions = {
  overflow: { x: "scroll", y: "scroll" },
  scrollbars: {
    theme: "os-theme-fvpn",
    autoHide: "leave",
    autoHideDelay: 600,
    clickScroll: true,
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
    <OverlayScrollbarsComponent defer={defer} className={className} style={style} options={OPTIONS}>
      {children}
    </OverlayScrollbarsComponent>
  );
}
