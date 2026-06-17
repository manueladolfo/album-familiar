"use client";

import { useState, useEffect, useRef } from "react";
import { supabase, isUserAdmin, saveRotationsToSupabase, loadRotationsFromSupabase, saveMetadataToSupabase, loadMetadataFromSupabase } from "@/lib/supabase";
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
  const [activeLightboxPhoto, setActiveLightboxPhoto] = useState<{ url: string; name: string } | null>(null);
  const [rotations, setRotations] = useState<Record<string, number>>({});
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    const checkAdmin = () => {
      const email = localStorage.getItem("family_album_user_email");
      setIsAdmin(isUserAdmin(email));
    };
    checkAdmin();
    window.addEventListener("photo-moved", checkAdmin);
    return () => window.removeEventListener("photo-moved", checkAdmin);
  }, []);

  // Estados para Búsqueda Inteligente e IA
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [taggedPhotos, setTaggedPhotos] = useState<Record<string, string[]>>({});
  const [photoMetadata, setPhotoMetadata] = useState<Record<string, PhotoMetadata>>({});

  // Estado de Favoritos
  const [favorites, setFavorites] = useState<string[]>([]);

  let filteredPhotos = filterPhotos(photos, searchQuery, albums, people, taggedPhotos, photoMetadata);

  if (filterParam === "favorites") {
    filteredPhotos = filteredPhotos.filter((photo) => favorites.includes(photo.name));
  }

  if (filterParam === "recent") {
    filteredPhotos = filteredPhotos.slice(0, 12);
  }

  useEffect(() => {
    const initData = async () => {
      const savedFavorites = localStorage.getItem("family_album_favorites");
      if (savedFavorites) {
        setFavorites(JSON.parse(savedFavorites));
      }
      const remoteRots = await loadRotationsFromSupabase();
      if (remoteRots) {
        setRotations(remoteRots);
        localStorage.setItem("family_album_photo_rotations", JSON.stringify(remoteRots));
      } else {
        const savedRotations = localStorage.getItem("family_album_photo_rotations");
        if (savedRotations) {
          setRotations(JSON.parse(savedRotations));
        }
      }
    };
    initData();
  }, []);

  const toggleFavorite = (photoName: string) => {
    const updated = favorites.includes(photoName)
      ? favorites.filter((name) => name !== photoName)
      : [...favorites, photoName];
    setFavorites(updated);
    localStorage.setItem("family_album_favorites", JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("photo-moved"));
  };

  const handleRotatePhoto = async (photoName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const currentRotation = rotations[photoName] || 0;
    const newRotation = (currentRotation + 90) % 360;
    const updatedRotations = {
      ...rotations,
      [photoName]: newRotation,
    };
    setRotations(updatedRotations);
    localStorage.setItem("family_album_photo_rotations", JSON.stringify(updatedRotations));
    await saveRotationsToSupabase(updatedRotations);
    window.dispatchEvent(new CustomEvent("photo-moved"));
  };

  // Estado y manejadores para el menú de asignación rápida de álbum
  const [openAlbumDropdownPhoto, setOpenAlbumDropdownPhoto] = useState<string | null>(null);
  const [openLightboxAlbumDropdown, setOpenLightboxAlbumDropdown] = useState<string | null>(null);

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
    // Si fue long press, evitamos que el click del contenedor se dispare
    if (isLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handlePrevPhoto = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!activeLightboxPhoto) return;
    const currentIndex = filteredPhotos.findIndex((p) => p.name === activeLightboxPhoto.name);
    if (currentIndex > 0) {
      const prevPhoto = filteredPhotos[currentIndex - 1];
      const isRemote = prevPhoto.url.includes("supabase.co");
      let originalUrl: string;
      if (prevPhoto.url_original) {
        originalUrl = prevPhoto.url_original;
      } else if (isRemote) {
        const nameWithoutWebp = prevPhoto.name.replace(/\.webp$/, "");
        originalUrl = supabase.storage.from("family-album").getPublicUrl(`originals/${nameWithoutWebp}`).data.publicUrl;
      } else {
        originalUrl = prevPhoto.url;
      }
      setActiveLightboxPhoto({ url: originalUrl, name: prevPhoto.name });
      setOpenLightboxAlbumDropdown(null);
    }
  };

  const handleNextPhoto = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!activeLightboxPhoto) return;
    const currentIndex = filteredPhotos.findIndex((p) => p.name === activeLightboxPhoto.name);
    if (currentIndex < filteredPhotos.length - 1) {
      const nextPhoto = filteredPhotos[currentIndex + 1];
      const isRemote = nextPhoto.url.includes("supabase.co");
      let originalUrl: string;
      if (nextPhoto.url_original) {
        originalUrl = nextPhoto.url_original;
      } else if (isRemote) {
        const nameWithoutWebp = nextPhoto.name.replace(/\.webp$/, "");
        originalUrl = supabase.storage.from("family-album").getPublicUrl(`originals/${nameWithoutWebp}`).data.publicUrl;
      } else {
        originalUrl = nextPhoto.url;
      }
      setActiveLightboxPhoto({ url: originalUrl, name: nextPhoto.name });
      setOpenLightboxAlbumDropdown(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeLightboxPhoto) return;
      if (e.key === "ArrowLeft") {
        handlePrevPhoto();
      } else if (e.key === "ArrowRight") {
        handleNextPhoto();
      } else if (e.key === "Escape") {
        setActiveLightboxPhoto(null);
        setOpenLightboxAlbumDropdown(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeLightboxPhoto, filteredPhotos]);

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

  const moveSelectedToTrash = async () => {
    for (const photoName of selectedPhotos) {
      await moveToTrash(photoName);
    }
    setSelectedPhotos(new Set());
    setIsSelectMode(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;
      if (
        target &&
        !target.closest("[data-album-dropdown-trigger]") &&
        !target.closest("[data-album-dropdown]")
      ) {
        setOpenAlbumDropdownPhoto(null);
      }
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

  const handleAddPhotoToAlbum = async (photoName: string, albumId: string | null) => {
    const isLocalMode = localStorage.getItem("family_album_local_mode_active") === "true";

    if (!isLocalMode) {
      // MODO ONLINE: Solo Supabase
      try {
        console.log(`[AlbumAssign] Asociando foto "${photoName}" al álbum "${albumId}" en Supabase`);
        const nameWithoutExt = photoName.replace(/\.[^/.]+$/, "");
        const cleanPhotoId = nameWithoutExt.split(".")[0];
        const photoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : photoName;

        console.log(`[AlbumAssign] photoId extraído: "${photoId}", isValidUUID: ${isValidUUID(photoId)}`);

        if (!isValidUUID(photoId)) {
          console.error(`[AlbumAssign] No se pudo extraer un UUID válido de "${photoName}"`);
          setUploadStatus({ type: "error", message: `No se pudo identificar la foto "${photoName}"` });
          setTimeout(() => setUploadStatus(null), 4000);
          return;
        }

        if (albumId !== null && !isValidUUID(albumId)) {
          console.error(`[AlbumAssign] albumId "${albumId}" no es un UUID válido`);
          setUploadStatus({ type: "error", message: `Álbum no válido` });
          setTimeout(() => setUploadStatus(null), 4000);
          return;
        }

        const { data, error, count } = await supabase
          .from("photos")
          .update({ album_id: albumId })
          .eq("id", photoId)
          .select();

        if (error) throw error;

        if (!data || data.length === 0) {
          console.warn(`[AlbumAssign] La foto "${photoId}" no se encontró en la tabla photos o RLS bloqueó la operación`);
          setUploadStatus({ type: "error", message: "No se pudo asociar la foto al álbum. Verifica los permisos." });
          setTimeout(() => setUploadStatus(null), 4000);
          return;
        }

        console.log(`[AlbumAssign] Actualizado en Supabase correctamente:`, data);
        const albumLabel = albumId ? albums.find(a => a.id === albumId)?.name || "álbum" : "";
        setUploadStatus({ type: "success", message: albumId ? `Foto añadida a "${albumLabel}"` : "Foto quitada del álbum" });
        setTimeout(() => setUploadStatus(null), 3000);

        window.dispatchEvent(
          new CustomEvent("photo-moved", {
            detail: { photoId: photoName, albumId },
          })
        );
        await fetchPhotos();
      } catch (err: any) {
        console.error("[AlbumAssign] Fallo al actualizar en Supabase:", err);
        setUploadStatus({ type: "error", message: `Error al asignar álbum: ${err?.message || String(err)}` });
        setTimeout(() => setUploadStatus(null), 5000);
      }
    } else {
      // MODO LOCAL: Solo LocalStorage
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
      const isLocalMode = localStorage.getItem("family_album_local_mode_active") === "true";
      if (!isLocalMode) {
        const { data, error } = await supabase.from("albums").select("id, name, cover_url");
        if (error) throw error;
        if (data) {
          const filtered = data.filter((a) => !a.name.startsWith("__system_"));
          setAlbums(filtered);
        }
      } else {
        const localAlbums = localStorage.getItem("family_album_local_albums");
        if (localAlbums) setAlbums(JSON.parse(localAlbums));
      }
    } catch (err) {
      console.error("Error al cargar álbumes de Supabase:", err);
    }
  };

  // Cargar fotos y cruzar con base de datos + LocalStorage + Semillero
  const fetchPhotos = async () => {
    try {
      setLoading(true);
      const isLocalMode = localStorage.getItem("family_album_local_mode_active") === "true";
      let allPhotos: PhotoItem[] = [];

      if (!isLocalMode) {
        // --- MODO ONLINE: Solo Supabase ---
        try {
          const { data: storageData, error: storageError } = await supabase.storage
            .from("family-album")
            .list("thumbnails", {
              limit: 100,
              sortBy: { column: "created_at", order: "desc" },
            });

          if (storageError) throw storageError;

          if (storageData) {
            const validFiles = storageData.filter((file) => file.name !== ".emptyFolderPlaceholder");

            // Mappings remotos de base de datos
            let dbAlbumMappings: Record<string, string> = {};
            let dbStatusMappings: Record<string, string> = {};
            
            const { data: dbPhotos, error: dbPhotosError } = await supabase
              .from("photos")
              .select("id, album_id, status, url_original, url_thumbnail");

            if (dbPhotosError) throw dbPhotosError;

            let dbUrlOriginalMappings: Record<string, string> = {};
            if (dbPhotos) {
              dbPhotos.forEach((p) => {
                if (p.album_id) dbAlbumMappings[p.id] = p.album_id;
                if (p.status) dbStatusMappings[p.id] = p.status;
                if (p.url_original) dbUrlOriginalMappings[p.id] = p.url_original;
              });
            }

            allPhotos = validFiles.map((file) => {
              const { data: urlData } = supabase.storage
                .from("family-album")
                .getPublicUrl(`thumbnails/${file.name}`);

              const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
              const cleanPhotoId = nameWithoutExt.split(".")[0];
              const photoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : file.name;

              const albumId = dbAlbumMappings[photoId] || null;
              const status = dbStatusMappings[photoId] || null;

              const urlOriginal = dbUrlOriginalMappings[photoId] || null;

              return {
                name: file.name,
                url: urlData.publicUrl,
                created_at: file.created_at,
                album_id: albumId,
                status: status,
                url_original: urlOriginal,
              };
            });
          }
        } catch (err) {
          console.error("Error al cargar fotos de Supabase:", err);
          return;
        }
      } else {
        // --- MODO LOCAL ---
        const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
        const localPhotos: PhotoItem[] = JSON.parse(localPhotosJson);

        const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
        const localAlbumMappings = JSON.parse(localAlbumMappingsJson);

        const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
        const localStatusMappings = JSON.parse(localStatusMappingsJson);

        allPhotos = localPhotos.map((photo) => ({
          ...photo,
          album_id: localAlbumMappings[photo.name] !== undefined ? localAlbumMappings[photo.name] : photo.album_id,
          status: localStatusMappings[photo.name] !== undefined ? localStatusMappings[photo.name] : photo.status,
        }));
      }

      // Filtrar activas (omitir status === 'trash') y ordenar por fecha de creación
      const activePhotos = allPhotos
        .filter((photo) => photo.status !== "trash")
        .sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });

      // Cargar personas, tags de personas y metadata de IA (Supabase o LocalStorage)
      const loadPeopleConfig = async () => {
        const localActive = localStorage.getItem("family_album_local_mode_active") === "true";
        let loadedPeople = null;
        let loadedTagged = null;

        if (!localActive) {
          try {
            const { data } = await supabase
              .from("albums")
              .select("id, name, cover_url")
              .eq("name", "__system_config__")
              .limit(1);

            if (data && data.length > 0 && data[0].cover_url) {
              const config = JSON.parse(data[0].cover_url);
              loadedPeople = config.people;
              loadedTagged = config.taggedPhotos;
            }
          } catch (err) {
            console.error("Error al cargar config de personas desde Supabase (Photos):", err);
          }
        }

        if (loadedPeople && loadedTagged) {
          setPeople(loadedPeople);
          setTaggedPhotos(loadedTagged);
          localStorage.setItem("family_album_people", JSON.stringify(loadedPeople));
          localStorage.setItem("family_album_person_tags", JSON.stringify(loadedTagged));
        } else {
          const peopleJson = localStorage.getItem("family_album_people") || "[]";
          setPeople(JSON.parse(peopleJson));

          const taggedJson = localStorage.getItem("family_album_person_tags") || "{}";
          setTaggedPhotos(JSON.parse(taggedJson));
        }
      };

      await loadPeopleConfig();

      const metadataJson = localStorage.getItem("family_album_photo_metadata") || "{}";
      setPhotoMetadata(JSON.parse(metadataJson));

      setPhotos(activePhotos);
    } catch (error) {
      console.error("Error al cargar fotos combinadas:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlbums();
    fetchPhotos();
 
    // Escuchar cambios globales de Drag & Drop o de actualización de fotos y álbumes
    const handlePhotoMoved = async () => {
      fetchPhotos();
      const remoteRots = await loadRotationsFromSupabase();
      if (remoteRots) {
        setRotations(remoteRots);
        localStorage.setItem("family_album_photo_rotations", JSON.stringify(remoteRots));
      } else {
        const savedRotations = localStorage.getItem("family_album_photo_rotations");
        if (savedRotations) {
          setRotations(JSON.parse(savedRotations));
        }
      }
    };
    const handleRefreshAlbums = () => fetchAlbums();
    window.addEventListener("photo-moved", handlePhotoMoved);
    window.addEventListener("refresh-albums", handleRefreshAlbums);
    window.addEventListener("local-mode-changed", handlePhotoMoved);
    window.addEventListener("local-mode-changed", handleRefreshAlbums);
    return () => {
      window.removeEventListener("photo-moved", handlePhotoMoved);
      window.removeEventListener("refresh-albums", handleRefreshAlbums);
      window.removeEventListener("local-mode-changed", handlePhotoMoved);
      window.removeEventListener("local-mode-changed", handleRefreshAlbums);
    };
  }, []);

  const compressImage = (file: File, maxDim = 1200, quality = 0.85): Promise<Blob> => {
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
            quality
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
        latitude: lat !== null ? lat : undefined,
        longitude: lon !== null ? lon : undefined,
      };

      localStorage.setItem("family_album_photo_metadata", JSON.stringify(metadata));
      
      const isLocalMode = localStorage.getItem("family_album_local_mode_active") === "true";
      if (!isLocalMode) {
        const remoteMeta = await loadMetadataFromSupabase() || {};
        const mergedMeta = { ...remoteMeta, ...metadata };
        await saveMetadataToSupabase(mergedMeta);
        localStorage.setItem("family_album_photo_metadata", JSON.stringify(mergedMeta));
      }
      
      // Notificar a los listados que cambie la UI
      window.dispatchEvent(new CustomEvent("photo-moved"));
    } catch (err) {
      console.error("Error en evaluación automática de IA en subida:", err);
    }
  };

  // Manejar subida de archivos
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    try {
      setUploading(true);
      setUploadStatus(null);

      let successCount = 0;
      const failedFiles: { name: string; reason: string }[] = [];
      const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) {
          console.warn("Archivo omitido porque no es una imagen:", file.name);
          failedFiles.push({ name: file.name, reason: "No es una imagen" });
          continue;
        }

        setUploadStatus({
          type: "success",
          message: `Procesando y subiendo foto ${i + 1} de ${files.length}: "${file.name}"...`,
        });

        const fileExt = file.name.split(".").pop();
        const photoId = generateUUID();

        const compressedBlob = await compressImage(file, 1200, 0.85);
        const compressedOriginalBlob = await compressImage(file, 2560, 0.85);

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
            const originalPath = `originals/${photoId}.webp`;
            const { error: origError } = await supabase.storage
              .from("family-album")
              .upload(originalPath, compressedOriginalBlob, {
                contentType: "image/webp",
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

            const { data: origUrlData } = supabase.storage
              .from("family-album")
              .getPublicUrl(originalPath);

            const { data: thumbUrlData } = supabase.storage
              .from("family-album")
              .getPublicUrl(thumbnailPath);

            const { error: dbError } = await supabase.from("photos").insert({
              id: photoId,
              album_id: null,
              status: "active",
              url_original: origUrlData.publicUrl,
              url_thumbnail: thumbUrlData.publicUrl,
            });
            if (dbError) throw dbError;

            successCount++;
            triggerAIEvaluation(thumbnailName, base64Image, latitude, longitude);
          } catch (err: any) {
            console.error("Fallo al subir a Supabase en modo online:", err);
            const reason = err?.message || String(err);
            failedFiles.push({ name: file.name, reason });
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
              album_id: null,
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

            successCount++;
            triggerAIEvaluation(localThumbnailName, base64Image, latitude, longitude);
          } catch (fallbackErr: any) {
            console.error("Fallo al guardar en LocalStorage:", fallbackErr);
            failedFiles.push({ name: file.name, reason: fallbackErr?.message || "Error de almacenamiento local" });
          }
        }
      }

      await fetchPhotos();

      if (failedFiles.length === 0) {
        setUploadStatus({
          type: "success",
          message: `¡Se subieron y optimizaron con éxito ${successCount} fotos!`,
        });
      } else {
        const fileList = failedFiles.length <= 5
          ? failedFiles.map(f => `"${f.name}" (${f.reason})`).join(", ")
          : failedFiles.slice(0, 5).map(f => `"${f.name}" (${f.reason})`).join(", ") + ` ...y ${failedFiles.length - 5} más`;
        const successMsg = successCount > 0 ? `${successCount} subidas con éxito. ` : "";
        setUploadStatus({
          type: "error",
          message: `${successMsg}Fallaron ${failedFiles.length}: ${fileList}`,
        });
      }
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

  // Mover foto a papelera (status = 'trash')
  const moveToTrash = async (photoName: string) => {
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

    if (!localActive) {
      try {
        const nameWithoutExt = photoName.replace(/\.[^/.]+$/, "");
        const cleanPhotoId = nameWithoutExt.split(".")[0];
        const photoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : photoName;

        let dbUpdated = false;

        if (isValidUUID(photoId)) {
          const { data, error } = await supabase
            .from("photos")
            .update({ status: "trash" })
            .eq("id", photoId)
            .select();

          if (error) throw error;
          dbUpdated = data && data.length > 0;
        }

        if (!dbUpdated) {
          // Foto huérfana: existe en storage pero no en la BD. Eliminar archivos directamente.
          console.warn(`[Trash] Foto "${photoName}" no encontrada en BD. Eliminando del storage directamente.`);
          
          // Eliminar thumbnail
          const { error: thumbDelError } = await supabase.storage
            .from("family-album")
            .remove([`thumbnails/${photoName}`]);
          if (thumbDelError) console.warn("[Trash] Error al borrar thumbnail:", thumbDelError);

          // Intentar eliminar posibles originales (probamos extensiones comunes)
          const possibleExts = ["jpg", "jpeg", "png", "heic", "webp"];
          const possibleOriginals = possibleExts.map(ext => `originals/${cleanPhotoId}.${ext}`);
          const { error: origDelError } = await supabase.storage
            .from("family-album")
            .remove(possibleOriginals);
          if (origDelError) console.warn("[Trash] Error al borrar originales:", origDelError);

          console.log(`[Trash] Archivos de storage eliminados para foto huérfana "${photoName}"`);
        } else {
          console.log(`[Trash] Foto "${photoId}" movida a la papelera en BD`);
        }

        setUploadStatus({ type: "success", message: "Foto eliminada correctamente" });
        setTimeout(() => setUploadStatus(null), 3000);
        
        window.dispatchEvent(new CustomEvent("photo-moved"));
        await fetchPhotos();
      } catch (err: any) {
        console.error("[Trash] Fallo al mover a papelera:", err);
        setUploadStatus({ type: "error", message: `Error al eliminar: ${err?.message || String(err)}` });
        setTimeout(() => setUploadStatus(null), 4000);
      }
    } else {
      const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
      const localStatusMappings = JSON.parse(localStatusMappingsJson);
      localStatusMappings[photoName] = "trash";
      localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));

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


  return (
    <div className="flex-1 p-4 md:p-8 space-y-6 md:space-y-8 bg-brand-cream overflow-y-auto">
      {/* Cargador de Imágenes */}
      {isAdmin && (
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
              multiple
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
      )}

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
          <div className="flex items-center gap-3 bg-transparent">
            {isSelectMode ? (
              <>
                <span className="text-[11px] text-brand-navy/60 select-none">
                  {selectedPhotos.size} seleccionada{selectedPhotos.size !== 1 ? "s" : ""}
                </span>
                {selectedPhotos.size > 0 && (
                  <button
                    onClick={moveSelectedToTrash}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-red-400 text-red-600 hover:bg-red-50 rounded-xs text-[11px] font-semibold transition-all cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Mover a papelera
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

              const albumName = getAlbumName(photo.album_id);

              return (
                <div
                  key={photo.name}
                  data-photo-card
                  draggable={!isSelectMode}
                  onDragStart={(e) => !isSelectMode && handlePhotoDragStart(e, photo.name)}
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
                  className={`group relative aspect-square bg-brand-cream/50 rounded-xs border transition-all duration-300 select-none ${
                    openAlbumDropdownPhoto === photo.name || activeActionMenuPhoto === photo.name ? "z-40" : "z-10"
                  } ${
                    isSelectMode
                      ? selectedPhotos.has(photo.name)
                        ? "border-brand-navy ring-2 ring-brand-navy cursor-pointer"
                        : "border-brand-navy/10 hover:border-brand-navy/40 cursor-pointer"
                      : activeActionMenuPhoto === photo.name
                        ? "border-brand-navy ring-2 ring-brand-navy cursor-zoom-in"
                        : "border-brand-navy/10 hover:border-brand-navy cursor-zoom-in active:cursor-grabbing"
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
                  {/* Contenedor visual recortado para la imagen y el hover overlay */}
                  <div className="absolute inset-0 rounded-xs overflow-hidden z-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.name}
                      className="w-full h-full object-cover border border-brand-navy/5 transition-transform duration-500 group-hover:scale-103"
                      style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }}
                      loading="lazy"
                    />

                    {/* Botón de Añadir a Álbum (más) permanente */}
                    {!isSelectMode && (
                      <div className="absolute top-2 right-2 z-30 flex">
                        <button
                          data-album-dropdown-trigger
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenAlbumDropdownPhoto(openAlbumDropdownPhoto === photo.name ? null : photo.name);
                          }}
                          className="p-1.5 bg-black/55 backdrop-blur-xs border border-white/20 text-white rounded-xs transition-all hover:bg-black/70 cursor-pointer flex items-center justify-center shadow-md"
                          title="Añadir a un álbum..."
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Botones de Favorito y Papelera (esquina superior izquierda) */}
                    {!isSelectMode && (
                      <div className={`absolute top-2 left-2 z-30 flex gap-1.5 bg-transparent transition-opacity duration-200 ${
                        activeActionMenuPhoto === photo.name 
                          ? "opacity-100 flex" 
                          : "hidden md:flex md:opacity-0 md:group-hover:opacity-100"
                      }`}>
                        {/* Botón de Favorito */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(photo.name);
                          }}
                          className="p-1.5 bg-black/55 backdrop-blur-xs border border-white/20 text-white rounded-xs transition-all hover:bg-black/70 cursor-pointer flex items-center justify-center"
                          title={favorites.includes(photo.name) ? "Quitar de favoritos" : "Marcar como favorito"}
                        >
                          <svg
                            className={`w-3.5 h-3.5 ${
                              favorites.includes(photo.name) ? "fill-red-500 text-red-500" : "text-white"
                            }`}
                            fill={favorites.includes(photo.name) ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        </button>

                        {/* Botón de enviar a la papelera */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveToTrash(photo.name);
                          }}
                          className="p-1.5 bg-black/55 backdrop-blur-xs border border-red-500/20 text-red-400 rounded-xs transition-all hover:bg-red-500/30 cursor-pointer flex items-center justify-center"
                          title="Mover a la papelera"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Hover overlay con desenfoque de cristal */}
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-350 flex flex-col justify-end p-4">
                      <div className="bg-transparent space-y-2 text-left">
                        <div className="bg-transparent space-y-1">
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
                              setActiveLightboxPhoto({ url: originalUrl, name: photo.name });
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

                  {/* Menú Desplegable de Álbumes */}
                  {openAlbumDropdownPhoto === photo.name && (
                    <div
                      data-album-dropdown
                      className="absolute top-11 right-3 bg-brand-cream border border-brand-navy/25 rounded-xs p-2 shadow-xl z-50 flex flex-col gap-1 w-44 animate-in fade-in duration-150 cursor-default"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-[9px] uppercase font-bold text-brand-navy/40 tracking-wider px-2 py-1 border-b border-brand-navy/5">
                        Añadir al álbum
                      </p>
                      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto py-1 scrollbar-thin">
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
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setOpenAlbumDropdownPhoto(null);
                          await handleAddPhotoToAlbum(photo.name, null);
                        }}
                        className="w-full text-left text-[10px] font-bold text-red-600 py-1.5 px-2 hover:bg-red-50 rounded-xs transition-colors cursor-pointer border-t border-brand-navy/5 mt-1 pt-1.5"
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
      {activeLightboxPhoto && (
        <div
          onClick={() => {
            setActiveLightboxPhoto(null);
            setOpenLightboxAlbumDropdown(null);
          }}
          className="fixed inset-0 bg-brand-navy/90 backdrop-blur-md z-60 flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{
            cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='14' cy='14' r='8' fill='none' stroke='black' stroke-width='3'/%3E%3Cline x1='20' y1='20' x2='28' y2='28' stroke='black' stroke-width='3'/%3E%3Cpath d='M11 11 L17 17 M17 11 L11 17' stroke='black' stroke-width='3'/%3E%3Ccircle cx='14' cy='14' r='8' fill='none' stroke='white' stroke-width='2'/%3E%3Cline x1='20' y1='20' x2='28' y2='28' stroke='white' stroke-width='2'/%3E%3Cpath d='M11 11 L17 17 M17 11 L11 17' stroke='white' stroke-width='2'/%3E%3C/svg%3E") 14 14, pointer`
          }}
        >
          <div className="absolute top-6 right-6 flex items-center gap-4 z-60">
            <button
              onClick={() => {
                setActiveLightboxPhoto(null);
                setOpenLightboxAlbumDropdown(null);
              }}
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
            className="max-w-full max-h-[80vh] object-contain rounded-xs border border-brand-cream/20 shadow-2xl animate-in zoom-in-95 duration-200 transition-transform duration-300"
            style={{
              transform: `rotate(${rotations[activeLightboxPhoto.name] || 0}deg)`,
              cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='14' cy='14' r='8' fill='none' stroke='black' stroke-width='3'/%3E%3Cline x1='20' y1='20' x2='28' y2='28' stroke='black' stroke-width='3'/%3E%3Cpath d='M11 11 L17 17 M17 11 L11 17' stroke='black' stroke-width='3'/%3E%3Ccircle cx='14' cy='14' r='8' fill='none' stroke='white' stroke-width='2'/%3E%3Cline x1='20' y1='20' x2='28' y2='28' stroke='white' stroke-width='2'/%3E%3Cpath d='M11 11 L17 17 M17 11 L11 17' stroke='white' stroke-width='2'/%3E%3C/svg%3E") 14 14, pointer`
            }}
          />

          {/* Botones de navegación (Flechas izquierda/derecha) */}
          {filteredPhotos.findIndex(p => p.name === activeLightboxPhoto.name) > 0 && (
            <button
              onClick={handlePrevPhoto}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/55 backdrop-blur-xs text-white rounded-full border border-white/20 transition-all hover:bg-black/75 cursor-pointer z-70 flex items-center justify-center shadow-lg"
              title="Foto anterior"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
          )}

          {filteredPhotos.findIndex(p => p.name === activeLightboxPhoto.name) < filteredPhotos.length - 1 && (
            <button
              onClick={handleNextPhoto}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/55 backdrop-blur-xs text-white rounded-full border border-white/20 transition-all hover:bg-black/75 cursor-pointer z-70 flex items-center justify-center shadow-lg"
              title="Siguiente foto"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )}

          {/* Barra de herramientas inferior del Lightbox */}
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-4 px-6 py-3 bg-black/60 backdrop-blur-md border border-white/10 rounded-full shadow-2xl z-70"
          >
            {/* Botón de Favorito */}
            <button
              onClick={() => toggleFavorite(activeLightboxPhoto.name)}
              className="p-2.5 text-white hover:text-red-400 transition-colors cursor-pointer flex items-center justify-center rounded-full hover:bg-white/10"
              title={favorites.includes(activeLightboxPhoto.name) ? "Quitar de favoritos" : "Marcar como favorito"}
            >
              <svg
                className={`w-5 h-5 ${
                  favorites.includes(activeLightboxPhoto.name) ? "fill-red-500 text-red-500" : "text-white"
                }`}
                fill={favorites.includes(activeLightboxPhoto.name) ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>

            {/* Separador */}
            <div className="w-[1px] h-6 bg-white/15" />

            {/* Botón de Añadir a Álbum */}
            <div className="relative">
              <button
                onClick={() => {
                  setOpenLightboxAlbumDropdown(openLightboxAlbumDropdown ? null : activeLightboxPhoto.name);
                }}
                className="p-2.5 text-white hover:text-brand-sage transition-colors cursor-pointer flex items-center justify-center rounded-full hover:bg-white/10"
                title="Añadir a un álbum..."
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>

              {/* Menú Desplegable de Álbumes en Lightbox */}
              {openLightboxAlbumDropdown === activeLightboxPhoto.name && (
                <div
                  className="absolute bottom-14 left-1/2 transform -translate-x-1/2 bg-brand-cream border border-brand-navy/25 rounded-xs p-2 shadow-2xl z-80 flex flex-col gap-1 w-44 animate-in fade-in slide-in-from-bottom-2 duration-150 cursor-default"
                >
                  <p className="text-[9px] uppercase font-bold text-brand-navy/40 tracking-wider px-2 py-1 border-b border-brand-navy/5">
                    Añadir al álbum
                  </p>
                  <div className="flex flex-col gap-1 max-h-40 overflow-y-auto py-1 scrollbar-thin">
                    {albums.map((album) => {
                      const photoObj = photos.find(p => p.name === activeLightboxPhoto.name);
                      const isAssociated = photoObj?.album_id === album.id;
                      return (
                        <button
                          key={album.id}
                          onClick={async () => {
                            setOpenLightboxAlbumDropdown(null);
                            await handleAddPhotoToAlbum(activeLightboxPhoto.name, album.id);
                          }}
                          className={`w-full text-left text-[11px] font-medium py-1.5 px-2 hover:bg-brand-navy/5 rounded-xs transition-colors cursor-pointer ${
                            isAssociated ? "text-brand-timber font-semibold" : "text-brand-navy"
                          }`}
                        >
                          {album.name} {isAssociated ? "✓" : ""}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={async () => {
                      setOpenLightboxAlbumDropdown(null);
                      await handleAddPhotoToAlbum(activeLightboxPhoto.name, null);
                    }}
                    className="w-full text-left text-[10px] font-bold text-red-650 py-1.5 px-2 hover:bg-red-50 rounded-xs transition-colors cursor-pointer border-t border-brand-navy/5 mt-1 pt-1.5"
                  >
                    Quitar del álbum
                  </button>
                </div>
              )}
            </div>

            {/* Separador */}
            <div className="w-[1px] h-6 bg-white/15" />

            {/* Botón de girar */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRotatePhoto(activeLightboxPhoto.name);
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

            {/* Botón de enviar a la papelera */}
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const nameToTrash = activeLightboxPhoto.name;
                setActiveLightboxPhoto(null);
                await moveToTrash(nameToTrash);
              }}
              className="p-2.5 text-red-400 hover:text-red-500 transition-colors cursor-pointer flex items-center justify-center rounded-full hover:bg-red-500/10"
              title="Mover a la papelera"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
