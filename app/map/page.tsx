"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface PhotoItem {
  name: string;
  url: string;
  created_at: string | null;
  album_id?: string | null;
  status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface PhotoLocation {
  name: string;
  url: string;
  title: string;
  city: string;
  year: string;
  x: number; // Porcentaje de posición X en el mapa SVG
  y: number; // Porcentaje de posición Y en el mapa SVG
}

// Mapa estático de ubicaciones para los recuerdos sembrados
const SAMPLE_LOCATIONS: Record<string, { city: string; x: number; y: number; title: string }> = {
  "sample_picnic_1988.webp": { city: "Pirineos (Huesca)", x: 72, y: 22, title: "Picnic familiar en la montaña" },
  "sample_cumpleanos_1991.webp": { city: "Madrid", x: 48, y: 48, title: "Cumpleaños de la abuela Sofía" },
  "sample_playa_1985.webp": { city: "Valencia", x: 74, y: 52, title: "Vacaciones de verano en la costa" },
  "sample_boda_1980.webp": { city: "Sevilla", x: 26, y: 79, title: "Boda de los padres" },
  "sample_navidad_1992.webp": { city: "Madrid (Casa)", x: 48, y: 48, title: "Cena de Navidad en casa" },
  "sample_bicicleta_1987.webp": { city: "Barcelona", x: 86, y: 26, title: "Paseo dominical en bicicleta" }
};

const SPAIN_CITIES = [
  { name: "Madrid", x: 48, y: 48 },
  { name: "Barcelona", x: 86, y: 26 },
  { name: "Valencia", x: 74, y: 52 },
  { name: "Sevilla", x: 26, y: 79 },
  { name: "Bilbao", x: 48, y: 14 },
  { name: "Málaga", x: 34, y: 86 },
  { name: "Galicia", x: 12, y: 18 }
];

// Helper para proyectar coordenadas GPS reales en los límites del mapa SVG de España
const getXYFromCoordinates = (lat: number, lng: number) => {
  // Límites aproximados del mapa de España
  const latMin = 35.0; // Sur
  const latMax = 44.0; // Norte
  const lngMin = -9.5; // Oeste
  const lngMax = 4.5;  // Este
  
  let x = ((lng - lngMin) / (lngMax - lngMin)) * 100;
  let y = 100 - ((lat - latMin) / (latMax - latMin)) * 100;
  
  // Ajuste para asegurar que permanezcan dentro del mapa visualmente (entre 5% y 95%)
  x = Math.max(8, Math.min(92, x));
  y = Math.max(8, Math.min(92, y));
  
  return { x, y };
};

// Helper para encontrar la ciudad más cercana en España basándose en coordenadas GPS
const getNearestCity = (lat: number, lng: number): string => {
  let nearestCity = "Ubicación Georeferenciada";
  let minDistance = Infinity;
  
  const cities = [
    { name: "Madrid", lat: 40.4167, lng: -3.7037 },
    { name: "Barcelona", lat: 41.3851, lng: 2.1734 },
    { name: "Valencia", lat: 39.4699, lng: -0.3763 },
    { name: "Sevilla", lat: 37.3891, lng: -5.9845 },
    { name: "Bilbao", lat: 43.2630, lng: -2.9350 },
    { name: "Málaga", lat: 36.7213, lng: -4.4214 },
    { name: "Santiago de Compostela", lat: 42.8782, lng: -8.5448 }
  ];
  
  cities.forEach((city) => {
    const d = Math.pow(city.lat - lat, 2) + Math.pow(city.lng - lng, 2);
    if (d < minDistance) {
      minDistance = d;
      nearestCity = city.name;
    }
  });
  
  return nearestCity;
};

export default function MapPage() {
  const [photosOnMap, setPhotosOnMap] = useState<PhotoLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoLocation | null>(null);
  const [activeLightbox, setActiveLightbox] = useState<string | null>(null);

  useEffect(() => {
    const fetchPhotosForMap = async () => {
      try {
        setLoading(true);
        // Cargar fotos locales
        const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
        const localPhotos: PhotoItem[] = JSON.parse(localPhotosJson);
        const activePhotos = localPhotos.filter((p) => p.status !== "trash");

        const mapped: PhotoLocation[] = [];

        activePhotos.forEach((photo) => {
          const locData = SAMPLE_LOCATIONS[photo.name];
          const cleanTitle = photo.name.split("_").slice(1).join("_").replace(/\.webp$/, "");
          
          if (photo.latitude !== undefined && photo.latitude !== null && photo.longitude !== undefined && photo.longitude !== null) {
            // Caso 1: Foto con coordenadas GPS reales (del EXIF)
            const { x, y } = getXYFromCoordinates(photo.latitude, photo.longitude);
            const nearestCityName = getNearestCity(photo.latitude, photo.longitude);
            
            mapped.push({
              name: photo.name,
              url: photo.url,
              title: cleanTitle || "Recuerdo Familiar",
              city: `${nearestCityName} (${photo.latitude.toFixed(2)}, ${photo.longitude.toFixed(2)})`,
              year: photo.created_at ? new Date(photo.created_at).getFullYear().toString() : "2026",
              x,
              y
            });
          } else if (locData) {
            // Caso 2: Foto sembrada de muestra con ubicación predefinida
            mapped.push({
              name: photo.name,
              url: photo.url,
              title: locData.title,
              city: locData.city,
              year: photo.created_at ? new Date(photo.created_at).getFullYear().toString() : "1990",
              x: locData.x,
              y: locData.y
            });
          } else {
            // Caso 3: Foto subida sin coordenadas EXIF GPS: la ubicamos en Madrid (centro) con pequeña variación
            const defaultCity = SPAIN_CITIES[0]; // Madrid
            mapped.push({
              name: photo.name,
              url: photo.url,
              title: cleanTitle || "Recuerdo Familiar",
              city: "Ubicación Familiar (Madrid)",
              x: defaultCity.x + (Math.random() * 6 - 3),
              y: defaultCity.y + (Math.random() * 6 - 3),
              year: photo.created_at ? new Date(photo.created_at).getFullYear().toString() : "2026"
            });
          }
        });

        setPhotosOnMap(mapped);
      } catch (err) {
        console.error("Error cargando fotos en el mapa:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPhotosForMap();
  }, []);

  return (
    <div className="flex-1 p-4 md:p-8 space-y-6 md:space-y-8 bg-brand-cream overflow-y-auto max-w-6xl mx-auto w-full select-none">
      
      {/* Cabecera */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-navy/10 pb-6">
        <div className="space-y-1.5 bg-transparent">
          <h1 className="text-2xl md:text-3xl font-light tracking-wide text-brand-navy">Mapa de Recuerdos</h1>
          <p className="text-xs md:text-sm text-brand-navy/60 max-w-md">
            Visualiza geográficamente dónde sucedieron los momentos especiales de tu familia a lo largo de los años.
          </p>
        </div>
        <Link
          href="/photos"
          className="py-2 px-4 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy text-xs font-semibold rounded-xs transition-colors cursor-pointer text-center md:w-auto"
        >
          Volver a la Biblioteca
        </Link>
      </div>

      {loading ? (
        <div className="w-full h-[500px] bg-brand-navy/5 rounded-xs animate-pulse flex items-center justify-center">
          <p className="text-xs text-brand-navy/50 font-semibold uppercase tracking-wider">Cargando mapa interactivo...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* El Mapa Interactivo SVG */}
          <div className="lg:col-span-3 bg-brand-cream/40 border border-brand-navy/10 rounded-xs p-4 relative shadow-sm overflow-hidden flex items-center justify-center min-h-[400px] md:min-h-[500px]">
            
            {/* Canvas de Mapa SVG de Estilo Lineal y Premium */}
            <svg
              viewBox="0 0 800 600"
              className="w-full h-auto max-w-[700px] opacity-80"
              fill="none"
              stroke="currentColor"
            >
              {/* Contorno simplificado y estético de la Península Ibérica */}
              <path
                d="M100 150 C 120 120, 200 90, 250 80 C 300 70, 360 80, 420 70 C 480 60, 500 50, 550 60 C 600 70, 680 70, 720 100 C 760 130, 780 180, 790 220 C 800 260, 780 320, 770 370 C 760 420, 730 450, 710 470 C 690 490, 650 510, 610 520 C 570 530, 520 540, 480 550 C 440 560, 380 570, 320 580 C 260 590, 220 570, 190 560 C 160 550, 150 530, 130 520 C 110 510, 100 480, 90 440 C 80 400, 70 300, 60 250 C 50 200, 80 180, 100 150 Z"
                fill="#FFFDF5"
                stroke="#0d1b2a"
                strokeWidth="2"
                strokeOpacity="0.15"
              />
              
              {/* Frontera de Portugal (Línea de trazo fino) */}
              <path
                d="M190 560 C 180 500, 170 450, 175 400 C 180 350, 170 300, 160 250 C 150 200, 140 180, 130 150"
                stroke="#0d1b2a"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                strokeOpacity="0.12"
              />

              {/* Islas Baleares */}
              <path d="M720 320 C730 310, 750 315, 760 325 Z" fill="#FFFDF5" stroke="#0d1b2a" strokeWidth="1.5" strokeOpacity="0.15" />
              <path d="M740 350 C745 345, 755 348, 760 355 Z" fill="#FFFDF5" stroke="#0d1b2a" strokeWidth="1.5" strokeOpacity="0.15" />
              
              {/* Guía visual de ciudades de España */}
              {SPAIN_CITIES.map((city) => (
                <g key={city.name} className="opacity-30">
                  <circle cx={city.x * 8} cy={city.y * 6} r="3" fill="#0d1b2a" />
                  <text
                    x={city.x * 8 + 6}
                    y={city.y * 6 + 3}
                    className="text-[9px] font-medium fill-brand-navy"
                  >
                    {city.name}
                  </text>
                </g>
              ))}
            </svg>

            {/* Pines interactivos absolute sobre el contenedor */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="relative w-full h-full">
                {photosOnMap.map((photo) => {
                  const isSelected = selectedPhoto?.name === photo.name;
                  return (
                    <button
                      key={photo.name}
                      onClick={() => setSelectedPhoto(photo)}
                      style={{ left: `${photo.x}%`, top: `${photo.y}%` }}
                      className="absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 group/pin cursor-pointer focus:outline-none z-20"
                    >
                      <div className="relative flex flex-col items-center">
                        
                        {/* Pin de ubicación */}
                        <div
                          className={`w-5 h-5 rounded-full border shadow-md flex items-center justify-center transition-all ${
                            isSelected
                              ? "bg-brand-navy border-brand-cream scale-110"
                              : "bg-brand-timber border-brand-cream group-hover/pin:scale-105"
                          }`}
                        >
                          <svg className="w-2.5 h-2.5 text-brand-cream" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                          </svg>
                        </div>
                        
                        {/* Tooltip flotante en hover */}
                        <div className="absolute bottom-6 bg-brand-navy text-brand-cream text-[9px] px-2 py-0.5 rounded-xs opacity-0 group-hover/pin:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none shadow-md">
                          {photo.city} • {photo.year}
                        </div>

                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Panel Lateral: Detalle del recuerdo seleccionado */}
          <div className="lg:col-span-1 flex flex-col justify-between border border-brand-navy/10 rounded-xs p-6 bg-brand-cream/30 min-h-[300px]">
            {selectedPhoto ? (
              <div className="space-y-5 flex-1 flex flex-col justify-between">
                <div className="space-y-4 bg-transparent">
                  <div className="aspect-video relative rounded-xs overflow-hidden border border-brand-navy/10 shadow-sm bg-brand-navy/5">
                    <img
                      src={selectedPhoto.url}
                      alt={selectedPhoto.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 bg-brand-cream/90 text-[9px] font-bold px-1.5 py-0.5 rounded-xs text-brand-navy">
                      {selectedPhoto.year}
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 bg-transparent">
                    <span className="text-[9px] font-bold text-brand-timber uppercase tracking-wider">
                      Ubicación del Recuerdo
                    </span>
                    <h3 className="text-xs font-bold text-brand-navy uppercase tracking-wide leading-relaxed">
                      {selectedPhoto.title}
                    </h3>
                    <p className="text-[11px] text-brand-navy/65 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-brand-navy/40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {selectedPhoto.city}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 bg-transparent pt-4 border-t border-brand-navy/10">
                  <button
                    onClick={() => setActiveLightbox(selectedPhoto.url)}
                    className="w-full py-2 bg-brand-navy text-brand-cream hover:bg-brand-navy/90 text-xs font-semibold rounded-xs transition-colors cursor-pointer text-center"
                  >
                    Ver foto original
                  </button>
                  <button
                    onClick={() => setSelectedPhoto(null)}
                    className="w-full py-1.5 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy text-[11px] font-semibold rounded-xs transition-colors cursor-pointer text-center"
                  >
                    Cerrar detalle
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4 bg-transparent">
                <svg className="w-12 h-12 text-brand-navy/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="mt-4 text-xs font-medium text-brand-navy/50 leading-relaxed">
                  Selecciona un pin en el mapa interactivo para ver los detalles del recuerdo en esa ubicación.
                </p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Lightbox */}
      {activeLightbox && (
        <div
          onClick={() => setActiveLightbox(null)}
          className="fixed inset-0 bg-brand-navy/95 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
        >
          <button
            onClick={() => setActiveLightbox(null)}
            className="absolute top-6 right-6 text-brand-cream/65 hover:text-brand-cream transition-colors p-2 cursor-pointer"
          >
            ✕ Cerrar
          </button>
          <img
            src={activeLightbox}
            alt="Recuerdo Ampliado"
            className="max-w-full max-h-[85vh] object-contain rounded-xs border border-brand-cream/20 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

    </div>
  );
}
