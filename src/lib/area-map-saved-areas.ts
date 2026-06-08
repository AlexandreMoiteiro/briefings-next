import { supabase } from "@/lib/supabase/client";

export type AreaMapPoint = {
  lat: number;
  lon: number;
  label: string;
  raw: string;
};

export type SavedArea = {
  id: string;
  name: string;
  input: string;
  points: AreaMapPoint[];
  createdAt?: string;
  updatedAt?: string;
};

type SupabaseAreaRow = {
  id: string;
  name: string;
  input: string;
  points: AreaMapPoint[] | null;
  created_at?: string;
  updated_at?: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  return supabase;
}

function rowToSavedArea(row: SupabaseAreaRow): SavedArea {
  return {
    id: row.id,
    name: row.name,
    input: row.input,
    points: Array.isArray(row.points) ? row.points : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadSavedAreas(): Promise<SavedArea[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from("area_map_areas")
    .select("id,name,input,points,created_at,updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as SupabaseAreaRow[]).map(rowToSavedArea);
}

export async function createSavedArea(
  name: string,
  input: string,
  points: AreaMapPoint[]
): Promise<SavedArea> {
  const client = requireSupabase();

  const { data, error } = await client
    .from("area_map_areas")
    .insert({
      name: name.trim(),
      input,
      points,
      is_public: true,
    })
    .select("id,name,input,points,created_at,updated_at")
    .single();

  if (error) {
    throw error;
  }

  return rowToSavedArea(data as SupabaseAreaRow);
}

export async function updateSavedArea(
  id: string,
  name: string,
  input: string,
  points: AreaMapPoint[]
): Promise<SavedArea> {
  const client = requireSupabase();

  const { data, error } = await client
    .from("area_map_areas")
    .update({
      name: name.trim(),
      input,
      points,
    })
    .eq("id", id)
    .select("id,name,input,points,created_at,updated_at")
    .single();

  if (error) {
    throw error;
  }

  return rowToSavedArea(data as SupabaseAreaRow);
}

export async function deleteSavedArea(id: string) {
  const client = requireSupabase();

  const { error } = await client.from("area_map_areas").delete().eq("id", id);

  if (error) {
    throw error;
  }
}
