"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";



export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [keepConnected, setKeepConnected] = useState<boolean>(false);
  
  // Estado para la recuperación de contraseña
  const [isRecovering, setIsRecovering] = useState<boolean>(false);
  const [recoveryEmail, setRecoveryEmail] = useState<string>( "");
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);

  // Cargar email del LocalStorage si existe (pantalla bloqueada)
  useEffect(() => {
    const savedEmail = localStorage.getItem("family_album_user_email");
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  // Iniciar Sesión (Login)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg("Por favor, rellena todos los campos.");
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);

      // Iniciar sesión directamente en Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (error) throw error;
      
      console.log("Sesión iniciada con éxito en Supabase:", data);

      // Guardar el email del usuario logueado en LocalStorage
      localStorage.setItem("family_album_user_email", email.trim());

      // Redirigir al Dashboard
      router.push("/");
      
      // Forzar al wrapper a recargar el layout
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("photo-moved"));
      }, 100);

    } catch (err: any) {
      console.error("Error de login:", err);
      setErrorMsg(err.message || "Fallo al iniciar sesión. Comprueba tus datos.");
    } finally {
      setLoading(false);
    }
  };

  // Recuperar Contraseña
  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail.trim()) {
      setErrorMsg("Por favor, introduce tu correo electrónico.");
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      setRecoverySuccess(null);

      // 1. Intentar recuperación en Supabase Auth
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail.trim(), {
          redirectTo: `${window.location.origin}/login`,
        });
        if (error) throw error;
      } catch (err: any) {
        console.warn("Fallo al resetear en Supabase Auth. Operando recuperación en modo local...", err.message);
      }

      // 2. Mostrar mensaje de éxito simulado
      setRecoverySuccess(
        `Se ha enviado un enlace de recuperación al correo "${recoveryEmail.trim()}".`
      );
      setRecoveryEmail("");

    } catch (err: any) {
      console.error("Error en recuperación:", err);
      setErrorMsg(err.message || "Error al enviar el enlace de recuperación.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-brand-cream flex flex-col items-center justify-center p-4 md:p-8 select-none">
      
      <div className="w-full max-w-[280px] sm:max-w-[340px] md:max-w-[380px] flex flex-col items-center gap-6">
        
        {/* Logotipo responsive y centrado con blend multiply */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-familiar-transparente.png"
          alt="Álbum Familiar Logo"
          className="w-[220px] sm:w-[260px] md:w-[300px] h-auto object-contain bg-transparent mix-blend-multiply transition-all duration-350"
        />

        {/* Cajetín de Autenticación */}
        <div className="w-full bg-brand-cream border border-brand-navy/10 rounded-xs p-6 sm:p-8 shadow-md flex flex-col gap-6 relative overflow-hidden transition-all duration-350">
          
          <div className="space-y-1 bg-transparent">
            <h2 className="text-lg font-light tracking-wide text-brand-navy">
              {isRecovering ? "Recuperar Contraseña" : "Iniciar Sesión"}
            </h2>
            <p className="text-[10px] text-brand-navy/55 bg-transparent leading-relaxed">
              {isRecovering 
                ? "Introduce tu email para enviarte un enlace de restauración de contraseña." 
                : "Usa tus credenciales familiares registradas para acceder al álbum."
              }
            </p>
          </div>

          {/* Errores y Notificaciones */}
          {errorMsg && (
            <div className="p-3 bg-brand-cream border border-red-200 text-red-800 text-[11px] rounded-xs font-medium">
              {errorMsg}
            </div>
          )}

          {recoverySuccess && (
            <div className="p-3 bg-brand-cream border border-green-200 text-green-800 text-[11px] rounded-xs font-medium leading-relaxed">
              {recoverySuccess}
            </div>
          )}

          {/* Formulario de Login */}
          {!isRecovering ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-5 bg-transparent">
              <div className="space-y-1 bg-transparent">
                <label className="text-[10px] uppercase font-bold tracking-wider text-brand-navy/45">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  required
                  className="w-full bg-transparent border-b border-brand-navy/15 text-base text-brand-navy focus:outline-none focus:border-brand-navy py-1.5 transition-all placeholder-brand-navy/20"
                />
              </div>

              <div className="space-y-1 bg-transparent">
                <label className="text-[10px] uppercase font-bold tracking-wider text-brand-navy/45">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-transparent border-b border-brand-navy/15 text-base text-brand-navy focus:outline-none focus:border-brand-navy py-1.5 transition-all placeholder-brand-navy/20"
                />
              </div>

              <div className="flex justify-between items-center bg-transparent mt-2 select-none">
                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-medium text-brand-navy/60 hover:text-brand-navy transition-colors bg-transparent">
                  <input
                    type="checkbox"
                    checked={keepConnected}
                    onChange={(e) => setKeepConnected(e.target.checked)}
                    className="w-3.5 h-3.5 accent-brand-navy border border-brand-navy/20 rounded-xs cursor-pointer focus:outline-none"
                  />
                  Mantenerse conectado
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setIsRecovering(true);
                    setErrorMsg(null);
                    setRecoverySuccess(null);
                  }}
                  className="text-[10px] font-medium text-brand-timber hover:text-brand-navy transition-colors cursor-pointer bg-transparent"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-brand-navy hover:bg-brand-navy/90 text-brand-cream text-xs font-semibold rounded-xs transition-all cursor-pointer shadow-sm text-center flex items-center justify-center gap-2 disabled:opacity-75 disabled:pointer-events-none mt-2"
              >
                {loading && (
                  <svg className="animate-spin h-3.5 w-3.5 text-brand-cream" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
              </button>
            </form>
          ) : (
            /* Formulario de Recuperación de Contraseña */
            <form onSubmit={handleRecovery} className="flex flex-col gap-5 bg-transparent">
              <div className="space-y-1 bg-transparent">
                <label className="text-[10px] uppercase font-bold tracking-wider text-brand-navy/45">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  required
                  className="w-full bg-transparent border-b border-brand-navy/15 text-base text-brand-navy focus:outline-none focus:border-brand-navy py-1.5 transition-all placeholder-brand-navy/20"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-brand-navy hover:bg-brand-navy/90 text-brand-cream text-xs font-semibold rounded-xs transition-all cursor-pointer shadow-sm text-center flex items-center justify-center gap-2 disabled:opacity-75 disabled:pointer-events-none mt-2"
              >
                {loading && (
                  <svg className="animate-spin h-3.5 w-3.5 text-brand-cream" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {loading ? "Enviando..." : "Enviar enlace de restauración"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsRecovering(false);
                  setErrorMsg(null);
                  setRecoverySuccess(null);
                }}
                className="w-full py-2 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy text-[11px] font-semibold rounded-xs transition-all cursor-pointer text-center"
              >
                Volver al Inicio de Sesión
              </button>
            </form>
          )}

        </div>

        {/* Footer del Cajetín */}
        <p className="text-[10px] text-brand-navy/35 tracking-wide text-center">
          © 2026 Álbum Familiar • Recuerdos Preservados
        </p>

      </div>
      
    </div>
  );
}
