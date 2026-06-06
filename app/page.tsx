"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";

interface SamplePhoto {
  id: string;
  name: string;
  title: string;
  url: string;
  albumId: string;
  createdAt: string;
}

const SAMPLE_PHOTOS: SamplePhoto[] = [
  {
    id: "sample_picnic_1988",
    name: "sample_picnic_1988.webp",
    title: "Picnic familiar en la montaña",
    url: "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&auto=format&fit=crop",
    albumId: "d2a60222-92b0-4f81-b51f-d748ad0a7202",
    createdAt: "1988-07-15T14:00:00Z"
  },
  {
    id: "sample_cumpleanos_1991",
    name: "sample_cumpleanos_1991.webp",
    title: "Cumpleaños de la abuela Sofía",
    url: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&auto=format&fit=crop",
    albumId: "d3a60333-92b0-4f81-b51f-d748ad0a7203",
    createdAt: "1991-11-22T18:30:00Z"
  },
  {
    id: "sample_playa_1985",
    name: "sample_playa_1985.webp",
    title: "Vacaciones de verano en la costa",
    url: "https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=800&auto=format&fit=crop",
    albumId: "d1a60111-92b0-4f81-b51f-d748ad0a7201",
    createdAt: "1985-08-05T12:00:00Z"
  },
  {
    id: "sample_boda_1980",
    name: "sample_boda_1980.webp",
    title: "Boda de los padres",
    url: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop",
    albumId: "d2a60222-92b0-4f81-b51f-d748ad0a7202",
    createdAt: "1980-05-18T16:00:00Z"
  },
  {
    id: "sample_navidad_1992",
    name: "sample_navidad_1992.webp",
    title: "Cena de Navidad en casa",
    url: "https://images.unsplash.com/photo-1543257580-7269da773bf5?w=800&auto=format&fit=crop",
    albumId: "d2a60222-92b0-4f81-b51f-d748ad0a7202",
    createdAt: "1992-12-24T21:00:00Z"
  },
  {
    id: "sample_bicicleta_1987",
    name: "sample_bicicleta_1987.webp",
    title: "Paseo dominical en bicicleta",
    url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop",
    albumId: "d1a60111-92b0-4f81-b51f-d748ad0a7201",
    createdAt: "1987-04-12T11:00:00Z"
  }
];

export default function Home() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("search") || "";
  const [statusMessage, setStatusMessage] = useState("Conectando con Supabase...");
  const [importedPhotos, setImportedPhotos] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Inicializar estado de Supabase y fotos importadas
  useEffect(() => {
    try {
      if (supabase) {
        setStatusMessage("Supabase cliente inicializado correctamente.");
      } else {
        setStatusMessage("Supabase no está disponible, operando en modo local.");
      }
    } catch {
      setStatusMessage("Error al inicializar el cliente de Supabase.");
    }

    const loadImported = () => {
      const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
      const localPhotos = JSON.parse(localPhotosJson);
      setImportedPhotos(localPhotos.map((p: any) => p.name));
    };

    loadImported();
    window.addEventListener("photo-moved", loadImported);
    return () => window.removeEventListener("photo-moved", loadImported);
  }, []);

  // Importar una foto específica de ejemplo
  const importPhoto = (photo: SamplePhoto) => {
    try {
      const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
      const localPhotos = JSON.parse(localPhotosJson);

      // Verificar si ya existe
      if (localPhotos.some((p: any) => p.name === photo.name)) {
        setFeedback({ type: "error", text: "Este recuerdo ya ha sido importado a tu biblioteca." });
        return;
      }

      // Añadir a fotos locales
      const newPhoto = {
        name: photo.name,
        url: photo.url,
        created_at: photo.createdAt,
        album_id: photo.albumId,
        status: "active"
      };
      localPhotos.push(newPhoto);
      localStorage.setItem("family_album_local_photos", JSON.stringify(localPhotos));

      // Guardar estados e mappings de álbum locales
      const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
      const localStatusMappings = JSON.parse(localStatusMappingsJson);
      localStatusMappings[photo.name] = "active";
      localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));

      const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
      const localAlbumMappings = JSON.parse(localAlbumMappingsJson);
      localAlbumMappings[photo.name] = photo.albumId;
      localStorage.setItem("family_album_photo_mappings", JSON.stringify(localAlbumMappings));

      setImportedPhotos((prev) => [...prev, photo.name]);
      setFeedback({ type: "success", text: `¡"${photo.title}" importado con éxito a tu biblioteca!` });

      // Notificar cambio
      window.dispatchEvent(new CustomEvent("photo-moved"));
    } catch (error) {
      setFeedback({ type: "error", text: "Error al importar el recuerdo de ejemplo." });
    }
  };

  // Sembrar todos los ejemplos y crear álbumes por defecto
  const seedAllExamples = () => {
    try {
      localStorage.removeItem("family_album_cleared");
      // 1. Crear álbumes locales si no existen
      const defaultAlbums = [
        { id: "d1a60111-92b0-4f81-b51f-d748ad0a7201", name: "Vacaciones" },
        { id: "d2a60222-92b0-4f81-b51f-d748ad0a7202", name: "Familia" },
        { id: "d3a60333-92b0-4f81-b51f-d748ad0a7203", name: "Cumpleaños" }
      ];
      localStorage.setItem("family_album_local_albums", JSON.stringify(defaultAlbums));
      window.dispatchEvent(new CustomEvent("refresh-albums"));

      // 2. Importar todas las fotos
      const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
      const localPhotos = JSON.parse(localPhotosJson);

      const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
      const localStatusMappings = JSON.parse(localStatusMappingsJson);

      const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
      const localAlbumMappings = JSON.parse(localAlbumMappingsJson);

      SAMPLE_PHOTOS.forEach((photo) => {
        if (!localPhotos.some((p: any) => p.name === photo.name)) {
          localPhotos.push({
            name: photo.name,
            url: photo.url,
            created_at: photo.createdAt,
            album_id: photo.albumId,
            status: "active"
          });
        }
        localStatusMappings[photo.name] = "active";
        localAlbumMappings[photo.name] = photo.albumId;
      });

      // Añadir una foto de ejemplo en la papelera para validar la sección
      const trashPhotoName = "sample_trash_photo.webp";
      if (!localPhotos.some((p: any) => p.name === trashPhotoName)) {
        localPhotos.push({
          name: trashPhotoName,
          url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop",
          created_at: "1994-06-05T10:00:00Z",
          album_id: null,
          status: "trash"
        });
      }
      localStatusMappings[trashPhotoName] = "trash";

      localStorage.setItem("family_album_local_photos", JSON.stringify(localPhotos));
      localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));
      localStorage.setItem("family_album_photo_mappings", JSON.stringify(localAlbumMappings));

      setImportedPhotos(SAMPLE_PHOTOS.map((p) => p.name).concat([trashPhotoName]));
      setFeedback({ type: "success", text: "¡Se han sembrado todos los álbumes y recuerdos de ejemplo en todas las secciones!" });

      // Notificar cambios globales
      window.dispatchEvent(new CustomEvent("photo-moved"));
    } catch {
      setFeedback({ type: "error", text: "Error al sembrar los recuerdos familiares de ejemplo." });
    }
  };

  // Limpiar todos los datos sembrados locales
  const clearLocalData = () => {
    try {
      localStorage.removeItem("family_album_local_photos");
      localStorage.removeItem("family_album_photo_statuses");
      localStorage.removeItem("family_album_photo_mappings");
      localStorage.setItem("family_album_cleared", "true");
      setImportedPhotos([]);
      setFeedback({ type: "success", text: "Se han eliminado todos los datos de ejemplo locales de tu biblioteca." });
      window.dispatchEvent(new CustomEvent("photo-moved"));
    } catch {
      setFeedback({ type: "error", text: "Error al limpiar los datos locales." });
    }
  };

  return (
    <div className="flex-1 p-4 md:p-8 space-y-8 md:space-y-12 bg-brand-cream overflow-y-auto max-w-6xl mx-auto w-full">
      {/* Bienvenida y Estado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 bg-transparent border-b border-brand-navy/10 pb-6 md:pb-8">
        <div className="space-y-2 bg-transparent">
          <h1 className="text-2xl md:text-3xl font-light tracking-wide text-brand-navy">Dashboard</h1>
          <p className="text-xs md:text-sm text-brand-navy/60 max-w-md">
            Gestiona la biblioteca de tu memoria familiar. Siembra recuerdos de catálogo para validar los flujos o sube tus propias fotos.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full md:w-auto md:min-w-[280px]">
          <div className="px-4 py-2.5 bg-brand-cream border border-brand-navy/10 rounded-xs flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            <p className="text-[11px] font-medium text-brand-navy/80">{statusMessage}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={seedAllExamples}
              className="flex-1 py-2 px-3 bg-brand-navy text-brand-cream text-xs font-semibold rounded-xs hover:bg-brand-navy/90 transition-all cursor-pointer text-center"
            >
              Sembrar Ejemplos
            </button>
            {importedPhotos.length > 0 && (
              <button
                onClick={clearLocalData}
                className="py-2 px-3 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy text-xs font-medium rounded-xs transition-all cursor-pointer text-center"
                title="Limpiar ejemplos locales"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Retroalimentación */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xs border text-xs flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200 ${
            feedback.type === "success"
              ? "bg-brand-cream border-green-300 text-green-800"
              : "bg-brand-cream border-red-200 text-red-800"
          }`}
        >
          <span className="flex-1 font-medium">{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-brand-navy/40 hover:text-brand-navy/70">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Catálogo de Recuerdos Disponibles */}
      <div className="space-y-6 bg-transparent">
        <div className="space-y-1 bg-transparent">
          <h3 className="text-lg font-medium text-brand-navy tracking-tight">Catálogo de Recuerdos</h3>
          <p className="text-xs text-brand-navy/50">Selecciona e importa imágenes específicas del catálogo a tu biblioteca del álbum.</p>
        </div>

        {(() => {
          const filteredPhotos = SAMPLE_PHOTOS.filter((photo) => {
            if (!searchQuery) return true;
            const query = searchQuery.toLowerCase();
            const matchTitle = photo.title.toLowerCase().includes(query);
            const matchYear = photo.createdAt.split("-")[0].includes(query);
            const matchAlbum = photo.albumId.split("-").slice(2).join(" ").toLowerCase().includes(query);
            const matchName = photo.name.toLowerCase().includes(query);
            return matchTitle || matchYear || matchAlbum || matchName;
          });

          if (filteredPhotos.length === 0) {
            return (
              <div className="text-center py-20 bg-brand-cream/40 border border-brand-navy/10 rounded-xs">
                <svg className="w-12 h-12 mx-auto text-brand-navy/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="mt-4 text-xs text-brand-navy/50">No se encontraron recuerdos en el catálogo que coincidan con tu búsqueda.</p>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {filteredPhotos.map((photo) => {
                const isImported = importedPhotos.includes(photo.name);
                const year = photo.createdAt.split("-")[0];

                return (
                  <div
                    key={photo.id}
                    className="group border border-brand-navy/10 bg-brand-cream/50 rounded-xs overflow-hidden hover:border-brand-navy/30 transition-all duration-300 flex flex-col justify-between"
                  >
                    <div className="aspect-video relative overflow-hidden bg-brand-navy/5">
                      <img
                        src={photo.url}
                        alt={photo.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
                        loading="lazy"
                      />
                      <div className="absolute top-3 right-3 bg-brand-cream/90 backdrop-blur-xs text-brand-navy text-[10px] font-semibold px-2 py-0.5 rounded-xs">
                        {year}
                      </div>
                    </div>

                    <div className="p-4 space-y-4 flex-1 flex flex-col justify-between bg-transparent">
                      <div className="space-y-1 bg-transparent">
                        <h4 className="text-xs font-semibold text-brand-navy/90 tracking-wide uppercase">
                          {photo.title}
                        </h4>
                        <p className="text-[11px] text-brand-navy/50 capitalize bg-transparent">
                          Álbum sugerido: <span className="font-medium text-brand-timber">{photo.albumId.split("-").slice(2).join(" ")}</span>
                        </p>
                      </div>

                      <button
                        disabled={isImported}
                        onClick={() => importPhoto(photo)}
                        className={`w-full py-2 text-[11px] font-semibold rounded-xs border text-center transition-all cursor-pointer ${
                          isImported
                            ? "border-green-300 bg-transparent text-green-700 cursor-not-allowed flex items-center justify-center gap-1.5"
                            : "border-brand-navy text-brand-navy hover:bg-brand-navy hover:text-brand-cream"
                        }`}
                      >
                        {isImported ? (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            Importado
                          </>
                        ) : (
                          "Importar Recuerdo"
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

