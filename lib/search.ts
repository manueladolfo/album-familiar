export interface PhotoItem {
  name: string;
  url: string;
  created_at: string | null;
  album_id?: string | null;
  status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  url_original?: string | null;
  url_thumbnail?: string | null;
}

export interface AlbumItem {
  id: string;
  name: string;
}

export interface PersonProfile {
  id: string;
  name: string;
  avatar?: string;
  isGroup?: boolean;
}

export interface PhotoMetadata {
  tags: string[];
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Filtra las fotos basándose en una consulta de búsqueda que analiza múltiples criterios:
 * Nombre, Año, Álbum, Personas etiquetadas, Meses, Estaciones, Etiquetas IA y Ubicación.
 */
export function filterPhotos(
  photos: PhotoItem[],
  query: string,
  albums: AlbumItem[],
  people: PersonProfile[],
  taggedPhotos: Record<string, string[]>,
  metadata: Record<string, PhotoMetadata>
): PhotoItem[] {
  if (!query) return photos;
  const lowerQuery = query.toLowerCase().trim();

  // 1. Identificar personas cuyo nombre coincida con el query
  const matchingPersonIds = people
    .filter((p) => p.name.toLowerCase().includes(lowerQuery))
    .map((p) => p.id);

  // Mapear qué fotos tienen a esas personas etiquetadas
  const photosWithMatchingPeople = new Set<string>();
  matchingPersonIds.forEach((pId) => {
    const photoNames = taggedPhotos[pId] || [];
    photoNames.forEach((name) => photosWithMatchingPeople.add(name));
  });

  // 2. Comprobar si el query es un mes o una estación
  const months = [
    ["enero"],
    ["febrero"],
    ["marzo"],
    ["abril"],
    ["mayo"],
    ["junio"],
    ["julio"],
    ["agosto"],
    ["septiembre", "setiembre"],
    ["octubre"],
    ["noviembre"],
    ["diciembre"]
  ];

  let targetMonth: number | null = null;
  months.forEach((aliases, index) => {
    if (aliases.some((alias) => lowerQuery.includes(alias))) {
      targetMonth = index;
    }
  });

  let targetSeasons: number[] = [];
  if (lowerQuery.includes("verano")) {
    targetSeasons = [5, 6, 7, 8]; // Junio, Julio, Agosto, Septiembre
  } else if (lowerQuery.includes("otoño")) {
    targetSeasons = [8, 9, 10, 11]; // Septiembre, Octubre, Noviembre, Diciembre
  } else if (lowerQuery.includes("invierno")) {
    targetSeasons = [11, 0, 1, 2]; // Diciembre, Enero, Febrero, Marzo
  } else if (lowerQuery.includes("primavera")) {
    targetSeasons = [2, 3, 4, 5]; // Marzo, Abril, Mayo, Junio
  }

  const isChristmasQuery = lowerQuery.includes("navidad");

  return photos.filter((photo) => {
    // A) Búsqueda básica en nombre del archivo
    const photoName = photo.name.toLowerCase();
    const cleanName = photo.name.split("_").slice(1).join("_").replace(/\.webp$/, "").toLowerCase();
    if (cleanName.includes(lowerQuery) || photoName.includes(lowerQuery)) return true;

    // B) Búsqueda básica en año
    const photoYear = photo.created_at ? new Date(photo.created_at).getFullYear().toString() : "";
    if (photoYear === lowerQuery) return true;

    // C) Búsqueda por álbum asociado
    if (photo.album_id) {
      const album = albums.find((a) => a.id === photo.album_id);
      if (album && album.name.toLowerCase().includes(lowerQuery)) return true;
    }

    // D) Búsqueda por personas etiquetadas
    if (photosWithMatchingPeople.has(photo.name)) return true;

    // E) Búsqueda por mes de creación
    if (photo.created_at && targetMonth !== null) {
      const photoMonth = new Date(photo.created_at).getMonth();
      if (photoMonth === targetMonth) return true;
    }

    // F) Búsqueda por estación del año
    if (photo.created_at && targetSeasons.length > 0) {
      const photoMonth = new Date(photo.created_at).getMonth();
      if (targetSeasons.includes(photoMonth)) return true;
    }

    // G) Búsqueda por Navidad (del 15 al 31 de diciembre)
    if (photo.created_at && isChristmasQuery) {
      const date = new Date(photo.created_at);
      if (date.getMonth() === 11 && date.getDate() >= 15) return true;
    }

    // H) Búsqueda por metadatos de IA (etiquetas y ubicación)
    const photoMeta = metadata[photo.name];
    if (photoMeta) {
      // Buscar en etiquetas generadas por IA
      const hasMatchingTag = photoMeta.tags.some((tag) => tag.toLowerCase().includes(lowerQuery));
      if (hasMatchingTag) return true;

      // Buscar en ubicación geocodificada
      if (photoMeta.location && photoMeta.location.toLowerCase().includes(lowerQuery)) {
        return true;
      }
    }

    return false;
  });
}

/**
 * Llama a la API de Gemini para analizar el contenido visual de la imagen en base64
 * y generar una lista de etiquetas en español.
 */
export async function analyzePhotoWithGemini(
  base64Data: string,
  apiKey: string,
  locationText?: string,
  originalDateStr?: string
): Promise<string[]> {
  try {
    const cleanBase64 = base64Data.split(",")[1] || base64Data;
    
    const formattedDate = originalDateStr ? new Date(originalDateStr).toLocaleDateString("es-ES", { month: "long", year: "numeric" }) : "";
    const promptText = `Eres un asistente experto en análisis visual de fotografías familiares. Se te proporciona una foto tomada en: ${locationText || "Ubicación desconocida"} en la fecha: ${formattedDate || "Fecha de creación desconocida"}.
Analiza la foto y genera exactamente entre 3 y 5 etiquetas cortas en español, separadas por comas, que describan y relacionen EXCLUSIVAMENTE el lugar y la fecha de la foto (por ejemplo, el nombre de la ciudad o país, estación del año, clima aparente, tipo de paisaje o evento local deducible de la fecha o lugar).
PROHIBIDO usar etiquetas genéricas como 'recuerdo', 'familiar', 'foto', 'imagen' o 'momento'. Devuelve ÚNICAMENTE las etiquetas separadas por comas, sin explicaciones.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: promptText
                },
                {
                  inlineData: {
                    mimeType: "image/webp",
                    data: cleanBase64
                  }
                }
              ]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      let errorMsg = response.statusText || `${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData?.error?.message) {
          errorMsg = errorData.error.message;
        } else if (typeof errorData === "string") {
          errorMsg = errorData;
        } else if (errorData) {
          errorMsg = JSON.stringify(errorData);
        }
      } catch {
        // Ignorar fallo al parsear el JSON de error
      }
      throw new Error(`API de Gemini error: ${errorMsg}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // Convertir a array de etiquetas limpias
    const bannedTags = ["recuerdo", "familiar", "foto", "imagen", "momento", "fotografía", "recuerdo familiar", "foto familiar"];
    const tags = text
      .split(",")
      .map((tag: string) => tag.replace(/[.*+?^${}()|[\]\\]/g, "").trim().toLowerCase())
      .filter((tag: string) => tag.length > 1 && !tag.includes("\n") && !bannedTags.includes(tag));
      
    return tags;
  } catch (err) {
    console.error("Error al analizar foto con Gemini:", err);
    return [];
  }
}

/**
 * Consulta el servicio público de OpenStreetMap Nominatim para geocodificar las coordenadas GPS.
 */
export async function getReverseGeocoding(lat: number, lon: number): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=12&addressdetails=1`,
      {
        headers: {
          "User-Agent": "AlbumFamiliar/1.0 (contact@albumfamiliar.com)"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Nominatim error: ${response.statusText}`);
    }

    const data = await response.json();
    const address = data.address;
    if (!address) return "";

    const city = address.city || address.town || address.village || address.suburb || address.county || "";
    const country = address.country || "";
    
    return [city, country].filter(Boolean).join(", ");
  } catch (err) {
    console.error("Error en geocodificación inversa:", err);
    return "";
  }
}
