export const navigationItems = [
  {
    title: "Briefing",
    href: "/briefing",
    eyebrow: "PDF Builder",
    description:
      "Build a complete flight briefing package with weather, NOTAM, performance, FPL and route sections.",
    details: ["Local PDF generation", "Ordered sections", "File previews"],
  },
  {
    title: "NavLog",
    href: "/navlog",
    eyebrow: "Navigation",
    description:
      "Create an operational navigation log with route building, wind checks, headings, timings, fuel and EFOB.",
    details: ["Wind confirmation", "Saved routes", "Fuel/EFOB review"],
  },
  {
    title: "Performance",
    href: "/performance",
    eyebrow: "M&B + Performance",
    description:
      "Calculate Mass & Balance, fuel planning and aerodrome performance for the selected aircraft.",
    details: ["Aircraft-specific data", "MET/runway checks", "Template export"],
  },
  {
    title: "Area Map",
    href: "/area-map",
    eyebrow: "NOTAM areas",
    description:
      "Plot coordinate areas mentioned in NOTAMs so temporary restrictions and local areas are easier to visualise.",
    details: ["DMS parser", "GeoJSON copy", "Saved areas"],
  },
  {
    title: "Aviation Map",
    href: "/vfr-map",
    eyebrow: "Portugal airspace",
    description:
      "Get a general view of Portuguese aviation data: aerodromes, VFR points, IFR fixes, navaids and map overlays.",
    details: ["Portugal overview", "Search points", "Layer control"],
  },
] as const;
