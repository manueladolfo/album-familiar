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

export async function saveStoriesToSupabase(stories: Record<string, { chronicle: string; anecdote: string }>) {
  const localActive = typeof window !== "undefined" && localStorage.getItem("family_album_local_mode_active") === "true";
  if (localActive) return;
  try {
    const { data: existing } = await supabase
      .from("albums")
      .select("id")
      .eq("name", "__system_config_stories__")
      .limit(1);

    const configJson = JSON.stringify(stories);
    if (existing && existing.length > 0) {
      await supabase
        .from("albums")
        .update({ cover_url: configJson })
        .eq("id", existing[0].id);
    } else {
      await supabase
        .from("albums")
        .insert({ name: "__system_config_stories__", cover_url: configJson });
    }
  } catch (err) {
    console.error("Error al guardar las historias en Supabase:", err);
  }
}

export async function loadStoriesFromSupabase(): Promise<Record<string, { chronicle: string; anecdote: string }> | null> {
  const localActive = typeof window !== "undefined" && localStorage.getItem("family_album_local_mode_active") === "true";
  if (localActive) return null;
  try {
    const { data } = await supabase
      .from("albums")
      .select("cover_url")
      .eq("name", "__system_config_stories__")
      .limit(1);

    if (data && data.length > 0 && data[0].cover_url) {
      return JSON.parse(data[0].cover_url);
    }
  } catch (err) {
    console.error("Error al cargar las historias de Supabase:", err);
  }
  return null;
}

export interface NotificationItem {
  id: string;
  message: string;
  read: boolean;
  timestamp: string;
  photoName?: string;
}

export async function saveNotificationsToSupabase(notifications: NotificationItem[]) {
  const localActive = typeof window !== "undefined" && localStorage.getItem("family_album_local_mode_active") === "true";
  if (localActive) return;
  try {
    const { data: existing } = await supabase
      .from("albums")
      .select("id")
      .eq("name", "__system_config_notifications__")
      .limit(1);

    const configJson = JSON.stringify(notifications);
    if (existing && existing.length > 0) {
      await supabase
        .from("albums")
        .update({ cover_url: configJson })
        .eq("id", existing[0].id);
    } else {
      await supabase
        .from("albums")
        .insert({ name: "__system_config_notifications__", cover_url: configJson });
    }
  } catch (err) {
    console.error("Error al guardar las notificaciones en Supabase:", err);
  }
}

export async function loadNotificationsFromSupabase(): Promise<NotificationItem[] | null> {
  const localActive = typeof window !== "undefined" && localStorage.getItem("family_album_local_mode_active") === "true";
  if (localActive) return null;
  try {
    const { data } = await supabase
      .from("albums")
      .select("cover_url")
      .eq("name", "__system_config_notifications__")
      .limit(1);

    if (data && data.length > 0 && data[0].cover_url) {
      return JSON.parse(data[0].cover_url);
    }
  } catch (err) {
    console.error("Error al cargar las notificaciones de Supabase:", err);
  }
  return null;
}

export async function syncLocalDataToSupabase() {
  const localActive = typeof window !== "undefined" && localStorage.getItem("family_album_local_mode_active") === "true";
  if (localActive) return;

  console.log("Iniciando sincronización de datos locales a Supabase...");

  try {
    // 1. Sincronizar Rotaciones
    const localRotsJson = localStorage.getItem("family_album_photo_rotations");
    if (localRotsJson) {
      const localRots = JSON.parse(localRotsJson);
      const remoteRots = await loadRotationsFromSupabase() || {};
      const mergedRots = { ...remoteRots, ...localRots };
      await saveRotationsToSupabase(mergedRots);
      localStorage.setItem("family_album_photo_rotations", JSON.stringify(mergedRots));
    }

    // 2. Sincronizar Historias
    const localStoriesJson = localStorage.getItem("family_album_photo_stories");
    if (localStoriesJson) {
      const localStories = JSON.parse(localStoriesJson);
      const remoteStories = await loadStoriesFromSupabase() || {};
      const mergedStories = { ...remoteStories, ...localStories };
      await saveStoriesToSupabase(mergedStories);
      localStorage.setItem("family_album_photo_stories", JSON.stringify(mergedStories));
    }

    // 3. Sincronizar Personas y Tags
    const localPeopleJson = localStorage.getItem("family_album_people");
    const localTagsJson = localStorage.getItem("family_album_person_tags");
    if (localPeopleJson && localTagsJson) {
      const localPeople = JSON.parse(localPeopleJson);
      const localTags = JSON.parse(localTagsJson);

      let remotePeople = [];
      let remoteTags = {};
      const { data: existing } = await supabase
        .from("albums")
        .select("id, cover_url")
        .eq("name", "__system_config__")
        .limit(1);

      if (existing && existing.length > 0 && existing[0].cover_url) {
        const config = JSON.parse(existing[0].cover_url);
        remotePeople = config.people || [];
        remoteTags = config.taggedPhotos || {};
      }

      // Fusionar personas (evitando duplicados por ID)
      const mergedPeople = [...remotePeople];
      localPeople.forEach((lp: any) => {
        if (!mergedPeople.some((rp: any) => rp.id === lp.id)) {
          mergedPeople.push(lp);
        }
      });

      // Fusionar fotos etiquetadas
      const mergedTags: Record<string, string[]> = { ...remoteTags };
      Object.keys(localTags).forEach((personId) => {
        const localList = localTags[personId] || [];
        const remoteList = mergedTags[personId] || [];
        mergedTags[personId] = Array.from(new Set([...remoteList, ...localList]));
      });

      // Guardar de vuelta en Supabase y local
      const configJson = JSON.stringify({ people: mergedPeople, taggedPhotos: mergedTags });
      if (existing && existing.length > 0) {
        await supabase
          .from("albums")
          .update({ cover_url: configJson })
          .eq("id", existing[0].id);
      } else {
        await supabase
          .from("albums")
          .insert({ name: "__system_config__", cover_url: configJson });
      }
      localStorage.setItem("family_album_people", JSON.stringify(mergedPeople));
      localStorage.setItem("family_album_person_tags", JSON.stringify(mergedTags));
    }

    // 4. Sincronizar Notificaciones
    const localNotifsJson = localStorage.getItem("family_album_notifications");
    if (localNotifsJson) {
      const localNotifs = JSON.parse(localNotifsJson);
      const remoteNotifs = await loadNotificationsFromSupabase() || [];
      // Fusionar notificaciones evitando duplicados por ID
      const mergedNotifs = [...remoteNotifs];
      localNotifs.forEach((ln: any) => {
        if (!mergedNotifs.some((rn: any) => rn.id === ln.id)) {
          mergedNotifs.push(ln);
        }
      });
      // Ordenar por fecha descendente
      mergedNotifs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      await saveNotificationsToSupabase(mergedNotifs);
      localStorage.setItem("family_album_notifications", JSON.stringify(mergedNotifs));
    }

    console.log("Sincronización de datos completada con éxito.");
  } catch (err) {
    console.error("Error al sincronizar datos locales a Supabase:", err);
  }
}
