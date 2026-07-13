"use client";

import { useEffect, useRef, useState } from "react";
import { ensureBundledP2006Form } from "../p2006-form-storage";
import { P2006TCalculationPreview as BaseCalculationPreview } from "./p2006-calculation-preview";

function performanceSection(root: HTMLElement) {
  const heading = Array.from(root.querySelectorAll<HTMLHeadingElement>("h3")).find(
    (candidate) => candidate.textContent?.trim() === "Performance calculation"
  );
  return heading?.closest<HTMLElement>("section") ?? null;
}

/**
 * Applies visual-only refinements. It deliberately never removes, replaces or
 * reorders React-owned nodes; doing so caused React reconciliation to crash
 * when the selected performance table changed.
 */
function polishPreview(root: HTMLElement) {
  root
    .querySelectorAll<HTMLDivElement>(
      "div.pointer-events-none.absolute.bottom-3.left-3"
    )
    .forEach((summary) => {
      summary.style.display = "none";
    });

  root.querySelectorAll<SVGTextElement>("svg text").forEach((label) => {
    if (!/^Max\s+\d+\s+kg$/i.test(label.textContent?.trim() ?? "")) return;
    label.style.display = "none";
    const preceding = label.previousElementSibling;
    if (preceding?.tagName.toLowerCase() === "rect") {
      (preceding as SVGRectElement).style.display = "none";
    }
  });

  root.querySelectorAll<SVGGElement>("svg g").forEach((group) => {
    const label = group.querySelector<SVGTextElement>(":scope > text");
    if (!label || !/^[1-4]$/.test(label.textContent?.trim() ?? "")) return;
    label.style.display = "none";
    group
      .querySelector<SVGCircleElement>(":scope > circle")
      ?.style.setProperty("display", "none");
  });

  root
    .querySelectorAll<SVGLineElement>("svg line[marker-end]")
    .forEach((line) => line.style.setProperty("display", "none"));

  performanceSection(root)
    ?.querySelectorAll<SVGCircleElement>("svg circle")
    .forEach((circle) => {
      const fill = circle.getAttribute("fill") ?? "";
      if (/rgb\(22\s+163\s+74\)|#16a34a/i.test(fill)) {
        circle.style.setProperty("display", "none");
      }
    });
}

export function P2006TCalculationPreview() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [formWarning, setFormWarning] = useState("");

  useEffect(() => {
    let cancelled = false;

    void ensureBundledP2006Form()
      .catch((error) => {
        console.warn("Unable to prepare bundled P2006T form pages", error);
        if (!cancelled) {
          setFormWarning(
            "The bundled form background could not be cached. The calculation preview remains available."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    const apply = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        polishPreview(root);
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    root.addEventListener("input", apply);
    root.addEventListener("change", apply);
    root.addEventListener("click", apply);

    return () => {
      observer.disconnect();
      root.removeEventListener("input", apply);
      root.removeEventListener("change", apply);
      root.removeEventListener("click", apply);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ready]);

  return (
    <div ref={rootRef}>
      {!ready ? (
        <div className="rounded-3xl border border-sky-200 bg-sky-50 p-5 text-sm font-semibold text-sky-900">
          Preparing the official P2006T form background…
        </div>
      ) : (
        <>
          {formWarning ? (
            <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              {formWarning}
            </p>
          ) : null}
          <BaseCalculationPreview />
        </>
      )}
    </div>
  );
}
