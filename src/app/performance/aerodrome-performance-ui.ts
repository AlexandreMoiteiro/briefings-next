function sectionByTitle(root: HTMLElement, title: string) {
  const heading = Array.from(root.querySelectorAll("h2")).find(
    (element) => element.textContent?.trim() === title
  );
  return heading?.closest("section") as HTMLElement | null;
}

function roundUp10(value: number) {
  return Math.ceil(Math.max(0, value) / 10) * 10;
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function complianceValues(box: HTMLElement) {
  const paragraphs = Array.from(box.children).filter(
    (element): element is HTMLParagraphElement =>
      element instanceof HTMLParagraphElement
  );
  const title = paragraphs[0]?.textContent?.trim() ?? "";
  const detail = paragraphs[1]?.textContent?.trim() ?? "";
  const label = /^Landing/i.test(title) ? "Landing" : "Takeoff";

  const p2006 = detail.match(
    /(\d+)\s*m\s+with\s+25%\s+margin\s*[·|]\s*(\d+)\s*m\s+available\s*[·|]\s*about\s*(\d+)%/i
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

  return null;
}

function styleCompliance(box: HTMLElement) {
  const values = complianceValues(box);
  if (!values) return false;

  const requiredM = roundUp10(values.requiredM);
  const availableM = Math.round(values.availableM);
  const usedPct = Math.ceil((requiredM / Math.max(1, availableM)) * 100);
  const ok = requiredM <= availableM;
  const paragraphs = Array.from(box.children).filter(
    (element): element is HTMLParagraphElement =>
      element instanceof HTMLParagraphElement
  );
  const title = paragraphs[0] as HTMLElement | undefined;
  const detail = paragraphs[1] as HTMLElement | undefined;

  const boxClass =
    "rounded-xl border border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-700";
  if (box.className !== boxClass) box.className = boxClass;

  if (title) {
    const nextTitle = `${values.label} · ${ok ? "OK" : "NOT OK"}`;
    if (title.textContent !== nextTitle) title.textContent = nextTitle;
    const titleClass = ok
      ? "font-semibold text-emerald-700"
      : "font-semibold text-red-700";
    if (title.className !== titleClass) title.className = titleClass;
  }

  if (detail) {
    const nextDetail = `${formatNumber(requiredM)} m required · ${formatNumber(
      availableM
    )} m available · ${usedPct}% runway`;
    if (detail.textContent !== nextDetail) detail.textContent = nextDetail;
    const detailClass = "mt-1 leading-5 text-zinc-600";
    if (detail.className !== detailClass) detail.className = detailClass;
  }

  box.dataset.aerodromeCompliance = "true";
  return true;
}

function styleCard(card: HTMLElement) {
  const complianceBoxes = Array.from(card.querySelectorAll("div")).filter(
    (element) => styleCompliance(element as HTMLElement)
  ) as HTMLElement[];
  if (complianceBoxes.length === 0) return;

  const cardClass =
    "rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4 transition";
  if (card.className !== cardClass) card.className = cardClass;

  const title = Array.from(card.children).find(
    (element) =>
      element instanceof HTMLParagraphElement &&
      element.classList.contains("font-semibold")
  ) as HTMLElement | undefined;
  if (title) {
    const titleClass = "font-semibold text-zinc-950";
    if (title.className !== titleClass) title.className = titleClass;
  }

  const metadata = Array.from(card.children).find(
    (element) =>
      element instanceof HTMLParagraphElement &&
      element !== title
  ) as HTMLElement | undefined;
  if (metadata) {
    const metadataClass = "mt-1 text-xs leading-5 text-zinc-500";
    if (metadata.className !== metadataClass) metadata.className = metadataClass;
  }

  const parent = complianceBoxes[0]?.parentElement;
  if (parent && complianceBoxes.every((box) => box.parentElement === parent)) {
    const parentClass = "mt-4 grid gap-2 sm:grid-cols-2";
    if (parent.className !== parentClass) parent.className = parentClass;
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
    subtitle.dataset.aerodromePerformanceSummary = "true";
    if (!existing) heading.insertAdjacentElement("afterend", subtitle);
  }

  const subtitleText =
    "Required distance already includes the 25% OM buffer. Values are rounded for quick operational reading.";
  if (subtitle.textContent !== subtitleText) subtitle.textContent = subtitleText;
  const subtitleClass = "mt-1 max-w-3xl text-sm leading-6 text-zinc-500";
  if (subtitle.className !== subtitleClass) subtitle.className = subtitleClass;

  const complianceTitles = Array.from(section.querySelectorAll("p")).filter(
    (element) => /^(Takeoff|Landing):/i.test(element.textContent?.trim() ?? "")
  );
  const cards = new Set<HTMLElement>();
  complianceTitles.forEach((title) => {
    const card = title.closest("div.rounded-2xl") as HTMLElement | null;
    if (card) cards.add(card);
  });
  cards.forEach(styleCard);
}
