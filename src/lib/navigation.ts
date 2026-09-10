export const navigationItems = [
  {
    title: "Briefing",
    href: "/briefing",
    eyebrow: "Flight package",
    description: "Assemble mission, weather, NOTAM, performance, FPL and route documents into one PDF.",
    details: ["Mission", "Weather & NOTAM", "Final PDF"],
  },
  {
    title: "NavLog",
    href: "/navlog",
    eyebrow: "Route planning",
    description: "Build or reuse a route, apply aircraft and wind data, review fuel and export the NavLog.",
    details: ["Saved routes", "Wind & headings", "Fuel & EFOB"],
  },
  {
    title: "Performance",
    href: "/performance",
    eyebrow: "M&B + performance",
    description: "Calculate loading, fuel and runway performance for the selected aircraft.",
    details: ["Mass & balance", "Aerodromes", "PDF export"],
  },
  {
    title: "Area Map",
    href: "/area-map",
    eyebrow: "NOTAM / GAMET",
    description: "Plot coordinate areas, choose what is visible and export the map.",
    details: ["GAMET coordinates", "Saved areas", "PDF map"],
  },
  {
    title: "Aviation Map",
    href: "/vfr-map",
    eyebrow: "Portugal",
    description: "Search aerodromes, VFR points, IFR fixes and navaids on the aviation map.",
    details: ["VFR chart", "Search", "Layers"],
  },
] as const;
