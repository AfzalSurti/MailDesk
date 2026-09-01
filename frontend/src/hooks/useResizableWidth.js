import { useCallback, useEffect, useRef, useState } from "react";

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 360;

/**
 * Drag-to-resize width for a side panel.
 * Width persists in localStorage and is only applied on md+ screens
 * (mobile keeps the panel full-width).
 */
export function useResizableWidth(storageKey = "emailListWidth") {
  const readSaved = () => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (saved >= MIN_WIDTH && saved <= MAX_WIDTH) return saved;
    } catch {
      /* ignore */
    }
    return DEFAULT_WIDTH;
  };

  const [width, setWidth] = useState(readSaved);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 768px)").matches;
  });
  const [resizing, setResizing] = useState(false);
  const panelRef = useRef(null);
  const widthRef = useRef(width);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const clamp = (val) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, val));

  const onResizeStart = useCallback(
    (event) => {
      event.preventDefault();
      setResizing(true);
      const startX = event.clientX;
      const startWidth = panelRef.current
        ? panelRef.current.getBoundingClientRect().width
        : widthRef.current;

      const onMove = (e) => {
        const next = clamp(startWidth + (e.clientX - startX));
        widthRef.current = next;
        setWidth(next);
      };
      const onUp = () => {
        setResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        try {
          localStorage.setItem(storageKey, String(Math.round(widthRef.current)));
        } catch {
          /* ignore */
        }
      };

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [storageKey]
  );

  return { width, isDesktop, resizing, panelRef, onResizeStart };
}
