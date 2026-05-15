# 📖 Guía de instalación — Porra Mundial 2026
### julio097110.github.io/porra-mundial-2026

**Lo que ya tienes listo:**
- ✅ VS Code instalado
- ✅ Git instalado
- ✅ Cuenta en GitHub (`julio097110`)
- ✅ Proyecto Firebase creado (`porra-mundial-2026-ccbda`)
- ✅ API key de football-data.org
- ✅ Email de la porra (`pool2026mundial@gmail.com`)

**Lo que harás en esta guía, en orden:**
1. Instalar Live Server en VS Code
2. Preparar la carpeta del proyecto
3. Instalar extensión Live Server y probar en local
4. Configurar las reglas de seguridad de Firestore
5. Registrarte en EmailJS y configurar los emails
6. Actualizar `email.js` con tus datos de EmailJS
7. Registrarte en cron-job.org
8. Crear el repositorio en GitHub y subir los archivos
9. Activar GitHub Pages
10. Crear el primer usuario administrador
11. Verificar que todo funciona
12. Crear cuentas de jugadores
13. Configurar los enlaces de pago y el bote

---

## Paso 1 — Instalar Live Server en VS Code

Live Server te permite probar la web en tu ordenador como si estuviera publicada en internet.

1. Abre VS Code
2. Pulsa `Ctrl+Shift+X` para abrir el panel de extensiones
3. En el buscador escribe **Live Server**
4. Haz clic en el resultado que pone "Live Server" de **Ritwick Dey**
5. Pulsa el botón azul **"Install"**
6. Espera a que se instale (unos segundos)

Sabrás que está instalado cuando en la barra inferior de VS Code aparezca el texto **"Go Live"**.

---

## Paso 2 — Preparar la carpeta del proyecto

1. Crea una carpeta en tu ordenador llamada `porra-mundial-2026`
   - Puedes crearla donde quieras (por ejemplo en el Escritorio o en Documentos)
2. Descarga todos los archivos que te he generado y colócalos dentro siguiendo exactamente esta estructura:

```
porra-mundial-2026/
├── index.html
├── app.html
├── info.html
├── cron.html
├── css/
│   └── styles.css
├── js/
│   ├── firebase-config.js
│   ├── i18n.js
│   ├── auth.js
│   ├── prediccion.js
│   ├── resultados.js
│   ├── clasificacion.js
│   ├── previsiones.js
│   ├── admin.js
│   ├── email.js
│   └── info.js
├── data/
│   └── partidos.js
├── i18n/
│   ├── es.json
│   └── en.json
├── GUIA_INSTALACION.md
├── TUTORIAL_VSCODE.md
└── CHECKLIST_DEBUG.md
```

> ⚠️ Las carpetas `css/`, `js/`, `data/` e `i18n/` son obligatorias. Si los archivos no están exactamente en esas rutas, la web no funcionará.

---

## Paso 3 — Abrir el proyecto y probar en local

1. Abre VS Code
2. Ve al menú **Archivo → Abrir carpeta**
3. Selecciona la carpeta `porra-mundial-2026`
4. En el panel izquierdo verás todos los archivos del proyecto
5. Haz clic derecho sobre `index.html`
6. Selecciona **"Open with Live Server"**
7. Chrome se abrirá automáticamente en `http://127.0.0.1:5500/index.html`

Si ves la pantalla de login con el diseño verde, Live Server funciona correctamente.

> 💡 **Importante:** Mantén VS Code abierto mientras pruebas la web. Si cierras VS Code, el servidor local se detiene.

---

## Paso 4 — Configurar las reglas de seguridad de Firestore

Estas reglas controlan quién puede leer y escribir datos en la base de datos.

1. Ve a [console.firebase.google.com](https://console.firebase.google.com)
2. Abre tu proyecto `porra-mundial-2026-ccbda`
3. En el menú izquierdo: **Seguridad → Firestore Database**
4. Haz clic en la pestaña **"Reglas"**
5. Borra todo el contenido y pega exactamente esto:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function esAdmin() {
      return request.auth != null &&
        get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.rol == 'admin';
    }
    function esUsuarioLogueado() {
      return request.auth != null;
    }
    function esPropioUsuario(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    match /usuarios/{uid} {
      allow read:  if esUsuarioLogueado();
      allow create: if esAdmin();
      allow update: if esPropioUsuario(uid) || esAdmin();
      allow delete: if esAdmin();
    }
    match /partidos/{id} {
      allow read:  if true;
      allow write: if esAdmin();
    }
    match /resultados/{id} {
      allow read:  if true;
      allow write: if esAdmin();
    }
    match /predicciones/{id} {
      allow read:  if esUsuarioLogueado();
      allow create: if esUsuarioLogueado() &&
        request.resource.data.uid == request.auth.uid;
      allow update: if esUsuarioLogueado() &&
        resource.data.uid == request.auth.uid;
      allow delete: if esAdmin();
    }
    match /predicciones_elim/{id} {
      allow read:  if esUsuarioLogueado();
      allow create: if esUsuarioLogueado() &&
        request.resource.data.uid == request.auth.uid;
      allow update: if esUsuarioLogueado() &&
        resource.data.uid == request.auth.uid;
      allow delete: if esAdmin();
    }
    match /pred_especiales/{uid} {
      allow read:  if esUsuarioLogueado();
      allow write: if esPropioUsuario(uid) || esAdmin();
    }
    match /puntos/{id} {
      allow read:  if esUsuarioLogueado();
      allow write: if esAdmin();
    }
    match /clasificacion/{uid} {
      allow read:  if esUsuarioLogueado();
      allow write: if esAdmin();
    }
    match /config/{id} {
      allow read:  if true;
      allow write: if esAdmin();
    }
    match /email_log/{id} {
      allow read:  if esAdmin();
      allow write: if esUsuarioLogueado();
    }
  }
}
```

6. Haz clic en **"Publicar"**

---

## Paso 5 — Registrarte en EmailJS y crear las plantillas

### 5.1 Crear cuenta

1. Ve a [emailjs.com](https://www.emailjs.com) y haz clic en **"Sign Up Free"**
2. Regístrate con `pool2026mundial@gmail.com`
3. Confirma el email que te llega

### 5.2 Conectar Gmail

1. En el panel de EmailJS ve a **"Email Services"**
2. Haz clic en **"Add New Service"**
3. Selecciona **"Gmail"**
4. Haz clic en **"Connect Account"** y autoriza con `pool2026mundial@gmail.com`
5. En "Service Name" escribe: `porra_mundial`
6. Haz clic en **"Create Service"**
7. **Copia el Service ID** — lo necesitarás en el paso 6

### 5.3 Crear plantilla de predicciones guardadas

1. Ve a **"Email Templates"** → **"Create New Template"**
2. Configura así:

**To Email:** `{{to_email}}`
**Subject:** `✅ {{jugador_nombre}} ha guardado sus predicciones — {{tipo_prediccion}}`

**Body:**
```
Hola Admin,

{{jugador_nombre}} ha guardado sus predicciones de {{tipo_prediccion}}.
Fecha: {{fecha}}
Campos rellenados: {{total_campos}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESUMEN DE PREDICCIONES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{resumen}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Porra Mundial 2026 — Copia de seguridad automática
```

3. Haz clic en **"Save"**
4. **Copia el Template ID**

### 5.4 Crear plantilla de aviso diario

1. Crea otra plantilla nueva
2. Configura así:

**To Email:** `{{to_email}}`
**Subject:** `⚠️ {{total_sin}} jugadores sin predicciones — {{fecha}}`

**Body:**
```
Hola Admin,

Quedan {{dias_restantes}} días para el cierre del plazo.

Jugadores sin rellenar:
{{lista_jugadores}}

Total: {{total_sin}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Porra Mundial 2026
```

3. Haz clic en **"Save"**
4. **Copia el Template ID**

### 5.5 Obtener tu Public Key

1. En EmailJS ve a **"Account"** → **"General"**
2. **Copia tu Public Key**

---

## Paso 6 — Actualizar email.js con tus datos de EmailJS

1. En VS Code abre el archivo `js/email.js`
2. Busca las líneas 28–31 (al principio del archivo)
3. Sustituye los 4 valores marcados con los datos reales que copiaste:

```javascript
// Cambia esto:
const EMAILJS_PUBLIC_KEY     = 'TU_PUBLIC_KEY_AQUI';
const EMAILJS_SERVICE_ID     = 'TU_SERVICE_ID_AQUI';
const EMAILJS_TEMPLATE_PRED  = 'TU_TEMPLATE_PREDICCIONES_AQUI';
const EMAILJS_TEMPLATE_AVISO = 'TU_TEMPLATE_AVISO_AQUI';

// Por esto (con tus datos reales):
const EMAILJS_PUBLIC_KEY     = 'el_public_key_que_copiaste';
const EMAILJS_SERVICE_ID     = 'service_xxxxxxx';
const EMAILJS_TEMPLATE_PRED  = 'template_xxxxxxx';
const EMAILJS_TEMPLATE_AVISO = 'template_yyyyyyy';
```

4. Guarda el archivo con `Ctrl+S`

---

## Paso 7 — Registrarte en cron-job.org

> ⚠️ Crea la cuenta ahora, pero el trabajo cron lo configurarás en el paso 9 una vez que la web esté publicada.

1. Ve a [cron-job.org](https://cron-job.org)
2. Haz clic en **"Sign up"**
3. Regístrate con `pool2026mundial@gmail.com`
4. Confirma el email

---

## Paso 8 — Crear el repositorio en GitHub y subir los archivos

### 8.1 Crear el repositorio

1. Ve a [github.com](https://github.com) e inicia sesión con `julio097110`
2. Haz clic en el botón **"+"** arriba a la derecha → **"New repository"**
3. Configura así:
   - **Repository name:** `porra-mundial-2026`
   - **Visibility:** ● Public
   - **NO** marques ninguna casilla de "Initialize this repository"
4. Haz clic en **"Create repository"**
5. Deja esa pestaña abierta

### 8.2 Subir los archivos desde VS Code

1. En VS Code abre la terminal con `Ctrl+Ñ`
2. Asegúrate de que la terminal muestra la ruta de tu carpeta `porra-mundial-2026`
   - Si no es así, escribe: `cd ruta\a\tu\carpeta\porra-mundial-2026`
3. Escribe estos comandos uno a uno, pulsando Enter tras cada uno:

```bash
git init
git add .
git commit -m "Porra Mundial 2026 - version inicial"
git branch -M main
git remote add origin https://github.com/julio097110/porra-mundial-2026.git
git push -u origin main
```

4. Si te pide usuario y contraseña de GitHub:
   - **Usuario:** `julio097110`
   - **Contraseña:** necesitas un **Personal Access Token** (ver paso 8.3)

### 8.3 Crear un Personal Access Token (si lo pide)

1. En GitHub ve a tu foto de perfil → **Settings**
2. Baja hasta **"Developer settings"** (último del menú izquierdo)
3. **Personal access tokens → Tokens (classic)**
4. Haz clic en **"Generate new token (classic)"**
5. En "Note" escribe: `porra-mundial`
6. En "Expiration" selecciona **"No expiration"**
7. Marca la casilla **"repo"**
8. Haz clic en **"Generate token"**
9. **Copia el token** (empieza por `ghp_...`) — úsalo como contraseña en el paso anterior

> ⚠️ Guarda el token en algún sitio seguro — GitHub no te lo volverá a mostrar.

---

## Paso 9 — Activar GitHub Pages y configurar cron-job.org

### 9.1 Activar GitHub Pages

1. En tu repositorio en GitHub ve a la pestaña **"Settings"**
2. En el menú izquierdo haz clic en **"Pages"**
3. En "Source" selecciona **"Deploy from a branch"**
4. En "Branch" selecciona **"main"** y la carpeta **"/ (root)"**
5. Haz clic en **"Save"**
6. Espera 3-5 minutos y recarga la página
7. Aparecerá: **"Your site is live at https://julio097110.github.io/porra-mundial-2026/"**

### 9.2 Configurar el trabajo cron en cron-job.org

1. Inicia sesión en [cron-job.org](https://cron-job.org)
2. Haz clic en **"CREATE CRONJOB"**
3. Configura así:
   - **Title:** `Porra Mundial 2026 — Aviso diario`
   - **URL:** `https://julio097110.github.io/porra-mundial-2026/cron.html`
   - **Schedule:** selecciona **"Custom"**
   - En el campo personalizado escribe: `0 18 1-11 6 *`
     *(esto significa: a las 18:00 UTC = 20:00 CET, del 1 al 11 de junio)*
4. Haz clic en **"CREATE"**

---

## Paso 10 — Crear el primer usuario administrador

### 10.1 Crear el usuario en Firebase Authentication

1. Ve a [console.firebase.google.com](https://console.firebase.google.com)
2. Abre tu proyecto → **Seguridad → Authentication**
3. Pestaña **"Usuarios"** → **"Añadir usuario"**
4. Introduce:
   - **Email:** `pool2026mundial@gmail.com`
   - **Contraseña:** elige una contraseña segura (mínimo 6 caracteres)
5. Haz clic en **"Añadir usuario"**
6. En la tabla que aparece, copia el **UID** de ese usuario — es una cadena larga tipo `xKj3mN...`

### 10.2 Crear el documento del admin en Firestore

1. **Seguridad → Firestore Database**
2. Haz clic en **"+ Iniciar colección"**
3. **Collection ID:** `usuarios` → **"Siguiente"**
4. **Document ID:** pega el UID que copiaste
5. Añade estos campos uno a uno haciendo clic en **"+ Añadir campo"**:

| Campo | Tipo | Valor |
|-------|------|-------|
| `email` | string | `pool2026mundial@gmail.com` |
| `nombre_visible` | string | `Julio S.` |
| `nombre_visible_lower` | string | `julio s.` |
| `username` | string | `admin` |
| `idioma` | string | `es` |
| `rol` | string | `admin` |
| `pagado` | boolean | `true` |

6. Haz clic en **"Guardar"**

---

## Paso 11 — Verificar que todo funciona

1. Abre Chrome y ve a `https://julio097110.github.io/porra-mundial-2026`
2. Inicia sesión con `pool2026mundial@gmail.com` y tu contraseña
3. Deberías ver las 4 pestañas normales **más** la pestaña ⚙️ Admin

Si funciona, **¡enhorabuena, la web está en marcha!** Ahora sigue la `CHECKLIST_DEBUG.md` para verificar todo en detalle.

Si no funciona, abre la consola del navegador (`F12`) y mira el error rojo — casi siempre indica exactamente qué ha fallado.

---

## Paso 12 — Crear cuentas de jugadores

Una vez logueado como admin:

1. Ve a la pestaña **⚙️ Admin → 👥 Jugadores**
2. Haz clic en **"+ Añadir jugador"**
3. Rellena para cada jugador:
   - **Nombre visible:** cómo aparecerá en la clasificación (único, sin repetir)
   - **Usuario:** para hacer login, sin espacios, en minúsculas (ej: `carlos_m`)
   - **Contraseña:** mínimo 6 caracteres
   - **Email:** puede ser cualquiera (ej: `carlos@porra.com`)
   - **Idioma:** ES o EN
4. Haz clic en **"Guardar"**

Envía a cada jugador por WhatsApp:

```
⚽ PORRA MUNDIAL 2026 ⚽

Accede en:
https://julio097110.github.io/porra-mundial-2026

Usuario: [el que pusiste]
Contraseña: [la que pusiste]

Fecha límite grupos: 11 junio · 00:00 CET
Fecha límite eliminatorias: 28 junio · 15:00 CET
```

---

## Paso 13 — Configurar los enlaces de pago y el bote

### 13.1 Enlace de Revolut

Tu enlace ya está configurado en el código:
`https://revolut.me/julioz65d?currency=NOK&amount=10000&note=Porra%20mundial`

Si quieres cambiarlo en el futuro:
1. Panel Admin → **💳 Pagos**
2. Pega el nuevo enlace en el campo Revolut
3. Haz clic en **"Guardar configuración de pagos"**

### 13.2 Enlace de Vipps

Tu enlace ya está configurado:
`https://vipps.no/pay/48420588`

Se puede actualizar igual que Revolut desde el panel de admin.

### 13.3 Introducir el bote total

Cuando hayas recaudado el dinero de todos los jugadores:

1. Panel Admin → **💳 Pagos**
2. En "Bote total recaudado" introduce el importe en NOK (ej: `2300`)
3. Verás automáticamente el desglose: 🥇 1.495 NOK · 🥈 575 NOK · 🥉 230 NOK
4. Haz clic en **"Guardar bote"**
5. La clasificación mostrará inmediatamente los premios junto a los puestos

### 13.4 Cerrar inscripciones cuando la porra esté llena

1. Panel Admin → **💳 Pagos**
2. Activa el toggle **"Porra llena — cerrar inscripciones"**
3. Haz clic en **"Guardar configuración de pagos"**
4. Los botones de Revolut y Vipps desaparecerán de la página pública

---

## Cómo actualizar la web después de un cambio

Cada vez que modifiques cualquier archivo (por ejemplo para corregir un error), sube los cambios así desde la terminal de VS Code (`Ctrl+Ñ`):

```bash
git add .
git commit -m "descripcion breve del cambio"
git push
```

La web en GitHub Pages se actualiza automáticamente en 1-2 minutos.

---

## Resumen de datos importantes

```
Web:             https://julio097110.github.io/porra-mundial-2026
Firebase:        porra-mundial-2026-ccbda
Admin email:     pool2026mundial@gmail.com
football-data:   28872f0758074a58859f45fb56bd712b
Revolut:         https://revolut.me/julioz65d?currency=NOK&amount=10000&note=Porra%20mundial
Vipps:           https://vipps.no/pay/48420588
Inscripción:     100 NOK · reparto 65% / 25% / 10%
```

---

## Si algo falla — dónde mirar

| Síntoma | Dónde mirar |
|---------|-------------|
| Pantalla en blanco | `F12` → Console → error rojo |
| No puedo hacer login | Firebase Console → Authentication → el usuario existe? |
| Error de permisos | Firestore → Reglas → están publicadas? |
| Índice necesario | El error rojo en consola tiene un enlace azul → haz clic |
| Emails no llegan | EmailJS → Email Logs → hay errores? |
| Web no se actualiza | Espera 2 min tras el `git push` → recarga con `Ctrl+F5` |

---

*Guía de instalación — Porra Mundial 2026 · Windows · mayo 2026*
