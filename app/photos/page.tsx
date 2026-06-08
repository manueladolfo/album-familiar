"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { generateUUID, isValidUUID } from "@/lib/uuid";
import { useSearchParams } from "next/navigation";
import exifr from "exifr";
import { filterPhotos, analyzePhotoWithGemini, getReverseGeocoding, PersonProfile, PhotoMetadata, PhotoItem } from "@/lib/search";


interface AlbumItem {
  id: string;
  name: string;
}

export default function PhotosPage() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("search") || "";
  const filterParam = searchParams.get("filter") || "";
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeLightboxPhoto, setActiveLightboxPhoto] = useState<string | null>(null);

  // Estados para Búsqueda Inteligente e IA
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [taggedPhotos, setTaggedPhotos] = useState<Record<string, string[]>>({});
  const [photoMetadata, setPhotoMetadata] = useState<Record<string, PhotoMetadata>>({});

  // Estado de Favoritos
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const savedFavorites = localStorage.getItem("family_album_favorites");
    if (savedFavorites) {
      setFavorites(JSON.parse(savedFavorites));
    }
  }, []);

  const toggleFavorite = (photoName: string) => {
    const updated = favorites.includes(photoName)
      ? favorites.filter((name) => name !== photoName)
      : [...favorites, photoName];
    setFavorites(updated);
    localStorage.setItem("family_album_favorites", JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("photo-moved"));
  };

  // Estado y manejadores para el menú de asignación rápida de álbum
  const [openAlbumDropdownPhoto, setOpenAlbumDropdownPhoto] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        target &&
        !target.closest("[data-album-dropdown-trigger]") &&
        !target.closest("[data-album-dropdown]")
      ) {
        setOpenAlbumDropdownPhoto(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  const handleAddPhotoToAlbum = async (photoName: string, albumId: string | null) => {
    try {
      console.log(`Asociando foto ${photoName} al álbum ${albumId}`);

      if (isValidUUID(photoName) && (albumId === null || isValidUUID(albumId))) {
        const { error } = await supabase
          .from("photos")
          .update({ album_id: albumId })
          .eq("id", photoName);

        if (error) throw error;
        console.log("Actualizado en Supabase correctamente");
      }
    } catch {
      console.warn("Fallo al actualizar en Supabase (RLS). Guardando en LocalStorage fallback...");
    } finally {
      const mappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
      const mappings = JSON.parse(mappingsJson);
      mappings[photoName] = albumId;
      localStorage.setItem("family_album_photo_mappings", JSON.stringify(mappings));

      window.dispatchEvent(
        new CustomEvent("photo-moved", {
          detail: { photoId: photoName, albumId },
        })
      );
      await fetchPhotos();
    }
  };

  // Cargar álbumes
  const fetchAlbums = async () => {
    try {
      const { data } = await supabase.from("albums").select("id, name");
      if (data && data.length > 0) {
        setAlbums(data);
      } else {
        const localAlbums = localStorage.getItem("family_album_local_albums");
        if (localAlbums) setAlbums(JSON.parse(localAlbums));
      }
    } catch {
      const localAlbums = localStorage.getItem("family_album_local_albums");
      if (localAlbums) setAlbums(JSON.parse(localAlbums));
    }
  };
  // Cargar fotos y cruzar con base de datos + LocalStorage + Semillero
  const fetchPhotos = async () => {
    try {
      setLoading(true);

      let remotePhotos: PhotoItem[] = [];

      // 1. Intentar obtener archivos de Supabase Storage
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

          // Mappings remotos de base de datos
          let dbAlbumMappings: Record<string, string> = {};
          let dbStatusMappings: Record<string, string> = {};
          try {
            const { data: dbPhotos } = await supabase.from("photos").select("id, album_id, status");
            if (dbPhotos) {
              dbPhotos.forEach((p) => {
                if (p.album_id) dbAlbumMappings[p.id] = p.album_id;
                if (p.status) dbStatusMappings[p.id] = p.status;
              });
            }
          } catch {
            // Ignorar
          }

          // Combinar mappings temporales locales
          const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
          const localAlbumMappings = JSON.parse(localAlbumMappingsJson);

          const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
          const localStatusMappings = JSON.parse(localStatusMappingsJson);

          const combinedAlbumMappings = { ...dbAlbumMappings, ...localAlbumMappings };
          const combinedStatusMappings = { ...dbStatusMappings, ...localStatusMappings };

          remotePhotos = validFiles.map((file) => {
            const { data: urlData } = supabase.storage
              .from("family-album")
              .getPublicUrl(`thumbnails/${file.name}`);

            const albumId = combinedAlbumMappings[file.name] || null;
            const status = combinedStatusMappings[file.name] || null;

            return {
              name: file.name,
              url: urlData.publicUrl,
              created_at: file.created_at,
              album_id: albumId,
              status: status,
            };
          });
        }
      } catch (err) {
        console.warn("Fallo al conectar con Supabase Storage para fotos. Operando localmente...");
      }

      // 2. Obtener fotos locales sembradas/importadas de LocalStorage
      const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
      const localPhotos: PhotoItem[] = JSON.parse(localPhotosJson);

      // Re-mapear estados de álbum y estado de papelera locales más recientes
      const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
      const localAlbumMappings = JSON.parse(localAlbumMappingsJson);

      const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
      const localStatusMappings = JSON.parse(localStatusMappingsJson);

      const updatedLocalPhotos = localPhotos.map((photo) => ({
        ...photo,
        album_id: localAlbumMappings[photo.name] !== undefined ? localAlbumMappings[photo.name] : photo.album_id,
        status: localStatusMappings[photo.name] !== undefined ? localStatusMappings[photo.name] : photo.status,
      }));

      // 3. Combinar fotos remotas y locales
      const allPhotos = [...remotePhotos];
      
      // Añadir locales que no tengan el mismo nombre que una remota
      updatedLocalPhotos.forEach((localPhoto) => {
        if (!allPhotos.some((p) => p.name === localPhoto.name)) {
          allPhotos.push(localPhoto);
        }
      });

      // 4. Filtrar activas (omitir status === 'trash') y ordenar por fecha de creación
      const activePhotos = allPhotos
        .filter((photo) => photo.status !== "trash")
        .sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });

      // Cargar personas, tags de personas y metadata de IA
      const peopleJson = localStorage.getItem("family_album_people") || "[]";
      setPeople(JSON.parse(peopleJson));

      const taggedJson = localStorage.getItem("family_album_person_tags") || "{}";
      setTaggedPhotos(JSON.parse(taggedJson));

      const metadataJson = localStorage.getItem("family_album_photo_metadata") || "{}";
      setPhotoMetadata(JSON.parse(metadataJson));

      setPhotos(activePhotos);
    } catch (error) {
      console.error("Error al cargar fotos combinadas:", error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlbums();
    fetchPhotos();
 
    // Escuchar cambios globales de Drag & Drop o de actualización de fotos y álbumes
    const handlePhotoMoved = () => fetchPhotos();
    const handleRefreshAlbums = () => fetchAlbums();
    window.addEventListener("photo-moved", handlePhotoMoved);
    window.addEventListener("refresh-albums", handleRefreshAlbums);
    return () => {
      window.removeEventListener("photo-moved", handlePhotoMoved);
      window.removeEventListener("refresh-albums", handleRefreshAlbums);
    };
  }, []);

  // Comprimir imagen usando Canvas en el cliente (max 500px, WebP)
  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("No se pudo inicializar el contexto de Canvas"));
            return;
          }

          let width = img.width;
          let height = img.height;
          const maxDim = 500;

          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("Error al convertir Canvas a Blob"));
              }
            },
            "image/webp",
            0.85
          );
        };
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Analizar foto en segundo plano con Gemini e IA y geolocalizar con Nominatim
  const triggerAIEvaluation = async (photoName: string, base64Image: string, lat: number | null, lon: number | null) => {
    const apiKey = localStorage.getItem("family_album_gemini_api_key");
    if (!apiKey && !lat && !lon) return;

    try {
      let tags: string[] = [];
      if (apiKey && base64Image) {
        tags = await analyzePhotoWithGemini(base64Image, apiKey);
      }

      let locationText = "";
      if (lat !== null && lon !== null) {
        locationText = await getReverseGeocoding(lat, lon);
      }

      const metadataJson = localStorage.getItem("family_album_photo_metadata") || "{}";
      const metadata = JSON.parse(metadataJson);

      metadata[photoName] = {
        tags: tags.length > 0 ? tags : ["recuerdo", "familiar"],
        location: locationText || undefined,
      };

      localStorage.setItem("family_album_photo_metadata", JSON.stringify(metadata));
      
      // Notificar a los listados que cambie la UI
      window.dispatchEvent(new CustomEvent("photo-moved"));
    } catch (err) {
      console.error("Error en evaluación automática de IA en subida:", err);
    }
  };

  // Manejar subida de archivos
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setUploadStatus({
        type: "error",
        message: "Por favor, selecciona únicamente archivos de imagen.",
      });
      return;
    }

    try {
      setUploading(true);
      setUploadStatus(null);

      const fileExt = file.name.split(".").pop();
      const cleanFileName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9]/g, "_")
        .toLowerCase();
      const uniqueName = `${Date.now()}_${cleanFileName}`;

      const compressedBlob = await compressImage(file);

      // Convertir a Base64 de antemano para Gemini
      const base64Image: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Error al convertir imagen a base64"));
        reader.readAsDataURL(compressedBlob);
      });

      // Extraer metadatos GPS de la imagen original usando exifr
      let latitude: number | null = null;
      let longitude: number | null = null;
      try {
        const gps = await exifr.gps(file);
        if (gps) {
          latitude = gps.latitude;
          longitude = gps.longitude;
          console.log("Coordenadas GPS extraídas con éxito:", latitude, longitude);
        }
      } catch (exifErr) {
        console.warn("No se encontraron metadatos GPS EXIF en esta foto:", exifErr);
      }

      let uploadSuccess = false;
      const thumbnailName = `${uniqueName}.${fileExt}.webp`;

      // 1. Intentar subir imagen original a Supabase
      try {
        const originalPath = `originals/${uniqueName}.${fileExt}`;
        const { error: origError } = await supabase.storage
          .from("family-album")
          .upload(originalPath, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (origError) throw origError;

        // 2. Intentar subir miniatura comprimida (WebP)
        const thumbnailPath = `thumbnails/${thumbnailName}`;
        const { error: thumbError } = await supabase.storage
          .from("family-album")
          .upload(thumbnailPath, compressedBlob, {
            contentType: "image/webp",
            cacheControl: "3600",
            upsert: false,
          });

        if (thumbError) {
          await supabase.storage.from("family-album").remove([originalPath]);
          throw thumbError;
        }

        // 3. Registrar en base de datos con UUID válido
        try {
          await supabase.from("photos").insert({
            id: generateUUID(),
            album_id: null,
            status: "active",
            latitude: latitude,
            longitude: longitude,
          });
        } catch {
          // Fallback de mapeo si la DB falla pero el storage no
          const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
          const localStatusMappings = JSON.parse(localStatusMappingsJson);
          localStatusMappings[thumbnailName] = "active";
          localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));
        }

        setUploadStatus({
          type: "success",
          message: "¡Foto subida y optimizada correctamente a la nube (Supabase)!",
        });
        uploadSuccess = true;
        
        // Evaluar IA y GPS en segundo plano
        triggerAIEvaluation(thumbnailName, base64Image, latitude, longitude);
        await fetchPhotos();
      } catch (err) {
        console.warn("Fallo al subir a Supabase. Activando almacenamiento local de respaldo...", err instanceof Error ? err.message : String(err));
      }

      // Si no se subió a Supabase, guardamos localmente como fallback
      if (!uploadSuccess) {
        const localThumbnailName = `${uniqueName}.webp`;
        try {
          const newPhoto: PhotoItem = {
            name: localThumbnailName,
            url: base64Image,
            created_at: new Date().toISOString(),
            album_id: null,
            status: "active",
            latitude: latitude,
            longitude: longitude,
          };

          // Guardar en family_album_local_photos
          const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
          const localPhotos = JSON.parse(localPhotosJson);
          localPhotos.unshift(newPhoto);
          localStorage.setItem("family_album_local_photos", JSON.stringify(localPhotos));

          // Guardar estado
          const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
          const localStatusMappings = JSON.parse(localStatusMappingsJson);
          localStatusMappings[localThumbnailName] = "active";
          localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));

          setUploadStatus({
            type: "success",
            message: "¡Foto optimizada y guardada localmente (almacenamiento del navegador)!",
          });
          
          // Evaluar IA y GPS en segundo plano
          triggerAIEvaluation(localThumbnailName, base64Image, latitude, longitude);
        } catch (fallbackErr) {
          console.error("Fallo al guardar en LocalStorage:", fallbackErr);
          setUploadStatus({
            type: "error",
            message: `Fallo al guardar la foto localmente: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
          });
        } finally {
          await fetchPhotos();
          setUploading(false);
        }
      } else {
        setUploading(false);
      }

    } catch (error) {
      console.error("Error general en el proceso de subida:", error);
      setUploadStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Error al procesar la imagen.",
      });
      setUploading(false);
    }
  };

  // Mover foto a papelera (status = 'trash')
  const moveToTrash = async (photoName: string) => {
    try {
      // 1. Intentar actualizar en base de datos de Supabase solo si el ID es un UUID válido
      if (isValidUUID(photoName)) {
        const { error } = await supabase
          .from("photos")
          .update({ status: "trash" })
          .eq("id", photoName);

        if (error) throw error;
      }
    } catch {
      console.warn("Fallo en actualización de base de datos Supabase (RLS). Usando LocalStorage fallback...");
    } finally {
      // 2. Guardar en LocalStorage como fallback
      const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
      const localStatusMappings = JSON.parse(localStatusMappingsJson);
      localStatusMappings[photoName] = "trash";
      localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));

      // 3. Emitir evento global y refrescar localmente
      window.dispatchEvent(new CustomEvent("photo-moved"));
      await fetchPhotos();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const handlePhotoDragStart = (e: React.DragEvent, photoName: string) => {
    e.dataTransfer.setData("text/plain", photoName);
    e.dataTransfer.effectAllowed = "move";
  };

  const getAlbumName = (albumId?: string | null) => {
    if (!albumId) return null;
    const album = albums.find((a) => a.id === albumId);
    return album ? album.name : null;
  };

  let filteredPhotos = filterPhotos(photos, searchQuery, albums, people, taggedPhotos, photoMetadata);

  if (filterParam === "favorites") {
    filteredPhotos = filteredPhotos.filter((photo) => favorites.includes(photo.name));
  }

  if (filterParam === "recent") {
    filteredPhotos = filteredPhotos.slice(0, 12);
  }


  return (
    <div className="flex-1 p-4 md:p-8 space-y-6 md:space-y-8 bg-brand-cream overflow-y-auto">
      {/* Cargador de Imágenes */}
      <div className="max-w-4xl mx-auto bg-transparent">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed p-6 md:p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-4 rounded-xs ${
            isDragOver
              ? "border-brand-navy bg-brand-sage/15"
              : "border-brand-navy/20 hover:border-brand-navy/55 bg-brand-cream/40"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
            accept="image/*"
          />

          <div className="w-12 h-12 border border-brand-navy/35 text-brand-navy rounded-full flex items-center justify-center bg-transparent">
            {uploading ? (
              <svg className="animate-spin h-5 w-5 text-brand-navy" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-brand-navy" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            )}
          </div>

          <div className="space-y-1 bg-transparent">
            <p className="text-sm font-medium text-brand-navy bg-transparent">
              {uploading ? "Procesando y subiendo imagen..." : "Sube tu foto familiar"}
            </p>
            <p className="text-xs text-brand-navy/50 bg-transparent">
              Arrastra y suelta tu foto aquí, o haz clic para buscar en tu dispositivo
            </p>
          </div>
        </div>

        {/* Notificación de Estado */}
        {uploadStatus && (
          <div
            className={`mt-4 p-3 rounded-xs border text-xs flex items-center gap-3 bg-brand-cream/80 ${
              uploadStatus.type === "success"
                ? "border-green-200 text-green-800"
                : "border-red-200 text-red-800"
            }`}
          >
            <span className="flex-1 font-medium">{uploadStatus.message}</span>
            <button onClick={() => setUploadStatus(null)} className="text-brand-navy/40 hover:text-brand-navy/70">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Cuadrícula de fotos */}
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex justify-between items-center bg-transparent">
          <h3 className="text-base font-medium text-brand-navy tracking-tight bg-transparent">
            {filterParam === "favorites"
              ? "Mis Recuerdos Favoritos"
              : filterParam === "recent"
              ? "Recuerdos Guardados Recientemente (Últimos 12)"
              : "Fotos de tu biblioteca"}
          </h3>
          <span className="text-[11px] text-brand-navy/40 bg-transparent select-none">
            Tip: Arrastra una foto al Sidebar para agregarla a un álbum o haz clic en el corazón para marcarla.
          </span>
        </div>
        
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-square bg-brand-navy/5 rounded-xs border border-brand-navy/5 animate-pulse" />
            ))}
          </div>
        ) : filteredPhotos.length === 0 ? (
          <div className="text-center py-20 bg-brand-cream/40 border border-brand-navy/10 rounded-xs">
            <svg className="w-12 h-12 mx-auto text-brand-navy/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="mt-4 text-xs text-brand-navy/50">No se encontraron recuerdos que coincidan con tu búsqueda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6">
            {filteredPhotos.map((photo) => {
              const nameWithoutWebp = photo.name.replace(/\.webp$/, "");
              const isRemote = photo.url.includes("supabase.co");
              const originalUrl = isRemote
                ? supabase.storage.from("family-album").getPublicUrl(`originals/${nameWithoutWebp}`).data.publicUrl
                : photo.url;

              const albumName = getAlbumName(photo.album_id);

              return (
                <div
                  key={photo.name}
                  draggable
                  onDragStart={(e) => handlePhotoDragStart(e, photo.name)}
                  onClick={() => setActiveLightboxPhoto(originalUrl)}
                  className="group relative aspect-square bg-brand-cream/50 rounded-xs border border-brand-navy/10 hover:border-brand-navy transition-all duration-300 cursor-zoom-in active:cursor-grabbing select-none"
                >
                  {/* Contenedor visual recortado para la imagen y el hover overlay */}
                  <div className="absolute inset-0 rounded-xs overflow-hidden z-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.name}
                      className="w-full h-full object-cover border border-brand-navy/5 transition-transform duration-500 group-hover:scale-103"
                      loading="lazy"
                    />

                    {/* Hover overlay con desenfoque de cristal */}
                    <div className="absolute inset-0 bg-brand-navy/85 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-350 flex flex-col justify-between p-4">
                      <div className="flex justify-end bg-transparent">
                        {/* Botón de enviar a la papelera */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveToTrash(photo.name);
                          }}
                          className="p-2 border border-brand-cream/20 hover:bg-brand-cream/10 text-brand-cream rounded-xs transition-all"
                          title="Mover a la papelera"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      <div className="bg-transparent space-y-2 text-left">
                        <div className="bg-transparent space-y-1">
                          <p className="text-brand-cream text-xs font-semibold tracking-wider uppercase truncate">
                            {photo.name.split("_").slice(1).join("_").replace(/\.webp$/, "")}
                          </p>
                          <p className="text-brand-cream/70 text-[9px]">
                            {photo.created_at ? new Date(photo.created_at).toLocaleDateString("es-ES") : ""}
                          </p>
                          {photoMetadata[photo.name] && (
                            <div className="bg-transparent space-y-0.5 pt-0.5">
                              {photoMetadata[photo.name].location && (
                                <p className="text-[9px] text-brand-cream/80 truncate flex items-center gap-1">
                                  📍 {photoMetadata[photo.name].location}
                                </p>
                              )}
                              {photoMetadata[photo.name].tags && photoMetadata[photo.name].tags.length > 0 && (
                                <p className="text-[8px] text-brand-cream/60 italic truncate">
                                  🏷️ {photoMetadata[photo.name].tags.slice(0, 4).join(", ")}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 bg-transparent">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveLightboxPhoto(originalUrl);
                            }}
                            className="flex-1 py-1.5 px-3 border border-brand-cream/30 hover:bg-brand-cream/10 text-brand-cream text-[11px] font-medium rounded-xs text-center transition-all cursor-pointer"
                          >
                            Ver
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Badge de álbum */}
                  {albumName && (
                    <div className="absolute top-3 left-3 bg-brand-timber text-brand-cream px-2 py-0.5 rounded-xs text-[9px] font-bold uppercase tracking-wider z-20">
                      {albumName}
                    </div>
                  )}

                  {/* Botón de Favorito */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(photo.name);
                    }}
                    className="absolute top-3 right-3 z-20 p-1.5 rounded-full bg-brand-cream/90 backdrop-blur-xs border border-brand-navy/15 text-brand-navy hover:scale-105 transition-all cursor-pointer focus:outline-none"
                    title={favorites.includes(photo.name) ? "Quitar de favoritos" : "Marcar como favorito"}
                  >
                    <svg
                      className={`w-3.5 h-3.5 ${
                        favorites.includes(photo.name) ? "fill-red-500 text-red-500" : "text-brand-navy/60"
                      }`}
                      fill={favorites.includes(photo.name) ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>

                  {/* Botón de Añadir a Álbum (Cruz/Más) */}
                  <button
                    data-album-dropdown-trigger
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenAlbumDropdownPhoto(openAlbumDropdownPhoto === photo.name ? null : photo.name);
                    }}
                    className="absolute top-3 right-11 z-20 p-1.5 rounded-full bg-brand-cream/90 backdrop-blur-xs border border-brand-navy/15 text-brand-navy hover:scale-105 transition-all cursor-pointer focus:outline-none"
                    title="Añadir a un álbum..."
                  >
                    <svg className="w-3.5 h-3.5 text-brand-navy/60" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>

                  {/* Menú Desplegable de Álbumes */}
                  {openAlbumDropdownPhoto === photo.name && (
                    <div
                      data-album-dropdown
                      className="absolute top-11 right-3 bg-brand-cream border border-brand-navy/25 rounded-xs p-2 shadow-xl z-30 flex flex-col gap-1 w-44 animate-in fade-in duration-150 cursor-default"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-[9px] uppercase font-bold text-brand-navy/40 tracking-wider px-2 py-1 border-b border-brand-navy/5">
                        Añadir al álbum
                      </p>
                      {albums.map((album) => (
                        <button
                          key={album.id}
                          onClick={async (e) => {
                            e.stopPropagation();
                            setOpenAlbumDropdownPhoto(null);
                            await handleAddPhotoToAlbum(photo.name, album.id);
                          }}
                          className={`w-full text-left text-[11px] font-medium py-1.5 px-2 hover:bg-brand-navy/5 rounded-xs transition-colors cursor-pointer ${
                            photo.album_id === album.id ? "text-brand-timber font-semibold" : "text-brand-navy"
                          }`}
                        >
                          {album.name} {photo.album_id === album.id ? "✓" : ""}
                        </button>
                      ))}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setOpenAlbumDropdownPhoto(null);
                          await handleAddPhotoToAlbum(photo.name, null);
                        }}
                        className="w-full text-left text-[10px] font-bold text-red-600 py-1.5 px-2 hover:bg-red-50 rounded-xs transition-colors cursor-pointer border-t border-brand-navy/5"
                      >
                        Quitar del álbum
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Lightbox para ver la imagen a pantalla completa */}
      {activeLightboxPhoto && (
        <div
          onClick={() => setActiveLightboxPhoto(null)}
          className="fixed inset-0 bg-brand-navy/90 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
        >
          <button
            onClick={() => setActiveLightboxPhoto(null)}
            className="absolute top-6 right-6 text-brand-cream/65 hover:text-brand-cream transition-colors p-2 cursor-pointer"
            title="Cerrar"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeLightboxPhoto}
            alt="Recuerdo Familiar Ampliado"
            className="max-w-full max-h-[85vh] object-contain rounded-xs border border-brand-cream/20 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
