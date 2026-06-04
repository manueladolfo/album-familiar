"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Comprobar si hay sesión iniciada en LocalStorage
    const isLoggedIn = localStorage.getItem("family_album_session") === "active";
    
    if (!isLoggedIn && pathname !== "/login") {
      router.push("/login");
    } else if (isLoggedIn && pathname === "/login") {
      router.push("/");
    } else {
      setAuthorized(true);
    }
    setLoading(false);
  }, [pathname, router]);

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
      {/* Sidebar persistente */}
      <Sidebar />

      {/* Panel principal con desplazamiento a la derecha para dejar sitio al Sidebar fijo */}
      <div className="flex-1 flex flex-col min-h-screen pl-[280px] bg-brand-cream">
        {/* Navbar superior */}
        <Navbar />

        {/* Área de contenido de la página */}
        <main className="flex-1 pt-16 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
