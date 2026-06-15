"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/uuid";
import { useSearchParams } from "next/navigation";
import { filterPhotos, PersonProfile, PhotoMetadata, PhotoItem } from "@/lib/search";

export default function TrashPage() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("search") || "";
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [showConfirmDeleteSelectedModal, setShowConfirmDeleteSelectedModal] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [rotations, setRotations] = useState<Record<string, number>>({});
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [activeLightboxPhoto, setActiveLightboxPhoto] = useState<{ url: string; name: string } | null>(null);

  // Estado y refs para pulsación larga (long press) en móviles
  const [activeActionMenuPhoto, setActiveActionMenuPhoto] = useState<string | null>(null);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef<boolean>(false);

  const handleTouchStart = (photoName: string) => {
    isLongPressRef.current = false;
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    
    touchTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setActiveActionMenuPhoto(photoName);
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500); // 500ms
  };

  const handleTouchMove = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
    if (isLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const toggleSelectPhoto = (photoName: string) => {
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(photoName)) {
        next.delete(photoName);
      } else {
        next.add(photoName);
      }
      return next;
    });
  };

  // Estados para Búsqueda Inteligente e IA
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [taggedPhotos, setTaggedPhotos] = useState<Record<string, string[]>>({});
  const [photoMetadata, setPhotoMetadata] = useState<Record<string, PhotoMetadata>>({});

  // Cargar fotos eliminadas (status === 'trash')
  const fetchTrashPhotos = async () => {
    try {
      setLoading(true);
      const localActive = localStorage.getItem("family_album_local_mode_active") === "true";
      let allPhotos: PhotoItem[] = [];

      if (!localActive) {
        // --- MODO ONLINE: Solo Supabase ---
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

            let dbStatusMappings: Record<string, string> = {};
            const { data: dbPhotos } = await supabase
              .from("photos")
              .select("id, status")
              .eq("status", "trash");
            if (dbPhotos) {
              dbPhotos.forEach((p) => {
                if (p.status) dbStatusMappings[p.id] = p.status;
              });
            }

            allPhotos = validFiles.map((file) => {
              const { data: urlData } = supabase.storage
                .from("family-album")
                .getPublicUrl(`thumbnails/${file.name}`);

              const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
              const cleanPhotoId = nameWithoutExt.split(".")[0];
              const photoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : file.name;

              const status = dbStatusMappings[photoId] || null;

              return {
                name: file.name,
                url: urlData.publicUrl,
                created_at: file.created_at,
                status: status,
              };
            });
          }
        } catch (err) {
          console.error("Fallo al conectar con Supabase en la papelera:", err);
          return;
        }
      } else {
        // --- MODO LOCAL ---
        const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
        const localPhotos: PhotoItem[] = JSON.parse(localPhotosJson);

        const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
        const localStatusMappings = JSON.parse(localStatusMappingsJson);

        allPhotos = localPhotos.map((photo) => ({
          ...photo,
          status: localStatusMappings[photo.name] !== undefined ? localStatusMappings[photo.name] : photo.status,
        }));
      }

      // Filtrar fotos con status === 'trash'
      const trashPhotos = allPhotos
        .filter((photo) => photo.status === "trash")
        .sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });

      const peopleJson = localStorage.getItem("family_album_people") || "[]";
      setPeople(JSON.parse(peopleJson));

      const taggedJson = localStorage.getItem("family_album_person_tags") || "{}";
      setTaggedPhotos(JSON.parse(taggedJson));

      const metadataJson = localStorage.getItem("family_album_photo_metadata") || "{}";
      setPhotoMetadata(JSON.parse(metadataJson));

      const savedRotations = localStorage.getItem("family_album_photo_rotations");
      if (savedRotations) {
        setRotations(JSON.parse(savedRotations));
      }

      setPhotos(trashPhotos);
    } catch (err: any) {
      console.error("Error al cargar fotos de papelera:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrashPhotos();

    window.addEventListener("local-mode-changed", fetchTrashPhotos);
    return () => {
      window.removeEventListener("local-mode-changed", fetchTrashPhotos);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;
      if (target && !target.closest("[data-photo-card]")) {
        setActiveActionMenuPhoto(null);
      }
    };
    document.addEventListener("click", handleClickOutside as any);
    document.addEventListener("touchstart", handleClickOutside as any);
    return () => {
      document.removeEventListener("click", handleClickOutside as any);
      document.removeEventListener("touchstart", handleClickOutside as any);
    };
  }, []);

  // Restaurar una foto
  const restorePhoto = async (photoName: string) => {
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

    if (!localActive) {
      try {
        const nameWithoutExt = photoName.replace(/\.[^/.]+$/, "");
        const cleanPhotoId = nameWithoutExt.split(".")[0];
        const photoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : photoName;

        if (isValidUUID(photoId)) {
          const { error } = await supabase
            .from("photos")
            .update({ status: "active" })
            .eq("id", photoId);

          if (error) throw error;
          console.log("Foto restaurada en Supabase correctamente:", photoId);
        }

        window.dispatchEvent(new CustomEvent("photo-moved"));
        setStatusMessage({ type: "success", text: "Foto restaurada con éxito en la biblioteca." });
        await fetchTrashPhotos();
      } catch (err) {
        console.error("Fallo al restaurar en Supabase:", err);
      }
    } else {
      const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
      const localStatusMappings = JSON.parse(localStatusMappingsJson);
      localStatusMappings[photoName] = "active";
      localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));

      window.dispatchEvent(new CustomEvent("photo-moved"));
      setStatusMessage({ type: "success", text: "Foto restaurada con éxito en la biblioteca." });
      await fetchTrashPhotos();
    }
  };

  // Restaurar fotos seleccionadas en lote
  const restoreSelectedPhotos = async () => {
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";
    
    try {
      setLoading(true);
      if (!localActive) {
        const idsToRestore: string[] = [];
        selectedPhotos.forEach((photoName) => {
          const nameWithoutExt = photoName.replace(/\.[^/.]+$/, "");
          const cleanPhotoId = nameWithoutExt.split(".")[0];
          const photoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : photoName;
          if (isValidUUID(photoId)) {
            idsToRestore.push(photoId);
          }
        });

        if (idsToRestore.length > 0) {
          const { error } = await supabase
            .from("photos")
            .update({ status: "active" })
            .in("id", idsToRestore);
          if (error) throw error;
        }
      } else {
        const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
        const localStatusMappings = JSON.parse(localStatusMappingsJson);
        selectedPhotos.forEach((photoName) => {
          localStatusMappings[photoName] = "active";
        });
        localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));
      }

      setStatusMessage({
        type: "success",
        text: `${selectedPhotos.size} ${selectedPhotos.size === 1 ? "foto restaurada" : "fotos restauradas"} con éxito en la biblioteca.`,
      });
      
      setSelectedPhotos(new Set());
      setIsSelectMode(false);
      window.dispatchEvent(new CustomEvent("photo-moved"));
      await fetchTrashPhotos();
    } catch (err: any) {
      console.error("Error al restaurar fotos seleccionadas:", err);
      setStatusMessage({ type: "error", text: "Error al restaurar las fotos seleccionadas." });
    } finally {
      setLoading(false);
    }
  };

  // Borrar fotos seleccionadas definitivamente en lote
  const deleteSelectedPhotos = async () => {
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";
    
    try {
      setDeleting(true);
      setShowConfirmDeleteSelectedModal(false);
      
      if (!localActive) {
        const pathsToDeleteFromStorage: string[] = [];
        const idsToDeleteFromDb: string[] = [];

        selectedPhotos.forEach((photoName) => {
          const nameWithoutWebp = photoName.replace(/\.webp$/, "");
          pathsToDeleteFromStorage.push(`thumbnails/${photoName}`);
          pathsToDeleteFromStorage.push(`originals/${nameWithoutWebp}.jpg`);
          pathsToDeleteFromStorage.push(`originals/${nameWithoutWebp}.jpeg`);
          pathsToDeleteFromStorage.push(`originals/${nameWithoutWebp}.png`);
          pathsToDeleteFromStorage.push(`originals/${nameWithoutWebp}.webp`);

          const nameWithoutExt = photoName.replace(/\.[^/.]+$/, "");
          const cleanPhotoId = nameWithoutExt.split(".")[0];
          const photoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : photoName;
          if (isValidUUID(photoId)) {
            idsToDeleteFromDb.push(photoId);
          }
        });

        // 1. Borrar en Storage
        const { error: storageError } = await supabase.storage
          .from("family-album")
          .remove(pathsToDeleteFromStorage);
        if (storageError) throw storageError;

        // 2. Borrar en BD
        if (idsToDeleteFromDb.length > 0) {
          const { error: dbError } = await supabase
            .from("photos")
            .delete()
            .in("id", idsToDeleteFromDb);
          if (dbError) throw dbError;
        }
      } else {
        // MODO LOCAL
        const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
        const localStatusMappings = JSON.parse(localStatusMappingsJson);
        
        const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
        const localAlbumMappings = JSON.parse(localAlbumMappingsJson);

        selectedPhotos.forEach((photoName) => {
          delete localStatusMappings[photoName];
          delete localAlbumMappings[photoName];
        });

        localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));
        localStorage.setItem("family_album_photo_mappings", JSON.stringify(localAlbumMappings));

        const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
        let localPhotos = JSON.parse(localPhotosJson);
        localPhotos = localPhotos.filter((p: any) => !selectedPhotos.has(p.name));
        localStorage.setItem("family_album_local_photos", JSON.stringify(localPhotos));
      }

      setStatusMessage({
        type: "success",
        text: `${selectedPhotos.size} ${selectedPhotos.size === 1 ? "foto eliminada" : "fotos eliminadas"} definitivamente.`,
      });

      setSelectedPhotos(new Set());
      setIsSelectMode(false);
      window.dispatchEvent(new CustomEvent("photo-moved"));
      await fetchTrashPhotos();
    } catch (err: any) {
      console.error("Error al borrar seleccionadas:", err);
      setStatusMessage({ type: "error", text: "Error al borrar las fotos seleccionadas." });
    } finally {
      setDeleting(false);
    }
  };

  // Vaciar papelera (borrado definitivo)
  const emptyTrash = async () => {
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

    if (!localActive) {
      try {
        setDeleting(true);
        setShowConfirmModal(false);
        setStatusMessage(null);

        const pathsToDeleteFromStorage: string[] = [];
        const idsToDeleteFromDb: string[] = [];

        photos.forEach((photo) => {
          const nameWithoutWebp = photo.name.replace(/\.webp$/, "");
          pathsToDeleteFromStorage.push(`thumbnails/${photo.name}`);
          pathsToDeleteFromStorage.push(`originals/${nameWithoutWebp}.jpg`);
          pathsToDeleteFromStorage.push(`originals/${nameWithoutWebp}.jpeg`);
          pathsToDeleteFromStorage.push(`originals/${nameWithoutWebp}.png`);
          pathsToDeleteFromStorage.push(`originals/${nameWithoutWebp}.webp`);

          const nameWithoutExt = photo.name.replace(/\.[^/.]+$/, "");
          const cleanPhotoId = nameWithoutExt.split(".")[0];
          const photoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : photo.name;
          idsToDeleteFromDb.push(photoId);
        });

        // 1. Borrar en Storage
        const { error: storageError } = await supabase.storage
          .from("family-album")
          .remove(pathsToDeleteFromStorage);

        if (storageError) throw storageError;

        // 2. Borrar en base de datos
        const validUUIDs = idsToDeleteFromDb.filter(isValidUUID);
        if (validUUIDs.length > 0) {
          const { error: dbError } = await supabase
            .from("photos")
            .delete()
            .in("id", validUUIDs);
          if (dbError) throw dbError;
        }

        setStatusMessage({
          type: "success",
          text: "La papelera ha sido vaciada de forma definitiva.",
        });

        window.dispatchEvent(new CustomEvent("photo-moved"));
        setPhotos([]);
      } catch (err: any) {
        console.error("Fallo al vaciar papelera en Supabase:", err);
      } finally {
        setDeleting(false);
      }
    } else {
      // MODO LOCAL
      try {
        setDeleting(true);
        setShowConfirmModal(false);
        setStatusMessage(null);

        const idsToDelete: string[] = photos.map((p) => p.name);

        const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
        const localStatusMappings = JSON.parse(localStatusMappingsJson);
        
        const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
        const localAlbumMappings = JSON.parse(localAlbumMappingsJson);

        idsToDelete.forEach((id) => {
          delete localStatusMappings[id];
          delete localAlbumMappings[id];
        });

        localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));
        localStorage.setItem("family_album_photo_mappings", JSON.stringify(localAlbumMappings));

        const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
        let localPhotos = JSON.parse(localPhotosJson);
        localPhotos = localPhotos.filter((p: any) => !idsToDelete.includes(p.name));
        localStorage.setItem("family_album_local_photos", JSON.stringify(localPhotos));

        setStatusMessage({
          type: "success",
          text: "La papelera ha sido vaciada de forma definitiva.",
        });

        window.dispatchEvent(new CustomEvent("photo-moved"));
        setPhotos([]);
      } catch (err: any) {
        console.error("Error al vaciar papelera local:", err);
        setStatusMessage({
          type: "error",
          text: err.message || "Error al vaciar la papelera.",
        });
      } finally {
        setDeleting(false);
      }
    }
  };

  // Borrar una sola foto definitivamente de la papelera
  const deleteSinglePhoto = async (photoName: string) => {
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

    if (!localActive) {
      try {
        setDeleting(true);
        setStatusMessage(null);

        const nameWithoutWebp = photoName.replace(/\.webp$/, "");
        const pathsToDeleteFromStorage = [
          `thumbnails/${photoName}`,
          `originals/${nameWithoutWebp}.jpg`,
          `originals/${nameWithoutWebp}.jpeg`,
          `originals/${nameWithoutWebp}.png`,
          `originals/${nameWithoutWebp}.webp`,
        ];

        // 1. Borrar en Storage
        const { error: storageError } = await supabase.storage
          .from("family-album")
          .remove(pathsToDeleteFromStorage);

        if (storageError) throw storageError;

        // 2. Borrar registro
        const cleanPhotoId = nameWithoutWebp.split(".")[0];
        const photoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : photoName;

        if (isValidUUID(photoId)) {
          const { error: dbError } = await supabase
            .from("photos")
            .delete()
            .eq("id", photoId);
          if (dbError) throw dbError;
        }

        setStatusMessage({
          type: "success",
          text: "La foto ha sido eliminada definitivamente.",
        });

        window.dispatchEvent(new CustomEvent("photo-moved"));
        await fetchTrashPhotos();
      } catch (err: any) {
        console.error("Fallo al borrar foto en Supabase:", err);
      } finally {
        setDeleting(false);
      }
    } else {
      // MODO LOCAL
      try {
        setDeleting(true);
        setStatusMessage(null);

        const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
        const localStatusMappings = JSON.parse(localStatusMappingsJson);
        
        const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
        const localAlbumMappings = JSON.parse(localAlbumMappingsJson);

        delete localStatusMappings[photoName];
        delete localAlbumMappings[photoName];

        localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));
        localStorage.setItem("family_album_photo_mappings", JSON.stringify(localAlbumMappings));

        const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
        let localPhotos = JSON.parse(localPhotosJson);
        localPhotos = localPhotos.filter((p: any) => p.name !== photoName);
        localStorage.setItem("family_album_local_photos", JSON.stringify(localPhotos));

        setStatusMessage({
          type: "success",
          text: "La foto ha sido eliminada definitivamente.",
        });

        window.dispatchEvent(new CustomEvent("photo-moved"));
        await fetchTrashPhotos();
      } catch (err: any) {
        console.error("Error al borrar foto local:", err);
        setStatusMessage({
          type: "error",
          text: err.message || "Error al borrar la foto.",
        });
      } finally {
        setDeleting(false);
      }
    }
  };

  const filteredPhotos = filterPhotos(
    photos,
    searchQuery,
    [],
    people,
    taggedPhotos,
    photoMetadata
  );

  return (
    <div className="flex-1 p-4 md:p-8 space-y-6 md:space-y-8 bg-brand-cream overflow-y-auto">
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

        <div className="flex items-center gap-3 bg-transparent">
          {isSelectMode ? (
            <>
              <span className="text-[11px] text-brand-navy/60 select-none">
                {selectedPhotos.size} seleccionada{selectedPhotos.size !== 1 ? "s" : ""}
              </span>
              {selectedPhotos.size > 0 && (
                <>
                  <button
                    onClick={restoreSelectedPhotos}
                    disabled={deleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy rounded-xs text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    Restaurar
                  </button>
                  <button
                    onClick={() => setShowConfirmDeleteSelectedModal(true)}
                    disabled={deleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-red-400 text-red-600 hover:bg-red-50 rounded-xs text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Borrar
                  </button>
                </>
              )}
              <button
                onClick={() => { setIsSelectMode(false); setSelectedPhotos(new Set()); }}
                className="px-3 py-1.5 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy rounded-xs text-[11px] font-semibold transition-all cursor-pointer"
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              {photos.length > 0 && (
                <>
                  <button
                    onClick={() => setIsSelectMode(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy rounded-xs text-[11px] font-semibold transition-all cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Seleccionar
                  </button>
                  <button
                    onClick={() => setShowConfirmModal(true)}
                    disabled={deleting}
                    className="flex items-center gap-2 px-3 py-1.5 border border-red-650 hover:bg-red-50/10 text-red-600 rounded-xs text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Vaciar Papelera
                  </button>
                </>
              )}
            </>
          )}
        </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6">
            {filteredPhotos.map((photo) => {
              const isRemote = photo.url.includes("supabase.co");
              let originalUrl: string;
              if (photo.url_original) {
                originalUrl = photo.url_original;
              } else if (isRemote) {
                const nameWithoutWebp = photo.name.replace(/\.webp$/, "");
                originalUrl = supabase.storage.from("family-album").getPublicUrl(`originals/${nameWithoutWebp}`).data.publicUrl;
              } else {
                originalUrl = photo.url;
              }

              return (
                <div
                  key={photo.name}
                  data-photo-card
                  onTouchStart={() => !isSelectMode && handleTouchStart(photo.name)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onClick={() => {
                    if (isLongPressRef.current) {
                      isLongPressRef.current = false;
                      return;
                    }
                    if (isSelectMode) {
                      toggleSelectPhoto(photo.name);
                    } else {
                      if (activeActionMenuPhoto) {
                        setActiveActionMenuPhoto(null);
                      } else {
                        setActiveLightboxPhoto({ url: originalUrl, name: photo.name });
                      }
                    }
                  }}
                  className={`group relative aspect-square bg-brand-cream/50 rounded-xs overflow-hidden border transition-all duration-300 select-none ${
                    activeActionMenuPhoto === photo.name ? "z-40" : "z-10"
                  } ${
                    isSelectMode
                      ? selectedPhotos.has(photo.name)
                        ? "border-brand-navy ring-2 ring-brand-navy cursor-pointer"
                        : "border-brand-navy/10 hover:border-brand-navy/40 cursor-pointer"
                      : activeActionMenuPhoto === photo.name
                        ? "border-brand-navy ring-2 ring-brand-navy cursor-zoom-in"
                        : "border-brand-navy/10 hover:border-brand-navy cursor-zoom-in"
                  }`}
                >
                  {/* Checkbox de selección */}
                  {isSelectMode && (
                    <div className={`absolute top-2.5 left-2.5 z-30 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedPhotos.has(photo.name)
                        ? "bg-brand-navy border-brand-navy"
                        : "bg-brand-cream/80 border-brand-navy/30"
                    }`}>
                      {selectedPhotos.has(photo.name) && (
                        <svg className="w-3 h-3 text-brand-cream" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  )}

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="w-full h-full object-cover grayscale opacity-80 border border-brand-navy/5 transition-transform duration-500 group-hover:scale-103"
                    style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }}
                    loading="lazy"
                  />
                  
                  {/* Botones de acción visibles en móvil al pulsar largo, y en hover en web */}
                  {!isSelectMode && (
                    <div className={`absolute top-2 right-2 z-30 flex gap-1.5 bg-transparent transition-opacity duration-200 ${
                      activeActionMenuPhoto === photo.name 
                        ? "opacity-100 flex" 
                        : "hidden md:flex md:opacity-0 md:group-hover:opacity-100"
                    }`}>
                      {/* Botón Restaurar */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          restorePhoto(photo.name);
                        }}
                        className="p-1.5 bg-black/55 backdrop-blur-xs border border-white/20 text-white rounded-xs transition-all hover:bg-black/70 cursor-pointer flex items-center justify-center"
                        title="Restaurar a la biblioteca"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                      </button>

                      {/* Botón Borrar definitivamente */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSinglePhoto(photo.name);
                        }}
                        className="p-1.5 bg-black/55 backdrop-blur-xs border border-red-500/20 text-red-400 rounded-xs transition-all hover:bg-red-500/30 cursor-pointer flex items-center justify-center"
                        title="Borrar definitivamente"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                  
                  {/* Hover overlay completo de escritorio */}
                  {!isSelectMode && (
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-xs opacity-0 md:group-hover:opacity-100 transition-opacity duration-350 hidden md:flex flex-col justify-end p-4 z-10">
                      <div className="bg-transparent">
                        <p className="text-brand-cream/70 text-[10px]">
                          {photo.created_at ? new Date(photo.created_at).toLocaleDateString("es-ES") : ""}
                        </p>
                        {photoMetadata[photo.name] && (
                          <div className="bg-transparent space-y-0.5 pt-1">
                            {photoMetadata[photo.name].location && (
                              <p className="text-[9px] text-brand-cream/80 truncate flex items-center gap-1">
                                📍 {photoMetadata[photo.name].location}
                              </p>
                            )}
                          </div>
                        )}
                        <div className="flex gap-2 bg-transparent mt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              restorePhoto(photo.name);
                            }}
                            className="flex-1 py-1.5 px-2 border border-brand-cream/30 hover:bg-brand-cream/10 text-brand-cream text-[10px] font-medium rounded-xs text-center transition-all cursor-pointer"
                          >
                            Restaurar
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSinglePhoto(photo.name);
                            }}
                            className="flex-1 py-1.5 px-2 border border-red-400/30 hover:bg-red-500/20 text-red-400 text-[10px] font-medium rounded-xs text-center transition-all cursor-pointer"
                          >
                            Borrar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de confirmación premium para vaciar papelera */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-brand-navy/20 backdrop-blur-xs z-60 flex items-center justify-center p-4">
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

      {/* Modal de confirmación premium para borrar seleccionadas */}
      {showConfirmDeleteSelectedModal && (
        <div className="fixed inset-0 bg-brand-navy/20 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-brand-cream border border-brand-navy/30 rounded-xs p-6 max-w-sm w-full space-y-4 shadow-xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-base font-medium text-brand-navy">
              ¿Eliminar fotos seleccionadas para siempre?
            </h3>
            <p className="text-xs text-brand-navy/60 leading-relaxed">
              Se eliminarán definitivamente {selectedPhotos.size} {selectedPhotos.size === 1 ? "foto seleccionada" : "fotos seleccionadas"} del almacenamiento. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3 justify-end pt-2 bg-transparent">
              <button
                onClick={() => setShowConfirmDeleteSelectedModal(false)}
                className="px-4 py-2 border border-brand-navy/20 hover:bg-brand-navy/5 rounded-xs text-[11px] font-semibold text-brand-navy cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={deleteSelectedPhotos}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-brand-cream rounded-xs text-[11px] font-semibold cursor-pointer transition-colors"
              >
                Eliminar para siempre
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Visualizador en la Papelera */}
      {activeLightboxPhoto && (
        <div
          onClick={() => setActiveLightboxPhoto(null)}
          className="fixed inset-0 bg-brand-navy/90 backdrop-blur-md z-60 flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{
            cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='14' cy='14' r='8' fill='none' stroke='black' stroke-width='3'/%3E%3Cline x1='20' y1='20' x2='28' y2='28' stroke='black' stroke-width='3'/%3E%3Cpath d='M11 11 L17 17 M17 11 L11 17' stroke='black' stroke-width='3'/%3E%3Ccircle cx='14' cy='14' r='8' fill='none' stroke='white' stroke-width='2'/%3E%3Cline x1='20' y1='20' x2='28' y2='28' stroke='white' stroke-width='2'/%3E%3Cpath d='M11 11 L17 17 M17 11 L11 17' stroke='white' stroke-width='2'/%3E%3C/svg%3E") 14 14, pointer`
          }}
        >
          <div className="absolute top-6 right-6 flex items-center gap-4 z-60">
            <button
              onClick={() => setActiveLightboxPhoto(null)}
              className="text-brand-cream/65 hover:text-brand-cream transition-colors p-2 cursor-pointer bg-brand-navy/50 hover:bg-brand-navy/80 rounded-full"
              title="Cerrar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeLightboxPhoto.url}
            alt="Recuerdo Familiar Ampliado (Papelera)"
            className="max-w-full max-h-[80vh] object-contain rounded-xs border border-brand-cream/20 shadow-2xl animate-in zoom-in-95 duration-200 transition-transform duration-300"
            style={{
              transform: `rotate(${rotations[activeLightboxPhoto.name] || 0}deg)`,
              cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='14' cy='14' r='8' fill='none' stroke='black' stroke-width='3'/%3E%3Cline x1='20' y1='20' x2='28' y2='28' stroke='black' stroke-width='3'/%3E%3Cpath d='M11 11 L17 17 M17 11 L11 17' stroke='black' stroke-width='3'/%3E%3Ccircle cx='14' cy='14' r='8' fill='none' stroke='white' stroke-width='2'/%3E%3Cline x1='20' y1='20' x2='28' y2='28' stroke='white' stroke-width='2'/%3E%3Cpath d='M11 11 L17 17 M17 11 L11 17' stroke='white' stroke-width='2'/%3E%3C/svg%3E") 14 14, pointer`
            }}
          />

          {/* Barra de herramientas inferior del Lightbox de Papelera */}
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-4 px-6 py-3 bg-black/60 backdrop-blur-md border border-white/10 rounded-full shadow-2xl z-70"
          >
            {/* Botón Restaurar */}
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const nameToRestore = activeLightboxPhoto.name;
                setActiveLightboxPhoto(null);
                await restorePhoto(nameToRestore);
              }}
              className="p-2.5 text-white hover:text-brand-sage transition-colors cursor-pointer flex items-center justify-center rounded-full hover:bg-white/10"
              title="Restaurar a la biblioteca"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>

            {/* Separador */}
            <div className="w-[1px] h-6 bg-white/15" />

            {/* Botón de girar */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                const currentRotation = rotations[activeLightboxPhoto.name] || 0;
                const newRotation = (currentRotation + 90) % 360;
                const updatedRotations = {
                  ...rotations,
                  [activeLightboxPhoto.name]: newRotation,
                };
                setRotations(updatedRotations);
                localStorage.setItem("family_album_photo_rotations", JSON.stringify(updatedRotations));
              }}
              className="p-2.5 text-white hover:text-brand-sage transition-colors cursor-pointer flex items-center justify-center rounded-full hover:bg-white/10"
              title="Girar foto 90°"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>

            {/* Separador */}
            <div className="w-[1px] h-6 bg-white/15" />

            {/* Botón Borrar definitivamente */}
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const nameToDelete = activeLightboxPhoto.name;
                setActiveLightboxPhoto(null);
                await deleteSinglePhoto(nameToDelete);
              }}
              className="p-2.5 text-red-400 hover:text-red-500 transition-colors cursor-pointer flex items-center justify-center rounded-full hover:bg-red-500/10"
              title="Borrar definitivamente"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
