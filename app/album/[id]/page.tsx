"use client";

import { use, useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { generateUUID, isValidUUID } from "@/lib/uuid";
import { useSearchParams } from "next/navigation";
import exifr from "exifr";
import { filterPhotos, analyzePhotoWithGemini, getReverseGeocoding, PersonProfile, PhotoMetadata, PhotoItem } from "@/lib/search";

interface AlbumItem {
  id: string;
  name: string;
  coverUrl?: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AlbumPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("search") || "";

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [albumName, setAlbumName] = useState<string>(`Álbum #${id}`);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeLightboxPhoto, setActiveLightboxPhoto] = useState<{ url: string; name: string } | null>(null);
  const [rotations, setRotations] = useState<Record<string, number>>({});
  // Estados para Búsqueda Inteligente e IA
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [taggedPhotos, setTaggedPhotos] = useState<Record<string, string[]>>({});
  const [photoMetadata, setPhotoMetadata] = useState<Record<string, PhotoMetadata>>({});

  const [albumCover, setAlbumCover] = useState<string | null>(null);

  // Estado de selección por lotes
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());

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

  // Quitar foto del álbum (no la borra, solo la desasocia)
  const removeFromAlbum = async (photoName: string) => {
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

    if (!localActive) {
      try {
        const nameWithoutExt = photoName.replace(/\.[^/.]+$/, "");
        const cleanPhotoId = nameWithoutExt.split(".")[0];
        const photoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : photoName;

        if (isValidUUID(photoId) && isValidUUID(id)) {
          const { error } = await supabase
            .from("photos")
            .update({ album_id: null })
            .eq("id", photoId);
          if (error) throw error;
        }

        window.dispatchEvent(new CustomEvent("photo-moved"));
        await fetchAlbumData();
      } catch (err) {
        console.error("Fallo al quitar del álbum en Supabase:", err);
        window.dispatchEvent(new CustomEvent("supabase-connection-error"));
      }
    } else {
      const mappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
      const mappings = JSON.parse(mappingsJson);
      delete mappings[photoName];
      localStorage.setItem("family_album_photo_mappings", JSON.stringify(mappings));
      window.dispatchEvent(new CustomEvent("photo-moved"));
      await fetchAlbumData();
    }
  };

  const removeSelectedFromAlbum = async () => {
    for (const photoName of selectedPhotos) {
      await removeFromAlbum(photoName);
    }
    setSelectedPhotos(new Set());
    setIsSelectMode(false);
  };

  // Obtener nombre del álbum y filtrar fotos
  const fetchAlbumData = async () => {
    try {
      setLoading(true);
      const localActive = localStorage.getItem("family_album_local_mode_active") === "true";
      let allPhotos: PhotoItem[] = [];

      // 1. Obtener nombre del álbum
      if (!localActive) {
        try {
          const { data: dbAlbum } = await supabase
            .from("albums")
            .select("name")
            .eq("id", id)
            .single();
          if (dbAlbum) {
            setAlbumName(dbAlbum.name);
          }
        } catch (err) {
          console.error("Error al obtener nombre de álbum en Supabase:", err);
          window.dispatchEvent(new CustomEvent("supabase-connection-error"));
        }
      } else {
        const localAlbums = localStorage.getItem("family_album_local_albums");
        if (localAlbums) {
          const parsed = JSON.parse(localAlbums) as AlbumItem[];
          const found = parsed.find((a) => a.id === id);
          if (found) {
            setAlbumName(found.name);
            setAlbumCover(found.coverUrl || null);
          }
        }
      }

      // 2. Obtener fotos
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

            let dbMappings: Record<string, string> = {};
            const { data: dbPhotos } = await supabase
              .from("photos")
              .select("id, album_id")
              .eq("album_id", id);
            if (dbPhotos) {
              dbPhotos.forEach((p) => {
                if (p.album_id) dbMappings[p.id] = p.album_id;
              });
            }

            let dbStatusMappings: Record<string, string> = {};
            const { data: dbAllPhotos } = await supabase.from("photos").select("id, status");
            if (dbAllPhotos) {
              dbAllPhotos.forEach((p) => {
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

              const albumId = dbMappings[photoId] || null;
              const status = dbStatusMappings[photoId] || null;

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
          console.error("Fallo al conectar con Supabase Storage en el álbum:", err);
          window.dispatchEvent(new CustomEvent("supabase-connection-error"));
          return;
        }
      } else {
        // --- MODO LOCAL ---
        const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
        const localPhotos: PhotoItem[] = JSON.parse(localPhotosJson);

        const localMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
        const localMappings = JSON.parse(localMappingsJson);

        const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
        const localStatusMappings = JSON.parse(localStatusMappingsJson);

        allPhotos = localPhotos.map((photo) => ({
          ...photo,
          album_id: localMappings[photo.name] !== undefined ? localMappings[photo.name] : photo.album_id,
          status: localStatusMappings[photo.name] !== undefined ? localStatusMappings[photo.name] : photo.status,
        }));
      }

      // 3. Filtrar y ordenar
      const albumPhotos = allPhotos
        .filter((photo) => photo.album_id === id && photo.status !== "trash")
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

      setPhotos(albumPhotos);
    } catch (err) {
      console.error("Error al cargar fotos del álbum:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRotatePhoto = (photoName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const currentRotation = rotations[photoName] || 0;
    const newRotation = (currentRotation + 90) % 360;
    const updatedRotations = {
      ...rotations,
      [photoName]: newRotation,
    };
    setRotations(updatedRotations);
    localStorage.setItem("family_album_photo_rotations", JSON.stringify(updatedRotations));
    window.dispatchEvent(new CustomEvent("photo-moved"));
  };

  useEffect(() => {
    fetchAlbumData();

    // Escuchar cambios reactivos en caso de que se quiten fotos del álbum o se muevan
    const handlePhotoMoved = () => {
      fetchAlbumData();
      const savedRotations = localStorage.getItem("family_album_photo_rotations");
      if (savedRotations) {
        setRotations(JSON.parse(savedRotations));
      }
    };
    window.addEventListener("photo-moved", handlePhotoMoved);
    window.addEventListener("local-mode-changed", handlePhotoMoved);
    return () => {
      window.removeEventListener("photo-moved", handlePhotoMoved);
      window.removeEventListener("local-mode-changed", handlePhotoMoved);
    };
  }, [id]);

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
          const maxDim = 1200;

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
            0.90
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
      
      // Notificar a la UI
      window.dispatchEvent(new CustomEvent("photo-moved"));
    } catch (err) {
      console.error("Error en evaluación automática de IA en subida (álbum):", err);
    }
  };

  // Manejar subida de archivos
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    try {
      setUploading(true);
      setUploadStatus(null);

      let successCount = 0;
      let errorCount = 0;
      const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) {
          console.warn("Archivo omitido porque no es una imagen:", file.name);
          errorCount++;
          continue;
        }

        setUploadStatus({
          type: "success",
          message: `Procesando y subiendo foto ${i + 1} de ${files.length}: "${file.name}"...`,
        });

        const fileExt = file.name.split(".").pop();
        const photoId = generateUUID();

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
        } catch (exifErr: any) {
          const isUnknownFormat = exifErr?.message?.includes("Unknown file format");
          if (!isUnknownFormat) {
            console.warn("No se encontraron metadatos GPS EXIF en esta foto:", exifErr);
          }
        }

        const thumbnailName = `${photoId}.webp`;

        if (!localActive) {
          // MODO ONLINE: Solo Supabase
          try {
            const originalPath = `originals/${photoId}.${fileExt}`;
            const { error: origError } = await supabase.storage
              .from("family-album")
              .upload(originalPath, file, {
                cacheControl: "3600",
                upsert: false,
              });

            if (origError) throw origError;

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

            const { error: dbError } = await supabase.from("photos").insert({
              id: photoId,
              album_id: isValidUUID(id) ? id : null,
              status: "active",
              latitude: latitude,
              longitude: longitude,
            });
            if (dbError) throw dbError;

            successCount++;
            triggerAIEvaluation(thumbnailName, base64Image, latitude, longitude);
          } catch (err) {
            console.error("Fallo al subir a Supabase en modo online:", err);
            errorCount++;
            window.dispatchEvent(new CustomEvent("supabase-connection-error"));
            break;
          }
        } else {
          // MODO LOCAL: Solo LocalStorage
          const localThumbnailName = `${photoId}.webp`;
          try {
            const newPhoto: PhotoItem = {
              name: localThumbnailName,
              url: base64Image,
              created_at: new Date().toISOString(),
              album_id: id,
              status: "active",
              latitude: latitude,
              longitude: longitude,
            };

            const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
            const localPhotos = JSON.parse(localPhotosJson);
            localPhotos.unshift(newPhoto);
            localStorage.setItem("family_album_local_photos", JSON.stringify(localPhotos));

            const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
            const localStatusMappings = JSON.parse(localStatusMappingsJson);
            localStatusMappings[localThumbnailName] = "active";
            localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));

            const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
            const localAlbumMappings = JSON.parse(localAlbumMappingsJson);
            localAlbumMappings[localThumbnailName] = id;
            localStorage.setItem("family_album_photo_mappings", JSON.stringify(localAlbumMappings));

            successCount++;
            triggerAIEvaluation(localThumbnailName, base64Image, latitude, longitude);
          } catch (fallbackErr) {
            console.error("Fallo al guardar en LocalStorage:", fallbackErr);
            errorCount++;
          }
        }
      }

      await fetchAlbumData();

      if (errorCount === 0) {
        setUploadStatus({
          type: "success",
          message: `¡Se subieron y optimizaron con éxito ${successCount} fotos en este álbum!`,
        });
      } else {
        setUploadStatus({
          type: "error",
          message: `Subida completada: ${successCount} fotos subidas con éxito, ${errorCount} fallaron.`,
        });
      }

      window.dispatchEvent(new CustomEvent("photo-moved"));

    } catch (error) {
      console.error("Error general en el proceso de subida:", error);
      setUploadStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Error al procesar las imágenes.",
      });
    } finally {
      setUploading(false);
    }
  };

  // Establecer foto como portada del álbum
  const setAlbumCoverImage = (url: string) => {
    try {
      const localAlbumsJson = localStorage.getItem("family_album_local_albums");
      if (localAlbumsJson) {
        const parsed = JSON.parse(localAlbumsJson) as AlbumItem[];
        const updated = parsed.map((a) => a.id === id ? { ...a, coverUrl: url } : a);
        localStorage.setItem("family_album_local_albums", JSON.stringify(updated));
        setAlbumCover(url);
        
        // Refrescar Sidebar
        window.dispatchEvent(new CustomEvent("refresh-albums"));
        
        setUploadStatus({
          type: "success",
          message: "¡Foto de portada del álbum actualizada con éxito!",
        });
      }
    } catch (err) {
      console.error("Error al actualizar portada del álbum:", err);
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

  const filteredPhotos = filterPhotos(
    photos,
    searchQuery,
    [{ id, name: albumName }],
    people,
    taggedPhotos,
    photoMetadata
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex-1 p-4 md:p-8 space-y-6 md:space-y-8 bg-brand-cream overflow-y-auto transition-all ${
        isDragOver ? "bg-brand-sage/10 animate-pulse" : ""
      }`}
    >
      {/* Cabecera del Álbum */}
      {albumCover ? (
        <div className="max-w-6xl mx-auto relative h-40 sm:h-48 rounded-xs overflow-hidden border border-brand-navy/10 shadow-sm group mb-6">
          <img src={albumCover} alt={albumName} className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-700" />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/90 via-brand-navy/30 to-transparent flex flex-col justify-end p-6" />
          <div className="absolute bottom-6 left-6 text-brand-cream space-y-1 bg-transparent">
            <h1 className="text-xl sm:text-2xl font-light tracking-wide uppercase">
              {albumName}
            </h1>
            <p className="text-[10px] sm:text-xs text-brand-cream/75 bg-transparent font-medium">
              Álbum de fotos • {filteredPhotos.length} {filteredPhotos.length === 1 ? "recuerdo" : "recuerdos"}
              {searchQuery && ` (filtrado de un total de ${photos.length})`}
            </p>
          </div>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto flex items-center justify-between border-b border-brand-navy/10 pb-5 bg-transparent">
          <div className="space-y-1 bg-transparent">
            <h1 className="text-2xl font-light tracking-wide text-brand-navy">
              {albumName}
            </h1>
            <p className="text-[11px] text-brand-navy/55 bg-transparent">
              Álbum de fotos • {filteredPhotos.length} {filteredPhotos.length === 1 ? "recuerdo" : "recuerdos"}
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
                  <button
                    onClick={removeSelectedFromAlbum}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-red-400 text-red-600 hover:bg-red-50 rounded-xs text-[11px] font-semibold transition-all cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Quitar del álbum
                  </button>
                )}
                <button
                  onClick={() => { setIsSelectMode(false); setSelectedPhotos(new Set()); }}
                  className="px-3 py-1.5 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy rounded-xs text-[11px] font-semibold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsSelectMode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy rounded-xs text-[11px] font-semibold transition-all cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Seleccionar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cuadrícula de fotos del álbum */}
      <div className="max-w-6xl mx-auto">
        {/* Notificación de Estado de Subida */}
        {uploadStatus && (
          <div
            className={`mb-6 p-3.5 rounded-xs border text-xs flex items-center gap-3 bg-brand-cream/80 ${
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

        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => handleUpload(e.target.files)}
          className="hidden"
          accept="image/*"
          multiple
        />

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="aspect-square bg-brand-navy/5 rounded-xs border border-brand-navy/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6">
            {/* Tarjeta de Subida del Disco Duro */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square border border-dashed border-brand-navy/20 hover:border-brand-navy/60 rounded-xs flex flex-col items-center justify-center gap-3 cursor-pointer bg-brand-cream/40 hover:bg-brand-cream/70 transition-all select-none"
            >
              <div className="w-10 h-10 border border-brand-navy/20 text-brand-navy rounded-full flex items-center justify-center bg-transparent">
                {uploading ? (
                  <svg className="animate-spin h-4 w-4 text-brand-navy" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-brand-navy" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                )}
              </div>
              <div className="text-center bg-transparent">
                <p className="text-xs font-semibold text-brand-navy bg-transparent">
                  {uploading ? "Subiendo foto..." : "Subir Foto"}
                </p>
                <p className="text-[9px] text-brand-navy/40 bg-transparent mt-0.5 max-w-[100px] mx-auto leading-tight">
                  Arrastra un archivo o haz clic para buscar
                </p>
              </div>
            </div>

            {/* Renderizado de Fotos */}
            {filteredPhotos.map((photo) => {
              const nameWithoutWebp = photo.name.replace(/\.webp$/, "");
              const isRemote = photo.url.includes("supabase.co");
              const originalUrl = isRemote
                ? supabase.storage.from("family-album").getPublicUrl(`originals/${nameWithoutWebp}`).data.publicUrl
                : photo.url;

              const isCurrentCover = albumCover === photo.url;

              return (
                <div
                  key={photo.name}
                  onClick={() => isSelectMode ? toggleSelectPhoto(photo.name) : setActiveLightboxPhoto({ url: originalUrl, name: photo.name })}
                  className={`group relative aspect-square bg-brand-cream/50 rounded-xs overflow-hidden border transition-all duration-300 select-none ${
                    isSelectMode
                      ? selectedPhotos.has(photo.name)
                        ? "border-brand-navy ring-2 ring-brand-navy cursor-pointer"
                        : "border-brand-navy/10 hover:border-brand-navy/40 cursor-pointer"
                      : isCurrentCover
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
                    className="w-full h-full object-cover border border-brand-navy/5 transition-transform duration-500 group-hover:scale-103"
                    style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }}
                    loading="lazy"
                  />
                  
                  {/* Hover overlay con desenfoque de cristal */}
                  {!isSelectMode && (
                  <div className="absolute inset-0 bg-black/45 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-350 flex flex-col justify-between p-4 z-10">
                    <div className="flex justify-end bg-transparent">
                      {/* Botón Quitar del álbum */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromAlbum(photo.name);
                        }}
                        className="p-2 border border-red-400/40 hover:bg-red-500/20 text-red-400 rounded-xs transition-all cursor-pointer"
                        title="Quitar del álbum"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="bg-transparent space-y-2">
                      <div className="bg-transparent text-left">
                        <p className="text-brand-cream/70 text-[10px] mt-0.5">
                          {photo.created_at ? new Date(photo.created_at).toLocaleDateString("es-ES") : ""}
                        </p>
                        {photoMetadata[photo.name] && (
                          <div className="bg-transparent space-y-0.5 pt-1">
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
                      <div className="flex gap-2 bg-transparent w-full">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveLightboxPhoto({ url: originalUrl, name: photo.name });
                          }}
                          className="flex-1 py-1.5 px-2.5 border border-brand-cream/30 hover:bg-brand-cream/10 text-brand-cream text-[10px] sm:text-[11px] font-medium rounded-xs text-center transition-all cursor-pointer"
                        >
                          Ver Original
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAlbumCoverImage(photo.url);
                          }}
                          className="py-1.5 px-2.5 bg-brand-cream text-brand-navy hover:bg-brand-navy hover:text-brand-cream text-[10px] sm:text-[11px] font-semibold rounded-xs text-center transition-all cursor-pointer"
                        >
                          Portada
                        </button>
                      </div>
                    </div>
                  </div>
                  )}

                  {/* Etiqueta persistente para la portada actual del álbum */}
                  {isCurrentCover && (
                    <div className="absolute bottom-0 inset-x-0 bg-brand-navy/85 text-[8px] text-brand-cream py-0.5 text-center font-bold tracking-wider uppercase z-20">
                      Portada
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {activeLightboxPhoto && (
        <div
          onClick={() => setActiveLightboxPhoto(null)}
          className="fixed inset-0 bg-brand-navy/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{
            cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='14' cy='14' r='8' fill='none' stroke='black' stroke-width='3'/%3E%3Cline x1='20' y1='20' x2='28' y2='28' stroke='black' stroke-width='3'/%3E%3Cpath d='M11 11 L17 17 M17 11 L11 17' stroke='black' stroke-width='3'/%3E%3Ccircle cx='14' cy='14' r='8' fill='none' stroke='white' stroke-width='2'/%3E%3Cline x1='20' y1='20' x2='28' y2='28' stroke='white' stroke-width='2'/%3E%3Cpath d='M11 11 L17 17 M17 11 L11 17' stroke='white' stroke-width='2'/%3E%3C/svg%3E") 14 14, pointer`
          }}
        >
          <div className="absolute top-6 right-6 flex items-center gap-4 z-50">
            {/* Botón de girar */}
            <button
              onClick={(e) => handleRotatePhoto(activeLightboxPhoto.name, e)}
              className="text-brand-cream/65 hover:text-brand-cream transition-colors p-2 cursor-pointer bg-brand-navy/50 hover:bg-brand-navy/80 rounded-full"
              title="Girar foto 90°"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
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
            alt="Recuerdo Familiar Ampliado"
            className="max-w-full max-h-[85vh] object-contain rounded-xs border border-brand-cream/20 shadow-2xl animate-in zoom-in-95 duration-200 transition-transform duration-300"
            style={{
              transform: `rotate(${rotations[activeLightboxPhoto.name] || 0}deg)`,
              cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='14' cy='14' r='8' fill='none' stroke='black' stroke-width='3'/%3E%3Cline x1='20' y1='20' x2='28' y2='28' stroke='black' stroke-width='3'/%3E%3Cpath d='M11 11 L17 17 M17 11 L11 17' stroke='black' stroke-width='3'/%3E%3Ccircle cx='14' cy='14' r='8' fill='none' stroke='white' stroke-width='2'/%3E%3Cline x1='20' y1='20' x2='28' y2='28' stroke='white' stroke-width='2'/%3E%3Cpath d='M11 11 L17 17 M17 11 L11 17' stroke='white' stroke-width='2'/%3E%3C/svg%3E") 14 14, pointer`
            }}
          />
        </div>
      )}
    </div>
  );
}
