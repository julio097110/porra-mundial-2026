# 🔄 Guía de actualización — Porra Mundial 2026

Cada vez que necesites cambiar algo en la web, el proceso siempre sigue
el mismo orden: editar el archivo → guardar → subir a GitHub → esperar.

---

## El concepto clave antes de empezar

Piensa en tu proyecto como si tuvieras dos copias del mismo libro. Una copia
está en tu ordenador (la versión "en borrador") y otra está publicada en
GitHub (la versión "en internet"). Cuando editas un archivo en VS Code, solo
estás cambiando el borrador. Para que el cambio aparezca en la web real,
necesitas "publicar" esa nueva versión usando Git.

---

## Paso 1 — Abre el proyecto en VS Code

Abre VS Code y carga la carpeta `porra-mundial-2026` desde
**Archivo → Abrir carpeta**. Si ya la tienes abierta de antes, puedes
saltarte este paso.

---

## Paso 2 — Haz el cambio que necesites

Abre el archivo que quieres modificar desde el panel izquierdo de VS Code
y edítalo. Cuando termines, guarda con `Ctrl+S`.

Para saber qué archivo tocar según lo que quieras cambiar, consulta la
tabla de referencia rápida al final de esta guía.

---

## Paso 3 — Prueba el cambio en local antes de publicarlo

Antes de subir nada a GitHub, es buena práctica comprobar que el cambio
funciona correctamente en tu ordenador.

Haz clic derecho sobre `index.html` en el panel izquierdo → **"Open with
Live Server"**. Chrome se abrirá con la web en local. Navega a la parte
que cambiaste y verifica que todo se ve como esperas.

Si algo no está bien, corrígelo ahora — es mucho más fácil arreglarlo
antes de publicar que después.

---

## Paso 4 — Abre Git Gui

Abre **Git Gui** desde el menú Inicio de Windows (búscalo como "Git Gui").
Cuando se abra, haz clic en **"Open Existing Repository"** y selecciona
tu carpeta `porra-mundial-2026`.

---

## Paso 5 — Prepara los archivos modificados

Dentro de Git Gui verás dos paneles en la parte superior izquierda:
"Unstaged Changes" (cambios sin preparar) y "Staged Changes" (cambios
preparados). Los archivos que has modificado aparecerán en "Unstaged
Changes".

Ve al menú **Stage → Stage All** o pulsa `Ctrl+T` para mover todos los
cambios al panel "Staged Changes". Esto equivale a decirle a Git: "estos
son los archivos que quiero incluir en esta actualización".

Si solo quieres subir un archivo concreto (no todos los que hayas
modificado), puedes hacer clic sobre él individualmente y arrastrarlo, o
hacer clic derecho → "Stage".

---

## Paso 6 — Escribe un mensaje descriptivo

En la caja de texto de abajo (donde pone "Commit Message") escribe una
descripción breve de lo que has cambiado. No tiene que ser perfecta, pero
sí útil para recordar qué hiciste si alguna vez necesitas volver atrás.

Algunos ejemplos de buenos mensajes:

```
Añadido jugador Carlos
Corregido error en el bracket de eliminatorias
Actualizado bote total a 2300 NOK
Cambiado el plazo de grupos al 10 de junio
```

---

## Paso 7 — Haz commit

Haz clic en el botón **"Commit"**. Esto crea un "punto de guardado" en el
historial de tu proyecto con los cambios y el mensaje que escribiste.
Todavía no has subido nada a internet — esto solo registra el cambio
localmente.

---

## Paso 8 — Sube los cambios a GitHub

Ve al menú **Remote → Push**. Aparecerá la ventana de Push que ya
conoces. Asegúrate de que está seleccionada la rama `master` y el remoto
`origin`, y haz clic en **"Push"**.

Si Git te pide credenciales, usa:
- **Usuario:** `julio097110`
- **Contraseña:** tu Personal Access Token (`ghp_...`)

---

## Paso 9 — Espera 1-2 minutos y verifica

Abre Chrome y ve a `https://julio097110.github.io/porra-mundial-2026`.
Si no ves el cambio inmediatamente, espera un minuto y recarga la página
con `Ctrl+F5` (esto fuerza una recarga completa sin usar el caché del
navegador, que a veces muestra la versión antigua).

---

## Tabla de referencia rápida — qué archivo tocar

| Lo que quieres cambiar | Archivo a editar |
|------------------------|-----------------|
| Textos en español (botones, etiquetas, mensajes) | `i18n/es.json` |
| Textos en inglés | `i18n/en.json` |
| Colores, tamaños, diseño visual | `css/styles.css` |
| Claves de EmailJS | `js/email.js` |
| Lógica de predicciones (fase de grupos) | `js/prediccion.js` |
| Lógica de resultados o confirmar marcadores | `js/resultados.js` |
| Lógica de la clasificación | `js/clasificacion.js` |
| Panel de administración | `js/admin.js` |
| Página de login | `index.html` |
| Estructura general de la app (pestañas) | `app.html` |
| Página pública de información | `info.html` y `js/info.js` |
| Lista de partidos y equipos | `data/partidos.js` |

---

## Casos comunes

**Cambiar un texto que se ve en la app** — Abre `i18n/es.json` o
`i18n/en.json`, busca el texto con `Ctrl+F`, cámbialo y guarda. Los
textos están organizados por secciones (`nav`, `myPool`, `standings`,
etc.) para que sean fáciles de encontrar.

**Cambiar el plazo de predicciones** — No necesitas tocar ningún archivo.
Inicia sesión como admin → Panel Admin → Fechas límite → cambia la fecha
y guarda. El cambio se aplica instantáneamente en Firestore sin necesidad
de actualizar la web.

**Añadir un jugador** — Tampoco requiere tocar archivos. Hazlo desde el
Panel Admin → Jugadores → Añadir jugador.

**Cambiar el bote total** — Panel Admin → Pagos → Bote total. Se
actualiza en tiempo real en la clasificación de todos los jugadores.

**Corregir un error visual pequeño** — Edita `css/styles.css` y pruébalo
con Live Server antes de subir.

---

## Si algo sale mal después de subir

Si publicas un cambio y la web deja de funcionar o se ve mal, puedes
volver a la versión anterior así:

1. Abre Git Gui con el repositorio abierto
2. Ve al menú **Repository → Visualize master's History**
3. Verás una lista de todos los commits anteriores. Haz clic derecho
   sobre el último que funcionaba bien → "Reset master branch to here"
4. Elige "Hard" para descartar todos los cambios posteriores
5. Vuelve al paso 8 (Push) para subir la versión anterior a GitHub

---

## Resumen del flujo en 30 segundos

Editar archivo en VS Code → `Ctrl+S` para guardar → probar en Live Server
→ Git Gui → Stage All → escribir mensaje → Commit → Remote → Push →
esperar 1-2 min → `Ctrl+F5` en el navegador.

---

*Guía de actualización — Porra Mundial 2026 · mayo 2026*
