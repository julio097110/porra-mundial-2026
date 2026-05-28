# 🌍 CONTEXTO PROYECTO — Porra Mundial 2026
> Léeme al inicio de cada nueva conversación para tener el contexto completo.
> Última actualización: 28 mayo 2026

---

## 1. QUÉ ES ESTE PROYECTO

Una web app de porra (pool de apuestas amistosas) para el Mundial de fútbol 2026. Los jugadores predicen los resultados de los 72 partidos de la fase de grupos y el bracket completo de eliminatorias. El que más puntos acumule gana el bote.

**URL publicada:** https://julio097110.github.io/porra-mundial-2026
**Repositorio:** https://github.com/julio097110/porra-mundial-2026 (rama: `master`, no `main`)

---

## 2. STACK TÉCNICO

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML + CSS + JavaScript puro (sin frameworks) |
| Base de datos | Firebase Firestore |
| Autenticación | Firebase Auth |
| Hosting | GitHub Pages |
| Resultados | football-data.org API (solo funciona en localhost por CORS) |
| Emails | EmailJS (configurado y funcionando) |
| Cron | cron-job.org (aviso diario jugadores sin predicciones) |

**No se usa React, Vue, npm ni ningún bundler.** Todo son módulos ES6 nativos con `import/export`.

---

## 3. CREDENCIALES Y DATOS IMPORTANTES

```
Firebase Project:    porra-mundial-2026-ccbda
Firebase Region:     europe-west1
Admin email:         pool2026mundial@gmail.com
football-data API:   28872f0758074a58859f45fb56bd712b
Revolut:             https://revolut.me/julioz65d?currency=NOK&amount=10000&note=Porra%20mundial
Vipps:               https://vipps.no/pay/48420588
Inscripción:         100 NOK por jugador
Reparto premios:     1º 65% · 2º 25% · 3º 10%
GitHub user:         julio097110
```

**Firebase config (en js/firebase-config.js):**
```javascript
apiKey:            "AIzaSyDhIXY8tOLKxKpuXdkSNqZf3Fxaexw3d4c"
authDomain:        "porra-mundial-2026-ccbda.firebaseapp.com"
projectId:         "porra-mundial-2026-ccbda"
messagingSenderId: "339309866625"
appId:             "1:339309866625:web:499f0edb4f1b3405d2e780"
```

**EmailJS — CONFIGURADO Y FUNCIONANDO:**
Cuenta registrada con `pool2026mundial@gmail.com` en emailjs.com.
- Service ID: `service_emvnra4`
- Template predicciones guardadas: `template_fdn1f0v`
- Template aviso diario: `template_f1g7bgv`
- Public Key: en `js/email.js`

---

## 4. ESTRUCTURA DE ARCHIVOS

```
porra-mundial-2026/
├── index.html              ← Login
├── app.html                ← App principal (shell con las pestañas)
├── info.html               ← Página pública sin login
├── cron.html               ← Ejecutado por cron-job.org para aviso diario
├── css/
│   └── styles.css          ← Todos los estilos
├── js/
│   ├── firebase-config.js  ← Inicialización Firebase
│   ├── i18n.js             ← Sistema de traducciones
│   ├── auth.js             ← Autenticación y gestión de usuarios
│   ├── prediccion.js       ← Pestaña "Mi porra" (módulo más grande)
│   ├── resultados.js       ← Pestaña "Resultados"
│   ├── clasificacion.js    ← Pestaña "Clasificación"
│   ├── previsiones.js      ← Pestaña "Ver todas las predicciones"
│   ├── admin.js            ← Panel de administración
│   ├── email.js            ← Envío de emails via EmailJS
│   └── info.js             ← Lógica de info.html
├── data/
│   └── partidos.js         ← 72 partidos hardcodeados con fechas UTC
└── i18n/
    ├── es.json             ← Todas las cadenas en español
    └── en.json             ← Todas las cadenas en inglés
```

---

## 5. ARQUITECTURA DE LA APP

### Cómo funciona app.html
`app.html` es el shell principal. Carga los módulos JS bajo demanda cuando el usuario cambia de pestaña. Cada módulo se carga una sola vez y se cachea en `window._app.modulosCargados`.

**Sistema de cambio de idioma sin perder estado:**
Cada módulo registra `window._refreshTextos = () => { ... }` después de su primer render. Cuando el usuario pulsa ES/EN, `app.html` llama a `window._refreshTextos()` en lugar de recargar el módulo entero. Esto permite cambiar el idioma sin perder marcadores o grupos seleccionados.

### Colecciones de Firestore
```
usuarios/           { uid, email, nombre_visible, nombre_visible_lower, username,
                      idioma, rol, pagado, creado_en }
predicciones/       { uid, partido_id, local, visitante, timestamp }
predicciones_elim/  { uid, partido_id, local, visitante, ganador, timestamp }
pred_especiales/    { uid, campeon, subcampeon, mvp, goleador, bloqueado,
                      mvp_corregido, goleador_corregido }
resultados/         { partido_id, goles_local, goles_visitante, confirmado,
                      confirmado_por, confirmado_en }
puntos/             { uid, partido_id, puntos, tipo, timestamp }
clasificacion/      { uid, total, actualizado }
config/general      { fecha_limite_grupos, fecha_limite_eliminatorias,
                      bote_total, porra_llena, enlace_revolut, enlace_vipps,
                      mensaje_es, mensaje_en, mvp_oficial, goleador_oficial }
config/bracket_eliminatorias  { cruces de 1/16 a final con equipos reales }
email_log/          { tipo, jugador, timestamp, descripcion }
```

### Reglas de Firestore (versión actual)
- `usuarios` — lectura solo autenticados, escritura solo admin
- `predicciones`, `predicciones_elim`, `pred_especiales` — cada usuario lee/escribe las suyas
- `resultados`, `config` — lectura pública, escritura solo admin
- `puntos`, `clasificacion` — lectura autenticados, escritura solo admin
- `email_log` — lectura solo admin, escritura autenticados

---

## 6. FUNCIONALIDADES IMPLEMENTADAS

### Autenticación
- Login con email + contraseña (Firebase Auth)
- El campo "usuario" en el login acepta el email directamente. Si no tiene `@`, busca en Firestore por campo `username` para obtener el email y hacer login.
- ⚠️ **IMPORTANTE:** La búsqueda por username falla en producción con el error `Missing or insufficient permissions` porque ocurre antes de autenticarse y las reglas de Firestore no permiten leer `usuarios` sin auth. **Este bug está pendiente de resolver.** Por ahora los jugadores deben entrar con su email completo.
- El idioma del usuario se guarda en Firestore y se aplica al hacer login

### Pestaña "Mi porra"
Sub-toggle con 3 pestañas: **Fase de grupos · Eliminatorias · Predicciones especiales**

**Fase de grupos:**
- Selector de grupos A–L + botón "Ver todos" para ver la clasificación de los 12 grupos a la vez
- Inputs de marcador por partido
- Clasificación calculada en tiempo real según las predicciones del usuario (J/G/E/P/Pts)
- Desempate manual solo cuando dos equipos empatan a puntos Y diferencia de goles Y goles a favor — nunca al meter un empate en un partido individual
- Botones: Guardar predicciones · Borrar mis predicciones de grupos (con confirmación)

**Eliminatorias:**
- Bracket completo y editable desde el principio (1/16 hasta final + 3er/4º puesto)
- Ganadores se propagan automáticamente al siguiente cruce como sugerencia
- Si hay empate → selector de quién pasa en prórroga/penaltis
- Badge que muestra si el finalista coincide con la predicción especial
- Botón borrar eliminatorias

**Predicciones especiales (3ª sub-pestaña):**
- Campeón (autocompletado 48 equipos) · Subcampeón · MVP (texto libre) · Goleador (texto libre)
- Botón borrar especiales
- Cuando el plazo está cerrado: el usuario ve lo que escribió + aviso si el admin lo corrigió + resultado oficial cuando esté disponible (✅/❌)

### Pestaña "Resultados"
- **Vista jugador:** resultados confirmados agrupados, próximos atenuados
- **Vista admin:** inputs editables + botón Confirmar. Al confirmar calcula puntos de todos los jugadores automáticamente. Botón Borrar resultado (borra resultado + puntos de ese partido + recalcula totales).
- ⚠️ La API de football-data.org solo funciona desde localhost (CORS). En producción los resultados se confirman manualmente.

### Pestaña "Clasificación"
- Ranking en tiempo real (onSnapshot)
- Tarjeta dorada con bote total y desglose de premios
- **Premios solo entre jugadores que han pagado, con cascada:** si el 1º no ha pagado, el 65% va al siguiente pagador, etc.
- Columna "Premio" en la tabla: importe en NOK para los 3 primeros pagadores, "sin pago" para no pagadores, "—" para el resto
- Criterios de puntuación + reparto al final
- Tu posición siempre visible aunque estés en otra página
- Paginación: 20 jugadores por página
- Tabla usa **flexbox** (no grid) para garantizar que nombre y puntos siempre van en la misma línea en móvil y escritorio

### Pestaña "Ver todas las predicciones"
- Bloqueada hasta el cierre del plazo de grupos
- Tabla comparativa con selector de grupo A–L
- Vista de especiales (campeón, subcampeón, MVP, goleador de cada jugador)
- Buscador de jugadores
- El usuario propio destacado en verde

### Panel de Admin (8 secciones)
1. **Resumen** — estadísticas + accesos rápidos
2. **Jugadores** — crear/editar/eliminar jugadores, marcar pagos
3. **Ver predicciones** — resumen de predicciones de cada jugador + borrar por tipo con confirmación
4. **Fechas límite** — fecha cierre grupos y eliminatorias
5. **Pagos** — enlaces Revolut/Vipps + toggle "porra llena" + campo bote total con desglose automático
6. **Emails** — log de últimos 20 emails enviados
7. **Página info** — mensaje personalizado ES/EN para la página pública
8. **Especiales** — dos bloques:
   - **Resultado oficial:** el admin introduce el MVP real y el goleador real del torneo y los guarda en `config/general`. Botón separado "Recalcular puntos especiales" que recorre todas las `pred_especiales`, compara usando el campo corregido si existe (si no el original), y puntúa con 3 pts si coincide (normalizado: sin acentos, minúsculas).
   - **Corrección ortográfica:** tabla con el nombre original del usuario y un campo para introducir la corrección. Escribe en `mvp_corregido`/`goleador_corregido` sin tocar `mvp`/`goleador` original.

### Página info.html (pública, sin login)
- Bilingüe ES/EN independiente del login
- Carga dinámica: número de jugadores, bote total, reparto de premios, botones de pago, mensaje del admin
- Si `porra_llena = true` → oculta botones de pago y muestra aviso

---

## 7. SISTEMA DE PUNTUACIÓN

### Fase de grupos
| Resultado | Puntos |
|-----------|--------|
| Ganador o empate acertado | 1 pt |
| Resultado exacto | 3 pts |
| Equipo que pasa de grupo (c/u) | 1 pt |
| Empate a puntos acertado en tabla (c/u) | 1 pt |

### Eliminatorias (a 90 minutos)
| Resultado | Puntos |
|-----------|--------|
| Ganador acertado | 2 pts |
| Resultado exacto (90') | 4 pts |
| Empate acertado + quién pasa | 2 pts |
| Solo empate acertado | 1 pt |

### Predicciones especiales
| Predicción | Puntos |
|-----------|--------|
| Campeón del mundial | 6 pts |
| Segundo clasificado | 2 pts |
| MVP | 3 pts |
| Máximo goleador | 3 pts |

---

## 8. DISEÑO Y CSS

- **Paleta:** verde campo de fútbol
- Variables CSS principales: `--gd` (verde oscuro), `--gl` (verde claro), `--tm` (texto medio), `--ts` (texto suave), `--r` (rojo error), `--radius` (border-radius)
- Diseño responsive: mobile-first
- Sin frameworks CSS — todo custom en `css/styles.css`

---

## 9. BUGS CONOCIDOS (pendientes)

- **Login por username** — falla en producción con `Missing or insufficient permissions`. Por ahora los jugadores entran con email completo. Se intentó implementar login por username pero se revirtió. No se considera un bug urgente.
- **Banderas no se ven en Windows** — emojis Unicode no soportados en Windows. Twemoji se intentó implementar pero se eliminó porque rompía la página en producción. No se va a reintentar.
- **API football-data solo en localhost** — el admin confirma resultados manualmente desde la vista admin. El botón "Actualizar API" está deshabilitado en producción.
- **Índices de Firestore** — se crean bajo demanda al navegar la app y seguir los enlaces de error en la consola del navegador.

### ✅ Bugs resueltos
- Panel admin daba `SyntaxError: Unexpected end of input` — faltaba el cuerpo de `_adminGuardarEsp`
- Twemoji rompía la página — eliminado completamente
- `window.parseTwemoji` sigue definida como función vacía para que los módulos no fallen
- EmailJS configurado con claves reales — emails funcionando
- Bracket de eliminatorias solo mostraba la mitad de partidos — corregido con el bracket completo
- Ganador de semifinal aparecía tanto en la final como en el 3er/4º puesto — corregido propagando el perdedor
- Sección "Especiales" del panel admin mostraba `[object Promise]` — corregido convirtiendo `renderEspecialesAdmin` en función síncrona
- `cargarEspeciales` se ejecutaba en paralelo con `cargarUsuarios` y el nombre de usuario aparecía como `—` — corregido ejecutándola después del `Promise.all`

---

## 10. CÓMO ACTUALIZAR LA WEB

Los archivos se editan **directamente en GitHub desde el navegador** (sin Git Gui ni terminal):

1. Ir al repositorio en https://github.com/julio097110/porra-mundial-2026
2. Navegar hasta el archivo a editar
3. Pulsar el icono del lápiz (✏️ Edit this file)
4. Hacer los cambios
5. Pulsar **Commit changes** (rama `master`)
6. Esperar 1-2 min → `Ctrl+F5` en el navegador para ver los cambios

**Cambios que NO requieren tocar código** (se hacen desde el panel admin):
- Añadir/editar jugadores
- Marcar pagos
- Cambiar fechas límite
- Introducir el bote total
- Confirmar resultados
- Introducir MVP oficial y goleador oficial
- Corregir ortografía de MVP/goleador de jugadores

---

## 11. ESTADO ACTUAL (28 mayo 2026)

- ✅ Web publicada y accesible
- ✅ Firebase Auth + Firestore funcionando
- ✅ Admin puede crear jugadores, marcar pagos, confirmar resultados
- ✅ Jugadores reales creados y usando la app
- ✅ Panel admin funcionando correctamente (8 secciones)
- ✅ Login con email completo + contraseña (decisión de diseño final)
- ✅ EmailJS configurado y funcionando (2 plantillas)
- ✅ Bracket de eliminatorias completo: 16+8+4+2+1+1 partidos
- ✅ Admin puede introducir MVP oficial y goleador oficial del torneo
- ✅ Admin puede corregir ortografía de MVP/goleador sin perder el original
- ✅ Usuario ve su predicción original + aviso de corrección del admin + resultado oficial con ✅/❌
- ✅ Recálculo de puntos especiales con botón separado
- ✅ Confirmación modal antes de guardar fechas límite (admin)
- ✅ Desempates en tabla de grupos: icono ámbar en filas afectadas + aviso mejorado
- ⚠️ Banderas: no se ven en Windows (decisión de no resolver)
- ⚠️ API de resultados: solo funciona desde localhost (el admin confirma manualmente)

---

## 12. NORMAS DE TRABAJO CON CLAUDE

- **Antes de generar cualquier archivo**, Claude presenta el plan completo y espera confirmación explícita del usuario.
- **Para trabajar con el código**, el usuario sube los archivos actuales directamente al chat. El knowledge del proyecto contiene contexto y documentación, no el código fuente actualizado.
- Cuando se pidan cambios en múltiples archivos, Claude los genera todos enteros y listos para subir a GitHub.

---

## 13. CONTEXTO DE DESARROLLO

- **Ordenador:** Windows, teclado noruego
- **Flujo de trabajo:** los archivos se editan directamente en GitHub desde el navegador (sin Git Gui ni terminal)
- **GitHub:** repositorio público, rama `master` (no `main`)
- **Firebase Console:** menú en español — Authentication y Firestore están bajo "Seguridad", no "Compilación"
- **Idioma preferido del admin:** español

---

## 14. CONVENCIONES DE CÓDIGO

- Módulos ES6 nativos con `import/export`
- Cada módulo JS exporta una función `initXxx(app)` como punto de entrada
- El objeto `app` contiene `{ uid, usuario, esAdmin, tabActual, modulosCargados }`
- Los handlers del DOM se registran como `window._nombreHandler` para que el HTML inline pueda llamarlos
- Textos siempre via `t('clave.subclave')` del sistema i18n — nunca hardcodeados en JS
- Fechas siempre en UTC en Firestore, convertidas a hora local del usuario al mostrar
- `window.mostrarToast(msg)` para notificaciones
- `window.appAbrirModal(titulo, body, footer)` para modales de confirmación
- `window.parseTwemoji(el)` definida como función vacía (Twemoji eliminado)

---

## 15. HISTORIAL DE CAMBIOS

| # | Fecha | Archivo(s) | Descripción |
|---|-------|-----------|-------------|
| 1 | 21 may 2026 | `js/email.js` | EmailJS configurado con claves reales. Service ID `service_emvnra4`, templates `template_fdn1f0v` (predicciones) y `template_f1g7bgv` (aviso diario). Emails funcionando en producción. |
| 2 | 21 may 2026 | `js/prediccion.js` | Bracket de eliminatorias corregido: añadidos los 8 partidos que faltaban en 1/16 (r32_9 a r32_16), 4 en 1/8 (r16_5 a r16_8), 2 en cuartos (qf_3 y qf_4) y la segunda semifinal (sf_2). Canvas ampliado de 920×940px a 1100×1380px. Mapa de dependencias reescrito completo. |
| 3 | 21 may 2026 | `js/prediccion.js` | Corregido bug en 3er y 4º puesto: el ganador de la semifinal aparecía como los dos equipos del partido. Añadida función `propagarPerdedor()` que propaga el equipo eliminado de cada semifinal al partido de 3er puesto. |
| 4 | 21 may 2026 | `js/admin.js` | Corregido bug en sección "Especiales" del panel admin: mostraba `[object Promise]` porque `renderEspecialesAdmin` era `async`. Extraída la carga de datos a nueva función `cargarEspeciales()` (integrada en el `Promise.all` de `initAdmin`). `renderEspecialesAdmin` convertida a función síncrona que usa la variable de módulo `_especiales`. |
| 6 | 28 may 2026 | `js/admin.js`, `i18n/es.json`, `i18n/en.json` | Cambio 5: confirmación modal antes de guardar fechas límite. `_adminGuardarFechas` ahora abre un modal con las fechas que se van a guardar y pide confirmación explícita antes de escribir en Firestore. El guardado real ocurre en la nueva función `_adminConfirmarFechas`. Nuevas claves i18n: `admin.dates.confirmTitle/Body/Groups/KO/Btn`. |
| 7 | 28 may 2026 | `js/prediccion.js`, `css/styles.css`, `i18n/es.json`, `i18n/en.json` | Cambio 8: desempates más visibles en la tabla de grupos. La tabla añade una 8ª columna con icono ⚠ en ámbar (`#ba7517`) para los equipos afectados por un empate total. El aviso debajo de la tabla tiene nuevo estilo (borde y fondo ámbar suave) y texto más explicativo usando nuevas claves i18n: `myPool.tiebreakNeeded`, `myPool.tiebreakExplain`, `common.and`. Grid de la tabla actualizado de 7 a 8 columnas en `styles.css`. |
