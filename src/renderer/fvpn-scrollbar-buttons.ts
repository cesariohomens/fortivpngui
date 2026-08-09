import type { OverlayScrollbars } from "overlayscrollbars";

const MARK = "data-fvpn-scroll-buttons";
const STEP_PX = 48;

function bindRepeat(btn: HTMLButtonElement, action: () => void): void {
  let timer = 0;
  let delayTimer = 0;
  const stop = () => {
    window.clearInterval(timer);
    window.clearTimeout(delayTimer);
    timer = 0;
    delayTimer = 0;
  };
  const start = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    action();
    delayTimer = window.setTimeout(() => {
      timer = window.setInterval(action, 50);
    }, 400);
  };
  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointerleave", stop);
  btn.addEventListener("pointercancel", stop);
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
  });
}

function mountButtons(
  scrollbar: HTMLElement,
  axis: "x" | "y",
  scrollEl: HTMLElement
): void {
  if (scrollbar.hasAttribute(MARK)) return;
  const track = scrollbar.querySelector(".os-scrollbar-track");
  if (!track) return;
  scrollbar.setAttribute(MARK, "");

  const dec = document.createElement("button");
  const inc = document.createElement("button");
  dec.type = "button";
  inc.type = "button";
  dec.tabIndex = -1;
  inc.tabIndex = -1;
  dec.className = `os-scrollbar-button os-scrollbar-button-${axis === "y" ? "up" : "left"}`;
  inc.className = `os-scrollbar-button os-scrollbar-button-${axis === "y" ? "down" : "right"}`;
  dec.setAttribute("aria-label", axis === "y" ? "Scroll up" : "Scroll left");
  inc.setAttribute("aria-label", axis === "y" ? "Scroll down" : "Scroll right");

  scrollbar.insertBefore(dec, track);
  scrollbar.appendChild(inc);

  const scrollBy = (delta: number) => {
    if (axis === "y") scrollEl.scrollTop += delta;
    else scrollEl.scrollLeft += delta;
  };

  bindRepeat(dec, () => scrollBy(-STEP_PX));
  bindRepeat(inc, () => scrollBy(STEP_PX));
}

/** Inject UP/DOWN (and LEFT/RIGHT) arrow buttons into an OverlayScrollbars instance. */
export function attachFvpnScrollbarButtons(instance: OverlayScrollbars): void {
  const { scrollbarVertical, scrollbarHorizontal, scrollOffsetElement } = instance.elements();
  mountButtons(scrollbarVertical.scrollbar, "y", scrollOffsetElement);
  mountButtons(scrollbarHorizontal.scrollbar, "x", scrollOffsetElement);
}
