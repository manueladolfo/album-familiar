<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
# Reglas de Comportamiento del Proyecto

## Manejo y Notificación Obligatoria de Errores de Base de Datos / Supabase
- **Captura obligatoria**: Cada vez que se realicen operaciones asíncronas con la base de datos o almacenamiento de Supabase (inserciones, actualizaciones, lecturas críticas o eliminaciones), es obligatorio comprobar el objeto `{ error }` devuelto por Supabase o envolver la llamada en un bloque `try-catch`.
- **Propagación**: Las funciones auxiliares de conexión (p. ej. en `lib/supabase.ts`) deben lanzar la excepción (`throw error;`) en lugar de consumirla en un `console.error` local silencioso, para que el llamador esté al corriente del fallo.
- **Interfaz (Banner/Toast de Error)**: El error capturado debe presentarse de inmediato al usuario a través de un banner o Toast flotante premium en la parte superior o inferior de la pantalla (tanto en escritorio como en móvil y tablet). El banner debe detallar que la operación no pudo realizarse y especificar el tipo/mensaje del error.
- **Ámbito**: Esta norma rige para todas las implementaciones presentes y futuras en este repositorio.
