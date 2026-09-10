export const navigationItems = [
  {
    title: "Performance",
    href: "/performance",
    eyebrow: "M&B + Performance",
    group: "workflow",
    description:
      "Calculate Mass & Balance, fuel planning and aerodrome performance for the selected aircraft before building the operational NavLog.",
    details: ["Aircraft-specific data", "MET/runway checks", "Template export"],
  },
  {
    title: "NavLog",
    href: "/navlog",
    eyebrow: "Navigation",
    group: "workflow",
    description:
      "Create the operational navigation log with route building, wind checks, headings, timings, fuel and EFOB.",
    details: ["Wind confirmation", "Saved routes", "Fuel/EFOB review"],
  },
  {
    title: "Briefing",
    href: "/briefing",
    eyebrow: "Final package",
    group: "workflow",
    description:
      "Build the final flight briefing package once Performance and NavLog are ready, then combine weather, NOTAM, FPL and route sections.",
    details: ["Final workflow step", "Ordered sections", "Local PDF generation"],
  },
  {
    title: "Area Map",
    href: "/area-map",
    eyebrow: "NOTAM utility",
    group: "utility",
    description:
      "Plot coordinate areas mentioned in NOTAMs so temporary restrictions and local areas are easier to visualise.",
    details: ["DMS parser", "GeoJSON copy", "Saved areas"],
  },
  {
    title: "Aviation Map",
    href: "/vfr-map",
    eyebrow: "Map utility",
    group: "utility",
    description:
      "Get a general view of Portuguese aviation data: aerodromes, VFR points, IFR fixes, navaids and map overlays.",
    details: ["Portugal overview", "Search points", "Layer control"],
  },
] as const;
