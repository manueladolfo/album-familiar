"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase, isUserAdmin } from "@/lib/supabase";
import { generateUUID, isValidUUID } from "@/lib/uuid";

import { analyzePhotoWithGemini, getReverseGeocoding } from "@/lib/search";

interface AlbumItem {
  id: string;
  name: string;
  created_at?: string | null;
}

interface PhotoItem {
  name: string;
  url: string;
  created_at: string | null;
  album_id?: string | null;
  status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface FloatingHeart {
  id: number;
  left: number;
  size: number;
  delay: number;
  rotation: number;
}


export default function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const [dragOverAlbumId, setDragOverAlbumId] = useState<string | null>(null);
  const [isLocalMode, setIsLocalMode] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkLocalMode = () => {
      setIsLocalMode(localStorage.getItem("family_album_local_mode_active") === "true");
    };
    checkLocalMode();
    window.addEventListener("local-mode-changed", checkLocalMode);
    return () => {
      window.removeEventListener("local-mode-changed", checkLocalMode);
    };
  }, []);

  useEffect(() => {
    const checkAdmin = () => {
      const email = localStorage.getItem("family_album_user_email");
      setIsAdmin(isUserAdmin(email));
    };
    checkAdmin();
    window.addEventListener("photo-moved", checkAdmin);
    return () => window.removeEventListener("photo-moved", checkAdmin);
  }, []);

  const triggerHearts = () => {
    // Generar una ráfaga de 6 corazones con posiciones, retrasos y rotaciones aleatorias
    const newHearts: FloatingHeart[] = Array.from({ length: 6 }).map((_, i) => ({
      id: Date.now() + i + Math.random(),
      left: Math.random() * 80 + 10, // Entre 10% y 90% del ancho
      size: Math.random() * 10 + 12, // Tamaño entre 12px y 22px
      delay: Math.random() * 0.25, // Pequeño delay de entrada
      rotation: Math.random() * 60 - 30, // Inclinación aleatoria entre -30deg y 30deg
    }));

    setHearts((prev) => [...prev, ...newHearts]);

    // Limpiar los corazones después de completar la animación (1.3 segundos)
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => !newHearts.some((nh) => nh.id === h.id)));
    }, 1300);
  };


  // Estados de gestión de álbumes
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [newAlbumName, setNewAlbumName] = useState<string>("");
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [editingAlbumName, setEditingAlbumName] = useState<string>("");
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Estados para Ajustes de IA
  const [isAISettingsOpen, setIsAISettingsOpen] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [isAnalyzingRetroactive, setIsAnalyzingRetroactive] = useState<boolean>(false);
  const [retroactiveProgress, setRetroactiveProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [retroactiveMessage, setRetroactiveMessage] = useState<string>("");

  useEffect(() => {
    const savedKey = localStorage.getItem("family_album_gemini_api_key") || "";
    setApiKeyInput(savedKey);
  }, [isAISettingsOpen]);
  
  // Estado para la sección de Explorar
  const [isExploreOpen, setIsExploreOpen] = useState<boolean>(true);

  // Enfocar inputs automáticamente
  useEffect(() => {
    if (isCreating) {
      createInputRef.current?.focus();
    }
  }, [isCreating]);

  useEffect(() => {
    if (editingAlbumId) {
      editInputRef.current?.focus();
    }
  }, [editingAlbumId]);

  // Lista base de navegación
  const mainNavItems = [
    {
      name: "Inicio",
      href: "/",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: "Biblioteca",
      href: "/photos",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      name: "Papelera",
      href: "/trash",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      ),
    },
  ];

  // Crear Álbum
  const handleCreateAlbum = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newAlbumName.trim()) return;

    const newId = generateUUID();
    const newAlbum: AlbumItem = { id: newId, name: newAlbumName.trim() };
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

    if (!localActive) {
      try {
        const { error } = await supabase.from("albums").insert(newAlbum);
        if (error) throw error;
        
        setNewAlbumName("");
        setIsCreating(false);
        await loadAlbums();
        window.dispatchEvent(new CustomEvent("refresh-albums"));
      } catch (err) {
        console.error("Fallo al crear álbum en Supabase:", err);
      }
    } else {
      const localAlbumsJson = localStorage.getItem("family_album_local_albums");
      const localAlbums = localAlbumsJson ? JSON.parse(localAlbumsJson) : [];
      localAlbums.push(newAlbum);
      localStorage.setItem("family_album_local_albums", JSON.stringify(localAlbums));

      setNewAlbumName("");
      setIsCreating(false);
      await loadAlbums();
      window.dispatchEvent(new CustomEvent("refresh-albums"));
    }
  };

  // Renombrar Álbum
  const handleRenameAlbum = async (albumId: string) => {
    if (!editingAlbumName.trim()) {
      setEditingAlbumId(null);
      return;
    }
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

    if (!localActive) {
      try {
        if (isValidUUID(albumId)) {
          const { error } = await supabase
            .from("albums")
            .update({ name: editingAlbumName.trim() })
            .eq("id", albumId);
          if (error) throw error;
        }
        setEditingAlbumId(null);
        await loadAlbums();
        window.dispatchEvent(new CustomEvent("photo-moved"));
        window.dispatchEvent(new CustomEvent("refresh-albums"));
      } catch (err) {
        console.error("Fallo al renombrar álbum en Supabase:", err);
      }
    } else {
      const localAlbumsJson = localStorage.getItem("family_album_local_albums");
      if (localAlbumsJson) {
        let localAlbums = JSON.parse(localAlbumsJson);
        localAlbums = localAlbums.map((a: AlbumItem) =>
          a.id === albumId ? { ...a, name: editingAlbumName.trim() } : a
        );
        localStorage.setItem("family_album_local_albums", JSON.stringify(localAlbums));
      }
      setEditingAlbumId(null);
      await loadAlbums();
      window.dispatchEvent(new CustomEvent("photo-moved"));
      window.dispatchEvent(new CustomEvent("refresh-albums"));
    }
  };

  // Eliminar Álbum (confirmado)
  const handleDeleteAlbum = async (albumId: string) => {
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

    if (!localActive) {
      try {
        if (isValidUUID(albumId)) {
          await supabase
            .from("photos")
            .update({ album_id: null })
            .eq("album_id", albumId);

          const { error } = await supabase.from("albums").delete().eq("id", albumId);
          if (error) throw error;
        }

        setShowConfirmDelete(null);
        await loadAlbums();
        window.dispatchEvent(new CustomEvent("photo-moved"));
        window.dispatchEvent(new CustomEvent("refresh-albums"));
        if (pathname === `/album/${albumId}`) {
          router.push("/");
        }
      } catch (err) {
        console.error("Fallo al eliminar álbum en Supabase:", err);
      }
    } else {
      const localAlbumsJson = localStorage.getItem("family_album_local_albums");
      if (localAlbumsJson) {
        let localAlbums = JSON.parse(localAlbumsJson);
        localAlbums = localAlbums.filter((a: AlbumItem) => a.id !== albumId);
        localStorage.setItem("family_album_local_albums", JSON.stringify(localAlbums));
      }

      const mappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
      const mappings = JSON.parse(mappingsJson);
      Object.keys(mappings).forEach((pName) => {
        if (mappings[pName] === albumId) {
          mappings[pName] = null;
        }
      });
      localStorage.setItem("family_album_photo_mappings", JSON.stringify(mappings));

      setShowConfirmDelete(null);
      await loadAlbums();
      window.dispatchEvent(new CustomEvent("photo-moved"));
      window.dispatchEvent(new CustomEvent("refresh-albums"));
      if (pathname === `/album/${albumId}`) {
        router.push("/");
      }
    }
  };

  // Cerrar Sesión
  const handleLogout = () => {
    localStorage.removeItem("family_album_session");
    sessionStorage.removeItem("family_album_session");
    localStorage.removeItem("family_album_user_email");
    try {
      supabase.auth.signOut();
    } catch {
      // Ignorar
    }
    router.push("/login");
  };

  // Cargar álbumes de Supabase o local
  const loadAlbums = async () => {
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

    if (!localActive) {
      try {
        const { data, error } = await supabase
          .from("albums")
          .select("id, name, created_at")
          .order("name");

        if (error) throw error;
        if (data) setAlbums(data);
      } catch (err) {
        console.error("Fallo al cargar álbumes de Supabase:", err);
      }
    } else {
      const localAlbumsJson = localStorage.getItem("family_album_local_albums");
      if (localAlbumsJson) {
        setAlbums(JSON.parse(localAlbumsJson));
      } else {
        const defaultAlbums: AlbumItem[] = [
          { id: "d1a60111-92b0-4f81-b51f-d748ad0a7201", name: "Vacaciones" },
          { id: "d2a60222-92b0-4f81-b51f-d748ad0a7202", name: "Familia" },
          { id: "d3a60333-92b0-4f81-b51f-d748ad0a7203", name: "Cumpleaños" },
        ];
        localStorage.setItem("family_album_local_albums", JSON.stringify(defaultAlbums));
        setAlbums(defaultAlbums);
      }
    }
  };

  // Ejecutar análisis retroactivo de fotos existentes con Gemini e IA
  const handleRetroactiveAnalysis = async () => {
    const key = localStorage.getItem("family_album_gemini_api_key");
    if (!key) {
      setRetroactiveMessage("Error: Configura tu API Key de Gemini primero.");
      return;
    }

    try {
      setIsAnalyzingRetroactive(true);
      setRetroactiveMessage("Cargando lista de recuerdos...");

      // 1. Obtener fotos locales
      const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
      const localPhotos: PhotoItem[] = JSON.parse(localPhotosJson);
      const activeLocalPhotos = localPhotos.filter((p) => p.status !== "trash");

      // 2. Obtener fotos remotas de Supabase Storage
      let remotePhotos: PhotoItem[] = [];
      try {
        const { data: storageData } = await supabase.storage
          .from("family-album")
          .list("thumbnails", { limit: 100 });

        if (storageData) {
          const validFiles = storageData.filter((file) => file.name !== ".emptyFolderPlaceholder");
          
          let dbPhotos: any[] = [];
          try {
            const { data } = await supabase.from("photos").select("id, status, latitude, longitude");
            if (data) dbPhotos = data;
          } catch {}

          const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
          const localStatusMappings = JSON.parse(localStatusMappingsJson);

          remotePhotos = validFiles.map((file) => {
            const { data: urlData } = supabase.storage
              .from("family-album")
              .getPublicUrl(`thumbnails/${file.name}`);

            const dbPhoto = dbPhotos.find((p) => p.id === file.name);
            const status = localStatusMappings[file.name] || (dbPhoto ? dbPhoto.status : null);

            return {
              name: file.name,
              url: urlData.publicUrl,
              created_at: file.created_at,
              status: status,
              latitude: dbPhoto ? dbPhoto.latitude : null,
              longitude: dbPhoto ? dbPhoto.longitude : null,
            };
          }).filter((p) => p.status !== "trash");
        }
      } catch (err) {
        console.warn("Fallo al cargar fotos remotas en análisis retroactivo:", err);
      }

      // Combinar fotos (evitando duplicados por nombre)
      const allPhotos = [...remotePhotos];
      activeLocalPhotos.forEach((lp) => {
        if (!allPhotos.some((p) => p.name === lp.name)) {
          allPhotos.push(lp);
        }
      });

      // Leer metadatos actuales
      const metadataJson = localStorage.getItem("family_album_photo_metadata") || "{}";
      const metadata = JSON.parse(metadataJson);

      // Filtrar fotos que no tienen etiquetas registradas
      const pendingPhotos = allPhotos.filter((p) => !metadata[p.name]);

      if (pendingPhotos.length === 0) {
        setRetroactiveMessage("¡Todos tus recuerdos ya han sido analizados y etiquetados!");
        setIsAnalyzingRetroactive(false);
        return;
      }

      setRetroactiveProgress({ current: 0, total: pendingPhotos.length });
      setRetroactiveMessage(`Iniciando análisis de ${pendingPhotos.length} recuerdos...`);

      for (let i = 0; i < pendingPhotos.length; i++) {
        const photo = pendingPhotos[i];
        setRetroactiveProgress({ current: i + 1, total: pendingPhotos.length });
        setRetroactiveMessage(`Analizando: ${photo.name.split("_").slice(1).join("_") || photo.name}`);

        let base64Data = "";
        if (photo.url.startsWith("data:image/")) {
          base64Data = photo.url;
        } else {
          try {
            const response = await fetch(photo.url);
            const blob = await response.blob();
            base64Data = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () => reject(new Error("Error al convertir a base64"));
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          } catch (fetchErr) {
            console.error(`Error al descargar imagen remota ${photo.url}:`, fetchErr);
          }
        }

        let tags: string[] = [];
        try {
          if (base64Data) {
            tags = await analyzePhotoWithGemini(base64Data, key);
          }
        } catch (geminiErr) {
          console.error(`Error procesando foto ${photo.name} con Gemini:`, geminiErr);
        }

        let locationText = "";
        try {
          if (photo.latitude && photo.longitude) {
            locationText = await getReverseGeocoding(photo.latitude, photo.longitude);
          }
        } catch (geoErr) {
          console.error(`Error obteniendo ubicación de foto ${photo.name}:`, geoErr);
        }

        // Si se generaron etiquetas o se obtuvo ubicación, guardar metadatos
        metadata[photo.name] = {
          tags: tags.length > 0 ? tags : ["recuerdo", "familiar"],
          location: locationText || undefined,
        };
        localStorage.setItem("family_album_photo_metadata", JSON.stringify(metadata));

        // Notificar cambio al sistema para recargar listados reactivamente
        window.dispatchEvent(new CustomEvent("photo-moved"));
      }

      setRetroactiveMessage("¡Análisis retroactivo completado con éxito!");
    } catch (err) {
      console.error("Error en análisis retroactivo:", err);
      setRetroactiveMessage(`Ocurrió un error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAnalyzingRetroactive(false);
    }
  };

  useEffect(() => {
    loadAlbums();

    const handleRefreshAlbums = () => loadAlbums();
    window.addEventListener("refresh-albums", handleRefreshAlbums);
    window.addEventListener("local-mode-changed", handleRefreshAlbums);
    return () => {
      window.removeEventListener("refresh-albums", handleRefreshAlbums);
      window.removeEventListener("local-mode-changed", handleRefreshAlbums);
    };
  }, []);

  // Lógica de Drag & Drop
  const handleDragOver = (e: React.DragEvent, albumId: string) => {
    e.preventDefault();
    setDragOverAlbumId(albumId);
  };

  const handleDragLeave = () => {
    setDragOverAlbumId(null);
  };

  const handleDrop = async (e: React.DragEvent, albumId: string) => {
    e.preventDefault();
    setDragOverAlbumId(null);
    
    const photoId = e.dataTransfer.getData("text/plain");
    if (!photoId) return;
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

    if (!localActive) {
      try {
        console.log(`Asociando foto ${photoId} al álbum ${albumId} en Supabase`);
        const nameWithoutExt = photoId.replace(/\.[^/.]+$/, "");
        const cleanPhotoId = nameWithoutExt.split(".")[0];
        const uuidPhotoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : photoId;

        if (isValidUUID(albumId) && isValidUUID(uuidPhotoId)) {
          const { error } = await supabase
            .from("photos")
            .update({ album_id: albumId })
            .eq("id", uuidPhotoId);

          if (error) throw error;
          console.log("Actualizado en Supabase correctamente");
          
          window.dispatchEvent(
            new CustomEvent("photo-moved", {
              detail: { photoId, albumId },
            })
          );
        }
      } catch (err) {
        console.error("Fallo al actualizar en Supabase:", err);
      }
    } else {
      const mappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
      const mappings = JSON.parse(mappingsJson);
      mappings[photoId] = albumId;
      localStorage.setItem("family_album_photo_mappings", JSON.stringify(mappings));

      window.dispatchEvent(
        new CustomEvent("photo-moved", {
          detail: { photoId, albumId },
        })
      );
    }
  };

  return (
    <>
      <aside className={`w-[280px] fixed ${isLocalMode ? 'top-8' : 'top-0'} bottom-0 left-0 bg-brand-cream border-r border-brand-navy/10 flex flex-col z-30 transition-all duration-300 ease-in-out md:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        {/* Header con Logo */}
        <div 
          className="py-10 px-4 border-b border-brand-navy/10 bg-transparent flex items-center justify-between gap-2 relative overflow-visible"
          onMouseEnter={triggerHearts}
          onTouchStart={(e) => {
            // No prevenir comportamiento por defecto pero sí lanzar corazones
            triggerHearts();
          }}
        >
          <Link
            href="/"
            className="flex-1 flex items-center justify-center bg-transparent relative"
          >
            <img
              src="/logo-familiar-transparente.png"
              alt="Álbum Familiar"
              className="w-[180px] sm:w-[220px] h-auto object-contain bg-transparent mix-blend-multiply select-none"
            />

            {/* Renderizado de corazones flotantes */}
            <div className="absolute inset-0 pointer-events-none overflow-visible z-50">
              {hearts.map((heart) => (
                <span
                  key={heart.id}
                  className="animate-float-heart text-red-500/80 drop-shadow-sm select-none"
                  style={{
                    left: `${heart.left}%`,
                    bottom: "20px",
                    fontSize: `${heart.size}px`,
                    animationDelay: `${heart.delay}s`,
                    ["--rotation" as any]: `${heart.rotation}deg`,
                  }}
                >
                  ❤️
                </span>
              ))}
            </div>
          </Link>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-brand-navy/60 hover:text-brand-navy block md:hidden transition-colors cursor-pointer absolute right-2 top-2"
              title="Cerrar menú"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Navegación Principal */}
        <nav className="px-4 pt-6 space-y-1 bg-transparent">
          {mainNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 py-2 text-sm font-medium transition-all border-l-2 ${
                  isActive
                    ? "border-brand-navy text-brand-navy font-semibold pl-3 -ml-4 bg-transparent"
                    : "border-transparent text-brand-navy/60 hover:text-brand-navy hover:border-brand-timber/40 pl-3 -ml-4 bg-transparent"
                }`}
              >
                <span className={`transition-colors ${isActive ? "text-brand-navy" : "text-brand-navy/40"}`}>
                  {item.icon}
                </span>
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Sección Explorar (Colapsable) */}
        <div className="px-4 pt-4 space-y-1 bg-transparent">
          <button
            onClick={() => setIsExploreOpen(!isExploreOpen)}
            className="flex justify-between items-center w-full px-3 py-1.5 text-xs font-semibold text-brand-navy/50 uppercase tracking-wider hover:text-brand-navy transition-colors bg-transparent cursor-pointer"
          >
            <span>Explorar</span>
            <svg
              className={`w-3 h-3 transition-transform duration-200 ${isExploreOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {isExploreOpen && (
            <div className="space-y-1.5 bg-transparent pl-3 mt-1">
              <Link
                href="/photos?filter=favorites"
                className={`flex items-center gap-3 py-1 text-xs font-medium transition-all ${
                  pathname === "/photos" && searchParams.get("filter") === "favorites"
                    ? "text-brand-navy font-semibold bg-transparent"
                    : "text-brand-navy/60 hover:text-brand-navy bg-transparent"
                }`}
              >
                <svg className="w-4 h-4 text-brand-navy/40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                Favoritos
              </Link>
              <Link
                href="/photos?filter=recent"
                className={`flex items-center gap-3 py-1 text-xs font-medium transition-all ${
                  pathname === "/photos" && searchParams.get("filter") === "recent"
                    ? "text-brand-navy font-semibold bg-transparent"
                    : "text-brand-navy/60 hover:text-brand-navy bg-transparent"
                }`}
              >
                <svg className="w-4 h-4 text-brand-navy/40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Recientes
              </Link>
            </div>
          )}
        </div>

        {/* Sección de Álbumes */}
        <div className="flex-1 px-4 pt-6 space-y-2 overflow-y-auto bg-transparent">
          <div className="flex justify-between items-center px-3 bg-transparent mb-2">
            <h4 className="text-xs font-semibold text-brand-navy/50 uppercase tracking-wider bg-transparent">
              Álbumes
            </h4>
            {isAdmin && (
              <button
                onClick={() => setIsCreating(true)}
                className="p-1 border border-brand-navy/15 hover:border-brand-navy/40 text-brand-navy/60 hover:text-brand-navy rounded-xs transition-all cursor-pointer bg-transparent"
                title="Crear nuevo álbum"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            )}
          </div>

          {/* Formulario de creación inline */}
          {isAdmin && isCreating && (
            <form onSubmit={handleCreateAlbum} className="flex gap-2 p-2 bg-brand-cream/50 border border-brand-navy/15 rounded-xs mb-3">
              <input
                ref={createInputRef}
                type="text"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                placeholder="Nombre del álbum..."
                className="flex-1 bg-transparent border-b border-brand-navy/20 text-xs text-brand-navy focus:outline-none focus:border-brand-navy py-0.5"
                maxLength={30}
              />
              <div className="flex gap-1 bg-transparent">
                <button
                  type="submit"
                  className="p-1 hover:bg-brand-sage/20 text-green-700 rounded-xs transition-colors cursor-pointer"
                  title="Confirmar"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setNewAlbumName("");
                  }}
                  className="p-1 hover:bg-red-50 text-red-700 rounded-xs transition-colors cursor-pointer"
                  title="Cancelar"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </form>
          )}

          <div className="space-y-1 bg-transparent">
            {albums.map((album) => {
              const albumPath = `/album/${album.id}`;
              const isActive = pathname === albumPath;
              const isDraggingOver = dragOverAlbumId === album.id;

              return (
                <div
                  key={album.id}
                  onDragOver={(e) => isAdmin ? handleDragOver(e, album.id) : undefined}
                  onDragLeave={isAdmin ? handleDragLeave : undefined}
                  onDrop={(e) => isAdmin ? handleDrop(e, album.id) : undefined}
                  className={`group relative transition-all rounded-xs overflow-hidden ${
                    isDraggingOver
                      ? "bg-brand-sage/20 scale-[1.01] border border-dashed border-brand-navy/30"
                      : "bg-transparent border border-transparent hover:bg-brand-navy/5"
                  }`}
                >
                  {editingAlbumId === album.id ? (
                    <div className="flex gap-2 p-2 bg-brand-cream/50 border border-brand-navy/15 rounded-xs w-full">
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingAlbumName}
                        onChange={(e) => setEditingAlbumName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameAlbum(album.id);
                          if (e.key === "Escape") setEditingAlbumId(null);
                        }}
                        className="flex-1 bg-transparent border-b border-brand-navy/20 text-xs text-brand-navy focus:outline-none focus:border-brand-navy py-0.5"
                        maxLength={30}
                      />
                      <div className="flex gap-1 bg-transparent">
                        <button
                          onClick={() => handleRenameAlbum(album.id)}
                          className="p-1 hover:bg-brand-sage/20 text-green-700 rounded-xs transition-colors cursor-pointer"
                          title="Guardar renombre"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setEditingAlbumId(null)}
                          className="p-1 hover:bg-red-50 text-red-700 rounded-xs transition-colors cursor-pointer"
                          title="Cancelar"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full pr-2 bg-transparent">
                      <Link
                        href={albumPath}
                        className={`flex-1 flex items-center gap-3 py-2 text-sm font-medium transition-all border-l-2 ${
                          isActive
                            ? "border-brand-navy text-brand-navy font-semibold pl-3 -ml-4 bg-transparent"
                            : "border-transparent text-brand-navy/60 hover:text-brand-navy hover:border-brand-timber/40 pl-3 -ml-4 bg-transparent"
                        }`}
                      >
                        <span className={`transition-colors ${isActive ? "text-brand-navy" : "text-brand-navy/40"}`}>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                        </span>
                        <span className="truncate bg-transparent">{album.name}</span>
                      </Link>

                      {/* Botones de acción en hover */}
                      {isAdmin && (
                        <div className="flex md:hidden md:group-hover:flex items-center gap-1 bg-transparent transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setEditingAlbumId(album.id);
                              setEditingAlbumName(album.name);
                            }}
                            className="p-1 text-brand-navy/55 hover:text-brand-navy hover:bg-brand-navy/5 rounded-xs transition-colors cursor-pointer"
                            title="Renombrar álbum"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setShowConfirmDelete(album.id);
                            }}
                            className="p-1 text-brand-navy/55 hover:text-red-600 hover:bg-red-50/20 rounded-xs transition-colors cursor-pointer"
                            title="Borrar álbum"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer del Sidebar */}
        <div className="p-4 border-t border-brand-navy/10 flex flex-col gap-2.5 bg-transparent">
          {/* Botón de Ajustes de IA */}
          <button
            onClick={() => setIsAISettingsOpen(true)}
            className="w-full py-1.5 px-3 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy flex items-center justify-center gap-2 rounded-xs text-[10px] font-semibold tracking-wider transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-brand-navy/60" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-.813-5.096m.813 5.096a11.95 11.95 0 01-3.078-1.323m3.078 1.323a11.95 11.95 0 003.078-1.323M9 21c3.41 0 6.561-1.42 8.828-3.712m-1.157-11.108l.813-5.096m0 0l.813 5.096m-1.157-11.108a9.753 9.753 0 00-7.34 2.732m0 0a9.753 9.753 0 00-2.732 7.34M15 3c-.027.64.12 1.28.435 1.833m0 0a3 3 0 003.732 1.323m-3.732-1.323L19.5 3m-9.813 12.904L3 15m0 0l5.096-.813m-5.096.813a9.753 9.753 0 002.732 7.34m0 0a9.753 9.753 0 007.34-2.732M9 21c-.027-.64-.12-1.28-.435-1.833m0 0a3 3 0 00-3.732-1.323m3.732 1.323L3 21" />
            </svg>
            Ajustes de IA Inteligente
          </button>
          <button
            onClick={handleLogout}
            className="w-full py-1.5 px-3 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy hover:text-red-600 rounded-xs text-[10px] font-semibold tracking-wider transition-colors cursor-pointer text-center"
          >
            Cerrar Sesión
          </button>
          <div className="text-[10px] text-brand-navy/35 text-center bg-transparent">
            © 2026 Álbum Familiar
          </div>
        </div>
      </aside>

      {/* Modal de confirmación de borrado de álbum */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-brand-navy/20 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-brand-cream border border-brand-navy/30 rounded-xs p-6 max-w-sm w-full space-y-4 shadow-xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-base font-medium text-brand-navy">
              ¿Eliminar este álbum?
            </h3>
            <p className="text-xs text-brand-navy/60 leading-relaxed">
              Las fotos de este álbum no se borrarán; volverán a la biblioteca general libres de etiqueta.
            </p>
            <div className="flex gap-3 justify-end pt-2 bg-transparent">
              <button
                onClick={() => setShowConfirmDelete(null)}
                className="px-4 py-2 border border-brand-navy/20 hover:bg-brand-navy/5 rounded-xs text-[11px] font-semibold text-brand-navy cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteAlbum(showConfirmDelete)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-brand-cream rounded-xs text-[11px] font-semibold cursor-pointer transition-colors"
              >
                Eliminar Álbum
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ajustes de IA (Gemini) */}
      {isAISettingsOpen && (
        <div className="fixed inset-0 bg-brand-navy/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-brand-cream border border-brand-navy/20 rounded-xs p-6 max-w-md w-full space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 relative">
            {!isAnalyzingRetroactive && (
              <button
                onClick={() => {
                  setIsAISettingsOpen(false);
                  setRetroactiveMessage("");
                }}
                className="absolute top-4 right-4 text-brand-navy/40 hover:text-brand-navy transition-colors p-1 cursor-pointer"
                title="Cerrar ajustes"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            <div className="space-y-1 bg-transparent text-left">
              <h3 className="text-base font-semibold text-brand-navy flex items-center gap-2">
                <span className="text-lg">✨</span> Ajustes de Inteligencia Artificial
              </h3>
              <p className="text-[11px] text-brand-navy/50 leading-relaxed">
                Configura tu clave de API de Gemini para habilitar el etiquetado inteligente automático de todas tus fotos familiares en segundo plano.
              </p>
            </div>

            {/* Input de API Key */}
            <div className="space-y-2 bg-transparent text-left">
              <label className="text-[10px] uppercase font-bold text-brand-navy/60 tracking-wider">
                Gemini API Key
              </label>
              <div className="flex gap-2 bg-transparent">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  disabled={isAnalyzingRetroactive}
                  placeholder="Introduce tu clave API de Gemini..."
                  className="flex-1 px-3 py-1.5 border border-brand-navy/15 rounded-xs text-xs bg-transparent text-brand-navy focus:outline-none focus:border-brand-navy disabled:opacity-50"
                />
                <button
                  onClick={() => {
                    if (apiKeyInput.trim()) {
                      localStorage.setItem("family_album_gemini_api_key", apiKeyInput.trim());
                      setRetroactiveMessage("¡Clave de API guardada correctamente!");
                    } else {
                      localStorage.removeItem("family_album_gemini_api_key");
                      setRetroactiveMessage("Clave de API eliminada.");
                    }
                  }}
                  disabled={isAnalyzingRetroactive}
                  className="px-3.5 py-1.5 bg-brand-navy text-brand-cream text-xs font-semibold rounded-xs hover:bg-brand-navy/90 transition-all cursor-pointer disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
              <p className="text-[9px] text-brand-navy/40">
                Tu clave se guarda localmente en el navegador y nunca se envía a ningún otro servidor que no sea la API de Google Gemini.
              </p>
            </div>

            {/* Sección de Análisis Retroactivo */}
            <div className="border-t border-brand-navy/10 pt-4 space-y-3 bg-transparent text-left">
              <div className="bg-transparent">
                <h4 className="text-xs font-bold text-brand-navy uppercase tracking-wider">
                  Etiquetado Retroactivo
                </h4>
                <p className="text-[10px] text-brand-navy/50 leading-normal mt-0.5">
                  Analiza y genera etiquetas automáticamente para todos los recuerdos que ya tenías guardados antes de activar la IA.
                </p>
              </div>

              {isAnalyzingRetroactive ? (
                <div className="space-y-2.5 bg-transparent">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-brand-navy bg-transparent">
                    <span className="truncate max-w-[200px]">{retroactiveMessage}</span>
                    <span>
                      {retroactiveProgress.current} / {retroactiveProgress.total} (
                      {Math.round((retroactiveProgress.current / retroactiveProgress.total) * 100)}%)
                    </span>
                  </div>
                  {/* Barra de progreso premium */}
                  <div className="w-full h-1.5 bg-brand-navy/5 rounded-full overflow-hidden border border-brand-navy/5">
                    <div
                      className="h-full bg-brand-navy transition-all duration-300"
                      style={{
                        width: `${(retroactiveProgress.current / retroactiveProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 bg-transparent">
                  <button
                    onClick={handleRetroactiveAnalysis}
                    className="w-full py-2 bg-brand-cream border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy text-xs font-semibold rounded-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>✨</span> Analizar fotos existentes ahora
                  </button>
                  {retroactiveMessage && (
                    <p className={`text-[10px] text-center font-medium ${
                      retroactiveMessage.includes("Error") ? "text-red-600" : "text-green-700"
                    }`}>
                      {retroactiveMessage}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
