"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";

interface AlbumItem {
  id: string;
  name: string;
}

interface LocalPhotoItem {
  name: string;
  url: string;
  album_id?: string | null;
  status?: string | null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [showConnectionError, setShowConnectionError] = useState<boolean>(false);
  const [isLocalMode, setIsLocalMode] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Intentar siempre online por defecto al abrir o recargar la aplicación
      localStorage.removeItem("family_album_local_mode_active");
      setIsLocalMode(false);
      window.dispatchEvent(new CustomEvent("local-mode-changed"));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Guardar fetch original
    const originalFetch = window.fetch;

    // Sobreescribir fetch
    window.fetch = async function (input, init) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const isSupabaseRequest = url.includes("supabase.co");

      if (isSupabaseRequest) {
        try {
          const response = await originalFetch(input, init);
          if (response.status >= 502 && response.status <= 504) {
            window.dispatchEvent(new CustomEvent("supabase-connection-error"));
          }
          return response;
        } catch (error) {
          window.dispatchEvent(new CustomEvent("supabase-connection-error"));
          throw error;
        }
      }

      return originalFetch(input, init);
    };

    const handleConnectionError = () => {
      const activeLocal = localStorage.getItem("family_album_local_mode_active") === "true";
      if (!activeLocal) {
        setShowConnectionError(true);
      }
    };

    const handleLocalModeChanged = () => {
      setIsLocalMode(localStorage.getItem("family_album_local_mode_active") === "true");
    };

    window.addEventListener("supabase-connection-error", handleConnectionError);
    window.addEventListener("local-mode-changed", handleLocalModeChanged);

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener("supabase-connection-error", handleConnectionError);
      window.removeEventListener("local-mode-changed", handleLocalModeChanged);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!mounted) return;

        if (!session && pathname !== "/login") {
          router.push("/login");
        } else if (session && pathname === "/login") {
          router.push("/");
        } else {
          setAuthorized(true);
        }
      } catch (err) {
        console.error("Error al obtener la sesión de Supabase:", err);
        if (pathname !== "/login") {
          router.push("/login");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    checkSession();

    // Escuchar cambios de estado de autenticación (login, logout, token expirado)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (!session && pathname !== "/login") {
        setAuthorized(false);
        router.push("/login");
      } else if (session && pathname === "/login") {
        router.push("/");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  // Cerrar sidebar al cambiar de ruta
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [pathname]);

  // Siembra automática inicial de recuerdos y álbumes
  useEffect(() => {
    if (typeof window !== "undefined") {
      // --- Migración: convertir IDs de álbumes no-UUID a UUIDs válidos ---
      const migratedFlag = localStorage.getItem("family_album_uuid_migrated");
      if (!migratedFlag) {
        const localAlbumsJson = localStorage.getItem("family_album_local_albums");
        if (localAlbumsJson) {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          let localAlbums = JSON.parse(localAlbumsJson);
          const idMap: Record<string, string> = {};
          let needsMigration = false;

          localAlbums = localAlbums.map((a: AlbumItem) => {
            if (!uuidRegex.test(a.id)) {
              needsMigration = true;
              let newId = "";
              if (window.crypto && window.crypto.randomUUID) {
                newId = window.crypto.randomUUID();
              } else {
                newId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
                  const r = (Math.random() * 16) | 0;
                  const v = c === "x" ? r : (r & 0x3) | 0x8;
                  return v.toString(16);
                });
              }
              idMap[a.id] = newId;
              return { ...a, id: newId };
            }
            return a;
          });

          if (needsMigration) {
            localStorage.setItem("family_album_local_albums", JSON.stringify(localAlbums));

            // Mappings de fotos que referenciaban IDs antiguos
            const mappingsJson = localStorage.getItem("family_album_photo_mappings");
            if (mappingsJson) {
              const mappings = JSON.parse(mappingsJson);
              Object.keys(mappings).forEach((key) => {
                if (mappings[key] && idMap[mappings[key]]) {
                  mappings[key] = idMap[mappings[key]];
                }
              });
              localStorage.setItem("family_album_photo_mappings", JSON.stringify(mappings));
            }

            // Fotos locales que referenciaban album_id antiguos
            const localPhotosJson = localStorage.getItem("family_album_local_photos");
            if (localPhotosJson) {
              let localPhotos = JSON.parse(localPhotosJson);
              localPhotos = localPhotos.map((p: LocalPhotoItem) => {
                if (p.album_id && idMap[p.album_id]) {
                  return { ...p, album_id: idMap[p.album_id] };
                }
                return p;
              });
              localStorage.setItem("family_album_local_photos", JSON.stringify(localPhotos));
            }

            console.info("Migración de UUIDs completada:", idMap);
          }
        }
        localStorage.setItem("family_album_uuid_migrated", "true");
      }

      const isCleared = localStorage.getItem("family_album_cleared") === "true";
      const localPhotos = localStorage.getItem("family_album_local_photos");

      if (!isCleared && !localPhotos) {
        // Sembrar álbumes locales por defecto
        const defaultAlbums = [
          { id: "d1a60111-92b0-4f81-b51f-d748ad0a7201", name: "Vacaciones" },
          { id: "d2a60222-92b0-4f81-b51f-d748ad0a7202", name: "Familia" },
          { id: "d3a60333-92b0-4f81-b51f-d748ad0a7203", name: "Cumpleaños" }
        ];
        localStorage.setItem("family_album_local_albums", JSON.stringify(defaultAlbums));

        // Sembrar fotos locales por defecto
        const samplePhotos = [
          {
            id: "sample_picnic_1988",
            name: "sample_picnic_1988.webp",
            title: "Picnic familiar en la montaña",
            url: "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&auto=format&fit=crop",
            album_id: "d2a60222-92b0-4f81-b51f-d748ad0a7202",
            created_at: "1988-07-15T14:00:00Z",
            status: "active"
          },
          {
            id: "sample_cumpleanos_1991",
            name: "sample_cumpleanos_1991.webp",
            title: "Cumpleaños de la abuela Sofía",
            url: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&auto=format&fit=crop",
            album_id: "d3a60333-92b0-4f81-b51f-d748ad0a7203",
            created_at: "1991-11-22T18:30:00Z",
            status: "active"
          },
          {
            id: "sample_playa_1985",
            name: "sample_playa_1985.webp",
            title: "Vacaciones de verano en la costa",
            url: "https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=800&auto=format&fit=crop",
            album_id: "d1a60111-92b0-4f81-b51f-d748ad0a7201",
            created_at: "1985-08-05T12:00:00Z",
            status: "active"
          },
          {
            id: "sample_boda_1980",
            name: "sample_boda_1980.webp",
            title: "Boda de los padres",
            url: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop",
            album_id: "d2a60222-92b0-4f81-b51f-d748ad0a7202",
            created_at: "1980-05-18T16:00:00Z",
            status: "active"
          },
          {
            id: "sample_navidad_1992",
            name: "sample_navidad_1992.webp",
            title: "Cena de Navidad en casa",
            url: "https://images.unsplash.com/photo-1543257580-7269da773bf5?w=800&auto=format&fit=crop",
            album_id: "d2a60222-92b0-4f81-b51f-d748ad0a7202",
            created_at: "1992-12-24T21:00:00Z",
            status: "active"
          },
          {
            id: "sample_bicicleta_1987",
            name: "sample_bicicleta_1987.webp",
            title: "Paseo dominical en bicicleta",
            url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop",
            album_id: "d1a60111-92b0-4f81-b51f-d748ad0a7201",
            created_at: "1987-04-12T11:00:00Z",
            status: "active"
          },
          {
            id: "sample_trash_photo",
            name: "sample_trash_photo.webp",
            title: "Retrato antiguo",
            url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop",
            album_id: null,
            created_at: "1994-06-05T10:00:00Z",
            status: "trash"
          }
        ];
        localStorage.setItem("family_album_local_photos", JSON.stringify(samplePhotos));

        // Sembrar mapeos de estados y álbumes
        const statuses: Record<string, string> = {};
        const mappings: Record<string, string | null> = {};
        samplePhotos.forEach((p) => {
          statuses[p.name] = p.status;
          mappings[p.name] = p.album_id;
        });

        localStorage.setItem("family_album_photo_statuses", JSON.stringify(statuses));
        localStorage.setItem("family_album_photo_mappings", JSON.stringify(mappings));

        // Desencadenar eventos para actualizar Sidebar y páginas
        window.dispatchEvent(new CustomEvent("refresh-albums"));
        window.dispatchEvent(new CustomEvent("photo-moved"));
      }
    }
  }, []);

  // Durante la carga inicial, mostramos una pantalla limpia con spinner
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-brand-cream text-brand-navy">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-6 w-6 text-brand-navy" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <div className="text-[10px] font-semibold tracking-wider uppercase text-brand-navy/60">
            Cargando recuerdos...
          </div>
        </div>
      </div>
    );
  }

  // Si no está autorizado (redirigiendo), evitamos el flash de contenido
  if (!authorized && pathname !== "/login") {
    return null;
  }

  // Si es la ruta /login, renderizamos el contenido plano sin Sidebar ni Navbar
  if (pathname === "/login") {
    return <div className="flex-1 flex flex-col min-h-screen bg-brand-cream">{children}</div>;
  }

  // Para el resto de rutas, renderizamos la estructura de administración completa
  return (
    <div className="flex-1 flex min-h-screen bg-brand-cream relative">
      {/* Barra superior de Modo Local */}
      {isLocalMode && (
        <div className="fixed top-0 left-0 right-0 h-8 bg-red-600 text-white flex items-center justify-between px-4 sm:px-6 text-[11px] font-semibold z-60 shadow-md">
          <div className="flex items-center gap-2 bg-transparent">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>MODO LOCAL, SIN CONEXIÓN CON EL SERVIDOR</span>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("family_album_local_mode_active");
              window.dispatchEvent(new CustomEvent("local-mode-changed"));
              window.dispatchEvent(new CustomEvent("photo-moved"));
              window.location.reload();
            }}
            className="px-2.5 py-1 bg-white text-red-650 hover:bg-red-50 rounded-xs text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Intentar reconectar
          </button>
        </div>
      )}

      {/* Backdrop oscuro para móvil cuando el sidebar está abierto */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className={`fixed inset-0 bg-brand-navy/30 backdrop-blur-xs z-48 md:hidden ${isLocalMode ? "top-8" : "top-0"}`}
        />
      )}

      {/* Sidebar persistente / móvil */}
      <Sidebar isOpen={isMobileSidebarOpen} onClose={() => setIsMobileSidebarOpen(false)} />

      {/* Panel principal responsivo */}
      <div className="flex-1 flex flex-col min-h-screen pl-0 md:pl-[280px] bg-brand-cream">
        {/* Navbar superior */}
        <Navbar onOpenSidebar={() => setIsMobileSidebarOpen(true)} />

        {/* Área de contenido de la página */}
        <main className={`flex-1 ${isLocalMode ? "pt-24" : "pt-16"} flex flex-col transition-all duration-300`}>
          {children}
        </main>
      </div>

      {/* Modal rojo de conexión interrumpida */}
      {showConnectionError && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-60 flex items-center justify-center p-4">
          <div className="bg-red-50 border-2 border-red-600 rounded-xs p-6 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in zoom-in duration-250">
            <div className="flex items-center gap-3 bg-transparent text-red-600">
              <svg className="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-sm font-bold uppercase tracking-wide">
                Conexión interrumpida con el servidor
              </h3>
            </div>
            <p className="text-xs text-red-800 leading-relaxed font-medium">
              Se ha perdido la comunicación con la base de datos de Supabase. Por favor, comprueba tu conexión a internet o reintenta. Si el problema persiste, puedes continuar visualizando el sitio en modo local.
            </p>
            <div className="flex gap-3 justify-end pt-2 bg-transparent">
              <button
                onClick={() => {
                  localStorage.setItem("family_album_local_mode_active", "true");
                  window.dispatchEvent(new CustomEvent("local-mode-changed"));
                  window.dispatchEvent(new CustomEvent("photo-moved"));
                  setShowConnectionError(false);
                }}
                className="px-4 py-2 border border-red-300 hover:bg-red-100 text-red-850 rounded-xs text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors"
              >
                Ver en modo local
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("family_album_local_mode_active");
                  window.location.reload();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xs text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors shadow-sm"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
