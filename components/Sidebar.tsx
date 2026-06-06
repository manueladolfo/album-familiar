"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { generateUUID, isValidUUID } from "@/lib/uuid";

interface AlbumItem {
  id: string;
  name: string;
  created_at?: string | null;
}

export default function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [dragOverAlbumId, setDragOverAlbumId] = useState<string | null>(null);

  // Estados de gestión de álbumes
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [newAlbumName, setNewAlbumName] = useState<string>("");
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [editingAlbumName, setEditingAlbumName] = useState<string>("");
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  
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

    // Generar UUID v4 válido para evitar errores de tipo en Supabase
    const newId = generateUUID();
    const newAlbum: AlbumItem = { id: newId, name: newAlbumName.trim() };

    try {
      // 1. Intentar registrar en Supabase
      const { error } = await supabase.from("albums").insert(newAlbum);
      if (error) throw error;
    } catch (err) {
      console.warn("Fallo al crear álbum en Supabase (RLS). Guardando en LocalStorage fallback...", err instanceof Error ? err.message : String(err));
    } finally {
      // 2. Guardar localmente
      const localAlbumsJson = localStorage.getItem("family_album_local_albums");
      const localAlbums = localAlbumsJson ? JSON.parse(localAlbumsJson) : [];
      localAlbums.push(newAlbum);
      localStorage.setItem("family_album_local_albums", JSON.stringify(localAlbums));

      // 3. Resetear UI y disparar recarga
      setNewAlbumName("");
      setIsCreating(false);
      loadAlbums();
      window.dispatchEvent(new CustomEvent("refresh-albums"));
    }
  };

  // Renombrar Álbum
  const handleRenameAlbum = async (albumId: string) => {
    if (!editingAlbumName.trim()) {
      setEditingAlbumId(null);
      return;
    }

    try {
      // 1. Intentar renombrar en Supabase solo si el ID es un UUID válido
      if (isValidUUID(albumId)) {
        const { error } = await supabase
          .from("albums")
          .update({ name: editingAlbumName.trim() })
          .eq("id", albumId);
        if (error) throw error;
      }
    } catch (err) {
      console.warn("Fallo al renombrar álbum en Supabase (RLS). Guardando en LocalStorage fallback...", err instanceof Error ? err.message : String(err));
    } finally {
      // 2. Renombrar en LocalStorage
      const localAlbumsJson = localStorage.getItem("family_album_local_albums");
      if (localAlbumsJson) {
        let localAlbums = JSON.parse(localAlbumsJson);
        localAlbums = localAlbums.map((a: AlbumItem) =>
          a.id === albumId ? { ...a, name: editingAlbumName.trim() } : a
        );
        localStorage.setItem("family_album_local_albums", JSON.stringify(localAlbums));
      }

      // 3. Resetear UI y disparar eventos
      setEditingAlbumId(null);
      loadAlbums();
      window.dispatchEvent(new CustomEvent("photo-moved"));
    }
  };

  // Eliminar Álbum (confirmado)
  const handleDeleteAlbum = async (albumId: string) => {
    try {
      // 1. Intentar eliminar en Supabase solo si el ID es un UUID válido
      if (isValidUUID(albumId)) {
        const { error } = await supabase.from("albums").delete().eq("id", albumId);
        if (error) throw error;
      }
    } catch (err) {
      console.warn("Fallo al eliminar álbum en Supabase (RLS). Continuando localmente...", err instanceof Error ? err.message : String(err));
    } finally {
      // 2. Eliminar de LocalStorage
      const localAlbumsJson = localStorage.getItem("family_album_local_albums");
      if (localAlbumsJson) {
        let localAlbums = JSON.parse(localAlbumsJson);
        localAlbums = localAlbums.filter((a: AlbumItem) => a.id !== albumId);
        localStorage.setItem("family_album_local_albums", JSON.stringify(localAlbums));
      }

      // 3. Desvincular fotos de este álbum
      // 3a. En Supabase
      try {
        if (isValidUUID(albumId)) {
          await supabase
            .from("photos")
            .update({ album_id: null })
            .eq("album_id", albumId);
        }
      } catch {
        // Ignorar
      }
      // 3b. En LocalStorage mappings
      const mappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
      const mappings = JSON.parse(mappingsJson);
      Object.keys(mappings).forEach((pName) => {
        if (mappings[pName] === albumId) {
          mappings[pName] = null;
        }
      });
      localStorage.setItem("family_album_photo_mappings", JSON.stringify(mappings));

      // 4. Limpiar UI y notificar cambio global
      setShowConfirmDelete(null);
      loadAlbums();
      window.dispatchEvent(new CustomEvent("photo-moved"));
      
      // Si el usuario estaba actualmente en la página del álbum eliminado, redirigir al Dashboard
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

  // Cargar álbumes de Supabase con fallback local
  const loadAlbums = async () => {
    try {
      const { data, error } = await supabase
        .from("albums")
        .select("id, name, created_at")
        .order("name");

      if (error) throw error;

      if (data && data.length > 0) {
        setAlbums(data);
      } else {
        // Inicializar álbumes locales en LocalStorage si no hay en base de datos
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
    } catch {
      console.warn("Fallo al leer álbumes de Supabase (posible RLS). Cargando localmente...");
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

  useEffect(() => {
    loadAlbums();

    // Escuchar si se crean álbumes externamente
    const handleRefreshAlbums = () => loadAlbums();
    window.addEventListener("refresh-albums", handleRefreshAlbums);
    return () => window.removeEventListener("refresh-albums", handleRefreshAlbums);
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

    try {
      console.log(`Asociando foto ${photoId} al álbum ${albumId}`);

      // 1. Intentar actualizar en Supabase Database solo si ambos IDs son UUIDs válidos
      if (isValidUUID(albumId) && isValidUUID(photoId)) {
        const { error } = await supabase
          .from("photos")
          .update({ album_id: albumId })
          .eq("id", photoId);

        if (error) throw error;
        console.log("Actualizado en Supabase correctamente");
      }
    } catch {
      console.warn("Fallo al actualizar en Supabase (RLS). Guardando en LocalStorage fallback...");
    } finally {
      // 2. Persistir en LocalStorage como fallback siempre (para asegurar reactividad local instantánea)
      const mappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
      const mappings = JSON.parse(mappingsJson);
      mappings[photoId] = albumId;
      localStorage.setItem("family_album_photo_mappings", JSON.stringify(mappings));

      // 3. Emitir evento global indicando que la foto se movió
      window.dispatchEvent(
        new CustomEvent("photo-moved", {
          detail: { photoId, albumId },
        })
      );
    }
  };

  return (
    <>
      <aside className={`w-[280px] fixed inset-y-0 left-0 bg-brand-cream border-r border-brand-navy/10 flex flex-col z-30 transition-transform duration-300 ease-in-out md:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        {/* Header con Logo */}
        <div className="py-10 px-4 border-b border-brand-navy/10 bg-transparent flex items-center justify-between gap-2 relative">
          <Link
            href="/"
            className="flex-1 flex items-center justify-center bg-transparent hover:opacity-90 transition-opacity"
          >
            <img
              src="/logo-familiar-transparente.png"
              alt="Álbum Familiar"
              className="w-[180px] sm:w-[220px] h-auto object-contain bg-transparent mix-blend-multiply"
            />
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
            <button
              onClick={() => setIsCreating(true)}
              className="p-1 border border-brand-navy/15 hover:border-brand-navy/40 text-brand-navy/60 hover:text-brand-navy rounded-xs transition-all cursor-pointer bg-transparent"
              title="Crear nuevo álbum"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>

          {/* Formulario de creación inline */}
          {isCreating && (
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
                  onDragOver={(e) => handleDragOver(e, album.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, album.id)}
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer del Sidebar */}
        <div className="p-4 border-t border-brand-navy/10 flex flex-col gap-3 bg-transparent">
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
    </>
  );
}
