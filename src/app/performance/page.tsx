import { ModulePlaceholder } from "@/components/module-placeholder";

export default function PerformancePage() {
  return (
    <ModulePlaceholder
      eyebrow="Tecnam + PA-28"
      title="Performance & Mass Balance"
      description="Página única para Tecnam P2008 e Piper PA-28, com seletor de aeronave. A UI será comum, mas a lógica ficará separada porque as unidades, limites, combustível, gráficos e PDFs são diferentes."
      nextStep="Quando migrarmos o PA-28, os gráficos de performance não aparecerão por defeito no PDF final."
    />
  );
}
