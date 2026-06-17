import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno de Supabase en .env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const ADMIN_EMAILS = [
  "manueliphone09@gmail.com",
  "pau@albumfamiliar.com",
  "manu@albumfamiliar.com",
  "mama@albumfamiliar.com"
];

export function isUserAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export async function saveRotationsToSupabase(rotations: Record<string, number>) {
  const localActive = typeof window !== "undefined" && localStorage.getItem("family_album_local_mode_active") === "true";
  if (localActive) return;
  try {
    const { data: existing } = await supabase
      .from("albums")
      .select("id")
      .eq("name", "__system_config_rotations__")
      .limit(1);

    const configJson = JSON.stringify(rotations);
    if (existing && existing.length > 0) {
      await supabase
        .from("albums")
        .update({ cover_url: configJson })
        .eq("id", existing[0].id);
    } else {
      await supabase
        .from("albums")
        .insert({ name: "__system_config_rotations__", cover_url: configJson });
    }
  } catch (err) {
    console.error("Error al guardar las rotaciones en Supabase:", err);
  }
}

export async function loadRotationsFromSupabase(): Promise<Record<string, number> | null> {
  const localActive = typeof window !== "undefined" && localStorage.getItem("family_album_local_mode_active") === "true";
  if (localActive) return null;
  try {
    const { data } = await supabase
      .from("albums")
      .select("cover_url")
      .eq("name", "__system_config_rotations__")
      .limit(1);

    if (data && data.length > 0 && data[0].cover_url) {
      return JSON.parse(data[0].cover_url);
    }
  } catch (err) {
    console.error("Error al cargar las rotaciones de Supabase:", err);
  }
  return null;
}
