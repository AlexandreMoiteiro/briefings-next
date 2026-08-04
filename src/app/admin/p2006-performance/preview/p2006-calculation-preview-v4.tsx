"use client";

import { useEffect, useRef } from "react";
import { P2006TCalculationPreview as BaseCalculationPreview } from "./p2006-calculation-preview-v3";

function polishNoCorrectionWording(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>(
      "[data-p2006-engine-wording='true'] p"
    )
    .forEach((paragraph) => {
      const text = paragraph.textContent ?? "";
      const incorrect = " and the no additional corrections are applied.";
      if (!text.includes(incorrect)) return;
      paragraph.textContent = text.replace(
        incorrect,
        ". No additional corrections are applied."
      );
    });
}

export function P2006TCalculationPreview() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    const apply = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        polishNoCorrectionWording(root);
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={rootRef}>
      <BaseCalculationPreview />
    </div>
  );
}
