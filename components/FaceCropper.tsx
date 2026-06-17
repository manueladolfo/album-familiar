"use client";

import { useState, useEffect, useRef, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";

interface FaceCropperProps {
  src: string;
  rotation?: number;
  onCrop: (croppedBase64: string) => void;
  onClose: () => void;
  title?: string;
}

export default function FaceCropper({
  src,
  rotation = 0,
  onCrop,
  onClose,
  title = "Ajustar foto de perfil"
}: FaceCropperProps) {
  const [orientedSrc, setOrientedSrc] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const startPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const startPan = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Visor fijo en px
  const visorSize = 280;
  // Círculo de recorte en px (centrado)
  const cropSize = 185;
  const cropOffset = (visorSize - cropSize) / 2; // (280 - 185) / 2 = 47.5px

  // 1. Orientar la imagen en función de su rotación antes de editar
  useEffect(() => {
    let active = true;
    setLoading(true);

    const getOrientedImage = (imageSrc: string, angle: number): Promise<string> => {
      return new Promise((resolve) => {
        if (angle === 0 && imageSrc.startsWith("data:")) {
          resolve(imageSrc);
          return;
        }
        const img = new Image();
        img.crossOrigin = "anonymous";
        
        // Evitar caché de CORS del navegador agregando cache-buster para URLs remotas
        const srcWithBuster = imageSrc.startsWith("data:") 
          ? imageSrc 
          : `${imageSrc}${imageSrc.includes("?") ? "&" : "?"}t=${Date.now()}`;

        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(imageSrc);
            return;
          }

          const angleRad = (angle * Math.PI) / 180;
          const is90or270 = Math.abs(angle) % 180 !== 0;

          canvas.width = is90or270 ? img.height : img.width;
          canvas.height = is90or270 ? img.width : img.height;

          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(angleRad);
          ctx.drawImage(img, -img.width / 2, -img.height / 2);

          resolve(canvas.toDataURL("image/jpeg", 0.9));
        };
        img.onerror = () => {
          resolve(imageSrc);
        };
        img.src = srcWithBuster;
      });
    };

    getOrientedImage(src, rotation).then((oriented) => {
      if (active) {
        setOrientedSrc(oriented);
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [src, rotation]);

  // 2. Cuando la imagen orientada se carga, calculamos su tamaño base
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    // Escala base para cubrir el visor completo (como object-fit: cover)
    const scaleBase = Math.max(visorSize / img.naturalWidth, visorSize / img.naturalHeight);
    setImageSize({
      width: img.naturalWidth * scaleBase,
      height: img.naturalHeight * scaleBase
    });
    setPan({ x: 0, y: 0 });
    setZoom(1.1); // zoom inicial ligeramente mayor a 1 para un ajuste agradable
  };

  // 3. Controladores de arrastre (Touch y Mouse)
  const startDrag = (clientX: number, clientY: number) => {
    setIsDragging(true);
    startPos.current = { x: clientX, y: clientY };
    startPan.current = { ...pan };
  };

  const onDrag = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    const dx = clientX - startPos.current.x;
    const dy = clientY - startPos.current.y;
    
    // Limitar el arrastre para que la imagen no se salga excesivamente del círculo
    // (Opcional, pero dar un margen flexible suele ser lo más cómodo)
    setPan({
      x: startPan.current.x + dx,
      y: startPan.current.y + dy
    });
  };

  const stopDrag = () => {
    setIsDragging(false);
  };

  // Eventos de ratón
  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    onDrag(e.clientX, e.clientY);
  };

  // Eventos táctiles (iPhone/Tablet)
  const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      // Evitar scroll nativo en iPhone mientras arrastras dentro del recortador
      e.stopPropagation();
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      e.stopPropagation();
      onDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // Generar la imagen recortada en canvas
  const handleConfirm = () => {
    const img = imageRef.current;
    if (!img || !orientedSrc) return;

    // Dimensiones de la imagen renderizada en el visor
    const viewWidth = imageSize.width * zoom;
    const viewHeight = imageSize.height * zoom;

    // Esquina superior izquierda de la imagen respecto al visor
    const imgX = (visorSize / 2) - (viewWidth / 2) + pan.x;
    const imgY = (visorSize / 2) - (viewHeight / 2) + pan.y;

    // Desplazamiento del círculo de recorte con respecto a la imagen (en px de visor)
    const dx = cropOffset - imgX;
    const dy = cropOffset - imgY;

    // Relación de escala entre la imagen natural y la renderizada en el visor
    const scaleRatio = img.naturalWidth / viewWidth;

    // Coordenadas en la imagen real
    const sx = dx * scaleRatio;
    const sy = dy * scaleRatio;
    const sw = cropSize * scaleRatio;
    const sh = cropSize * scaleRatio;

    // Crear canvas final de 150x150 (perfecto y ultra-liviano para avatar)
    const canvas = document.createElement("canvas");
    canvas.width = 150;
    canvas.height = 150;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      try {
        // Dibujar de forma redonda en el canvas
        ctx.beginPath();
        ctx.arc(75, 75, 75, 0, Math.PI * 2);
        ctx.clip();
        
        // Dibujar la subimagen recortada
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 150, 150);

        // Exportar como Data URL comprimida
        const croppedBase64 = canvas.toDataURL("image/jpeg", 0.75);
        onCrop(croppedBase64);
      } catch (error) {
        console.error("Error al procesar el recorte en canvas (CORS/seguridad):", error);
        // Fallback: usar la imagen completa orientada directamente (sin recortar)
        onCrop(orientedSrc || src);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-md z-70 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-brand-cream border border-brand-navy/30 rounded-xs p-6 max-w-sm w-full shadow-2xl flex flex-col items-center space-y-5">
        
        {/* Header */}
        <div className="w-full text-center bg-transparent">
          <h3 className="text-xs font-bold text-brand-navy uppercase tracking-wider">
            {title}
          </h3>
          <p className="text-[10px] text-brand-navy/50 mt-1">
            Arrastra con el ratón o el dedo para centrar el rostro. Usa la barra para el tamaño.
          </p>
        </div>

        {/* Visor de recorte */}
        <div 
          className="relative rounded-xs border border-brand-navy/15 bg-brand-navy/5 overflow-hidden select-none touch-none shadow-inner"
          style={{ width: `${visorSize}px`, height: `${visorSize}px`, cursor: isDragging ? "grabbing" : "grab" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={stopDrag}
        >
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-brand-navy/50 font-medium bg-transparent">
              Cargando imagen...
            </div>
          ) : (
            <>
              {/* Imagen a recortar */}
              <img
                ref={imageRef}
                src={orientedSrc}
                alt="Para recortar"
                crossOrigin="anonymous"
                onLoad={handleImageLoad}
                className="absolute origin-center max-w-none pointer-events-none"
                style={{
                  width: `${imageSize.width * zoom}px`,
                  height: `${imageSize.height * zoom}px`,
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`
                }}
              />

              {/* Máscara de recorte (overlay redondo con shadow) */}
              <div 
                className="absolute pointer-events-none z-20 rounded-full border-2 border-brand-cream/80 ring-[999px] ring-brand-navy/60 shadow-lg"
                style={{
                  width: `${cropSize}px`,
                  height: `${cropSize}px`,
                  left: `${cropOffset}px`,
                  top: `${cropOffset}px`
                }}
              />
            </>
          )}
        </div>

        {/* Controles de Zoom */}
        <div className="w-full space-y-1 bg-transparent">
          <div className="flex justify-between items-center bg-transparent text-[10px] font-bold text-brand-navy/60 uppercase tracking-wider">
            <span>Zoom</span>
            <span>{Math.round(zoom * 100)}%</span>
          </div>
          <div className="flex items-center gap-3 bg-transparent">
            <span className="text-[10px] text-brand-navy/50 font-bold select-none">-</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              disabled={loading}
              className="flex-1 accent-brand-navy h-1 bg-brand-navy/15 rounded-lg appearance-none cursor-pointer outline-none"
            />
            <span className="text-[10px] text-brand-navy/50 font-bold select-none">+</span>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="w-full flex gap-3 pt-2 bg-transparent">
          <button
            onClick={onClose}
            className="flex-1 py-1.5 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy text-xs font-semibold rounded-xs transition-colors cursor-pointer text-center"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-1.5 bg-brand-navy text-brand-cream hover:bg-brand-navy/95 text-xs font-semibold rounded-xs transition-colors cursor-pointer text-center disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirmar
          </button>
        </div>

      </div>
    </div>
  );
}
