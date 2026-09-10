export const navigationItems = [
  {
    title: "Briefing",
    href: "/briefing",
    eyebrow: "Flight package",
    description:
      "Assemble the documents for a flight in one ordered briefing PDF.",
    details: ["Mission", "Weather & NOTAM", "Final PDF"],
  },
  {
    title: "NavLog",
    href: "/navlog",
    eyebrow: "Route planning",
    description:
      "Build a route, apply wind and aircraft data, review fuel and export the NavLog.",
    details: ["Saved routes", "Wind & headings", "Fuel & EFOB"],
  },
  {
    title: "Performance",
    href: "/performance",
    eyebrow: "M&B + performance",
    description:
      "Calculate loading, fuel and runway performance for the selected aircraft.",
    details: ["Mass & balance", "Aerodromes", "PDF export"],
  },
  {
    title: "Area Map",
    href: "/area-map",
    eyebrow: "NOTAM / GAMET",
    description:
      "Turn coordinate descriptions into a map and save or export the affected area.",
    details: ["GAMET coordinates", "Saved areas", "PDF map"],
  },
  {
    title: "Aviation Map",
    href: "/vfr-map",
    eyebrow: "Portugal",
    description:
      "Search aerodromes, VFR points, IFR fixes and navaids on the aviation map.",
    details: ["VFR chart", "Search", "Layers"],
  },
  {
    title: "Feedback",
    href: "/feedback",
    eyebrow: "Suggestions & questions",
    description:
      "Send a suggestion, ask a question or report something that is not working as expected.",
    details: ["Suggestion", "Question", "Problem"],
  },
] as const;
