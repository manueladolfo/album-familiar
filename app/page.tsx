"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import { filterPhotos, PhotoMetadata, PhotoItem } from "@/lib/search";
import { isValidUUID } from "@/lib/uuid";

interface SamplePhoto {
  id: string;
  name: string;
  title: string;
  url: string;
  albumId: string;
  createdAt: string;
}

interface AlbumItem {
  id: string;
  name: string;
}

interface PersonProfile {
  id: string;
  name: string;
  avatar: string;
  isGroup: boolean;
  tags: string[]; // Claves para simular búsqueda inteligente por concordancia
}

interface LocalPhotoItem {
  name: string;
  url: string;
  created_at?: string | null;
  album_id?: string | null;
  status?: string | null;
  title?: string;
}

const SAMPLE_PHOTOS: SamplePhoto[] = [
  {
    id: "sample_picnic_1988",
    name: "sample_picnic_1988.webp",
    title: "Picnic familiar en la montaña",
    url: "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&auto=format&fit=crop",
    albumId: "d2a60222-92b0-4f81-b51f-d748ad0a7202",
    createdAt: "1988-07-15T14:00:00Z"
  },
  {
    id: "sample_cumpleanos_1991",
    name: "sample_cumpleanos_1991.webp",
    title: "Cumpleaños de la abuela Sofía",
    url: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&auto=format&fit=crop",
    albumId: "d3a60333-92b0-4f81-b51f-d748ad0a7203",
    createdAt: "1991-11-22T18:30:00Z"
  },
  {
    id: "sample_playa_1985",
    name: "sample_playa_1985.webp",
    title: "Vacaciones de verano en la costa",
    url: "https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=800&auto=format&fit=crop",
    albumId: "d1a60111-92b0-4f81-b51f-d748ad0a7201",
    createdAt: "1985-08-05T12:00:00Z"
  },
  {
    id: "sample_boda_1980",
    name: "sample_boda_1980.webp",
    title: "Boda de los padres",
    url: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop",
    albumId: "d2a60222-92b0-4f81-b51f-d748ad0a7202",
    createdAt: "1980-05-18T16:00:00Z"
  },
  {
    id: "sample_navidad_1992",
    name: "sample_navidad_1992.webp",
    title: "Cena de Navidad en casa",
    url: "https://images.unsplash.com/photo-1543257580-7269da773bf5?w=800&auto=format&fit=crop",
    albumId: "d2a60222-92b0-4f81-b51f-d748ad0a7202",
    createdAt: "1992-12-24T21:00:00Z"
  },
  {
    id: "sample_bicicleta_1987",
    name: "sample_bicicleta_1987.webp",
    title: "Paseo dominical en bicicleta",
    url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop",
    albumId: "d1a60111-92b0-4f81-b51f-d748ad0a7201",
    createdAt: "1987-04-12T11:00:00Z"
  }
];

const DEFAULT_PEOPLE: PersonProfile[] = [
  {
    id: "p_ma_cynthia",
    name: "Manuel Adolfo y Cynthia",
    avatar: "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=300&auto=format&fit=crop",
    isGroup: true,
    tags: ["picnic", "boda", "navidad", "cynthia", "manuel adolfo"]
  },
  {
    id: "p_ap_manuel",
    name: "Ana Paula y Manuel",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&auto=format&fit=crop",
    isGroup: true,
    tags: ["bicicleta", "playa", "ana paula", "manuel"]
  },
  {
    id: "p_ma_manuel",
    name: "Manuel Adolfo y Manuel",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&auto=format&fit=crop",
    isGroup: true,
    tags: ["picnic", "navidad", "manuel adolfo", "manuel"]
  },
  {
    id: "p_manuel_adolfo",
    name: "Manuel Adolfo",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop",
    isGroup: false,
    tags: ["picnic", "boda", "navidad", "manuel adolfo"]
  },
  {
    id: "p_ana_paula",
    name: "Ana Paula",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&auto=format&fit=crop",
    isGroup: false,
    tags: ["playa", "bicicleta", "ana paula"]
  },
  {
    id: "p_manuel",
    name: "Manuel",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop",
    isGroup: false,
    tags: ["bicicleta", "playa", "picnic", "navidad", "manuel"]
  },
  {
    id: "p_cynthia",
    name: "Cynthia",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop",
    isGroup: false,
    tags: ["boda", "navidad", "cynthia"]
  },
  {
    id: "p_dante",
    name: "Dante",
    avatar: "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=200&auto=format&fit=crop",
    isGroup: false,
    tags: ["perro", "playa", "dante", "mascota"]
  }
];

export default function Home() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("search") || "";
  const [statusMessage, setStatusMessage] = useState("Conectando con Supabase...");
  const [importedPhotos, setImportedPhotos] = useState<string[]>([]);
  const [libraryPhotos, setLibraryPhotos] = useState<PhotoItem[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Estados de Colecciones & Música
  const [activeCollectionIndex, setActiveCollectionIndex] = useState<number>(0);
  const [isFullscreenCarousel, setIsFullscreenCarousel] = useState<boolean>(false);

  const [photoMetadata, setPhotoMetadata] = useState<Record<string, PhotoMetadata>>({});
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [rotations, setRotations] = useState<Record<string, number>>({});

  // Estados para Personas
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonProfile | null>(null);
  const [taggedPhotos, setTaggedPhotos] = useState<Record<string, string[]>>({}); // map of personId -> list of photo names
  const [unassignedPhotos, setUnassignedPhotos] = useState<LocalPhotoItem[]>([]);
  const [suggestedPhotos, setSuggestedPhotos] = useState<LocalPhotoItem[]>([]);

  // Estados para añadir nueva persona/mascota
  const [isAddPersonOpen, setIsAddPersonOpen] = useState<boolean>(false);
  const [newPersonName, setNewPersonName] = useState<string>("");
  const [selectedPhotoNamesForNewPerson, setSelectedPhotoNamesForNewPerson] = useState<string[]>([]);
  const [newPersonIsGroup, setNewPersonIsGroup] = useState<boolean>(false);

  const currentCarouselPhotos = libraryPhotos.length > 0 ? libraryPhotos : SAMPLE_PHOTOS;

  // Inicialización de música, personas e importados
  useEffect(() => {
    // 1. Inicializar Supabase status
    try {
      if (supabase) {
        setStatusMessage("Supabase cliente inicializado correctamente.");
      } else {
        setStatusMessage("Supabase no está disponible, operando en modo local.");
      }
    } catch {
      setStatusMessage("Error al inicializar el cliente de Supabase.");
    }

    // 2. Cargar personas de LocalStorage o sembrar iniciales
    const savedPeople = localStorage.getItem("family_album_people");
    if (savedPeople) {
      setPeople(JSON.parse(savedPeople));
    } else {
      localStorage.setItem("family_album_people", JSON.stringify(DEFAULT_PEOPLE));
      setPeople(DEFAULT_PEOPLE);
    }

    // 3. Cargar mapeo de fotos etiquetadas a personas
    const savedTagged = localStorage.getItem("family_album_person_tags");
    if (savedTagged) {
      setTaggedPhotos(JSON.parse(savedTagged));
    } else {
      // Mapear recuerdos de muestra iniciales por defecto a personas
      const initialTags: Record<string, string[]> = {
        "p_ma_cynthia": ["sample_boda_1980.webp", "sample_navidad_1992.webp"],
        "p_ap_manuel": ["sample_playa_1985.webp", "sample_bicicleta_1987.webp"],
        "p_ma_manuel": ["sample_picnic_1988.webp", "sample_navidad_1992.webp"],
        "p_manuel_adolfo": ["sample_picnic_1988.webp", "sample_boda_1980.webp", "sample_navidad_1992.webp"],
        "p_ana_paula": ["sample_playa_1985.webp", "sample_bicicleta_1987.webp", "sample_cumpleanos_1991.webp"],
        "p_manuel": ["sample_picnic_1988.webp", "sample_playa_1985.webp", "sample_bicicleta_1987.webp"],
        "p_cynthia": ["sample_boda_1980.webp", "sample_navidad_1992.webp"],
        "p_dante": ["sample_playa_1985.webp"]
      };
      localStorage.setItem("family_album_person_tags", JSON.stringify(initialTags));
      setTaggedPhotos(initialTags);
    }

    // 4. Cargar fotos importadas, remotas y metadatos de IA
    const loadImportedAndMetadata = async () => {
      try {
        let remotePhotos: PhotoItem[] = [];

        // 1. Obtener de Supabase Storage
        try {
          const { data: storageData, error } = await supabase.storage
            .from("family-album")
            .list("thumbnails", {
              limit: 100,
              sortBy: { column: "created_at", order: "desc" },
            });

          if (error) throw error;

          if (storageData) {
            const validFiles = storageData.filter((file) => file.name !== ".emptyFolderPlaceholder");

            let dbAlbumMappings: Record<string, string> = {};
            let dbStatusMappings: Record<string, string> = {};
            try {
              const { data: dbPhotos } = await supabase.from("photos").select("id, album_id, status");
              if (dbPhotos) {
                dbPhotos.forEach((p) => {
                  if (p.album_id) dbAlbumMappings[p.id] = p.album_id;
                  if (p.status) dbStatusMappings[p.id] = p.status;
                });
              }
            } catch {
              // Ignorar
            }

            const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
            const localAlbumMappings = JSON.parse(localAlbumMappingsJson);

            const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
            const localStatusMappings = JSON.parse(localStatusMappingsJson);

            const combinedAlbumMappings = { ...dbAlbumMappings, ...localAlbumMappings };
            const combinedStatusMappings = { ...dbStatusMappings, ...localStatusMappings };

            remotePhotos = validFiles.map((file) => {
              const { data: urlData } = supabase.storage
                .from("family-album")
                .getPublicUrl(`thumbnails/${file.name}`);

              const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
              const cleanPhotoId = nameWithoutExt.split(".")[0];
              const photoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : file.name;

              const albumId = combinedAlbumMappings[photoId] || null;
              const status = combinedStatusMappings[photoId] || null;

              return {
                name: file.name,
                url: urlData.publicUrl,
                created_at: file.created_at,
                album_id: albumId,
                status: status,
              };
            });
          }
        } catch (err) {
          console.warn("Fallo al conectar con Supabase Storage en inicio. Operando localmente...");
        }

        // 2. Obtener locales de LocalStorage
        const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
        const localPhotos: PhotoItem[] = JSON.parse(localPhotosJson);

        const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
        const localAlbumMappings = JSON.parse(localAlbumMappingsJson);

        const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
        const localStatusMappings = JSON.parse(localStatusMappingsJson);

        const updatedLocalPhotos = localPhotos.map((photo) => ({
          ...photo,
          album_id: localAlbumMappings[photo.name] !== undefined ? localAlbumMappings[photo.name] : photo.album_id,
          status: localStatusMappings[photo.name] !== undefined ? localStatusMappings[photo.name] : photo.status,
        }));

        // 3. Combinar
        const allPhotos = [...remotePhotos];
        updatedLocalPhotos.forEach((localPhoto) => {
          if (!allPhotos.some((p) => p.name === localPhoto.name)) {
            allPhotos.push(localPhoto);
          }
        });

        // 4. Filtrar activas
        const activePhotos = allPhotos
          .filter((photo) => photo.status !== "trash")
          .sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
          });

        setLibraryPhotos(activePhotos);
        setImportedPhotos(activePhotos.map((p) => p.name));
      } catch (err) {
        console.error("Error al cargar fotos de la biblioteca:", err);
      }

      const metadataJson = localStorage.getItem("family_album_photo_metadata") || "{}";
      setPhotoMetadata(JSON.parse(metadataJson));

      const savedRotations = localStorage.getItem("family_album_photo_rotations");
      if (savedRotations) {
        setRotations(JSON.parse(savedRotations));
      } else {
        setRotations({});
      }
    };

    loadImportedAndMetadata();

    // 5. Cargar álbumes locales
    const loadAlbums = () => {
      const localAlbums = localStorage.getItem("family_album_local_albums");
      if (localAlbums) {
        setAlbums(JSON.parse(localAlbums));
      }
    };
    loadAlbums();

    window.addEventListener("photo-moved", loadImportedAndMetadata);
    window.addEventListener("refresh-albums", loadAlbums);
    return () => {
      window.removeEventListener("photo-moved", loadImportedAndMetadata);
      window.removeEventListener("refresh-albums", loadAlbums);
    };
  }, []);

  // Rotación automática del carrusel cada 6 segundos
  useEffect(() => {
    if (currentCarouselPhotos.length === 0) return;
    const timer = setInterval(() => {
      setActiveCollectionIndex((prev) => (prev + 1) % currentCarouselPhotos.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [currentCarouselPhotos.length]);

  // Cargar fotos asociadas al perfil de persona seleccionado y buscar sugerencias
  useEffect(() => {
    if (selectedPerson) {
      const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
      const localPhotos = JSON.parse(localPhotosJson);
      const activeLocalPhotos: LocalPhotoItem[] = localPhotos.filter((p: LocalPhotoItem) => p.status !== "trash");

      // Fotos ya asociadas
      const assignedNames = taggedPhotos[selectedPerson.id] || [];
      const assigned = activeLocalPhotos.filter((p: LocalPhotoItem) => assignedNames.includes(p.name));

      // Buscar sugerencias (fotos no asignadas pero que tienen tags en común con el perfil)
      const unassigned = activeLocalPhotos.filter((p: LocalPhotoItem) => !assignedNames.includes(p.name));
      const suggestions = unassigned.filter((p: LocalPhotoItem) => {
        const titleLower = (p.title || p.name).toLowerCase();
        // Verificar si contiene alguna palabra clave del perfil
        return selectedPerson.tags.some(tag => titleLower.includes(tag.toLowerCase()));
      });

      setUnassignedPhotos(unassigned);
      setSuggestedPhotos(suggestions);
    }
  }, [selectedPerson, taggedPhotos]);

  // Añadir una foto seleccionada al perfil de la persona
  const addPhotoToPerson = (photoName: string) => {
    if (!selectedPerson) return;

    const newTagged = { ...taggedPhotos };
    const currentList = newTagged[selectedPerson.id] || [];
    if (!currentList.includes(photoName)) {
      currentList.push(photoName);
    }
    newTagged[selectedPerson.id] = currentList;

    localStorage.setItem("family_album_person_tags", JSON.stringify(newTagged));
    setTaggedPhotos(newTagged);
    setFeedback({ type: "success", text: `Recuerdo asociado con éxito a ${selectedPerson.name}.` });
  };

  // Desvincular una foto del perfil de la persona
  const removePhotoFromPerson = (photoName: string) => {
    if (!selectedPerson) return;

    const newTagged = { ...taggedPhotos };
    newTagged[selectedPerson.id] = (newTagged[selectedPerson.id] || []).filter(name => name !== photoName);

    localStorage.setItem("family_album_person_tags", JSON.stringify(newTagged));
    setTaggedPhotos(newTagged);
  };

  // Establecer foto como portada del perfil de persona o grupo
  const setPersonAvatar = (personId: string, photoUrl: string) => {
    const updatedPeople = people.map(p => p.id === personId ? { ...p, avatar: photoUrl } : p);
    setPeople(updatedPeople);
    localStorage.setItem("family_album_people", JSON.stringify(updatedPeople));
    
    if (selectedPerson && selectedPerson.id === personId) {
      setSelectedPerson({ ...selectedPerson, avatar: photoUrl });
    }
    setFeedback({ type: "success", text: "Foto de portada del perfil actualizada." });
  };

  // Sembrar todos los ejemplos locales
  const seedAllExamples = () => {
    try {
      localStorage.removeItem("family_album_cleared");
      const defaultAlbums = [
        { id: "d1a60111-92b0-4f81-b51f-d748ad0a7201", name: "Vacaciones" },
        { id: "d2a60222-92b0-4f81-b51f-d748ad0a7202", name: "Familia" },
        { id: "d3a60333-92b0-4f81-b51f-d748ad0a7203", name: "Cumpleaños" }
      ];
      localStorage.setItem("family_album_local_albums", JSON.stringify(defaultAlbums));
      window.dispatchEvent(new CustomEvent("refresh-albums"));

      const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
      const localPhotos = JSON.parse(localPhotosJson);

      const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
      const localStatusMappings = JSON.parse(localStatusMappingsJson);

      const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
      const localAlbumMappings = JSON.parse(localAlbumMappingsJson);

      SAMPLE_PHOTOS.forEach((photo) => {
        if (!localPhotos.some((p: LocalPhotoItem) => p.name === photo.name)) {
          localPhotos.push({
            name: photo.name,
            url: photo.url,
            created_at: photo.createdAt,
            album_id: photo.albumId,
            status: "active"
          });
        }
        localStatusMappings[photo.name] = "active";
        localAlbumMappings[photo.name] = photo.albumId;
      });

      // Foto en papelera
      const trashPhotoName = "sample_trash_photo.webp";
      if (!localPhotos.some((p: LocalPhotoItem) => p.name === trashPhotoName)) {
        localPhotos.push({
          name: trashPhotoName,
          url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop",
          created_at: "1994-06-05T10:00:00Z",
          album_id: null,
          status: "trash"
        });
      }
      localStatusMappings[trashPhotoName] = "trash";

      localStorage.setItem("family_album_local_photos", JSON.stringify(localPhotos));
      localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));
      localStorage.setItem("family_album_photo_mappings", JSON.stringify(localAlbumMappings));

      setImportedPhotos(SAMPLE_PHOTOS.map((p) => p.name).concat([trashPhotoName]));
      setFeedback({ type: "success", text: "¡Se han sembrado todos los recuerdos familiares en la biblioteca!" });
      window.dispatchEvent(new CustomEvent("photo-moved"));
    } catch {
      setFeedback({ type: "error", text: "Error al sembrar los recuerdos de ejemplo." });
    }
  };

  const clearLocalData = () => {
    try {
      localStorage.removeItem("family_album_local_photos");
      localStorage.removeItem("family_album_photo_statuses");
      localStorage.removeItem("family_album_photo_mappings");
      localStorage.removeItem("family_album_person_tags");
      localStorage.setItem("family_album_cleared", "true");
      setImportedPhotos([]);
      setTaggedPhotos({});
      setFeedback({ type: "success", text: "Biblioteca y mapeos limpiados correctamente." });
      window.dispatchEvent(new CustomEvent("photo-moved"));
    } catch {
      setFeedback({ type: "error", text: "Error al limpiar los datos." });
    }
  };

  // Importar catálogo individual
  const importPhoto = (photo: SamplePhoto) => {
    try {
      const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
      const localPhotos = JSON.parse(localPhotosJson);

      if (localPhotos.some((p: LocalPhotoItem) => p.name === photo.name)) {
        setFeedback({ type: "error", text: "Este recuerdo ya está importado." });
        return;
      }

      const newPhoto = {
        name: photo.name,
        url: photo.url,
        created_at: photo.createdAt,
        album_id: photo.albumId,
        status: "active"
      };
      localPhotos.push(newPhoto);
      localStorage.setItem("family_album_local_photos", JSON.stringify(localPhotos));

      const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
      const localStatusMappings = JSON.parse(localStatusMappingsJson);
      localStatusMappings[photo.name] = "active";
      localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));

      const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
      const localAlbumMappings = JSON.parse(localAlbumMappingsJson);
      localAlbumMappings[photo.name] = photo.albumId;
      localStorage.setItem("family_album_photo_mappings", JSON.stringify(localAlbumMappings));

      setImportedPhotos((prev) => [...prev, photo.name]);
      setFeedback({ type: "success", text: `"${photo.title}" importado con éxito.` });
      window.dispatchEvent(new CustomEvent("photo-moved"));
    } catch {
      setFeedback({ type: "error", text: "Error al importar el recuerdo." });
    }
  };

  // Mover foto a papelera desde Inicio
  const moveToTrashFromHome = async (photoName: string) => {
    try {
      const nameWithoutExt = photoName.replace(/\.[^/.]+$/, "");
      const cleanPhotoId = nameWithoutExt.split(".")[0];
      const photoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : photoName;

      if (isValidUUID(photoId)) {
        const { error } = await supabase
          .from("photos")
          .update({ status: "trash" })
          .eq("id", photoId);
        if (error) throw error;
        console.log("Foto movida a la papelera en Supabase desde inicio correctamente:", photoId);
      }
    } catch (err) {
      console.warn("Fallo al mover a la papelera en Supabase (RLS). Guardando localmente...", err);
    } finally {
      const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
      const localStatusMappings = JSON.parse(localStatusMappingsJson);
      localStatusMappings[photoName] = "trash";
      localStorage.setItem("family_album_photo_statuses", JSON.stringify(localStatusMappings));

      window.dispatchEvent(new CustomEvent("photo-moved"));
      setFeedback({ type: "success", text: "Foto movida a la papelera." });
    }
  };

  const groups = people.filter((p) => p.isGroup);
  const individuals = people.filter((p) => !p.isGroup);

  return (
    <div className="flex-1 p-4 md:p-8 space-y-8 md:space-y-12 bg-brand-cream overflow-y-auto max-w-6xl mx-auto w-full select-none">
      
      {/* Cabecera Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 bg-transparent border-b border-brand-navy/10 pb-6 md:pb-8">
        <div className="space-y-1.5 bg-transparent">
          <h1 className="text-2xl md:text-3xl font-light tracking-wide text-brand-navy">Inicio</h1>
          <p className="text-xs md:text-sm text-brand-navy/60 max-w-md">
            Explora tus recuerdos a través de colecciones con música o gestiona los rostros de tus seres queridos.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full md:w-auto md:min-w-[280px]">
          <div className="px-4 py-2.5 bg-brand-cream border border-brand-navy/10 rounded-xs flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            <p className="text-[11px] font-medium text-brand-navy/80">{statusMessage}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={seedAllExamples}
              className="flex-1 py-2 px-3 bg-brand-navy text-brand-cream text-xs font-semibold rounded-xs hover:bg-brand-navy/90 transition-all cursor-pointer text-center"
            >
              Sembrar Ejemplos
            </button>
            {importedPhotos.length > 0 && (
              <button
                onClick={clearLocalData}
                className="py-2 px-3 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy text-xs font-medium rounded-xs transition-all cursor-pointer text-center"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Retroalimentación */}
      {feedback && (
        <div className="p-3 bg-brand-cream border border-brand-navy/25 text-brand-navy text-xs rounded-xs font-medium flex justify-between items-center animate-in fade-in duration-200">
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-xs hover:opacity-70">✕</button>
        </div>
      )}

      {/* SECCIÓN 1: COLECCIONES CON MÚSICA */}
      <div className="space-y-4 bg-transparent">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-transparent">
          <div className="space-y-0.5 bg-transparent">
            <h3 className="text-lg font-medium text-brand-navy tracking-tight">Colecciones de Recuerdos</h3>
            <p className="text-xs text-brand-navy/55">Disfruta de tus fotografías familiares ambientadas con melodías relajantes.</p>
          </div>

          {/* Reproductor de Spotify Premium Estilo Glassmorphism */}
          <div className="w-full sm:w-auto sm:min-w-[360px] md:min-w-[420px] h-[82px] bg-transparent rounded-xs overflow-hidden border border-brand-navy/15 shadow-sm flex-shrink-0">
            <iframe
              style={{ borderRadius: "8px" }}
              src="https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn?utm_source=generator&theme=0"
              width="100%"
              height="100%"
              frameBorder="0"
              allowFullScreen={false}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
          </div>
        </div>

        {/* Carrusel de Visualización Estética */}
        <div
          onClick={() => setIsFullscreenCarousel(true)}
          className="relative aspect-[16/9] w-full max-h-[420px] bg-brand-navy/5 rounded-xs overflow-hidden border border-brand-navy/10 group shadow-md cursor-zoom-in"
          title="Haga clic para ver en pantalla completa"
        >
          {currentCarouselPhotos.map((photo, index) => {
            const isActive = index === activeCollectionIndex;
            const photoId = (photo as any).id || photo.name;
            const photoTitle = (photo as any).title || photo.name.split("_").slice(1).join("_").replace(/\.webp$/, "") || photo.name;
            const photoDate = (photo as any).created_at || (photo as any).createdAt || "";
            const photoYear = photoDate ? photoDate.split("-")[0] : "";
            const suggestedPersonName = photo.name.includes("playa") || photo.name.includes("bicicleta") ? "Ana Paula" : "Manuel Adolfo";

            return (
              <div
                key={photoId}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                  isActive ? "opacity-100 z-10 scale-100" : "opacity-0 z-0 scale-[1.01]"
                }`}
              >
                <img
                  src={photo.url}
                  alt={photoTitle}
                  className="w-full h-full object-cover transition-transform duration-300"
                  style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }}
                />
                
                {/* Degradado premium inferior */}
                <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/90 via-transparent to-transparent flex flex-col justify-end p-6 md:p-8" />
                
                <div className="absolute bottom-6 left-6 md:bottom-8 md:left-8 z-20 text-brand-cream space-y-1 bg-transparent">
                  {photoYear && (
                    <span className="bg-brand-timber text-brand-cream text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-xs">
                      {photoYear}
                    </span>
                  )}
                  <h4 className="text-sm md:text-lg font-light tracking-wide uppercase mt-1">
                    {photoTitle}
                  </h4>
                  <p className="text-[10px] md:text-xs text-brand-cream/75 bg-transparent font-medium">
                    Sugerido hoy en: Personas &gt; {suggestedPersonName}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Flechas manuales */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveCollectionIndex((prev) => (prev - 1 + currentCarouselPhotos.length) % currentCarouselPhotos.length);
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-brand-cream/80 backdrop-blur-xs text-brand-navy border border-brand-navy/15 rounded-xs hover:bg-brand-cream transition-all z-20 cursor-pointer opacity-0 group-hover:opacity-100"
          >
            ❮
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveCollectionIndex((prev) => (prev + 1) % currentCarouselPhotos.length);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-brand-cream/80 backdrop-blur-xs text-brand-navy border border-brand-navy/15 rounded-xs hover:bg-brand-cream transition-all z-20 cursor-pointer opacity-0 group-hover:opacity-100"
          >
            ❯
          </button>
        </div>
      </div>

      {/* SECCIÓN 2: PERSONAS Y MASCOTAS */}
      <div className="space-y-8 bg-transparent pt-4">
        
        {/* Grupos */}
        <div className="space-y-4 bg-transparent">
          <div className="space-y-0.5 bg-transparent">
            <h3 className="text-base font-semibold text-brand-navy tracking-tight uppercase">Grupos</h3>
            <p className="text-xs text-brand-navy/50">Recuerdos donde aparecen varios miembros familiares reunidos.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {groups.map((group) => {
              const count = (taggedPhotos[group.id] || []).length;
              return (
                <div
                  key={group.id}
                  onClick={() => setSelectedPerson(group)}
                  className="group relative aspect-video bg-brand-navy/5 rounded-xs overflow-hidden border border-brand-navy/10 hover:border-brand-navy/35 hover:-translate-y-0.5 shadow-sm transition-all duration-300 cursor-pointer"
                >
                  <img
                    src={group.avatar}
                    alt={group.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/95 via-brand-navy/30 to-transparent flex flex-col justify-end p-4" />
                  
                  <div className="absolute bottom-3 left-3 right-3 text-brand-cream flex justify-between items-end bg-transparent">
                    <div>
                      <h4 className="text-xs md:text-sm font-semibold tracking-wide uppercase">{group.name}</h4>
                      <p className="text-[10px] text-brand-cream/70 mt-0.5">{count} recuerdos asociados</p>
                    </div>
                    <span className="text-[10px] border border-brand-cream/30 px-1.5 py-0.5 rounded-xs text-brand-cream bg-transparent font-medium group-hover:border-brand-cream transition-colors">
                      Ver álbum
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Tarjeta de acción para Añadir Nuevo Grupo */}
            <div
              onClick={() => {
                setIsAddPersonOpen(true);
                setNewPersonIsGroup(true);
              }}
              className="group relative aspect-video bg-brand-cream border border-dashed border-brand-navy/25 hover:border-brand-navy/50 hover:bg-brand-navy/5 transition-all rounded-xs cursor-pointer flex flex-col items-center justify-center gap-3 p-4 shadow-sm min-h-[140px]"
            >
              <div className="w-12 h-12 rounded-full border border-dashed border-brand-navy/20 flex items-center justify-center bg-transparent group-hover:scale-104 transition-transform duration-300">
                <svg className="w-5 h-5 text-brand-navy/40 group-hover:text-brand-navy" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div className="space-y-0.5 bg-transparent text-center">
                <h4 className="text-xs font-semibold text-brand-navy/80 group-hover:text-brand-navy uppercase tracking-wide">
                  Añadir Grupo
                </h4>
                <p className="text-[10px] text-brand-navy/40">Crear colección grupal</p>
              </div>
            </div>
          </div>
        </div>

        {/* Personas y mascotas */}
        <div className="space-y-4 bg-transparent">
          <div className="space-y-0.5 bg-transparent">
            <h3 className="text-base font-semibold text-brand-navy tracking-tight uppercase">Personas y Mascotas</h3>
            <p className="text-xs text-brand-navy/50">Identifica caras individuales en tus recuerdos familiares.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {individuals.map((person) => {
              const count = (taggedPhotos[person.id] || []).length;
              return (
                <div
                  key={person.id}
                  onClick={() => setSelectedPerson(person)}
                  className="group flex flex-col items-center gap-3 p-4 bg-brand-cream border border-brand-navy/10 hover:border-brand-navy/35 hover:shadow-md transition-all rounded-xs cursor-pointer text-center"
                >
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border border-brand-navy/10 shadow-sm relative">
                    <img
                      src={person.avatar}
                      alt={person.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-104"
                    />
                    <div className="absolute inset-0 bg-brand-navy/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="space-y-0.5 bg-transparent">
                    <h4 className="text-xs font-semibold text-brand-navy/90 tracking-wide uppercase truncate max-w-[120px]">
                      {person.name}
                    </h4>
                    <p className="text-[10px] text-brand-navy/50 bg-transparent">{count} recuerdos</p>
                  </div>
                </div>
              );
            })}

            {/* Tarjeta de acción para Añadir Nueva Persona/Mascota */}
            <div
              onClick={() => {
                setIsAddPersonOpen(true);
                setNewPersonIsGroup(false);
              }}
              className="group flex flex-col items-center justify-center gap-3 p-4 bg-brand-cream border border-dashed border-brand-navy/25 hover:border-brand-navy/50 hover:bg-brand-navy/5 transition-all rounded-xs cursor-pointer text-center min-h-[160px]"
            >
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-dashed border-brand-navy/20 flex items-center justify-center bg-transparent group-hover:scale-104 transition-transform duration-300">
                <svg className="w-6 h-6 text-brand-navy/40 group-hover:text-brand-navy" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div className="space-y-0.5 bg-transparent">
                <h4 className="text-xs font-semibold text-brand-navy/80 group-hover:text-brand-navy uppercase tracking-wide">
                  Añadir Nueva
                </h4>
                <p className="text-[10px] text-brand-navy/40">Persona o mascota</p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* CATÁLOGO DE RECUERDOS DISPONIBLES (Original Dashboard) */}
      <div className="space-y-6 bg-transparent pt-6 border-t border-brand-navy/10">
        <div className="space-y-1 bg-transparent">
          <h3 className="text-lg font-medium text-brand-navy tracking-tight">Catálogo de Recuerdos</h3>
          <p className="text-xs text-brand-navy/50">
            {libraryPhotos.length > 0
              ? "Explora, visualiza y gestiona las fotografías activas de tu biblioteca."
              : "Selecciona e importa imágenes específicas del catálogo a tu biblioteca del álbum."}
          </p>
        </div>

        {(() => {
          if (libraryPhotos.length > 0) {
            const filteredPhotos = filterPhotos(
              libraryPhotos,
              searchQuery,
              albums,
              people,
              taggedPhotos,
              photoMetadata
            );

            if (filteredPhotos.length === 0) {
              return (
                <div className="text-center py-20 bg-brand-cream/40 border border-brand-navy/10 rounded-xs">
                  <svg className="w-12 h-12 mx-auto text-brand-navy/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="mt-4 text-xs text-brand-navy/50">No se encontraron recuerdos que coincidan con tu búsqueda.</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {filteredPhotos.map((photo) => {
                  const year = photo.created_at ? new Date(photo.created_at).getFullYear().toString() : "";
                  const cleanName = photo.name.split("_").slice(1).join("_").replace(/\.webp$/, "");
                  const photoTitle = (photoMetadata[photo.name] as any)?.title || cleanName || photo.name;
                  const albumName = albums.find((a) => a.id === photo.album_id)?.name;
                  const carouselIndex = libraryPhotos.findIndex((p) => p.name === photo.name);

                  return (
                    <div
                      key={photo.name}
                      className="group border border-brand-navy/10 bg-brand-cream/50 rounded-xs overflow-hidden hover:border-brand-navy/30 transition-all duration-300 flex flex-col justify-between"
                    >
                      <div className="aspect-video relative overflow-hidden bg-brand-navy/5">
                        <img
                          src={photo.url}
                          alt={photoTitle}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
                          style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }}
                          loading="lazy"
                        />
                        {year && (
                          <div className="absolute top-3 right-3 bg-brand-cream/90 backdrop-blur-xs text-brand-navy text-[10px] font-semibold px-2 py-0.5 rounded-xs">
                            {year}
                          </div>
                        )}

                        {/* Hover overlay translúcido con desenfoque de cristal (sin nombre) */}
                        <div className="absolute inset-0 bg-black/45 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-350 flex flex-col justify-between p-4 z-10">
                          <div className="flex justify-end gap-1.5 bg-transparent">
                            {/* Botón Ver en Pantalla Completa */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (carouselIndex !== -1) {
                                  setActiveCollectionIndex(carouselIndex);
                                  setIsFullscreenCarousel(true);
                                }
                              }}
                              className="p-2 border border-brand-cream/20 hover:bg-brand-cream/10 text-brand-cream rounded-xs transition-all cursor-pointer"
                              title="Ver en pantalla completa"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9m-11.25 11.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25 5.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
                              </svg>
                            </button>

                            {/* Botón Mover a Papelera */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveToTrashFromHome(photo.name);
                              }}
                              className="p-2 border border-red-400/40 hover:bg-red-500/20 text-red-400 rounded-xs transition-all cursor-pointer"
                              title="Mover a la papelera"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>

                          <div className="bg-transparent text-left space-y-0.5">
                            <p className="text-brand-cream/70 text-[9px]">
                              {photo.created_at ? new Date(photo.created_at).toLocaleDateString("es-ES") : ""}
                            </p>
                            {photoMetadata[photo.name]?.location && (
                              <p className="text-[9px] text-brand-cream/80 truncate flex items-center gap-1">
                                📍 {photoMetadata[photo.name].location}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 space-y-4 flex-1 flex flex-col justify-between bg-transparent">
                        <div className="space-y-1 bg-transparent text-left">
                          <h4 className="text-xs font-semibold text-brand-navy/90 tracking-wide uppercase truncate">
                            {photoTitle}
                          </h4>
                          <p className="text-[11px] text-brand-navy/50 capitalize bg-transparent">
                            Álbum: <span className="font-medium text-brand-timber">{albumName || "Sin álbum"}</span>
                          </p>
                        </div>

                        <div className="flex gap-2 bg-transparent">
                          <button
                            onClick={() => {
                              if (carouselIndex !== -1) {
                                setActiveCollectionIndex(carouselIndex);
                                setIsFullscreenCarousel(true);
                              }
                            }}
                            className="flex-1 py-1.5 text-[11px] font-semibold rounded-xs border border-brand-navy text-brand-navy hover:bg-brand-navy hover:text-brand-cream text-center transition-all cursor-pointer"
                          >
                            Ver en Pantalla Completa
                          </button>
                          <button
                            onClick={() => moveToTrashFromHome(photo.name)}
                            className="py-1.5 px-3 text-[11px] font-semibold rounded-xs border border-red-400 hover:bg-red-500 hover:text-brand-cream text-red-500 text-center transition-all cursor-pointer"
                          >
                            Borrar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }

          // Fallback al catálogo de ejemplos si no hay fotos
          const photoItems: PhotoItem[] = SAMPLE_PHOTOS.map((p) => ({
            name: p.name,
            url: p.url,
            created_at: p.createdAt,
            album_id: p.albumId,
            status: "active"
          }));

          const filteredPhotoItems = filterPhotos(
            photoItems,
            searchQuery,
            albums,
            people,
            taggedPhotos,
            photoMetadata
          );

          const filteredPhotos = SAMPLE_PHOTOS.filter((photo) =>
            filteredPhotoItems.some((f) => f.name === photo.name)
          );

          if (filteredPhotos.length === 0) {
            return (
              <div className="text-center py-20 bg-brand-cream/40 border border-brand-navy/10 rounded-xs">
                <svg className="w-12 h-12 mx-auto text-brand-navy/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="mt-4 text-xs text-brand-navy/50">No se encontraron recuerdos en el catálogo.</p>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {filteredPhotos.map((photo) => {
                const isImported = importedPhotos.includes(photo.name);
                const year = photo.createdAt.split("-")[0];

                return (
                  <div
                    key={photo.id}
                    className="group border border-brand-navy/10 bg-brand-cream/50 rounded-xs overflow-hidden hover:border-brand-navy/30 transition-all duration-300 flex flex-col justify-between"
                  >
                    <div className="aspect-video relative overflow-hidden bg-brand-navy/5">
                      <img
                        src={photo.url}
                        alt={photo.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
                        style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }}
                        loading="lazy"
                      />
                      <div className="absolute top-3 right-3 bg-brand-cream/90 backdrop-blur-xs text-brand-navy text-[10px] font-semibold px-2 py-0.5 rounded-xs">
                        {year}
                      </div>
                    </div>

                    <div className="p-4 space-y-4 flex-1 flex flex-col justify-between bg-transparent">
                      <div className="space-y-1 bg-transparent text-left">
                        <h4 className="text-xs font-semibold text-brand-navy/90 tracking-wide uppercase">
                          {photo.title}
                        </h4>
                        <p className="text-[11px] text-brand-navy/50 capitalize bg-transparent">
                          Álbum sugerido: <span className="font-medium text-brand-timber">{photo.albumId.split("-").slice(2).join(" ")}</span>
                        </p>
                      </div>

                      <button
                        disabled={isImported}
                        onClick={() => importPhoto(photo)}
                        className={`w-full py-2 text-[11px] font-semibold rounded-xs border text-center transition-all cursor-pointer ${
                          isImported
                            ? "border-green-300 bg-transparent text-green-700 cursor-not-allowed flex items-center justify-center gap-1.5"
                            : "border-brand-navy text-brand-navy hover:bg-brand-navy hover:text-brand-cream"
                        }`}
                      >
                        {isImported ? "✓ Importado" : "Importar Recuerdo"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* MODAL DETALLES DEL PERFIL DE PERSONA (ÁLBUM INDIVIDUAL) */}
      {selectedPerson && (
        <div className="fixed inset-0 bg-brand-navy/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-brand-cream border border-brand-navy/25 rounded-xs p-6 max-w-4xl w-full h-[85vh] flex flex-col justify-between shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Header del Modal */}
            <div className="flex justify-between items-center pb-4 border-b border-brand-navy/10 bg-transparent">
              <div className="flex items-center gap-4 bg-transparent">
                <div className="w-12 h-12 rounded-full overflow-hidden border border-brand-navy/15">
                  <img
                    src={selectedPerson.avatar}
                    alt={selectedPerson.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="bg-transparent">
                  <h3 className="text-base font-bold text-brand-navy uppercase tracking-wide">
                    {selectedPerson.name}
                  </h3>
                  <p className="text-[10px] text-brand-navy/50 font-medium">
                    Álbum inteligente de personas • {(taggedPhotos[selectedPerson.id] || []).length} recuerdos
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPerson(null)}
                className="p-1 hover:bg-brand-navy/5 text-brand-navy/70 hover:text-brand-navy rounded-xs cursor-pointer"
              >
                ✕ Cerrar
              </button>
            </div>

            {/* Contenido del Modal (Scroll) */}
            <div className="flex-1 overflow-y-auto py-6 space-y-8 bg-transparent pr-2">
              
              {/* Fotos del Perfil */}
              <div className="space-y-4 bg-transparent">
                <h4 className="text-xs font-semibold text-brand-navy/60 uppercase tracking-wider">Recuerdos en el álbum</h4>
                {(() => {
                  const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
                  const localPhotos = JSON.parse(localPhotosJson);
                  const activeLocalPhotos = localPhotos.filter((p: LocalPhotoItem) => p.status !== "trash");
                  const assignedNames = taggedPhotos[selectedPerson.id] || [];
                  const assigned = activeLocalPhotos.filter((p: LocalPhotoItem) => assignedNames.includes(p.name));

                  if (assigned.length === 0) {
                    return (
                      <p className="text-xs text-brand-navy/50 italic py-4">No hay fotos asociadas todavía a esta persona.</p>
                    );
                  }

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {assigned.map((photo: LocalPhotoItem) => {
                        const isCurrentAvatar = selectedPerson.avatar === photo.url;
                        return (
                          <div key={photo.name} className={`group relative aspect-square bg-brand-navy/5 rounded-xs overflow-hidden border transition-all duration-200 ${
                            isCurrentAvatar ? "border-brand-navy ring-2 ring-brand-navy" : "border-brand-navy/10 hover:border-brand-navy/30"
                          }`}>
                            <img src={photo.url} alt={photo.name} className="w-full h-full object-cover transition-transform duration-300" style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }} />
                            
                            {/* Overlay en hover */}
                            <div className="absolute inset-0 bg-brand-navy/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                              <div className="flex gap-2 justify-between items-start bg-transparent w-full">
                                <button
                                  onClick={() => setPersonAvatar(selectedPerson.id, photo.url)}
                                  disabled={isCurrentAvatar}
                                  className={`p-1 text-[9px] font-semibold rounded-xs shadow-md cursor-pointer transition-all ${
                                    isCurrentAvatar
                                      ? "bg-brand-navy text-brand-cream/60 cursor-not-allowed opacity-50"
                                      : "bg-brand-cream text-brand-navy hover:bg-brand-navy hover:text-brand-cream"
                                  }`}
                                  title="Establecer como foto de portada"
                                >
                                  Portada
                                </button>
                                <button
                                  onClick={() => removePhotoFromPerson(photo.name)}
                                  className="p-1 bg-red-600 hover:bg-red-700 text-brand-cream text-[9px] rounded-xs shadow-md cursor-pointer transition-colors"
                                  title="Quitar de este álbum"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </div>

                            {/* Etiqueta persistente para la portada actual */}
                            {isCurrentAvatar && (
                              <div className="absolute bottom-0 inset-x-0 bg-brand-navy/85 text-[8px] text-brand-cream py-0.5 text-center font-bold tracking-wider uppercase">
                                Portada actual
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Sugerencias de coincidencia inteligente (Facial Recognition simulado) */}
              {suggestedPhotos.length > 0 && (
                <div className="space-y-4 bg-transparent p-4 border border-brand-navy/10 rounded-xs bg-brand-cream/50">
                  <div className="space-y-0.5 bg-transparent flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-bold text-brand-navy/80 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                        Sugerencias de Coincidencia Inteligente
                      </h4>
                      <p className="text-[10px] text-brand-navy/50">La aplicación identificó rasgos y metadatos similares en la biblioteca.</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {suggestedPhotos.map((photo: LocalPhotoItem) => (
                      <div key={photo.name} className="group relative aspect-square bg-brand-navy/5 border border-brand-navy/10 rounded-xs overflow-hidden flex flex-col justify-between">
                        <img src={photo.url} alt={photo.name} className="w-full h-full object-cover transition-transform duration-300" style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }} />
                        <div className="absolute inset-x-0 bottom-0 bg-brand-navy/80 backdrop-blur-xs p-2 flex flex-col gap-1.5 z-10">
                          <p className="text-[8px] text-brand-cream/80 truncate">Coincidencia de rostro</p>
                          <button
                            onClick={() => addPhotoToPerson(photo.name)}
                            className="w-full py-1 bg-brand-navy text-brand-cream hover:bg-brand-navy/90 text-[10px] font-semibold rounded-xs cursor-pointer text-center"
                          >
                            Confirmar y Añadir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Selector manual para buscar en toda la biblioteca */}
              <div className="space-y-4 bg-transparent pt-4 border-t border-brand-navy/10">
                <h4 className="text-xs font-semibold text-brand-navy/60 uppercase tracking-wider">Identificar en foto de la biblioteca</h4>
                {(() => {
                  const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
                  const localPhotos = JSON.parse(localPhotosJson);
                  const activeLocalPhotos = localPhotos.filter((p: LocalPhotoItem) => p.status !== "trash");
                  const assignedNames = taggedPhotos[selectedPerson.id] || [];
                  const manualOptions = activeLocalPhotos.filter((p: LocalPhotoItem) => !assignedNames.includes(p.name));

                  if (manualOptions.length === 0) {
                    return (
                      <p className="text-xs text-brand-navy/40 italic">Todas las fotos de tu biblioteca ya están etiquetadas.</p>
                    );
                  }

                  return (
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin max-w-full">
                      {manualOptions.map((photo: LocalPhotoItem) => (
                        <div key={photo.name} className="w-24 h-24 relative flex-shrink-0 border border-brand-navy/10 rounded-xs overflow-hidden group">
                          <img src={photo.url} alt={photo.name} className="w-full h-full object-cover transition-transform duration-300" style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }} />
                          <button
                            onClick={() => addPhotoToPerson(photo.name)}
                            className="absolute inset-0 bg-brand-navy/70 text-brand-cream text-[10px] font-semibold opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                          >
                            Etiquetar
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

            </div>

            {/* Footer del Modal */}
            <div className="pt-4 border-t border-brand-navy/10 flex justify-end bg-transparent">
              <button
                onClick={() => setSelectedPerson(null)}
                className="py-1.5 px-4 bg-brand-navy text-brand-cream text-xs font-semibold rounded-xs cursor-pointer hover:bg-brand-navy/90"
              >
                Listo
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL AÑADIR NUEVA PERSONA O MASCOTA / GRUPO */}
      {isAddPersonOpen && (
        <div className="fixed inset-0 bg-brand-navy/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-brand-cream border border-brand-navy/25 rounded-xs p-6 max-w-2xl w-full max-h-[85vh] flex flex-col justify-between shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Header del Modal */}
            <div className="flex justify-between items-center pb-4 border-b border-brand-navy/10 bg-transparent">
              <div className="bg-transparent">
                <h3 className="text-base font-bold text-brand-navy uppercase tracking-wide">
                  {newPersonIsGroup ? "Añadir Grupo Familiar" : "Añadir Persona o Mascota"}
                </h3>
                <p className="text-[10px] text-brand-navy/55 font-medium">
                  {newPersonIsGroup 
                    ? "Crea una nueva colección grupal y asóciale sus fotos correspondientes." 
                    : "Crea un nuevo perfil y asóciale sus fotos correspondientes."}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsAddPersonOpen(false);
                  setNewPersonName("");
                  setSelectedPhotoNamesForNewPerson([]);
                }}
                className="p-1 hover:bg-brand-navy/5 text-brand-navy/70 hover:text-brand-navy rounded-xs cursor-pointer text-xs"
              >
                ✕ Cancelar
              </button>
            </div>

            {/* Contenido del Modal */}
            <div className="flex-1 overflow-y-auto py-6 space-y-6 bg-transparent pr-1">
              {/* Formulario Nombre */}
              <div className="space-y-2 bg-transparent">
                <label className="text-xs font-semibold text-brand-navy/70 uppercase tracking-wider block">
                  Nombre del {newPersonIsGroup ? "Grupo" : "Perfil"}
                </label>
                <input
                  type="text"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  placeholder={newPersonIsGroup ? "Ej. Primos, Hermanos, Viajes..." : "Ej. Tía María, Firulais, Papá..."}
                  className="w-full px-3 py-2 bg-transparent border border-brand-navy/20 focus:border-brand-navy text-xs rounded-xs outline-none text-brand-navy font-medium placeholder:text-brand-navy/30"
                  maxLength={40}
                />
              </div>

              {/* Grid de Fotos de la Biblioteca */}
              <div className="space-y-3 bg-transparent">
                <div className="bg-transparent">
                  <label className="text-xs font-semibold text-brand-navy/70 uppercase tracking-wider block">
                    Etiquetar en fotos existentes
                  </label>
                  <p className="text-[10px] text-brand-navy/40">
                    {newPersonIsGroup 
                      ? "Selecciona las fotos de la biblioteca donde aparecen. La primera seleccionada será la portada del grupo." 
                      : "Selecciona las fotos de la biblioteca donde aparece. La primera seleccionada será su foto de perfil (avatar)."}
                  </p>
                </div>

                {(() => {
                  const localPhotosJson = typeof window !== "undefined" ? localStorage.getItem("family_album_local_photos") || "[]" : "[]";
                  const localPhotos: LocalPhotoItem[] = JSON.parse(localPhotosJson);
                  const activeLocalPhotos = localPhotos.filter((p) => p.status !== "trash");

                  if (activeLocalPhotos.length === 0) {
                    return (
                      <div className="text-center py-8 border border-dashed border-brand-navy/20 rounded-xs bg-brand-navy/5">
                        <p className="text-xs text-brand-navy/50 italic">
                          No tienes fotos en tu biblioteca. Importa fotos del catálogo primero.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin">
                      {activeLocalPhotos.map((photo) => {
                        const isSelected = selectedPhotoNamesForNewPerson.includes(photo.name);
                        const selectIndex = selectedPhotoNamesForNewPerson.indexOf(photo.name);

                        return (
                          <div
                            key={photo.name}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedPhotoNamesForNewPerson((prev) =>
                                  prev.filter((name) => name !== photo.name)
                                );
                              } else {
                                setSelectedPhotoNamesForNewPerson((prev) => [...prev, photo.name]);
                              }
                            }}
                            className={`relative aspect-square rounded-xs overflow-hidden border cursor-pointer group transition-all duration-200 ${
                              isSelected
                                ? "border-brand-navy ring-2 ring-brand-navy"
                                : "border-brand-navy/10 hover:border-brand-navy/30"
                            }`}
                          >
                            <img
                              src={photo.url}
                              alt={photo.name}
                              className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-102 ${
                                isSelected ? "brightness-90" : ""
                              }`}
                              style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }}
                            />
                            
                            {/* Checkmark visual y orden de selección */}
                            {isSelected && (
                              <div className="absolute top-1.5 right-1.5 bg-brand-navy text-brand-cream rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-md">
                                {selectIndex === 0 ? "★" : selectIndex + 1}
                              </div>
                            )}

                            {/* Indicador de primera selección (Avatar / Portada) */}
                            {isSelected && selectIndex === 0 && (
                              <div className="absolute bottom-0 inset-x-0 bg-brand-navy/80 text-[8px] text-brand-cream py-0.5 text-center font-bold tracking-wider uppercase">
                                {newPersonIsGroup ? "Portada del grupo" : "Foto de perfil"}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer del Modal */}
            <div className="pt-4 border-t border-brand-navy/10 flex justify-end gap-3 bg-transparent">
              <button
                onClick={() => {
                  setIsAddPersonOpen(false);
                  setNewPersonName("");
                  setSelectedPhotoNamesForNewPerson([]);
                }}
                className="py-1.5 px-4 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy text-xs font-medium rounded-xs transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!newPersonName.trim()) {
                    setFeedback({ type: "error", text: "Por favor, introduce un nombre." });
                    return;
                  }

                  const newId = `p_${Date.now()}`;
                  
                  // Obtener la URL de la primera foto seleccionada (si hay)
                  let avatarUrl = newPersonIsGroup 
                    ? "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&auto=format&fit=crop" // Imagen de grupo por defecto
                    : "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop"; // Avatar por defecto
                  if (selectedPhotoNamesForNewPerson.length > 0) {
                    const localPhotosJson = typeof window !== "undefined" ? localStorage.getItem("family_album_local_photos") || "[]" : "[]";
                    const localPhotos: LocalPhotoItem[] = JSON.parse(localPhotosJson);
                    const firstPhoto = localPhotos.find((p) => p.name === selectedPhotoNamesForNewPerson[0]);
                    if (firstPhoto && firstPhoto.url) {
                      avatarUrl = firstPhoto.url;
                    }
                  }

                  const newPerson: PersonProfile = {
                    id: newId,
                    name: newPersonName.trim(),
                    avatar: avatarUrl,
                    isGroup: newPersonIsGroup,
                    tags: [newPersonName.trim().toLowerCase()]
                  };

                  const updatedPeople = [...people, newPerson];
                  setPeople(updatedPeople);
                  localStorage.setItem("family_album_people", JSON.stringify(updatedPeople));

                  const updatedTagged = {
                    ...taggedPhotos,
                    [newId]: selectedPhotoNamesForNewPerson
                  };
                  setTaggedPhotos(updatedTagged);
                  localStorage.setItem("family_album_person_tags", JSON.stringify(updatedTagged));

                  setIsAddPersonOpen(false);
                  setNewPersonName("");
                  setSelectedPhotoNamesForNewPerson([]);

                  setFeedback({
                    type: "success",
                    text: newPersonIsGroup
                      ? `¡Se ha creado el grupo "${newPerson.name}" con ${selectedPhotoNamesForNewPerson.length} fotos!`
                      : `¡Se ha añadido a "${newPerson.name}" y etiquetado en ${selectedPhotoNamesForNewPerson.length} fotos!`
                  });
                }}
                disabled={!newPersonName.trim()}
                className={`py-1.5 px-4 text-xs font-semibold rounded-xs transition-all cursor-pointer ${
                  newPersonName.trim()
                    ? "bg-brand-navy text-brand-cream hover:bg-brand-navy/90"
                    : "bg-brand-navy/20 text-brand-cream/60 cursor-not-allowed"
                }`}
              >
                Guardar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL CARRUSEL PANTALLA COMPLETA (MODO CINE) */}
      {isFullscreenCarousel && (
        <div
          className="fixed inset-0 bg-brand-navy/95 backdrop-blur-md z-50 flex flex-col justify-between p-4 md:p-6 select-none animate-in fade-in duration-200"
          onClick={() => setIsFullscreenCarousel(false)}
        >
          {/* Header del Modal */}
          <div className="flex justify-between items-center w-full bg-transparent text-brand-cream z-10">
            <div className="bg-transparent text-left">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-timber">Presentación de Recuerdos</h3>
              <p className="text-[10px] text-brand-cream/55 mt-0.5">Disfrutando de la colección familiar en pantalla completa</p>
            </div>
            <button
              onClick={() => setIsFullscreenCarousel(false)}
              className="p-2 border border-brand-cream/20 hover:bg-brand-cream/10 text-brand-cream rounded-xs transition-colors cursor-pointer text-xs font-semibold focus:outline-none"
            >
              ✕ Salir Modo Cine
            </button>
          </div>

          {/* Área del Recuerdo (Adaptable a orientación vertical y horizontal) */}
          <div className="flex-1 w-full flex items-center justify-center relative bg-transparent py-4 my-2">
            
            {/* Foto principal */}
            <div className="relative w-full h-full max-w-[92vw] flex items-center justify-center bg-transparent">
              {currentCarouselPhotos.map((photo, index) => {
                const isActive = index === activeCollectionIndex;
                const photoId = (photo as any).id || photo.name;
                const photoTitle = (photo as any).title || photo.name.split("_").slice(1).join("_").replace(/\.webp$/, "") || photo.name;
                const photoDate = (photo as any).created_at || (photo as any).createdAt || "";
                const photoYear = photoDate ? photoDate.split("-")[0] : "";

                return (
                  <div
                    key={photoId}
                    className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-1000 ease-in-out ${
                      isActive ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                    }`}
                  >
                    {/* Contenedor responsivo que optimiza visualización según la orientación */}
                    <div className="relative max-w-full max-h-[50vh] sm:max-h-[70vh] md:max-h-[75vh] landscape:max-h-[50vh] landscape:md:max-h-[72vh] flex items-center justify-center overflow-hidden rounded-xs border border-brand-cream/10 shadow-2xl bg-black/10">
                      <img
                        src={photo.url}
                        alt={photoTitle}
                        className="object-contain w-auto h-auto max-w-full max-h-[50vh] sm:max-h-[70vh] md:max-h-[75vh] landscape:max-h-[50vh] landscape:md:max-h-[72vh] transition-transform duration-300"
                        style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      
                      {/* Título superpuesto */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-navy/90 to-transparent p-4 text-left text-brand-cream flex flex-col gap-0.5 pointer-events-none">
                        {photoYear && (
                          <span className="bg-brand-timber text-brand-cream text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-xs w-max">
                            {photoYear}
                          </span>
                        )}
                        <h4 className="text-xs md:text-sm font-semibold uppercase tracking-wide mt-1">
                          {photoTitle}
                        </h4>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Navegación manual de carrusel */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveCollectionIndex((prev) => (prev - 1 + currentCarouselPhotos.length) % currentCarouselPhotos.length);
              }}
              className="absolute left-2 md:left-4 p-3 bg-brand-cream/10 border border-brand-cream/20 text-brand-cream hover:bg-brand-cream hover:text-brand-navy rounded-xs transition-all z-20 cursor-pointer text-sm font-bold focus:outline-none"
            >
              ❮
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveCollectionIndex((prev) => (prev + 1) % currentCarouselPhotos.length);
              }}
              className="absolute right-2 md:right-4 p-3 bg-brand-cream/10 border border-brand-cream/20 text-brand-cream hover:bg-brand-cream hover:text-brand-navy rounded-xs transition-all z-20 cursor-pointer text-sm font-bold focus:outline-none"
            >
              ❯
            </button>

          </div>

          {/* Floating Spotify Player en la base */}
          <div
            className="w-full max-w-[420px] mx-auto h-[82px] bg-transparent rounded-xs overflow-hidden border border-brand-cream/15 shadow-xl z-10 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              style={{ borderRadius: "8px" }}
              src="https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn?utm_source=generator&theme=0"
              width="100%"
              height="100%"
              frameBorder="0"
              allowFullScreen={false}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
          </div>

        </div>
      )}

    </div>
  );
}
