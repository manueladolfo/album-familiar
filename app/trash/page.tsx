"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";

interface PhotoItem {
  name: string;
  url: string;
  created_at: string | null;
  status: string | null;
}

export default function TrashPage() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("search") || "";
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Cargar fotos eliminadas (status === 'trash')
  const fetchTrashPhotos = async () => {
    try {
      setLoading(true);

      let remotePhotos: PhotoItem[] = [];

      // 1. Intentar obtener archivos del Storage
      try {
        const { data: storageData, error } = await supabase.storage
          .from("family-album")
          .list("thumbnails", {
            limit: 100,
            sortBy: { column: "created_at", order: "desc" },
          });

        if (error) throw error;

        if (storageData) {
          const validFiles = storageData.filter((file) => file.name !== ".emptyFolderPlaceholder");

          // Obtener mapeo de estados remotos
          let dbStatusMappings: Record<string, string> = {};
          try {
            const { data: dbPhotos } = await supabase
              .from("photos")
              .select("id, status")
              .eq("status", "trash");
            if (dbPhotos) {
              dbPhotos.forEach((p) => {
                if (p.status) dbStatusMappings[p.id] = p.status;
              });
            }
          } catch {
            // Ignorar
          }

          const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
          const localStatusMappings = JSON.parse(localStatusMappingsJson);

          const combinedStatusMappings = { ...dbStatusMappings, ...localStatusMappings };

          remotePhotos = validFiles.map((file) => {
            const { data: urlData } = supabase.storage
              .from("family-album")
              .getPublicUrl(`thumbnails/${file.name}`);

            const status = combinedStatusMappings[file.name] || null;

            return {
              name: file.name,
              url: urlData.publicUrl,
              created_at: file.created_at,
              status: status,
            };
          });
        }
      } catch (err) {
        console.warn("Fallo al conectar con Supabase Storage en la papelera. Operando localmente...");
      }

      // 2. Obtener fotos locales sembradas/importadas de LocalStorage
      const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
      const localPhotos: PhotoItem[] = JSON.parse(localPhotosJson);

      const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
      const localStatusMappings = JSON.parse(localStatusMappingsJson);

      const updatedLocalPhotos = localPhotos.map((photo) => ({
        ...photo,
        status: localStatusMappings[photo.name] !== undefined ? localStatusMappings[photo.name] : photo.status,
      }));

      // 3. Combinar
      const allPhotos = [...remotePhotos];
      updatedLocalPhotos.forEach((localPhoto) => {
        if (!allPhotos.some((p) => p.name === localPhoto.name)) {
          allPhotos.push(localPhoto);
        }
      });

      // 4. Filtrar fotos con status === 'trash'
      const trashPhotos = allPhotos
        .filter((photo) => photo.status === "trash")
        .sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });

      setPhotos(trashPhotos);
    } catch (err: any) {
      console.error("Error al cargar fotos de papelera:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrashPhotos();
  }, []);

  // Restaurar una foto
  const restorePhoto = async (photoName: string) => {
    try {
      // 1. Intentar actualizar en base de datos Supabase
      const { error } = await supabase
        .from("photos")
        .update({ status: "active" })
        .eq("id", photoName);

      if (error) throw error;
    } catch {
      console.warn("Fallo al restaurar en base de datos. Usando LocalStorage fallback...");
    } finally {
      // 2. Guardar en LocalStorage como fallback
      const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
      const localStatusMappings = JSON.parse(localStatusMappingsJson);
      localStatusMappings[photoName] = "active";
      localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));

      // 3. Emitir evento global y recargar la vista
      window.dispatchEvent(new CustomEvent("photo-moved"));
      setStatusMessage({ type: "success", text: "Foto restaurada con éxito en la biblioteca." });
      await fetchTrashPhotos();
    }
  };

  // Vaciar papelera (borrado definitivo)
  const emptyTrash = async () => {
    try {
      setDeleting(true);
      setShowConfirmModal(false);
      setStatusMessage(null);

      // Listar rutas de archivos a borrar
      const pathsToDeleteFromStorage: string[] = [];
      const idsToDeleteFromDb: string[] = [];

      photos.forEach((photo) => {
        const nameWithoutWebp = photo.name.replace(/\.webp$/, "");
        
        // Agregar miniatura y original para borrar en Storage
        pathsToDeleteFromStorage.push(`thumbnails/${photo.name}`);
        // Nota: para el original, asumimos que tiene la extension de la subida, pero no la conocemos con certeza.
        // Un truco seguro: borramos `originals/${nameWithoutWebp}` y tambien podemos intentar borrar
        // con las extensiones comunes (.jpg, .jpeg, .png, .webp) para asegurar limpieza completa.
        pathsToDeleteFromStorage.push(`originals/${nameWithoutWebp}.jpg`);
        pathsToDeleteFromStorage.push(`originals/${nameWithoutWebp}.jpeg`);
        pathsToDeleteFromStorage.push(`originals/${nameWithoutWebp}.png`);
        pathsToDeleteFromStorage.push(`originals/${nameWithoutWebp}.webp`);

        idsToDeleteFromDb.push(photo.name);
      });

      // 1. Borrar en Supabase Storage
      const { error: storageError } = await supabase.storage
        .from("family-album")
        .remove(pathsToDeleteFromStorage);

      if (storageError) {
        console.warn("Error al borrar archivos de Storage:", storageError.message);
      }

      // 2. Borrar registros de Supabase Database
      try {
        const { error: dbError } = await supabase
          .from("photos")
          .delete()
          .in("id", idsToDeleteFromDb);
        if (dbError) throw dbError;
      } catch {
        console.warn("Error al borrar de base de datos de Supabase (RLS). Continuando localmente...");
      }

      // 3. Borrar de LocalStorage
      const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
      const localStatusMappings = JSON.parse(localStatusMappingsJson);
      
      const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
      const localAlbumMappings = JSON.parse(localAlbumMappingsJson);

      idsToDeleteFromDb.forEach((id) => {
        delete localStatusMappings[id];
        delete localAlbumMappings[id];
      });

      localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));
      localStorage.setItem("family_album_photo_mappings", JSON.stringify(localAlbumMappings));

      // También borrar del array de fotos locales
      const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
      let localPhotos = JSON.parse(localPhotosJson);
      localPhotos = localPhotos.filter((p: any) => !idsToDeleteFromDb.includes(p.name));
      localStorage.setItem("family_album_local_photos", JSON.stringify(localPhotos));

      setStatusMessage({
        type: "success",
        text: "La papelera ha sido vaciada de forma definitiva.",
      });

      // Notificar cambio
      window.dispatchEvent(new CustomEvent("photo-moved"));
      setPhotos([]);
    } catch (err: any) {
      console.error("Error al vaciar papelera:", err);
      setStatusMessage({
        type: "error",
        text: err.message || "Error al vaciar la papelera.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const filteredPhotos = photos.filter((photo) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const photoName = photo.name.toLowerCase();
    const photoYear = photo.created_at ? new Date(photo.created_at).getFullYear().toString() : "";
    return photoName.includes(query) || photoYear.includes(query);
  });

  return (
    <div className="flex-1 p-8 space-y-8 bg-brand-cream overflow-y-auto">
      {/* Cabecera */}
      <div className="max-w-6xl mx-auto flex items-center justify-between border-b border-brand-navy/10 pb-5 bg-transparent">
        <div className="space-y-1 bg-transparent">
          <h1 className="text-2xl font-light tracking-wide text-brand-navy">
            Papelera
          </h1>
          <p className="text-[11px] text-brand-navy/55 bg-transparent">
            {filteredPhotos.length} {filteredPhotos.length === 1 ? "recuerdo" : "recuerdos"} en la papelera • Se borrarán definitivamente al vaciar.
            {searchQuery && ` (filtrado de un total de ${photos.length})`}
          </p>
        </div>

        {photos.length > 0 && (
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={deleting}
            className="flex items-center gap-2 px-3 py-1.5 border border-red-650 hover:bg-red-50/10 text-red-600 rounded-xs text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Vaciar Papelera
          </button>
        )}
      </div>

      {/* Mensaje de estado */}
      {statusMessage && (
        <div
          className={`max-w-6xl mx-auto p-3.5 rounded-xs border text-xs flex items-center gap-3 ${
            statusMessage.type === "success"
              ? "bg-brand-cream border-green-200 text-green-800"
              : "bg-brand-cream border-red-200 text-red-800"
          }`}
        >
          <span className="flex-1 font-medium">{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="text-brand-navy/40 hover:text-brand-navy/70">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Listado de fotos */}
      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="aspect-square bg-brand-navy/5 rounded-xs border border-brand-navy/5 animate-pulse" />
            ))}
          </div>
        ) : filteredPhotos.length === 0 ? (
          <div className="text-center py-20 bg-brand-cream/40 border border-brand-navy/10 rounded-xs">
            <svg className="w-12 h-12 mx-auto text-brand-navy/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="mt-4 text-xs text-brand-navy/50">
              No se encontraron recuerdos eliminados que coincidan con tu búsqueda.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
            {filteredPhotos.map((photo) => (
              <div
                key={photo.name}
                className="group relative aspect-square bg-brand-cream/50 rounded-xs overflow-hidden border border-brand-navy/10 hover:border-brand-navy transition-all duration-300 select-none"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.name}
                  className="w-full h-full object-cover grayscale opacity-80 border border-brand-navy/5 transition-transform duration-500 group-hover:scale-103"
                  loading="lazy"
                />
                
                {/* Hover overlay con restaurar y desenfoque */}
                <div className="absolute inset-0 bg-brand-navy/85 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-350 flex flex-col justify-between p-4 z-10">
                  <div className="flex justify-end bg-transparent">
                    {/* Botón Restaurar */}
                    <button
                      onClick={() => restorePhoto(photo.name)}
                      className="p-2 border border-brand-cream/20 hover:bg-brand-cream/10 text-brand-cream rounded-xs transition-all cursor-pointer"
                      title="Restaurar a la biblioteca"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="bg-transparent">
                    <p className="text-brand-cream text-xs font-semibold tracking-wider uppercase truncate">
                      {photo.name.split("_").slice(1).join("_").replace(/\.webp$/, "")}
                    </p>
                    <p className="text-brand-cream/70 text-[10px] mt-0.5">
                      {photo.created_at ? new Date(photo.created_at).toLocaleDateString("es-ES") : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de confirmación premium */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-brand-navy/20 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-brand-cream border border-brand-navy/30 rounded-xs p-6 max-w-sm w-full space-y-4 shadow-xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-base font-medium text-brand-navy">
              ¿Vaciar la papelera de fotos?
            </h3>
            <p className="text-xs text-brand-navy/60 leading-relaxed">
              Se eliminarán definitivamente {photos.length} {photos.length === 1 ? "foto" : "fotos"} del almacenamiento. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3 justify-end pt-2 bg-transparent">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-brand-navy/20 hover:bg-brand-navy/5 rounded-xs text-[11px] font-semibold text-brand-navy cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={emptyTrash}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-brand-cream rounded-xs text-[11px] font-semibold cursor-pointer transition-colors"
              >
                Eliminar para siempre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
