export type ModuleStatus = "ready" | "next" | "planned";

export type NavigationItem = {
  title: string;
  href: string;
  eyebrow: string;
  description: string;
  status: ModuleStatus;
  phase: string;
};

export const navigationItems: NavigationItem[] = [
  {
    title: "Briefing Builder",
    href: "/briefing",
    eyebrow: "PDF final",
    description:
      "Monta o briefing operacional com Mission, Weather, NOTAM, Performance, M&B, FPL, Routes e anexos.",
    status: "next",
    phase: "Fase 2",
  },
  {
    title: "NavLog",
    href: "/navlog",
    eyebrow: "VFR / IFR Low",
    description:
      "Vai substituir o NavLog antigo pela versão teste, com defaults restaurados e arquitetura mais limpa.",
    status: "planned",
    phase: "Fase 3",
  },
  {
    title: "Performance & M&B",
    href: "/performance",
    eyebrow: "Tecnam + PA-28",
    description:
      "Página única com seleção de aeronave, respeitando as diferenças entre Tecnam P2008 e PA-28.",
    status: "planned",
    phase: "Fase 4",
  },
  {
    title: "VFR Map",
    href: "/vfr-map",
    eyebrow: "Mapa",
    description:
      "Consulta visual de aeródromos, localidades, VORs, openAIP e futura integração com rotas.",
    status: "planned",
    phase: "Fase 5",
  },
  {
    title: "Tools",
    href: "/tools",
    eyebrow: "Utilitários",
    description:
      "Ferramentas auxiliares como JPG, PDF lado a lado, cartões, duplex e preparação de anexos.",
    status: "planned",
    phase: "Fase 6",
  },
];

export const workflowSteps = [
  "Mission",
  "Weather",
  "NOTAM",
  "Performance & M&B",
  "FPL",
  "Routes",
  "Final PDF",
];
