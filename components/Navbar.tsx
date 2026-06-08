"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function Navbar({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
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

  // Búsqueda
  const [searchVal, setSearchVal] = useState<string>("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchVal(searchParams.get("search") || "");
  }, [searchParams]);

  const handleSearchChange = (val: string) => {
    setSearchVal(val);
    const params = new URLSearchParams(window.location.search);
    if (val) {
      params.set("search", val);
    } else {
      params.delete("search");
    }
    router.replace(`${pathname}?${params.toString()}`);
  };

  // Dropdown de usuario
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [userEmail, setUserEmail] = useState<string>("Usuario Familiar");

  useEffect(() => {
    const email = localStorage.getItem("family_album_user_email");
    if (email) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserEmail(email);
    }
  }, []);

  // Cerrar el dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Bloquear pantalla (mantiene el email para pre-relleno en login)
  const handleLockScreen = () => {
    localStorage.removeItem("family_album_session");
    sessionStorage.removeItem("family_album_session");
    setShowDropdown(false);
    router.push("/login");
  };

  // Cambiar de usuario (limpia sesión y email por completo)
  const handleChangeUser = () => {
    localStorage.removeItem("family_album_session");
    sessionStorage.removeItem("family_album_session");
    localStorage.removeItem("family_album_user_email");
    setShowDropdown(false);
    router.push("/login");
  };

  const [title, setTitle] = useState<string>("Álbum Familiar");

  const updateTitle = () => {
    if (pathname === "/") {
      setTitle("Inicio");
    } else if (pathname === "/photos") {
      setTitle("Biblioteca de Fotos");
    } else if (pathname === "/trash") {
      setTitle("Papelera");
    } else if (pathname.startsWith("/album/")) {
      const albumId = pathname.split("/").pop();
      const localAlbumsJson = localStorage.getItem("family_album_local_albums");
      if (localAlbumsJson) {
        const parsed = JSON.parse(localAlbumsJson);
        const found = parsed.find((a: any) => a.id === albumId);
        if (found) {
          setTitle(`Álbum: ${found.name}`);
          return;
        }
      }
      setTitle("Álbum");
    } else {
      setTitle("Álbum Familiar");
    }
  };

  useEffect(() => {
    updateTitle();

    window.addEventListener("refresh-albums", updateTitle);
    window.addEventListener("photo-moved", updateTitle);
    return () => {
      window.removeEventListener("refresh-albums", updateTitle);
      window.removeEventListener("photo-moved", updateTitle);
    };
  }, [pathname]);

  return (
    <header className={`h-16 fixed ${isLocalMode ? "top-8" : "top-0"} right-0 left-0 md:left-[280px] bg-brand-cream/90 backdrop-blur-md border-b border-brand-navy/10 flex items-center justify-between px-4 md:px-8 z-10 transition-all duration-300`}>
      {/* Lado izquierdo: Botón menú móvil + Título */}
      <div className="flex items-center gap-3 bg-transparent">
        {onOpenSidebar && (
          <button
            onClick={onOpenSidebar}
            className="p-1.5 text-brand-navy/70 hover:text-brand-navy hover:bg-brand-navy/5 rounded-xs block md:hidden transition-colors cursor-pointer focus:outline-none"
            title="Abrir menú lateral"
          >
            <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        )}
        <h2 className="text-sm md:text-lg font-medium text-brand-navy tracking-tight truncate max-w-[150px] sm:max-w-xs md:max-w-none">
          {title}
        </h2>
      </div>

      {/* Acciones de la barra */}
      <div className="flex items-center gap-4 bg-transparent">
        {/* Buscador */}
        <div className="relative hidden md:block bg-transparent">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none bg-transparent">
            <svg
              className="w-4 h-4 text-brand-navy/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </span>
          <input
            type="search"
            value={searchVal}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar recuerdos..."
            className="w-64 pl-9 pr-2 py-1.5 border-b border-brand-navy/10 bg-transparent text-xs text-brand-navy placeholder-brand-navy/40 focus:outline-none focus:border-brand-navy transition-all"
          />
        </div>

        {/* Info de Usuario / Avatar clickable */}
        <div className="relative bg-transparent" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-8 h-8 rounded-full border border-brand-navy/20 text-brand-navy flex items-center justify-center bg-transparent select-none cursor-pointer hover:border-brand-navy/55 transition-colors focus:outline-none"
            title="Opciones de la cuenta"
          >
            <svg className="w-4 h-4 text-brand-navy/70" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </button>

          {/* Dropdown flotante premium */}
          {showDropdown && (
            <div className="absolute right-0 mt-2.5 w-60 bg-brand-cream border border-brand-navy/15 rounded-xs p-4 shadow-xl z-30 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="space-y-0.5 border-b border-brand-navy/5 pb-2.5 bg-transparent">
                <p className="text-[10px] uppercase font-bold tracking-wider text-brand-navy/40">
                  Usuario Activo
                </p>
                <p className="text-xs font-semibold text-brand-navy truncate bg-transparent">
                  {userEmail}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 bg-transparent">
                <button
                  onClick={handleLockScreen}
                  className="w-full text-left py-1.5 px-2 hover:bg-brand-navy/5 text-brand-navy hover:text-brand-timber text-xs font-medium rounded-xs transition-colors cursor-pointer bg-transparent"
                >
                  Bloquear pantalla
                </button>
                <button
                  onClick={handleChangeUser}
                  className="w-full text-left py-1.5 px-2 hover:bg-brand-navy/5 text-brand-navy hover:text-red-600 text-xs font-medium rounded-xs transition-colors cursor-pointer bg-transparent"
                >
                  Cambiar de usuario
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
