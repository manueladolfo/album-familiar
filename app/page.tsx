"use client";

import { useState, useEffect, useRef } from "react";
import { supabase, loadRotationsFromSupabase, saveRotationsToSupabase, saveStoriesToSupabase, loadStoriesFromSupabase, loadMetadataFromSupabase, saveMetadataToSupabase } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import { filterPhotos, PhotoMetadata, PhotoItem } from "@/lib/search";
import { isValidUUID } from "@/lib/uuid";
import FaceCropper from "@/components/FaceCropper";

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

const AvatarImage = ({ avatar, name, isGroup }: { avatar?: string; name: string; isGroup?: boolean }) => {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className="w-full h-full object-cover"
      />
    );
  }

  // Fallback SVG silhouette
  if (isGroup) {
    return (
      <div className="w-full h-full bg-brand-navy/5 flex items-center justify-center text-brand-navy/40">
        <svg className="w-1/2 h-1/2" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94-3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-brand-navy/5 flex items-center justify-center text-brand-navy/40">
      <svg className="w-1/2 h-1/2" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    </div>
  );
};

interface LocalPhotoItem {
  name: string;
  url: string;
  created_at?: string | null;
  album_id?: string | null;
  status?: string | null;
  title?: string;
}

interface PhotoStory {
  chronicle: string;
  anecdote: string;
}

const SAMPLE_PHOTOS: SamplePhoto[] = [];

const DEFAULT_PEOPLE: PersonProfile[] = [
  {
    id: "p_ma_cynthia",
    name: "Manuel Adolfo y Cynthia",
    avatar: "",
    isGroup: true,
    tags: ["picnic", "boda", "navidad", "cynthia", "manuel adolfo"]
  },
  {
    id: "p_ap_manuel",
    name: "Ana Paula y Manuel",
    avatar: "",
    isGroup: true,
    tags: ["bicicleta", "playa", "ana paula", "manuel"]
  },
  {
    id: "p_ma_manuel",
    name: "Manuel Adolfo y Manuel",
    avatar: "",
    isGroup: true,
    tags: ["picnic", "navidad", "manuel adolfo", "manuel"]
  },
  {
    id: "p_manuel_adolfo",
    name: "Manuel Adolfo",
    avatar: "",
    isGroup: false,
    tags: ["picnic", "boda", "navidad", "manuel adolfo"]
  },
  {
    id: "p_ana_paula",
    name: "Ana Paula",
    avatar: "",
    isGroup: false,
    tags: ["playa", "bicicleta", "ana paula"]
  },
  {
    id: "p_manuel",
    name: "Manuel",
    avatar: "",
    isGroup: false,
    tags: ["bicicleta", "playa", "picnic", "navidad", "manuel"]
  },
  {
    id: "p_cynthia",
    name: "Cynthia",
    avatar: "",
    isGroup: false,
    tags: ["boda", "navidad", "cynthia"]
  },
  {
    id: "p_dante",
    name: "Dante",
    avatar: "",
    isGroup: false,
    tags: ["perro", "playa", "dante", "mascota"]
  }
];

const FAMILY_MEMBERS = ["Manu", "Papa", "Mama", "Pau"];

export default function Home() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("search") || "";
  const [statusMessage, setStatusMessage] = useState("Conectando con Supabase...");
  const [importedPhotos, setImportedPhotos] = useState<string[]>([]);
  const [libraryPhotos, setLibraryPhotos] = useState<PhotoItem[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Auto-cerrar el cartel de operación exitosa en 5 segundos
  useEffect(() => {
    if (feedback && feedback.type === "success") {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

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
  const [newPersonIsGroup, setNewPersonIsGroup] = useState<boolean>(false);
  const [selectedPhotoNamesForNewPerson, setSelectedPhotoNamesForNewPerson] = useState<string[]>([]);
  const [newPersonCroppedAvatar, setNewPersonCroppedAvatar] = useState<string | null>(null);
  const [croppingPhoto, setCroppingPhoto] = useState<PhotoItem | LocalPhotoItem | null>(null);

  const firstSelectedPhotoName = selectedPhotoNamesForNewPerson[0];
  useEffect(() => {
    if (firstSelectedPhotoName) {
      const selected = libraryPhotos.find((p) => p.name === firstSelectedPhotoName);
      if (selected && !newPersonCroppedAvatar) {
        // no-op, avatar defaults to uncropped
      }
    }
  }, [firstSelectedPhotoName]);

  // Estados para Diario de Historias Familiares
  const [photoStories, setPhotoStories] = useState<Record<string, PhotoStory>>({});
  const [selectedDiaryPhoto, setSelectedDiaryPhoto] = useState<PhotoItem | null>(null);
  const [editingAnecdote, setEditingAnecdote] = useState<string>("");

  // Estados para autocompletado de menciones (@)
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showMentionDropdown, setShowMentionDropdown] = useState<boolean>(false);
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState<number>(-1);
  const [mentionSearchQuery, setMentionSearchQuery] = useState<string>("");
  const [selectedMentionIndex, setSelectedMentionIndex] = useState<number>(0);

  const currentCarouselPhotos = libraryPhotos.length > 0 ? libraryPhotos : SAMPLE_PHOTOS;

  // Inicialización de música, personas e importados
  useEffect(() => {
    // Purga de claves obsoletas de localStorage no utilizadas por la aplicación
    const activeKeys = [
      "family_album_pending_rotations",
      "family_album_local_mode_active",
      "family_album_photo_rotations",
      "family_album_photo_stories",
      "family_album_people",
      "family_album_person_tags",
      "family_album_notifications",
      "family_album_photo_metadata",
      "family_album_user_email",
      "family_album_gemini_api_key",
      "family_album_local_albums",
      "family_album_favorites",
      "family_album_local_photos",
      "family_album_photo_statuses",
      "family_album_photo_mappings"
    ];
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("family_album_") && !activeKeys.includes(key)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.warn("No se pudo limpiar el localStorage:", e);
    }

    // 1. Inicializar Supabase status
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";
    if (localActive) {
      setStatusMessage("Operando en MODO LOCAL (Offline).");
    } else {
      try {
        if (supabase) {
          setStatusMessage("Supabase cliente inicializado correctamente.");
        } else {
          setStatusMessage("Supabase no está disponible, operando en modo local.");
        }
      } catch {
        setStatusMessage("Error al inicializar el cliente de Supabase.");
      }
    }

    // 2 y 3. Cargar personas y mapeo de fotos etiquetadas (Supabase o LocalStorage)
    const loadConfig = async () => {
      const localActive = localStorage.getItem("family_album_local_mode_active") === "true";
      let loadedPeople = null;
      let loadedTagged = null;

      if (!localActive) {
        try {
          const { data } = await supabase
            .from("albums")
            .select("id, name, cover_url")
            .eq("name", "__system_config__")
            .limit(1);

          if (data && data.length > 0 && data[0].cover_url) {
            const config = JSON.parse(data[0].cover_url);
            loadedPeople = config.people;
            loadedTagged = config.taggedPhotos;
          }
        } catch (err) {
          console.error("Error al cargar config de personas desde Supabase:", err);
        }
      }

      const cleanPeople = (peopleList: PersonProfile[]) => {
        if (!Array.isArray(peopleList)) return peopleList;
        return peopleList.map(p => {
          if (p.avatar && p.avatar.includes("unsplash.com")) {
            return { ...p, avatar: "" };
          }
          return p;
        });
      };

      const cleanTagged = (taggedObj: Record<string, string[]>) => {
        if (!taggedObj) return {};
        const cleaned: Record<string, string[]> = {};
        Object.keys(taggedObj).forEach(key => {
          cleaned[key] = (taggedObj[key] || []).filter(name => !name.toLowerCase().includes("sample"));
        });
        return cleaned;
      };

      if (loadedPeople && loadedTagged) {
        const cleanedPeople = cleanPeople(loadedPeople);
        const cleanedTagged = cleanTagged(loadedTagged);
        
        setPeople(cleanedPeople);
        setTaggedPhotos(cleanedTagged);
        localStorage.setItem("family_album_people", JSON.stringify(cleanedPeople));
        localStorage.setItem("family_album_person_tags", JSON.stringify(cleanedTagged));

        // Sincronizar los cambios limpios de vuelta a Supabase si hubo limpieza
        const rawJsonString = JSON.stringify(loadedPeople);
        const cleanedJsonString = JSON.stringify(cleanedPeople);
        const rawTaggedString = JSON.stringify(loadedTagged);
        const cleanedTaggedString = JSON.stringify(cleanedTagged);
        if (rawJsonString !== cleanedJsonString || rawTaggedString !== cleanedTaggedString) {
          savePeopleConfig(cleanedPeople, cleanedTagged);
        }
      } else {
        const savedPeople = localStorage.getItem("family_album_people");
        let currentPeople = DEFAULT_PEOPLE;
        if (savedPeople) {
          currentPeople = JSON.parse(savedPeople);
        } else {
          localStorage.setItem("family_album_people", JSON.stringify(DEFAULT_PEOPLE));
        }

        const cleanedPeople = cleanPeople(currentPeople);
        setPeople(cleanedPeople);
        localStorage.setItem("family_album_people", JSON.stringify(cleanedPeople));

        const savedTagged = localStorage.getItem("family_album_person_tags");
        let currentTagged: Record<string, string[]> = {
          "p_ma_cynthia": [],
          "p_ap_manuel": [],
          "p_ma_manuel": [],
          "p_manuel_adolfo": [],
          "p_ana_paula": [],
          "p_manuel": [],
          "p_cynthia": [],
          "p_dante": []
        };
        if (savedTagged) {
          currentTagged = JSON.parse(savedTagged);
        } else {
          localStorage.setItem("family_album_person_tags", JSON.stringify(currentTagged));
        }
        const cleanedTagged = cleanTagged(currentTagged);
        setTaggedPhotos(cleanedTagged);
        localStorage.setItem("family_album_person_tags", JSON.stringify(cleanedTagged));
      }
    };

    loadConfig();

    // 4. Cargar fotos importadas, remotas y metadatos de IA
    const loadImportedAndMetadata = async () => {
      try {
        const localActive = localStorage.getItem("family_album_local_mode_active") === "true";
        let allPhotos: PhotoItem[] = [];

        if (!localActive) {
          // --- MODO ONLINE: Solo Supabase ---
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
              
              const { data: dbPhotos } = await supabase.from("photos").select("id, album_id, status");
              if (dbPhotos) {
                dbPhotos.forEach((p) => {
                  if (p.album_id) dbAlbumMappings[p.id] = p.album_id;
                  if (p.status) dbStatusMappings[p.id] = p.status;
                });
              }

              allPhotos = validFiles.map((file) => {
                const { data: urlData } = supabase.storage
                  .from("family-album")
                  .getPublicUrl(`thumbnails/${file.name}`);

                const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
                const cleanPhotoId = nameWithoutExt.split(".")[0];
                const photoId = isValidUUID(cleanPhotoId) ? cleanPhotoId : file.name;

                const albumId = dbAlbumMappings[photoId] || null;
                const status = dbStatusMappings[photoId] || null;

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
            console.error("Fallo al conectar con Supabase en el inicio:", err);
            return;
          }
        } else {
          // --- MODO LOCAL ---
          const localPhotosJson = localStorage.getItem("family_album_local_photos") || "[]";
          const localPhotos: PhotoItem[] = JSON.parse(localPhotosJson);

          const localAlbumMappingsJson = localStorage.getItem("family_album_photo_mappings") || "{}";
          const localAlbumMappings = JSON.parse(localAlbumMappingsJson);

          const localStatusMappingsJson = localStorage.getItem("family_album_photo_statuses") || "{}";
          const localStatusMappings = JSON.parse(localStatusMappingsJson);

          allPhotos = localPhotos.map((photo) => ({
            ...photo,
            album_id: localAlbumMappings[photo.name] !== undefined ? localAlbumMappings[photo.name] : photo.album_id,
            status: localStatusMappings[photo.name] !== undefined ? localStatusMappings[photo.name] : photo.status,
          }));
        }

        // Filtrar activas
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

      const remoteMeta = await loadMetadataFromSupabase();
      const localMetaJson = localStorage.getItem("family_album_photo_metadata") || "{}";
      const localMeta = JSON.parse(localMetaJson);

      const cleanMeta = (meta: any) => {
        if (!meta) return meta;
        const clean = { ...meta };
        Object.keys(clean).forEach((key) => {
          if (clean[key]?.tags) {
            clean[key].tags = clean[key].tags.filter(
              (t: string) => !["recuerdo", "familiar", "recuerdo familiar", "foto", "imagen", "momento", "fotografía", "recuerdo familiar", "foto familiar"].includes(t.toLowerCase().trim())
            );
          }
        });
        return clean;
      };

      const cleanLocalMeta = cleanMeta(localMeta);
      const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

      if (!localActive && remoteMeta) {
        const cleanRemoteMeta = cleanMeta(remoteMeta);
        setPhotoMetadata(cleanRemoteMeta);
        localStorage.setItem("family_album_photo_metadata", JSON.stringify(cleanRemoteMeta));
      } else {
        setPhotoMetadata(cleanLocalMeta);
      }

      const remoteStories = await loadStoriesFromSupabase();
      const localStoriesJson = localStorage.getItem("family_album_photo_stories") || "{}";
      const localStories = JSON.parse(localStoriesJson);
      if (!localActive && remoteStories) {
        setPhotoStories(remoteStories);
        localStorage.setItem("family_album_photo_stories", JSON.stringify(remoteStories));
      } else {
        setPhotoStories(localStories);
      }

      const remoteRots = await loadRotationsFromSupabase();
      const localRotsJson = localStorage.getItem("family_album_photo_rotations") || "{}";
      const localRots = JSON.parse(localRotsJson);
      if (!localActive && remoteRots) {
        setRotations(remoteRots);
        localStorage.setItem("family_album_photo_rotations", JSON.stringify(remoteRots));
      } else {
        setRotations(localRots);
      }
    };

    loadImportedAndMetadata();

    // 5. Cargar álbumes locales o remotos
    const loadAlbums = async () => {
      const localActive = localStorage.getItem("family_album_local_mode_active") === "true";
      if (!localActive) {
        try {
          const { data, error } = await supabase.from("albums").select("id, name, cover_url");
          if (error) throw error;
          if (data) {
            const filtered = data.filter((a) => !a.name.startsWith("__system_"));
            setAlbums(filtered);
          }
        } catch (err) {
          console.error("Error al cargar álbumes de Supabase en Inicio:", err);
        }
      } else {
        const localAlbums = localStorage.getItem("family_album_local_albums");
        if (localAlbums) {
          setAlbums(JSON.parse(localAlbums));
        }
      }
    };
    loadAlbums();

    window.addEventListener("photo-moved", loadImportedAndMetadata);
    window.addEventListener("refresh-albums", loadAlbums);
    window.addEventListener("local-mode-changed", loadImportedAndMetadata);
    window.addEventListener("local-mode-changed", loadAlbums);
    return () => {
      window.removeEventListener("photo-moved", loadImportedAndMetadata);
      window.removeEventListener("refresh-albums", loadAlbums);
      window.removeEventListener("local-mode-changed", loadImportedAndMetadata);
      window.removeEventListener("local-mode-changed", loadAlbums);
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
      // Fotos ya asociadas
      const assignedNames = taggedPhotos[selectedPerson.id] || [];
      const assigned = libraryPhotos.filter((p) => assignedNames.includes(p.name));

      // Buscar sugerencias (fotos no asignadas pero que tienen tags en común con el perfil)
      const unassigned = libraryPhotos.filter((p) => !assignedNames.includes(p.name));
      const suggestions = unassigned.filter((p) => {
        const meta = photoMetadata[p.name];
        const tagsString = meta?.tags ? meta.tags.join(" ") : "";
        const locationString = meta?.location || "";
        const titleLower = `${tagsString} ${locationString} ${p.name}`.toLowerCase();
        // Verificar si contiene alguna palabra clave del perfil
        return selectedPerson.tags.some(tag => titleLower.includes(tag.toLowerCase()));
      });

      setUnassignedPhotos(unassigned);
      setSuggestedPhotos(suggestions);
    }
  }, [selectedPerson, taggedPhotos, libraryPhotos, photoMetadata]);

  // Guardar configuración de personas y fotos etiquetadas a Supabase (y local)
  const savePeopleConfig = async (newPeople: PersonProfile[], newTaggedPhotos: Record<string, string[]>) => {
    localStorage.setItem("family_album_people", JSON.stringify(newPeople));
    localStorage.setItem("family_album_person_tags", JSON.stringify(newTaggedPhotos));

    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";
    if (!localActive) {
      try {
        const { data: existing, error: selectError } = await supabase
          .from("albums")
          .select("id")
          .eq("name", "__system_config__")
          .limit(1);
        if (selectError) throw selectError;

        const configJson = JSON.stringify({ people: newPeople, taggedPhotos: newTaggedPhotos });
        if (existing && existing.length > 0) {
          const { error: updateError } = await supabase
            .from("albums")
            .update({ cover_url: configJson })
            .eq("id", existing[0].id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase
            .from("albums")
            .insert({ name: "__system_config__", cover_url: configJson });
          if (insertError) throw insertError;
        }
      } catch (err: any) {
        console.error("Error al guardar la configuración de personas en Supabase:", err);
        setFeedback({
          type: "error",
          text: `Fallo al sincronizar con Supabase: ${err.message || err}`
        });
      }
    }
  };

  // Añadir una foto seleccionada al perfil de la persona
  const addPhotoToPerson = (photoName: string) => {
    if (!selectedPerson) return;

    const newTagged = { ...taggedPhotos };
    const currentList = newTagged[selectedPerson.id] || [];
    if (!currentList.includes(photoName)) {
      currentList.push(photoName);
    }
    newTagged[selectedPerson.id] = currentList;

    savePeopleConfig(people, newTagged);
    setTaggedPhotos(newTagged);
    setFeedback({ type: "success", text: `Recuerdo asociado con éxito a ${selectedPerson.name}.` });
  };

  // Desvincular una foto del perfil de la persona
  const removePhotoFromPerson = (photoName: string) => {
    if (!selectedPerson) return;

    const newTagged = { ...taggedPhotos };
    newTagged[selectedPerson.id] = (newTagged[selectedPerson.id] || []).filter(name => name !== photoName);

    savePeopleConfig(people, newTagged);
    setTaggedPhotos(newTagged);
  };

  // Establecer foto como portada del perfil de persona o grupo
  const setPersonAvatar = (personId: string, photoUrl: string) => {
    const updatedPeople = people.map(p => p.id === personId ? { ...p, avatar: photoUrl } : p);
    setPeople(updatedPeople);
    savePeopleConfig(updatedPeople, taggedPhotos);
    
    if (selectedPerson && selectedPerson.id === personId) {
      setSelectedPerson({ ...selectedPerson, avatar: photoUrl });
    }
    setFeedback({ type: "success", text: "Foto de portada del perfil actualizada." });
  };

  // Eliminar un perfil de persona o grupo familiar
  const handleDeletePerson = (personId: string, name: string, isGroup: boolean) => {
    const confirmMsg = isGroup 
      ? `¿Estás seguro de que deseas eliminar el grupo "${name}"? Esta acción no se puede deshacer.`
      : `¿Estás seguro de que deseas eliminar el perfil de "${name}"? Esta acción no se puede deshacer.`;
      
    if (!window.confirm(confirmMsg)) return;

    // 1. Filtrar la persona de la lista
    const updatedPeople = people.filter(p => p.id !== personId);
    setPeople(updatedPeople);

    // 2. Limpiar el mapeo de fotos etiquetadas correspondientes
    const updatedTagged = { ...taggedPhotos };
    delete updatedTagged[personId];
    setTaggedPhotos(updatedTagged);

    savePeopleConfig(updatedPeople, updatedTagged);

    // 3. Si estaba seleccionado, cerrar modal
    if (selectedPerson && selectedPerson.id === personId) {
      setSelectedPerson(null);
    }

    setFeedback({
      type: "success",
      text: isGroup ? `Grupo "${name}" eliminado correctamente.` : `Perfil de "${name}" eliminado correctamente.`
    });
  };

  // Genera un relato nostálgico evocador simulando IA basado en metadatos y contexto
  const generateChronicle = (photo: PhotoItem) => {
    const year = photo.created_at ? new Date(photo.created_at).getFullYear().toString() : "";
    const cleanName = photo.name.split("_").slice(1).join("_").replace(/\.webp$/, "");
    const photoTitle = (photoMetadata[photo.name] as any)?.title || cleanName || photo.name;
    const albumName = albums.find((a) => a.id === photo.album_id)?.name;
    const meta = photoMetadata[photo.name];
    const locationStr = meta?.location || "";
    
    // Lista de plantillas poéticas basadas en el tipo de foto y etiquetas
    const templates = [
      `Aquel recuerdo de ${year ? `año ${year}` : "días lejanos"}${locationStr ? ` en ${locationStr}` : ""} quedó grabado como un tesoro de la familia. La fotografía captura una calidez única que trasciende el papel, recordándonos los momentos donde el tiempo parecía detenerse para dejarnos sonreír de corazón.`,
      `El instante inmortalizado en "${photoTitle}"${year ? ` en el año ${year}` : ""} evoca el calor del hogar familiar. ${albumName ? `Bajo el cobijo del álbum "${albumName}", este` : "Este"} recuerdo permanece intacto para hablarnos de la complicidad y el amor compartido entre risas y miradas sinceras.`,
      `Hay días que se graban en el alma, y esta foto ${locationStr ? `tomada en ${locationStr}` : ""}${year ? ` (${year})` : ""} es el perfecto testigo de ello. Cada detalle en la imagen nos transporta a una tarde llena de anécdotas, el aroma a nostalgia y el eco de las voces de los que más queremos reunidos en comunión.`,
      `Una postal del baúl de los recuerdos que nos susurra historias de felicidad sencilla. La luz que baña "${photoTitle}"${year ? ` en aquel lejano ${year}` : ""} retrata no solo rostros, sino un fragmento irrepetible del largo viaje que hemos recorrido juntos como familia.`
    ];

    // Elegir plantilla de forma consistente usando el nombre del archivo como semilla
    let hash = 0;
    for (let i = 0; i < photo.name.length; i++) {
      hash = photo.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % templates.length;
    return templates[index];
  };

  // Escuchar el evento para abrir modal de historia de foto (por ejemplo, al hacer click en una notificación)
  useEffect(() => {
    const handleOpenPhotoStory = (e: Event) => {
      const customEvent = e as CustomEvent<{ photoName: string }>;
      const photo = libraryPhotos.find((p) => p.name === customEvent.detail.photoName);
      if (photo) {
        setSelectedDiaryPhoto(photo);
        setEditingAnecdote(photoStories[photo.name]?.anecdote || "");
      }
    };

    window.addEventListener("open-photo-story", handleOpenPhotoStory);

    // Verificar si hay una apertura pendiente al navegar a Inicio
    if (typeof window !== "undefined") {
      const pendingPhotoName = localStorage.getItem("family_album_open_story_pending");
      if (pendingPhotoName && libraryPhotos.length > 0) {
        const photo = libraryPhotos.find((p) => p.name === pendingPhotoName);
        if (photo) {
          setSelectedDiaryPhoto(photo);
          setEditingAnecdote(photoStories[photo.name]?.anecdote || "");
        }
        localStorage.removeItem("family_album_open_story_pending");
      }
    }

    return () => {
      window.removeEventListener("open-photo-story", handleOpenPhotoStory);
    };
  }, [libraryPhotos, photoStories]);

  // Guardar la anécdota personal y crónica del diario
  const handleSaveStory = async (photoName: string, chronicleText: string, anecdoteText: string) => {
    const isEdit = !!photoStories[photoName]?.anecdote;
    const updatedStories = { ...photoStories };
    updatedStories[photoName] = {
      chronicle: chronicleText,
      anecdote: anecdoteText
    };
    setPhotoStories(updatedStories);
    localStorage.setItem("family_album_photo_stories", JSON.stringify(updatedStories));
    try {
      await saveStoriesToSupabase(updatedStories);
      setFeedback({ type: "success", text: "Anécdota del diario guardada correctamente." });
    } catch (err: any) {
      console.error("Fallo al guardar anécdota en Supabase:", err);
      setFeedback({
        type: "error",
        text: `Fallo al sincronizar anécdota con Supabase: ${err.message || err}`
      });
    }

    // Emitir notificación a la campana del Navbar
    const meta = photoMetadata[photoName];
    const cleanName = photoName.split("_").slice(1).join("_").replace(/\.webp$/, "");
    const photoTitle = (meta as any)?.title || cleanName || "un recuerdo familiar";
    const notifMsg = isEdit 
      ? `✍️ Se modificó la historia de "${photoTitle}".`
      : `✍️ Se narró la historia de "${photoTitle}".`;
    window.dispatchEvent(new CustomEvent("new-notification", { detail: { message: notifMsg, photoName: photoName } }));
  };

  // Autocompletado de menciones (@)
  const filteredMembers = FAMILY_MEMBERS.filter(member => 
    member.toLowerCase().startsWith(mentionSearchQuery.toLowerCase())
  );

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditingAnecdote(val);

    const selectionStart = e.target.selectionStart;
    const textUpToCursor = val.slice(0, selectionStart);
    const lastAt = textUpToCursor.lastIndexOf('@');

    // Verificar si hay una @ activa antes del cursor en la palabra actual
    if (lastAt !== -1) {
      const query = textUpToCursor.slice(lastAt + 1);
      // Solo activamos si no hay espacios o saltos de línea después de la @
      if (!query.includes(' ') && !query.includes('\n')) {
        setShowMentionDropdown(true);
        setMentionTriggerIndex(lastAt);
        setMentionSearchQuery(query);
        setSelectedMentionIndex(0);
        return;
      }
    }
    setShowMentionDropdown(false);
  };

  const insertMention = (member: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const val = editingAnecdote;
    const startPos = mentionTriggerIndex;
    const endPos = textarea.selectionStart;

    const mentionText = `@${member}: `;
    const newVal = val.slice(0, startPos) + mentionText + val.slice(endPos);
    setEditingAnecdote(newVal);
    setShowMentionDropdown(false);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = startPos + mentionText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionDropdown && filteredMembers.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev + 1) % filteredMembers.length);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredMembers[selectedMentionIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionDropdown(false);
      }
    }
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

      localStorage.setItem("family_album_local_photos", "[]");
      localStorage.setItem("family_album_photo_statuses", "{}");
      localStorage.setItem("family_album_photo_mappings", "{}");

      setImportedPhotos([]);
      setFeedback({ type: "success", text: "¡Se han sembrado los álbumes vacíos!" });
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
      savePeopleConfig(people, {});
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
    const localActive = localStorage.getItem("family_album_local_mode_active") === "true";

    if (!localActive) {
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

        window.dispatchEvent(new CustomEvent("photo-moved"));
        setFeedback({ type: "success", text: "Foto movida a la papelera." });
      } catch (err) {
        console.error("Fallo al mover a papelera en Supabase desde inicio:", err);
      }
    } else {
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
      </div>

      {/* Retroalimentación Flotante y Premium (Toast) */}
      {feedback && (
        <div className={`fixed bottom-6 right-6 z-100 max-w-sm w-[calc(100vw-3rem)] p-4 border rounded-xs shadow-xl flex justify-between items-start gap-4 animate-in slide-in-from-bottom-5 duration-200 ${
          feedback.type === "error" 
            ? "bg-red-50/95 border-red-200 text-red-800 backdrop-blur-xs" 
            : "bg-green-50/95 border-green-200 text-green-800 backdrop-blur-xs"
        }`}>
          <div className="space-y-1 bg-transparent">
            <h5 className="text-[9px] font-bold uppercase tracking-wider">
              {feedback.type === "error" ? "⚠️ Error de Sincronización" : "✅ Operación Exitosa"}
            </h5>
            <p className="text-xs font-semibold leading-relaxed">{feedback.text}</p>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs font-bold hover:opacity-75 cursor-pointer flex-shrink-0">✕</button>
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
            const photoDate = (photo as any).created_at || (photo as any).createdAt || "";
            const photoYear = photoDate ? photoDate.split("-")[0] : "";
            const meta = photoMetadata[photo.name];
            const aiTags = (meta?.tags || [])
              .filter((t: string) => !["recuerdo", "familiar", "recuerdo familiar", "foto", "imagen", "momento", "fotografía", "recuerdo familiar", "foto familiar"].includes(t.toLowerCase().trim()))
              .slice(0, 4);
            const aiLocation = meta?.location || "";

            return (
              <div
                key={photoId}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                  isActive ? "opacity-100 z-10 scale-100" : "opacity-0 z-0 scale-[1.01]"
                }`}
              >
                <div className="absolute inset-0 bg-brand-navy/95 flex items-center justify-center overflow-hidden">
                  {/* Fondo difuminado ambiental */}
                  <img
                    src={photo.url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-35 select-none pointer-events-none"
                    style={{ transform: `rotate(${rotations[photo.name] || 0}deg) scale(1.15)` }}
                  />
                  {/* Imagen original contenida en el frente */}
                  <img
                    src={photo.url}
                    alt={aiTags.join(", ") || "Recuerdo familiar"}
                    className="relative w-full h-full object-contain z-10 transition-transform duration-300"
                    style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }}
                  />
                </div>
                
                {/* Degradado premium inferior */}
                <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/95 via-transparent to-transparent flex flex-col justify-end p-6 md:p-8 z-20 pointer-events-none" />
                
                <div className="absolute bottom-6 left-6 md:bottom-8 md:left-8 z-30 text-brand-cream space-y-1.5 bg-transparent">
                  {photoYear && (
                    <span className="bg-brand-timber text-brand-cream text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-xs">
                      {photoYear}
                    </span>
                  )}
                  {aiTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {aiTags.map((tag, i) => (
                        <span key={i} className="bg-brand-cream/15 backdrop-blur-sm text-brand-cream text-[10px] md:text-xs font-medium px-2 py-0.5 rounded-xs border border-brand-cream/20">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {aiLocation && (
                    <p className="text-[10px] md:text-xs text-brand-cream/65 bg-transparent font-medium mt-0.5">
                      📍 {aiLocation}
                    </p>
                  )}
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
              const assignedNames = taggedPhotos[group.id] || [];
              const count = libraryPhotos.filter((photo) => assignedNames.includes(photo.name)).length;
              return (
                <div
                  key={group.id}
                  onClick={() => setSelectedPerson(group)}
                  className="group relative aspect-video bg-brand-navy/5 rounded-xs overflow-hidden border border-brand-navy/10 hover:border-brand-navy/35 hover:-translate-y-0.5 shadow-sm transition-all duration-300 cursor-pointer"
                >
                  <div className="w-full h-full transition-transform duration-500 group-hover:scale-102 overflow-hidden">
                    <AvatarImage avatar={group.avatar} name={group.name} isGroup={true} />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/95 via-brand-navy/30 to-transparent flex flex-col justify-end p-4" />
                  
                  {/* Botón de eliminar en hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePerson(group.id, group.name, true);
                    }}
                    className="absolute top-2.5 right-2.5 p-1.5 bg-red-600/90 text-brand-cream rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 shadow-md z-20 cursor-pointer"
                    title="Eliminar grupo"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  
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
              const assignedNames = taggedPhotos[person.id] || [];
              const count = libraryPhotos.filter((photo) => assignedNames.includes(photo.name)).length;
              return (
                <div
                  key={person.id}
                  onClick={() => setSelectedPerson(person)}
                  className="group flex flex-col items-center gap-3 p-4 bg-brand-cream border border-brand-navy/10 hover:border-brand-navy/35 hover:shadow-md transition-all rounded-xs cursor-pointer text-center relative"
                >
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border border-brand-navy/10 shadow-sm relative">
                    <div className="w-full h-full transition-transform duration-500 group-hover:scale-104 overflow-hidden">
                      <AvatarImage avatar={person.avatar} name={person.name} isGroup={false} />
                    </div>
                    <div className="absolute inset-0 bg-brand-navy/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </div>
                  
                  {/* Botón de eliminar en hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePerson(person.id, person.name, false);
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-red-600/90 text-brand-cream rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 shadow-md z-20 cursor-pointer"
                    title="Eliminar perfil"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
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

      {/* DIARIO DE HISTORIAS FAMILIARES */}
      <div className="space-y-6 bg-transparent pt-6 border-t border-brand-navy/10">
        <div className="space-y-1 bg-transparent pb-2 border-b border-brand-navy/10">
          <h3 className="text-xl md:text-2xl font-bold text-brand-navy tracking-tight uppercase">Diario de Historias Familiares</h3>
          <p className="text-xs text-brand-navy/50">
            {libraryPhotos.length > 0
              ? "Explora el alma de tus recuerdos. Escribe tus propias anécdotas para cada momento y crea una crónica viva de la familia."
              : "No tienes recuerdos en tu biblioteca. Importa imágenes de muestra del catálogo para comenzar a narrar tus historias familiares."}
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

            // Agrupar fotos por álbum
            const albumsWithPhotos = albums.map((album) => {
              const albumPhotos = filteredPhotos.filter((p) => p.album_id === album.id);
              return {
                ...album,
                photos: albumPhotos
              };
            }).filter((a) => a.photos.length > 0);

            const uncategorizedPhotos = filteredPhotos.filter((p) => {
              return !p.album_id || !albums.some((a) => a.id === p.album_id);
            });

            // Función auxiliar para renderizar una foto
            const renderPhotoCard = (photo: PhotoItem) => {
              const year = photo.created_at ? new Date(photo.created_at).getFullYear().toString() : "";
              const photoTitle = (photoMetadata[photo.name] as any)?.title || (year ? `Recuerdo de ${year}` : "Recuerdo Familiar");
              const albumName = albums.find((a) => a.id === photo.album_id)?.name;
              
              const savedStory = photoStories[photo.name];
              const hasAnecdote = !!savedStory?.anecdote;
              const previewText = hasAnecdote 
                ? savedStory.anecdote 
                : "Sin historia narrada todavía. Haz clic para contar este momento de tu propia voz.";

              return (
                <div
                  key={photo.name}
                  className="group border border-brand-navy/10 bg-brand-cream/50 rounded-xs overflow-hidden hover:border-brand-navy/35 hover:shadow-md transition-all duration-300 flex flex-col justify-between"
                >
                  {/* Foto con clic directo para abrir el modal */}
                  <div
                    onClick={() => {
                      setSelectedDiaryPhoto(photo);
                      setEditingAnecdote(photoStories[photo.name]?.anecdote || "");
                    }}
                    className="aspect-video relative overflow-hidden bg-brand-navy/5 cursor-pointer"
                  >
                    <img
                      src={photo.url}
                      alt={photoTitle}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
                      style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }}
                      loading="lazy"
                    />
                    {year && (
                      <div className="absolute top-3 right-11 bg-brand-cream/90 backdrop-blur-xs text-brand-navy text-[10px] font-semibold px-2 py-0.5 rounded-xs shadow-sm z-20">
                        {year}
                      </div>
                    )}

                    {hasAnecdote && (
                      <div className="absolute top-3 left-3 bg-brand-navy/90 backdrop-blur-xs text-brand-cream text-[9px] font-bold px-2 py-0.5 rounded-xs flex items-center gap-1 shadow-md animate-in fade-in duration-200">
                        <span>✍️</span> Con historia
                      </div>
                    )}

                    {/* Hover overlay translúcido con desenfoque de cristal */}
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-350 flex flex-col justify-end p-4 z-10">
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

                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between bg-transparent">
                    <div className="space-y-1.5 bg-transparent text-left">
                      <h4 className="text-xs font-bold text-brand-navy/90 tracking-wide uppercase truncate">
                        {photoTitle}
                      </h4>
                      <p className="text-[10px] text-brand-navy/55 capitalize bg-transparent">
                        Álbum: <span className="font-semibold text-brand-timber">{albumName || "Sin álbum"}</span>
                      </p>
                      {/* Vista previa del texto de la anécdota */}
                      <p className="text-[11px] text-brand-navy/70 line-clamp-2 italic leading-relaxed pt-1 border-t border-brand-navy/5">
                        {previewText}
                      </p>
                    </div>

                    <div className="pt-2 bg-transparent">
                      <button
                        onClick={() => {
                          setSelectedDiaryPhoto(photo);
                          setEditingAnecdote(photoStories[photo.name]?.anecdote || "");
                        }}
                        className="w-full py-1.5 text-[11px] font-bold rounded-xs bg-brand-navy text-brand-cream hover:bg-brand-navy/95 text-center transition-all cursor-pointer shadow-xs"
                      >
                        {hasAnecdote ? "✍️ Editar tu historia" : "📖 Narrar tu historia"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            };

            return (
              <div className="space-y-10 bg-transparent">
                {/* 1. Listar por Álbumes */}
                {albumsWithPhotos.map((album) => (
                  <div key={album.id} className="space-y-4 bg-transparent border-t border-brand-navy/5 pt-6 first:border-t-0 first:pt-0">
                    <div className="bg-transparent border-l-2 border-brand-timber pl-3 py-0.5">
                      <h4 className="text-xs md:text-sm font-bold text-brand-navy uppercase tracking-wider flex items-center gap-2">
                        📁 {album.name}
                        <span className="text-[9px] lowercase font-medium text-brand-navy/50 bg-brand-navy/5 px-2 py-0.5 rounded-full">
                          {album.photos.length} {album.photos.length === 1 ? 'recuerdo' : 'recuerdos'}
                        </span>
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                      {album.photos.map(renderPhotoCard)}
                    </div>
                  </div>
                ))}

                {/* 2. Listar sin Álbum */}
                {uncategorizedPhotos.length > 0 && (
                  <div className="space-y-4 bg-transparent border-t border-brand-navy/5 pt-6">
                    <div className="bg-transparent border-l-2 border-brand-navy/40 pl-3 py-0.5">
                      <h4 className="text-xs md:text-sm font-bold text-brand-navy uppercase tracking-wider flex items-center gap-2">
                        📦 Recuerdos sin Álbum
                        <span className="text-[9px] lowercase font-medium text-brand-navy/50 bg-brand-navy/5 px-2 py-0.5 rounded-full">
                          {uncategorizedPhotos.length} {uncategorizedPhotos.length === 1 ? 'recuerdo' : 'recuerdos'}
                        </span>
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                      {uncategorizedPhotos.map(renderPhotoCard)}
                    </div>
                  </div>
                )}
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
                        <h4 className="text-xs font-semibold text-brand-navy/90 tracking-wide uppercase truncate">
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
        <div className="fixed inset-0 bg-brand-navy/50 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-brand-cream border border-brand-navy/25 rounded-xs p-6 max-w-4xl w-full h-[85vh] flex flex-col justify-between shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Header del Modal */}
            <div className="flex justify-between items-center pb-4 border-b border-brand-navy/10 bg-transparent">
              <div className="flex items-center gap-4 bg-transparent">
                <div className="w-12 h-12 rounded-full overflow-hidden border border-brand-navy/15 flex-shrink-0">
                  <AvatarImage avatar={selectedPerson.avatar} name={selectedPerson.name} isGroup={selectedPerson.isGroup} />
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
                  const assignedNames = taggedPhotos[selectedPerson.id] || [];
                  const assigned = libraryPhotos.filter((p) => assignedNames.includes(p.name));

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
                                {isCurrentAvatar ? (
                                  <button
                                    onClick={() => setCroppingPhoto(photo)}
                                    className="p-1 text-[9px] font-semibold rounded-xs shadow-md cursor-pointer transition-all bg-brand-cream text-brand-navy hover:bg-brand-navy hover:text-brand-cream"
                                    title="Recortar cara para la foto de perfil"
                                  >
                                    Recortar
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setPersonAvatar(selectedPerson.id, photo.url)}
                                    className="p-1 text-[9px] font-semibold rounded-xs shadow-md cursor-pointer transition-all bg-brand-cream text-brand-navy hover:bg-brand-navy hover:text-brand-cream"
                                    title="Establecer como foto de portada"
                                  >
                                    Portada
                                  </button>
                                )}
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
                  const assignedNames = taggedPhotos[selectedPerson.id] || [];
                  const manualOptions = libraryPhotos.filter((p) => !assignedNames.includes(p.name));

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
            <div className="pt-4 border-t border-brand-navy/10 flex justify-between items-center bg-transparent">
              <button
                onClick={() => handleDeletePerson(selectedPerson.id, selectedPerson.name, selectedPerson.isGroup)}
                className="py-1.5 px-3 bg-red-600 hover:bg-red-700 text-brand-cream text-xs font-semibold rounded-xs cursor-pointer transition-colors"
              >
                Eliminar {selectedPerson.isGroup ? "Grupo" : "Perfil"}
              </button>
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
        <div className="fixed inset-0 bg-brand-navy/50 backdrop-blur-xs z-60 flex items-center justify-center p-4">
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
                  setNewPersonCroppedAvatar(null);
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
                  className="w-full px-3 py-2 bg-transparent border border-brand-navy/20 focus:border-brand-navy text-base md:text-xs rounded-xs outline-none text-brand-navy font-medium placeholder:text-brand-navy/30"
                  maxLength={40}
                />
              </div>

              {/* Vista previa y recortador del avatar/portada */}
              {selectedPhotoNamesForNewPerson.length > 0 && (
                <div className="flex items-center gap-4 p-3 border border-brand-navy/15 rounded-xs bg-brand-cream/50">
                  <div className="w-14 h-14 rounded-full overflow-hidden border border-brand-navy/20 relative group flex-shrink-0">
                    <img
                      src={newPersonCroppedAvatar || libraryPhotos.find(p => p.name === selectedPhotoNamesForNewPerson[0])?.url}
                      alt="Avatar Vista Previa"
                      className="w-full h-full object-cover"
                      style={{
                        transform: !newPersonCroppedAvatar ? `rotate(${rotations[selectedPhotoNamesForNewPerson[0]] || 0}deg)` : 'none'
                      }}
                    />
                  </div>
                  <div className="flex-1 bg-transparent">
                    <h4 className="text-xs font-bold text-brand-navy/80 uppercase tracking-wider">
                      Foto de perfil (Avatar)
                    </h4>
                    <p className="text-[10px] text-brand-navy/50 mb-1.5">
                      {newPersonCroppedAvatar 
                        ? "Rostro personalizado recortado." 
                        : "Se usará la foto completa. Puedes recortar la cara para mejorar el avatar."}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const firstPhoto = libraryPhotos.find(p => p.name === selectedPhotoNamesForNewPerson[0]);
                        if (firstPhoto) {
                          setCroppingPhoto(firstPhoto);
                        }
                      }}
                      className="py-1 px-2.5 bg-brand-navy text-brand-cream text-[10px] font-semibold rounded-xs hover:bg-brand-navy/90 cursor-pointer flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      ✂️ Recortar Rostro
                    </button>
                  </div>
                </div>
              )}

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
                  if (libraryPhotos.length === 0) {
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
                      {libraryPhotos.map((photo) => {
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
                  setNewPersonCroppedAvatar(null);
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
                  
                  let avatarUrl = newPersonCroppedAvatar;
                  if (!avatarUrl) {
                    avatarUrl = "";
                    if (selectedPhotoNamesForNewPerson.length > 0) {
                      const firstPhoto = libraryPhotos.find((p) => p.name === selectedPhotoNamesForNewPerson[0]);
                      if (firstPhoto && firstPhoto.url) {
                        avatarUrl = firstPhoto.url;
                      }
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

                  const updatedTagged = {
                    ...taggedPhotos,
                    [newId]: selectedPhotoNamesForNewPerson
                  };
                  setTaggedPhotos(updatedTagged);

                  savePeopleConfig(updatedPeople, updatedTagged);

                  setIsAddPersonOpen(false);
                  setNewPersonName("");
                  setSelectedPhotoNamesForNewPerson([]);
                  setNewPersonCroppedAvatar(null);

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
          className="fixed inset-0 bg-brand-navy/95 backdrop-blur-md z-60 flex flex-col justify-between p-4 md:p-6 select-none animate-in fade-in duration-200"
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
                const photoDate = (photo as any).created_at || (photo as any).createdAt || "";
                const photoYear = photoDate ? photoDate.split("-")[0] : "";
                const meta = photoMetadata[photo.name];
                const aiTags = meta?.tags?.slice(0, 4) || [];
                const aiLocation = meta?.location || "";

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
                        alt={aiTags.join(", ") || "Recuerdo familiar"}
                        className="object-contain w-auto h-auto max-w-full max-h-[50vh] sm:max-h-[70vh] md:max-h-[75vh] landscape:max-h-[50vh] landscape:md:max-h-[72vh] transition-transform duration-300"
                        style={{ transform: `rotate(${rotations[photo.name] || 0}deg)` }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      
                      {/* Información superpuesta */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-navy/90 to-transparent p-4 text-left text-brand-cream flex flex-col gap-1 pointer-events-none">
                        {photoYear && (
                          <span className="bg-brand-timber text-brand-cream text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-xs w-max">
                            {photoYear}
                          </span>
                        )}
                        {aiTags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {aiTags.map((tag, i) => (
                              <span key={i} className="bg-brand-cream/15 backdrop-blur-sm text-brand-cream text-[9px] md:text-[11px] font-medium px-2 py-0.5 rounded-xs border border-brand-cream/20">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {aiLocation && (
                          <p className="text-[9px] md:text-xs text-brand-cream/60 font-medium mt-0.5">
                            📍 {aiLocation}
                          </p>
                        )}
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

      {/* MODAL DIARIO DE HISTORIAS FAMILIARES (SCRAPBOOK INTERACTIVO) */}
      {selectedDiaryPhoto && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-brand-cream border border-brand-navy/25 rounded-xs p-6 max-w-4xl w-full max-h-[90vh] flex flex-col md:flex-row gap-6 shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto md:overflow-visible">
            
            {/* Lateral Izquierdo: Fotografía */}
            <div className="flex-1 flex flex-col justify-center items-center bg-brand-navy/5 rounded-xs border border-brand-navy/10 p-4 min-h-[300px] md:max-h-[75vh] relative overflow-hidden">
              <div className="absolute top-3 right-3 z-10 flex gap-2">
                {selectedDiaryPhoto.created_at && (
                  <span className="bg-brand-timber text-brand-cream text-[9px] font-bold px-2 py-0.5 rounded-xs shadow-sm">
                    {new Date(selectedDiaryPhoto.created_at).getFullYear()}
                  </span>
                )}
              </div>
              <img
                src={selectedDiaryPhoto.url}
                alt={selectedDiaryPhoto.name}
                className="max-w-full max-h-[45vh] object-contain shadow-md rounded-xs transition-transform duration-300"
                style={{ transform: `rotate(${rotations[selectedDiaryPhoto.name] || 0}deg)` }}
              />
            </div>

            {/* Lateral Derecho: Anécdota */}
            <div className="flex-1 flex flex-col justify-between bg-transparent min-w-[280px]">
              
              <div className="space-y-6 bg-transparent flex-1 overflow-y-auto pr-1 scrollbar-thin md:max-h-[60vh]">
                {/* Header */}
                <div className="pb-3 border-b border-brand-navy/10 bg-transparent">
                  <h3 className="text-base font-bold text-brand-navy uppercase tracking-wide">
                    {(() => {
                      const modalYear = selectedDiaryPhoto.created_at ? new Date(selectedDiaryPhoto.created_at).getFullYear().toString() : "";
                      return (photoMetadata[selectedDiaryPhoto.name] as any)?.title || (modalYear ? `Recuerdo de ${modalYear}` : "Recuerdo Familiar");
                    })()}
                  </h3>
                  <p className="text-[10px] text-brand-navy/50">
                    {selectedDiaryPhoto.created_at ? new Date(selectedDiaryPhoto.created_at).toLocaleDateString("es-ES") : ""}
                    {photoMetadata[selectedDiaryPhoto.name]?.location && ` • 📍 ${photoMetadata[selectedDiaryPhoto.name].location}`}
                  </p>
                </div>

                {/* Anécdota Personal */}
                <div className="space-y-2 bg-transparent">
                  <label className="text-[10px] font-bold text-brand-navy/70 uppercase tracking-wider block">
                    ✍️ Tu Anécdota Personal
                  </label>
                  <div className="relative bg-transparent">
                    {showMentionDropdown && filteredMembers.length > 0 && (
                      <div className="absolute bottom-full left-0 mb-2 bg-brand-cream border border-brand-navy/15 rounded-xs p-1.5 shadow-lg flex gap-1.5 z-20 animate-in fade-in slide-in-from-bottom-2 duration-150 flex-wrap">
                        <span className="text-[9px] font-bold text-brand-navy/40 uppercase tracking-wider self-center px-1">
                          Mencionar:
                        </span>
                        {filteredMembers.map((member, idx) => {
                          const isSelected = idx === selectedMentionIndex;
                          return (
                            <button
                              key={member}
                              type="button"
                              onClick={() => insertMention(member)}
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-xs border transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-brand-navy text-brand-cream border-brand-navy shadow-sm"
                                  : "bg-brand-cream text-brand-navy border-brand-navy/15 hover:bg-brand-navy/5"
                              }`}
                            >
                              👤 {member}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <textarea
                      ref={textareaRef}
                      value={editingAnecdote}
                      onChange={handleTextareaChange}
                      onKeyDown={handleTextareaKeyDown}
                      placeholder="¿Quién estaba allí? ¿Qué música sonaba? Escribe aquí tu recuerdo sobre este día para conservarlo..."
                      className="w-full h-40 md:h-72 px-3 py-2 bg-transparent border border-brand-navy/20 focus:border-brand-navy text-base md:text-xs rounded-xs outline-none text-brand-navy font-medium placeholder:text-brand-navy/35 leading-relaxed resize-none scrollbar-thin"
                      maxLength={1000}
                    />
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="pt-4 border-t border-brand-navy/10 flex justify-end gap-3 bg-transparent">
                <button
                  onClick={() => setSelectedDiaryPhoto(null)}
                  className="py-1.5 px-4 border border-brand-navy/20 hover:bg-brand-navy/5 text-brand-navy text-xs font-medium rounded-xs transition-all cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => {
                    const chronicle = photoStories[selectedDiaryPhoto.name]?.chronicle || generateChronicle(selectedDiaryPhoto);
                    handleSaveStory(selectedDiaryPhoto.name, chronicle, editingAnecdote);
                    setSelectedDiaryPhoto(null);
                  }}
                  className="py-1.5 px-4 bg-brand-navy text-brand-cream hover:bg-brand-navy/90 text-xs font-semibold rounded-xs transition-all cursor-pointer"
                >
                  Guardar Recuerdo
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* MODAL DE RECORTE DE ROSTRO (FACE CROPPER) */}
      {croppingPhoto && (
        <FaceCropper
          src={croppingPhoto.url}
          rotation={rotations[croppingPhoto.name] || 0}
          title={selectedPerson ? `Ajustar rostro de ${selectedPerson.name}` : "Ajustar foto de perfil"}
          onClose={() => setCroppingPhoto(null)}
          onCrop={(croppedBase64) => {
            if (selectedPerson) {
              setPersonAvatar(selectedPerson.id, croppedBase64);
            } else {
              setNewPersonCroppedAvatar(croppedBase64);
            }
            setCroppingPhoto(null);
          }}
        />
      )}

    </div>
  );
}
