import { ModulePlaceholder } from "@/components/module-placeholder";

export default function VfrMapPage() {
  return (
    <ModulePlaceholder
      eyebrow="Mapa"
      title="VFR Map"
      description="Página para consulta visual de aeródromos, localidades, VORs, openAIP e futuramente rotas do NavLog."
      nextStep="Mais tarde vamos decidir se o mapa fica totalmente no frontend ou se parte dos dados passa por Supabase/API."
    />
  );
}
