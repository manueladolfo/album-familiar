"use client";

import { use, useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { generateUUID, isValidUUID } from "@/lib/uuid";
import { useSearchParams } from "next/navigation";

interface PhotoItem {
  name: string;
  url: string;
  created_at: string | null;
  album_id?: string | null;
  status?: string | null;
}

interface AlbumItem {
  id: string;
  name: string;
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
  const [activeLightboxPhoto, setActiveLightboxPhoto] = useState<string | null>(null);

  // Obtener nombre del álbum y filtrar fotos
  const fetchAlbumData = async () => {
    try {
      setLoading(true);

      // 1. Obtener nombre del álbum
      try {
        const { data: dbAlbum } = await supabase
          .from("albums")
          .select("name")
          .eq("id", id)
          .single();
        if (dbAlbum) {
          setAlbumName(dbAlbum.name);
        } else {
          const localAlbums = localStorage.getItem("family_album_local_albums");
          if (localAlbums) {
            const parsed = JSON.parse(localAlbums) as AlbumItem[];
            const found = parsed.find((a) => a.id === id);
            if (found) setAlbumName(found.name);
          }
        }
      } catch {
        const localAlbums = localStorage.getItem("family_album_local_albums");
        if (localAlbums) {
          const parsed = JSON.parse(localAlbums) as AlbumItem[];
          const found = parsed.find((a) => a.id === id);
          if (found) setAlbumName(found.name);
        }
      }

      // 2. Intentar obtener fotos de Supabase Storage
      let remotePhotos: PhotoItem[] = [];
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

          // Obtener asociaciones de base de datos remota
          let dbMappings: Record<string, string> = {};
          try {
            const { data: dbPhotos } = await supabase
              .from("photos")
              .select("id, album_id")
              .eq("album_id", id);
            if (dbPhotos) {
              dbPhotos.forEach((p) => {
                if (p.album_id) dbMappings[p.id] = p.album_id;
              });
            }
          } catch {
            // Ignorar
          }

          // Obtener estados remotos
          let dbStatusMappings: Record<string, string> = {};
          try {
            const { data: dbPhotos } = await supabase.from("photos").select("id, status");
            if (dbPhotos) {
              dbPhotos.forEach((p) => {
                if (p.status) dbStatusMappings[p.id] = p.status;
              });
            }
          } catch {
            // Ignorar
          }

          // Obtener de LocalStorage
          const localMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
          const localMappings = JSON.parse(localMappingsJson);

          const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
          const localStatusMappings = JSON.parse(localStatusMappingsJson);

          const combinedMappings = { ...dbMappings, ...localMappings };
          const combinedStatusMappings = { ...dbStatusMappings, ...localStatusMappings };

          remotePhotos = validFiles.map((file) => {
            const { data: urlData } = supabase.storage
              .from("family-album")
              .getPublicUrl(`thumbnails/${file.name}`);

            const albumId = combinedMappings[file.name] || null;
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
        console.warn("Fallo al conectar con Supabase Storage en el álbum. Operando localmente...");
      }

      // 3. Obtener fotos locales sembradas/importadas
      const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
      const localPhotos: PhotoItem[] = JSON.parse(localPhotosJson);

      const localMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
      const localMappings = JSON.parse(localMappingsJson);

      const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
      const localStatusMappings = JSON.parse(localStatusMappingsJson);

      const updatedLocalPhotos = localPhotos.map((photo) => ({
        ...photo,
        album_id: localMappings[photo.name] !== undefined ? localMappings[photo.name] : photo.album_id,
        status: localStatusMappings[photo.name] !== undefined ? localStatusMappings[photo.name] : photo.status,
      }));

      // 4. Combinar
      const allPhotos = [...remotePhotos];
      updatedLocalPhotos.forEach((localPhoto) => {
        if (!allPhotos.some((p) => p.name === localPhoto.name)) {
          allPhotos.push(localPhoto);
        }
      });

      // 5. Filtrar por este álbum específico y estado activo
      const albumPhotos = allPhotos
        .filter((photo) => photo.album_id === id && photo.status !== "trash")
        .sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });

      setPhotos(albumPhotos);
    } catch (err: any) {
      console.error("Error al cargar fotos del álbum:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlbumData();

    // Escuchar cambios reactivos en caso de que se quiten fotos del álbum o se muevan
    const handlePhotoMoved = () => fetchAlbumData();
    window.addEventListener("photo-moved", handlePhotoMoved);
    return () => window.removeEventListener("photo-moved", handlePhotoMoved);
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

      let uploadSuccess = false;

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
        const thumbnailName = `${uniqueName}.${fileExt}.webp`;
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

        // 3. Registrar en base de datos asociando a este álbum
        try {
          await supabase.from("photos").insert({
            id: generateUUID(),
            album_id: isValidUUID(id) ? id : null,
            status: "active",
          });
        } catch {
          // Fallback de mapeo si la DB falla pero el storage no
          const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
          const localStatusMappings = JSON.parse(localStatusMappingsJson);
          localStatusMappings[thumbnailName] = "active";
          localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));

          const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
          const localAlbumMappings = JSON.parse(localAlbumMappingsJson);
          localAlbumMappings[thumbnailName] = id;
          localStorage.setItem("family_album_photo_mappings", JSON.stringify(localAlbumMappings));
        }

        setUploadStatus({
          type: "success",
          message: "¡Foto subida y agregada correctamente a este álbum!",
        });
        uploadSuccess = true;
        await fetchAlbumData();
      } catch (err: any) {
        console.warn("Fallo al subir a Supabase. Activando almacenamiento local de respaldo...", err.message);
      }

      // Si no se subió a Supabase, guardamos localmente como fallback
      if (!uploadSuccess) {
        const thumbnailName = `${uniqueName}.webp`;
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64data = reader.result as string;
            
            const newPhoto: PhotoItem = {
              name: thumbnailName,
              url: base64data,
              created_at: new Date().toISOString(),
              album_id: id,
              status: "active"
            };

            // Guardar en family_album_local_photos
            const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
            const localPhotos = JSON.parse(localPhotosJson);
            localPhotos.unshift(newPhoto);
            localStorage.setItem("family_album_local_photos", JSON.stringify(localPhotos));

            // Guardar mappings y estado
            const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
            const localStatusMappings = JSON.parse(localStatusMappingsJson);
            localStatusMappings[thumbnailName] = "active";
            localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));

            const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
            const localAlbumMappings = JSON.parse(localAlbumMappingsJson);
            localAlbumMappings[thumbnailName] = id;
            localStorage.setItem("family_album_photo_mappings", JSON.stringify(localAlbumMappings));

            setUploadStatus({
              type: "success",
              message: "¡Foto optimizada y agregada localmente a este álbum!",
            });
          } catch (fallbackErr: any) {
            console.error("Fallo al guardar en LocalStorage:", fallbackErr);
            setUploadStatus({
              type: "error",
              message: `Fallo al guardar la foto localmente: ${fallbackErr.message}`,
            });
          } finally {
            await fetchAlbumData();
            setUploading(false);
          }
        };
        reader.readAsDataURL(compressedBlob);
      } else {
        setUploading(false);
      }

      // Notificar cambio al Sidebar para refrescar contadores
      window.dispatchEvent(new CustomEvent("photo-moved"));

    } catch (error: any) {
      console.error("Error general en el proceso de subida:", error);
      setUploadStatus({
        type: "error",
        message: error.message || "Error al procesar la imagen.",
      });
      setUploading(false);
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

  const filteredPhotos = photos.filter((photo) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const photoName = photo.name.toLowerCase();
    const photoYear = photo.created_at ? new Date(photo.created_at).getFullYear().toString() : "";
    return photoName.includes(query) || photoYear.includes(query);
  });

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
      <div className="max-w-6xl mx-auto flex items-center justify-between border-b border-brand-navy/10 pb-5 bg-transparent">
        <div className="space-y-1 bg-transparent">
          <h1 className="text-2xl font-light tracking-wide text-brand-navy">
            {albumName}
          </h1>
          <p className="text-[11px] text-brand-navy/55 bg-transparent">
            Álbum familiar con identificador "{id}" • {filteredPhotos.length} {filteredPhotos.length === 1 ? "foto" : "fotos"}
            {searchQuery && ` (filtrado de un total de ${photos.length})`}
          </p>
        </div>
      </div>

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

              return (
                <div
                  key={photo.name}
                  onClick={() => setActiveLightboxPhoto(originalUrl)}
                  className="group relative aspect-square bg-brand-cream/50 rounded-xs overflow-hidden border border-brand-navy/10 hover:border-brand-navy transition-all duration-300 cursor-zoom-in select-none"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="w-full h-full object-cover border border-brand-navy/5 transition-transform duration-500 group-hover:scale-103"
                    loading="lazy"
                  />
                  
                  {/* Hover overlay con desenfoque de cristal */}
                  <div className="absolute inset-0 bg-brand-navy/85 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-350 flex flex-col justify-end p-4 z-10">
                    <div className="bg-transparent mb-2">
                      <p className="text-brand-cream text-xs font-semibold tracking-wider uppercase truncate">
                        {photo.name.split("_").slice(1).join("_").replace(/\.webp$/, "")}
                      </p>
                      <p className="text-brand-cream/70 text-[10px] mt-0.5">
                        {photo.created_at ? new Date(photo.created_at).toLocaleDateString("es-ES") : ""}
                      </p>
                    </div>
                    <div className="flex gap-2 bg-transparent">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveLightboxPhoto(originalUrl);
                        }}
                        className="flex-1 py-1.5 px-3 border border-brand-cream/30 hover:bg-brand-cream/10 text-brand-cream text-[11px] font-medium rounded-xs text-center transition-all cursor-pointer"
                      >
                        Ver Original
                      </button>
                    </div>
                  </div>
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
