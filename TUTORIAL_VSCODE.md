# 🛠️ Tutorial VS Code — Porra Mundial 2026

Guía paso a paso para usar VS Code: probar la web en local y trabajar con la checklist de debugging.

---

## Parte 1 — Abrir el proyecto

Lo primero que tienes que hacer cada vez que vayas a trabajar en la web es abrir la carpeta del proyecto en VS Code. Esto es importante porque VS Code necesita saber cuál es la "raíz" de tu proyecto para que Live Server funcione correctamente y los archivos se encuentren entre sí.

**Cómo hacerlo:**

1. Abre VS Code.
2. Ve al menú **Archivo → Abrir carpeta** (en Mac: **File → Open Folder**).
3. Navega hasta donde tienes guardada la carpeta `porra-mundial-2026` y selecciónala.
4. Verás que en el panel izquierdo aparece toda la estructura de archivos del proyecto.

> 💡 **Truco:** Si ya tienes la carpeta visible en el Explorador de Windows o el Finder de Mac, puedes arrastrarla directamente sobre el icono de VS Code y se abrirá automáticamente.

---

## Parte 2 — Lanzar la web en local con Live Server

Live Server crea un servidor web temporal en tu ordenador para que la web funcione exactamente igual que si estuviera publicada en internet, incluyendo la conexión con Firebase.

**Cómo lanzarlo:**

1. En el panel izquierdo de VS Code, localiza el archivo `index.html`.
2. Haz clic derecho sobre él.
3. Selecciona **"Open with Live Server"**.
4. Chrome se abrirá automáticamente con la dirección `http://127.0.0.1:5500/index.html`.

Si en algún momento la web no se abre automáticamente, también puedes hacerlo manualmente: fíjate en la parte inferior de VS Code, verás un botón que pone **"Go Live"** — haz clic ahí y luego abre Chrome con la dirección de arriba.

**Lo que ocurre cuando guardas un archivo:** Live Server detecta el cambio automáticamente y recarga la web en Chrome en menos de un segundo. Esto significa que si editas algo en `styles.css` o en cualquier archivo JS, verás el resultado al instante sin necesidad de recargar manualmente.

**Para detener Live Server:** Haz clic en el botón de la barra inferior que ahora pone el puerto (algo como `Port: 5500`) o cierra VS Code.

---

## Parte 3 — Abrir la consola del navegador (imprescindible para el debugging)

La consola del navegador es tu herramienta más importante para encontrar errores. Cuando algo no funciona, aquí aparece el mensaje explicando exactamente qué ha fallado y en qué línea.

**Cómo abrirla:**

- **Windows:** pulsa `F12` o `Ctrl + Shift + J`
- **Mac:** pulsa `Cmd + Option + J`

Se abrirá un panel en el lateral o en la parte inferior del navegador. Asegúrate de estar en la pestaña **"Console"**.

Los mensajes de error aparecen en **rojo**. Los mensajes informativos aparecen en gris o negro. Cuando un error viene de Firebase (por ejemplo, un índice que falta), aparecerá un enlace azul clickable dentro del mensaje rojo — ese enlace te lleva directamente a Firebase para solucionarlo.

> 💡 **Consejo:** Mantén la consola abierta mientras haces el debugging. Es como el salpicadero de un coche — te dice qué está pasando en todo momento.

---

## Parte 4 — Navegar entre páginas de la web en local

Tu web tiene tres páginas HTML: `index.html` (login), `app.html` (la app principal) y `info.html` (página pública). Para acceder a cada una desde el navegador:

- Login: `http://127.0.0.1:5500/index.html`
- App principal: `http://127.0.0.1:5500/app.html`
- Info pública: `http://127.0.0.1:5500/info.html`

Normalmente no necesitarás escribir estas URLs manualmente porque la web redirige automáticamente — si haces login correctamente desde `index.html`, pasarás a `app.html` sola.

---

## Parte 5 — Usar la Checklist de Debugging en Markdown

El archivo `CHECKLIST_DEBUG.md` es un documento de texto con formato especial. VS Code puede mostrarlo de dos formas distintas y tú vas a querer usar **ambas a la vez**.

### Vista dividida: editor + previsualización

Esta es la forma más cómoda de trabajar con la checklist. Tendrás a la izquierda el texto plano (donde marcas los checkboxes) y a la derecha la versión formateada con el aspecto visual.

**Cómo activarla:**

1. En el panel izquierdo de VS Code, haz clic sobre `CHECKLIST_DEBUG.md` para abrirlo.
2. Verás el archivo en modo texto. En la esquina superior derecha del editor verás un icono que parece una hoja con una lupa — haz clic en él. También puedes pulsar `Ctrl+Shift+V` (Windows) o `Cmd+Shift+V` (Mac).
3. Se abrirá la previsualización. Para ver ambas cosas a la vez, haz clic derecho sobre la pestaña del archivo y selecciona **"Split Right"** — aparecerán una al lado de la otra.

### Cómo marcar un punto como completado

En el archivo de texto (lado izquierdo), los checkboxes sin marcar tienen este aspecto:

```
- [ ] Verificar que index.html carga sin errores
```

Para marcarlo como completado, simplemente cambia el espacio dentro de los corchetes por una `x`:

```
- [x] Verificar que index.html carga sin errores
```

En la previsualización (lado derecho) verás que el checkbox aparece marcado visualmente. Para guardar el cambio pulsa `Ctrl+S` (Windows) o `Cmd+S` (Mac).

> 💡 **Consejo:** Si quieres hacer los checkboxes clickables directamente en la previsualización (sin editar el texto), instala la extensión **"Markdown Checkboxes"** de VS Code — búscala igual que buscaste Live Server.

---

## Parte 6 — Abrir la terminal integrada de VS Code

La terminal es donde escribirás los comandos de Git cuando quieras subir cambios a GitHub. No necesitas abrir ningún programa externo — VS Code la tiene integrada.

**Cómo abrirla:**

- **Windows:** `Ctrl + Ñ` o menú **Terminal → New Terminal**
- **Mac:** `` Ctrl + ` `` o menú **Terminal → New Terminal**

Aparecerá un panel en la parte inferior de VS Code. Verás que ya está situada automáticamente dentro de tu carpeta de proyecto — no necesitas navegar a ningún sitio.

Los tres comandos que usarás más frecuentemente son:

```bash
# Preparar todos los archivos modificados para subir
git add .

# Crear un "punto de guardado" con una descripción
git commit -m "descripción de lo que has cambiado"

# Subir los cambios a GitHub (y actualizar la web automáticamente)
git push
```

---

## Resumen del flujo de trabajo diario

Cada vez que vayas a trabajar en el proyecto, el orden natural es:

Primero abrirás VS Code y cargarás la carpeta del proyecto. Después lanzarás Live Server haciendo clic derecho sobre `index.html`. Abrirás Chrome con la consola visible (`F12`). Si vas a hacer debugging, abrirás también la checklist en vista dividida. Trabajarás, harás cambios, verificarás que funcionan. Y cuando termines, si quieres que los cambios se publiquen en la web real, irás a la terminal y ejecutarás los tres comandos de Git.

---

*Tutorial para Porra Mundial 2026 · VS Code + Live Server + Git*
