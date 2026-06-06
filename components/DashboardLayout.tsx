"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";

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

  useEffect(() => {
    // Comprobar si hay sesión iniciada en LocalStorage o SessionStorage
    const isLoggedIn =
      localStorage.getItem("family_album_session") === "active" ||
      sessionStorage.getItem("family_album_session") === "active";
    
    if (!isLoggedIn && pathname !== "/login") {
      router.push("/login");
    } else if (isLoggedIn && pathname === "/login") {
      router.push("/");
    } else {
      setAuthorized(true);
    }
    setLoading(false);
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

            // Actualizar mappings de fotos que referenciaban IDs antiguos
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

            // Actualizar fotos locales que referenciaban album_id antiguos
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
    <div className="flex-1 flex min-h-screen bg-brand-cream">
      {/* Backdrop oscuro para móvil cuando el sidebar está abierto */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-brand-navy/30 backdrop-blur-xs z-25 md:hidden"
        />
      )}

      {/* Sidebar persistente / móvil */}
      <Sidebar isOpen={isMobileSidebarOpen} onClose={() => setIsMobileSidebarOpen(false)} />

      {/* Panel principal responsivo */}
      <div className="flex-1 flex flex-col min-h-screen pl-0 md:pl-[280px] bg-brand-cream">
        {/* Navbar superior */}
        <Navbar onOpenSidebar={() => setIsMobileSidebarOpen(true)} />

        {/* Área de contenido de la página */}
        <main className="flex-1 pt-16 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
