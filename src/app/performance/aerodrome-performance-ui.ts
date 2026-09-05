function sectionByTitle(root: HTMLElement, title: string) {
  const heading = Array.from(root.querySelectorAll("h2")).find(
    (element) => element.textContent?.trim() === title
  );
  return heading?.closest("section") as HTMLElement | null;
}

type ComplianceValues = {
  label: "Takeoff" | "Landing";
  requiredM: number;
  availableM: number;
};

function round10(value: number) {
  return Math.round(Math.max(0, Number(value || 0)) / 10) * 10;
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function numeric(text: string | undefined) {
  return Number(String(text ?? "").replace(/,/g, ""));
}

function setClass(element: HTMLElement, value: string) {
  if (element.className !== value) element.className = value;
}

function setText(element: HTMLElement | null | undefined, value: string) {
  if (element && element.textContent !== value) element.textContent = value;
}

function setDataset(
  element: HTMLElement,
  key: string,
  value: string
) {
  if (element.dataset[key] !== value) element.dataset[key] = value;
}

function complianceValues(box: HTMLElement): ComplianceValues | null {
  const paragraphs = Array.from(box.children).filter(
    (element): element is HTMLParagraphElement =>
      element instanceof HTMLParagraphElement
  );
  const title = paragraphs[0]?.textContent?.trim() ?? "";
  const detail = paragraphs[1]?.textContent?.trim() ?? "";
  const storedLabel = box.dataset.aerodromeLabel;
  const label: ComplianceValues["label"] =
    storedLabel === "Landing" || /^Landing/i.test(title)
      ? "Landing"
      : "Takeoff";

  const p2006 = detail.match(
    /(\d+)\s*m\s+with\s+25%\s+margin\s*[·|]\s*(\d+)\s*m\s+available/i
  );
  if (p2006) {
    return {
      label,
      requiredM: Number(p2006[1]),
      availableM: Number(p2006[2]),
    };
  }

  const standard = detail.match(
    /POH\s+(\d+)\s*m\s*[·|]\s*125%\s+(\d+)\s*m\s*[·|]\s*available\s+(\d+)\s*m/i
  );
  if (standard) {
    return {
      label,
      requiredM: Number(standard[2]),
      availableM: Number(standard[3]),
    };
  }

  const compact = detail.match(
    /([\d,]+)\s*m\s+required\s*[·|]\s*([\d,]+)\s*m\s+available/i
  );
  if (compact) {
    return {
      label,
      requiredM: numeric(compact[1]),
      availableM: numeric(compact[2]),
    };
  }

  const storedRequired = numeric(box.dataset.aerodromeRequiredM);
  const storedAvailable = numeric(box.dataset.aerodromeAvailableM);
  if (storedRequired > 0 && storedAvailable > 0) {
    return {
      label,
      requiredM: storedRequired,
      availableM: storedAvailable,
    };
  }

  return null;
}

function titleLabel(title: HTMLElement, label: ComplianceValues["label"]) {
  let labelNode = title.querySelector(
    '[data-aerodrome-label-text="true"]'
  ) as HTMLSpanElement | null;
  if (!labelNode) {
    title.textContent = "";
    labelNode = document.createElement("span");
    labelNode.dataset.aerodromeLabelText = "true";
    title.appendChild(labelNode);
  }
  setText(labelNode, label);
}

function statusBadge(title: HTMLElement, ok: boolean) {
  let badge = title.querySelector(
    '[data-aerodrome-status="true"]'
  ) as HTMLSpanElement | null;
  if (!badge) {
    badge = document.createElement("span");
    badge.dataset.aerodromeStatus = "true";
    title.appendChild(badge);
  }
  setText(badge, ok ? "OK" : "NOT OK");
  setClass(
    badge,
    ok
      ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-700"
      : "rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-red-700"
  );
}

function usageBar(box: HTMLElement, usedPct: number, ok: boolean) {
  let wrapper = box.querySelector(
    ':scope > [data-aerodrome-usage="true"]'
  ) as HTMLDivElement | null;
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.dataset.aerodromeUsage = "true";
    wrapper.innerHTML = `
      <div class="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Runway used</span>
        <span data-aerodrome-usage-value="true"></span>
      </div>
      <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div data-aerodrome-usage-bar="true" class="h-full rounded-full"></div>
      </div>`;
    box.appendChild(wrapper);
  }

  const value = wrapper.querySelector(
    '[data-aerodrome-usage-value="true"]'
  ) as HTMLElement | null;
  const bar = wrapper.querySelector(
    '[data-aerodrome-usage-bar="true"]'
  ) as HTMLElement | null;
  setText(value, `${usedPct}%`);

  if (bar) {
    const width = `${Math.min(100, Math.max(0, usedPct))}%`;
    if (bar.style.width !== width) bar.style.width = width;
    setClass(
      bar,
      ok
        ? "h-full rounded-full bg-emerald-500"
        : "h-full rounded-full bg-red-500"
    );
  }
}

function styleCompliance(box: HTMLElement) {
  const values = complianceValues(box);
  if (!values) return false;

  const requiredM = round10(values.requiredM);
  const availableM = Math.round(values.availableM);
  const usedPct = Math.round((requiredM / Math.max(1, availableM)) * 100);
  const ok = requiredM <= availableM;

  setDataset(box, "aerodromeCompliance", "true");
  setDataset(box, "aerodromeLabel", values.label);
  setDataset(box, "aerodromeRequiredM", String(requiredM));
  setDataset(box, "aerodromeAvailableM", String(availableM));
  setClass(
    box,
    "rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700 shadow-sm"
  );

  const paragraphs = Array.from(box.children).filter(
    (element): element is HTMLParagraphElement =>
      element instanceof HTMLParagraphElement
  );
  const title = paragraphs[0] as HTMLElement | undefined;
  const detail = paragraphs[1] as HTMLElement | undefined;

  if (title) {
    setClass(
      title,
      "flex items-center justify-between gap-3 text-sm font-semibold text-zinc-950"
    );
    titleLabel(title, values.label);
    statusBadge(title, ok);
  }

  if (detail) {
    setText(
      detail,
      `${formatNumber(requiredM)} m required · ${formatNumber(
        availableM
      )} m available`
    );
    setClass(detail, "mt-1 leading-5 text-zinc-600");
  }

  usageBar(box, usedPct, ok);
  return true;
}

function styleCard(card: HTMLElement) {
  const complianceBoxes = Array.from(
    card.querySelectorAll<HTMLElement>(
      'div[data-aerodrome-compliance="true"], div'
    )
  ).filter((element) => styleCompliance(element));

  const uniqueBoxes = Array.from(new Set(complianceBoxes));
  if (uniqueBoxes.length === 0) return;

  setDataset(card, "aerodromePerformanceCard", "true");
  setClass(
    card,
    "grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 lg:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.8fr)] lg:items-center"
  );

  const directParagraphs = Array.from(card.children).filter(
    (element): element is HTMLParagraphElement =>
      element instanceof HTMLParagraphElement
  );
  const title = directParagraphs[0] as HTMLElement | undefined;
  const metadata = directParagraphs[1] as HTMLElement | undefined;

  if (title) {
    setClass(
      title,
      "font-semibold text-zinc-950 lg:col-start-1 lg:row-start-1 lg:self-end"
    );
  }
  if (metadata) {
    setClass(
      metadata,
      "text-xs leading-5 text-zinc-500 lg:col-start-1 lg:row-start-2 lg:self-start"
    );
  }

  const parent = uniqueBoxes[0]?.parentElement;
  if (parent && uniqueBoxes.every((box) => box.parentElement === parent)) {
    setClass(
      parent,
      "grid gap-2 sm:grid-cols-2 lg:col-start-2 lg:row-start-1 lg:row-span-2"
    );
  }
}

export function enhanceAerodromePerformance(root: HTMLElement) {
  const section = sectionByTitle(root, "Aerodrome performance");
  if (!section) return;

  const heading = Array.from(section.querySelectorAll("h2")).find(
    (element) => element.textContent?.trim() === "Aerodrome performance"
  );
  if (!heading) return;

  const headingParent = heading.parentElement;
  let subtitle = headingParent?.querySelector(
    ':scope > p[data-aerodrome-performance-summary="true"]'
  ) as HTMLElement | null;

  if (!subtitle) {
    const existing = Array.from(headingParent?.children ?? []).find(
      (element) => element instanceof HTMLParagraphElement
    ) as HTMLElement | undefined;
    subtitle = existing ?? document.createElement("p");
    setDataset(subtitle, "aerodromePerformanceSummary", "true");
    if (!existing) heading.insertAdjacentElement("afterend", subtitle);
  }

  setText(
    subtitle,
    "25% OM buffer already included. Distances are rounded to practical 10 m values."
  );
  setClass(subtitle, "mt-1 max-w-3xl text-sm leading-6 text-zinc-500");

  const cards = new Set<HTMLElement>(
    Array.from(
      section.querySelectorAll<HTMLElement>(
        '[data-aerodrome-performance-card="true"]'
      )
    )
  );

  Array.from(section.querySelectorAll("p"))
    .filter((element) =>
      /^(Takeoff|Landing)(?:\s*[:·]|$)/i.test(
        element.textContent?.trim() ?? ""
      )
    )
    .forEach((title) => {
      const card = title.closest("div.rounded-2xl") as HTMLElement | null;
      if (card) cards.add(card);
    });

  cards.forEach(styleCard);

  const cardArray = Array.from(cards);
  const cardsParent = cardArray[0]?.parentElement;
  if (
    cardsParent &&
    cardArray.length > 0 &&
    cardArray.every((card) => card.parentElement === cardsParent)
  ) {
    setClass(cardsParent, "grid gap-3");
  }
}
