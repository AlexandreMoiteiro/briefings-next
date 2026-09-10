"use client";

import { useEffect, useRef, type ReactNode } from "react";

function updateEventLimitCopy(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  nodes.forEach((node) => {
    const current = node.nodeValue ?? "";
    const next = current.replace("Latest 500 events", "Latest 100 events");

    if (next !== current) {
      node.nodeValue = next;
    }
  });
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const apply = () => updateEventLimitCopy(root);
    apply();

    const observer = new MutationObserver(apply);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return <div ref={rootRef}>{children}</div>;
}
