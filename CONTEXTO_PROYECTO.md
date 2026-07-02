# 🌍 CONTEXTO PROYECTO — Porra Mundial 2026
> Léeme al inicio de cada nueva conversación para tener el contexto completo.
> Última actualización: 2 julio 2026

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
| Emails | EmailJS (configurado y funcionando) |
| Cron | cron-job.org (aviso diario jugadores sin predicciones) |

**No se usa React, Vue, npm ni ningún bundler.** Todo son módulos ES6 nativos con `import/export`.

> ⚠️ La integración con `football-data.org` fue descartada definitivamente por problemas CORS en GitHub Pages. Los resultados se confirman siempre de forma manual desde el panel admin. No reimplementar.

> ⚠️ Twemoji fue descartado definitivamente porque rompía la página en producción. `window.parseTwemoji(el)` sigue definida como función vacía para que los módulos no fallen. No reimplementar.

---

## 3. CREDENCIALES Y DATOS IMPORTANTES

```
Firebase Project:    porra-mundial-2026-ccbda
Firebase Region:     europe-west1
Admin email:         pool2026mundial@gmail.com
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
- Public Key: `o2Rm6h_kSRdn3R4Rj` (en `js/email.js`)

---

## 4. ESTRUCTURA DE ARCHIVOS

```
porra-mundial-2026/
├── index.html              ← Login
├── app.html                ← App principal (shell con las pestañas)
├── info.html                ← Página pública sin login
├── cron.html                ← Ejecutado por cron-job.org para aviso diario
├── css/
│   └── styles.css          ← Todos los estilos
├── js/
│   ├── firebase-config.js  ← Inicialización Firebase
│   ├── i18n.js             ← Sistema de traducciones
│   ├── auth.js              ← Autenticación y gestión de usuarios
│   ├── prediccion.js       ← Pestaña "Mi porra" (módulo más grande)
│   ├── resultados.js       ← Pestaña "Resultados" (fase de grupos)
│   ├── resultados_elim.js  ← Pestaña "Resultados" (eliminatorias) — esquema nuevo (pred_ko/res_ko)
│   ├── puntos-elim.js      ← Módulo compartido: única fuente de verdad del cálculo de puntos de eliminatorias
│   ├── clasificacion.js    ← Pestaña "Clasificación"
│   ├── previsiones.js      ← Pestaña "Ver todas las predicciones" — esquema nuevo (pred_ko/res_ko)
│   ├── admin.js            ← Panel de administración — esquema nuevo (pred_ko/res_ko)
│   ├── email.js            ← Envío de emails via EmailJS — esquema nuevo (pred_ko, IDs elim16_* etc.)
│   ├── info.js              ← Lógica de info.html
│   ├── informe-modal.js    ← Modales de desglose de puntos (jugador y partido) — esquema nuevo
│   └── sugerencias.js      ← Pestaña "Sugerencias" (texto nunca se guarda, solo cuenta envíos)
├── data/
│   ├── partidos.js          ← 72 partidos fase de grupos con fechaUTC correcta (verificada jun 2026)
│   ├── partidos_elim.js    ← 32 partidos R32 CON EQUIPOS HARDCODEADOS + MAPA_DEPENDENCIAS completo
│   ├── resultados-grupos-final.js  ← 72 resultados de grupos HARDCODEADOS (fase cerrada, ver sección 5)
│   └── usuarios-final.js           ← 9 jugadores HARDCODEADOS (lectura, ver sección 5)
└── i18n/
    ├── es.json              ← Todas las cadenas en español
    └── en.json              ← Todas las cadenas en inglés
```

---

## 5. ARQUITECTURA DE LA APP

### Cómo funciona app.html
`app.html` es el shell principal. Carga los módulos JS bajo demanda cuando el usuario cambia de pestaña. Cada módulo se carga una sola vez y se cachea en `window._app.modulosCargados`.

**Sistema de cambio de idioma sin perder estado:**
Cada módulo registra `window._refreshTextos = () => { ... }` después de su primer render. Cuando el usuario pulsa ES/EN, `app.html` llama a `window._refreshTextos()` en lugar de recargar el módulo entero. Esto permite cambiar el idioma sin perder marcadores o grupos seleccionados.

### Esquema del bracket de eliminatorias (vigente desde 30 jun 2026)

**IDs de partidos:**
```
R32   : elim16_1 … elim16_16
R16   : elim8_1  … elim8_8
QF    : elim4_1  … elim4_4
SF    : elim2_1, elim2_2
Final : elimfin
3º/4º : elim34
```

**MAPA_DEPENDENCIAS** (idéntico en `partidos_elim.js`, `prediccion.js`, `resultados_elim.js`):
```
elim8_1  ← elim16_3  vs elim16_4
elim8_2  ← elim16_1  vs elim16_2
elim8_3  ← elim16_9  vs elim16_10
elim8_4  ← elim16_11 vs elim16_12
elim8_5  ← elim16_8  vs elim16_7
elim8_6  ← elim16_6  vs elim16_5
elim8_7  ← elim16_16 vs elim16_15
elim8_8  ← elim16_13 vs elim16_14
elim4_1  ← elim8_1   vs elim8_2
elim4_2  ← elim8_5   vs elim8_6
elim4_3  ← elim8_3   vs elim8_4
elim4_4  ← elim8_7   vs elim8_8
elim2_1  ← elim4_1   vs elim4_2
elim2_2  ← elim4_3   vs elim4_4
elimfin  ← elim2_1   vs elim2_2
elim34   ← elim2_1   vs elim2_2  (perdedores)
```

**Equipos R32:** SIEMPRE hardcodeados en `PARTIDOS_ELIM_R32` (dentro de `data/partidos_elim.js`). Nunca se leen de Firebase — esto fue una decisión deliberada por fiabilidad.

**Campo `ronda` en `res_ko`:** No ha cambiado respecto al esquema viejo. Solo cambió el `partido_id`.
```
IDs de partido          campo ronda
──────────────────────  ───────────
elim16_1 … elim16_16    'r32'
elim8_1  … elim8_8      'r16'
elim4_1  … elim4_4      'qf'
elim2_1, elim2_2        'semi'
elim34                  '3er'
elimfin                 'final'
```

**Mejores terceros clasificados:** hardcodeados en `previsiones.js` y `email.js` (no se leen de Firebase, por fiabilidad):
```
Bosnia y Herzegovina, Suecia, Ecuador, Paraguay, Senegal, Argelia, RD Congo, Ghana
```

### Sin listeners en tiempo real (desde 2 jul 2026)

La app superó la cuota diaria gratuita de lecturas de Firestore. Como parche de emergencia se
quitaron los 3 `onSnapshot` que existían (`clasificacion.js`, `resultados.js`, `resultados_elim.js`).
Ahora cada vista carga los datos una vez al entrar, con un botón manual 🔄 para refrescar
(`window._clRefrescar()` en Clasificación, `window._resRefrescar()` en Resultados — este último
refresca grupos o eliminatorias según la sub-pestaña activa). Cambiar de sub-pestaña en
Resultados → Eliminatorias también refresca automáticamente (`initResultadosElim` vuelve a leer
`res_ko` cada vez que se entra).

**Efecto práctico:** si el admin confirma un resultado o cambia una predicción con otro jugador
mirando la pantalla en ese momento, ese jugador no lo verá hasta pulsar 🔄, cambiar de pestaña,
o recargar la página.

### Lecturas hardcodeadas por cuota de Firestore (desde 2 jul 2026)

Con la fase de grupos cerrada (72/72 confirmados) y una lista de jugadores confirmada como
cerrada (9 jugadores, sin altas/bajas/cambios de pago previstos), se generaron dos snapshots
estáticos a partir de un export real de Firestore, para eliminar las lecturas más frecuentes:

- **`data/resultados-grupos-final.js`** (`RESULTADOS_GRUPOS_FINAL`) — usado en `clasificacion.js`,
  `informe-modal.js`, `resultados.js` (vista de grupos) y `prediccion.js`.
- **`data/usuarios-final.js`** (`USUARIOS_FINAL`) — usado en `clasificacion.js` e `informe-modal.js`.

**Alcance deliberadamente limitado — siguen leyendo Firestore en vivo:**
- `admin.js` y `previsiones.js` — uso exclusivo del admin, poco frecuente, necesitan datos frescos
  para poder editar con seguridad.
- `auth.js` (búsqueda de email por username en el login) e `index.html` (login) — decisión
  explícita de no hardcodear pese a ser la lectura más frecuente de `usuarios`: un fallo aquí
  significa que un jugador no puede entrar.
- `res_ko`, `pred_ko`, `clasificacion`, `predicciones`, `pred_especiales`, `pred_terceros`,
  `config` — sin cambios, todo en vivo.

**⚠️ Caveat operativo (confirmado y aceptado):** la colección `resultados` (grupos) y `usuarios`
en Firestore **no se han tocado ni se borran** — siguen siendo la fuente para escritura/edición.
Pero si alguna vez se corrige un resultado de grupos, o se cambia algo de un jugador vía admin
(pago, nombre, y en particular el badge **`mimimi`**, que si se marca/desmarca desde la sección
"Mimimi" del admin **no se reflejará en el ranking de Clasificación** hasta regenerar el archivo),
hay que avisar para regenerar el archivo estático correspondiente y volver a desplegarlo. La
escritura en Firestore sigue funcionando con normalidad en todos los casos; es solo la lectura
hardcodeada la que queda desactualizada hasta regenerar.

### Colecciones de Firestore
```
usuarios/           { uid, email, nombre_visible, nombre_visible_lower, username,
                      idioma, rol, pagado, creado_en }
predicciones/       { uid, partido_id, local, visitante, timestamp }
pred_ko/            { uid, partido_id, local, visitante, ganador, timestamp }
                    ← COLECCIÓN ACTIVA de predicciones de eliminatorias (esquema nuevo, IDs elim16_*/elim8_*/etc.)
pred_especiales/    { uid, campeon, subcampeon, mvp, goleador, bloqueado,
                      mvp_corregido, goleador_corregido }
pred_terceros/      { uid, equipos: [nombre1, nombre2, ...], timestamp }
resultados/         { partido_id, goles_local, goles_visitante, confirmado,
                      confirmado_por, confirmado_en }
res_ko/             { partido_id, goles_local, goles_visitante, confirmado,
                      equipo_local, equipo_visitante, equipo_que_pasa,
                      hay_prorroga_penales, ronda }
                    ← COLECCIÓN ACTIVA de resultados de eliminatorias (esquema nuevo)
puntos/             { uid, partido_id, puntos, tipo, timestamp }
                    tipos: 'grupo' | 'clasificados' | 'eliminatoria' | 'especial' | 'terceros'
clasificacion/      { uid, total, actualizado }
config/general      { fecha_limite_grupos, fecha_limite_eliminatorias,
                      fecha_limite_terceros, bote_total, porra_llena,
                      enlace_revolut, enlace_vipps, mensaje_es, mensaje_en,
                      mvp_oficial, goleador_oficial,
                      terceros_confirmados: [nombre1, nombre2, ...] }
config/info_content { mensaje_es, mensaje_en }
email_log/          { tipo, jugador, timestamp, descripcion }
```

**⚠️ Colecciones VIEJAS — ya NO se leen ni se escriben, pero coexisten en Firestore sin borrar:**
```
predicciones_elim/             ← reemplazada por pred_ko. NO BORRAR (datos históricos).
resultados_elim/                ← reemplazada por res_ko. NO BORRAR (datos históricos).
config/bracket_eliminatorias    ← ya no se usa (equipos R32 ahora hardcodeados). NO BORRAR.
```

### Reglas de Firestore (versión actual)
```js
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
    match /login_lookup/{uid} {
      allow read:  if true;
      allow write: if esAdmin();
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
    match /resultados_elim/{id} {
      allow read:  if true;
      allow write: if esAdmin();
    }
    match /res_ko/{id} {
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
    match /pred_ko/{id} {
      allow read:  if esUsuarioLogueado();
      allow create: if esAdmin() || (esUsuarioLogueado() &&
        request.resource.data.uid == request.auth.uid);
      allow update: if esAdmin() || (esUsuarioLogueado() &&
        resource.data.uid == request.auth.uid);
      allow delete: if esAdmin();
    }
    match /pred_especiales/{uid} {
      allow read:  if esUsuarioLogueado();
      allow write: if esPropioUsuario(uid) || esAdmin();
    }
    match /pred_terceros/{uid} {
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
**Nota importante sobre `pred_ko`:** el `create`/`update` permite `esAdmin() || (uid propio)`, porque el admin necesita poder introducir o corregir predicciones en nombre de un jugador (p.ej. para partidos bloqueados, ver sección 9).

---

## 6. FUNCIONALIDADES IMPLEMENTADAS

### Autenticación
- Login con Firebase Auth (email + contraseña)
- El campo de usuario admite el email completo o el nombre de usuario: si no contiene `@`,
  `index.html` busca el email correspondiente en Firestore (`usuarios`, campo `username`) antes
  de autenticar
- El idioma del usuario se guarda en Firestore y se aplica al hacer login

### Pestaña "Mi porra"
Sub-toggle con 4 pestañas: **Fase de grupos · Eliminatorias · Predicciones especiales · Mejores terceros**

**Fase de grupos:**
- Selector de grupos A–L + botón "Ver todos" para ver la clasificación de los 12 grupos a la vez
- Inputs de marcador por partido
- Clasificación calculada en tiempo real según las predicciones del usuario (J/G/E/P/Pts)
- Desempate manual solo cuando dos equipos empatan a puntos Y diferencia de goles Y goles a favor — nunca al meter un empate en un partido individual
- Botones: Guardar predicciones · Borrar mis predicciones de grupos (con confirmación)

**Eliminatorias:**
- Bracket completo y editable desde el principio (1/16 hasta final + 3er/4º puesto), con los IDs y esquema nuevos (`elim16_*` … `elimfin`)
- Equipos del R32 siempre visibles desde el principio (hardcodeados, no dependen de Firebase)
- Ganadores se propagan automáticamente al siguiente cruce como sugerencia (`propagarGanador`)
- Perdedor de cada semifinal se propaga al partido de 3er/4º puesto (`propagarPerdedor`)
- Si hay empate (incluida la final) → selector "¿quién pasa?" aparece automáticamente bajo el marcador
- Badge que muestra si el finalista coincide con la predicción especial
- Botón borrar eliminatorias
- Guarda en `pred_ko/{uid}_{matchId}`
- Si el admin marca al jugador como **rezagado** (sección admin "Rezagados"), puede seguir
  prediciendo aunque el plazo esté cerrado

**Predicciones especiales (3ª sub-pestaña):**
- Campeón (autocompletado 48 equipos) · Subcampeón · MVP (texto libre) · Goleador (texto libre)
- Botón borrar especiales
- Cuando el plazo está cerrado: el usuario ve lo que escribió + aviso si el admin lo corrigió + resultado oficial cuando esté disponible (✅/❌)

**Mejores terceros (4ª sub-pestaña):**
- Selección de 1 equipo por grupo (A–L), máximo 8 en total
- Comportamiento radio-button por grupo (seleccionar uno deselecciona el anterior del mismo grupo)
- Guardado en `pred_terceros/{uid}` → campo `equipos: [...]`
- **Vista plazo cerrado:** muestra cada equipo elegido con ✅ +0,5 pts si ya está confirmado por FIFA, o ⏳ "Resultado oficial pendiente" si aún no. El resumen muestra aciertos sobre confirmados, no sobre el total de 8.
- **Fuente de verdad para confirmados:** `config/general.terceros_confirmados` (array de nombres). No usa los slots del bracket de r32.

### Pestaña "Resultados"
- **Vista jugador:** resultados confirmados agrupados, próximos atenuados
- **Vista admin:** inputs editables + botón Confirmar. Al confirmar calcula puntos de todos los jugadores automáticamente. Botón Borrar resultado (borra resultado + puntos de ese partido + recalcula totales).
- Los resultados se confirman siempre manualmente desde el panel admin.
- Sub-toggle **Fase de grupos / Eliminatorias**: ambas vistas implementadas para jugador y admin. Partidos confirmados muestran marcador real y botón 🔍. Partidos pendientes muestran "— — —".
- **Eliminatorias (`resultados_elim.js`):** lee/escribe en `res_ko`. Si hay empate a 90' aparece cuadro para elegir quién pasa (prórroga/penaltis). Al confirmar la final (`elimfin`) recalcula automáticamente los puntos especiales de campeón/subcampeón.
- **Sin tiempo real desde el 2 jul 2026** (ver sección 5): la vista de grupos lee de
  `data/resultados-grupos-final.js` (hardcodeado, fase cerrada). La vista de eliminatorias sigue
  leyendo Firestore en vivo, pero solo al entrar/cambiar de sub-pestaña o al pulsar 🔄, no con
  `onSnapshot`.

### Pestaña "Clasificación"
- Ranking cargado al entrar, con botón manual 🔄 de refresco (sin tiempo real desde el 2 jul 2026, ver sección 5)
- Tarjeta dorada con bote total y desglose de premios
- **Premios solo entre jugadores que han pagado, con cascada:** si el 1º no ha pagado, el 65% va al siguiente pagador, etc.
- Columna "Premio" en la tabla: importe en NOK para los 3 primeros pagadores, "sin pago" para no pagadores, "—" para el resto
- Criterios de puntuación + reparto al final
- Tu posición siempre visible aunque estés en otra página
- Paginación: 20 jugadores por página
- Contador de partidos jugados: grupos desde el archivo hardcodeado, eliminatorias en vivo desde `res_ko`
- Badge "Mimimimi yo quiero la porra así" junto al nombre si el admin marcó al jugador en la sección "Mimimi" — dato leído del snapshot hardcodeado de `usuarios`, puede quedar desactualizado hasta regenerar el archivo (ver sección 5)

### Pestaña "Ver todas las predicciones"
- Bloqueada hasta el cierre del plazo de grupos
- Tabla comparativa con selector de grupo A–L
- Pestaña Eliminatorias: lee predicciones desde `pred_ko`, muestra fases con IDs nuevos y equipos reales del R32
- Vista de especiales (campeón, subcampeón, MVP, goleador de cada jugador)
- Buscador de jugadores
- El usuario propio destacado en verde
- Si el propio jugador está marcado como **rezagado**, no ve las predicciones del resto todavía
- Si otro jugador está marcado como rezagado, se muestra el motivo en lugar de sus predicciones

### Pestaña "Sugerencias"
- Cualquier jugador puede escribir una sugerencia de texto libre
- El texto **nunca se guarda ni se envía a ningún sitio** — se descarta en el cliente al enviar
- Solo se incrementa el contador `sugerencias` del propio usuario en Firestore (`usuarios/{uid}`), visible para el admin en la sección "Jugadores"

### Panel de Admin (14 secciones en sidebar)
1. **Resumen** — estadísticas + accesos rápidos
2. **Jugadores** — crear/editar/eliminar jugadores, marcar pagos. Badges de 4 tipos de predicciones (Grupos / Esp. / Elim. / Terc.) y contador de sugerencias enviadas (💡)
3. **Ver predicciones** — resumen de predicciones de cada jugador + borrar por tipo con confirmación. Lee `pred_ko` para el contador de eliminatorias.
4. **Fechas límite** — fecha cierre grupos, eliminatorias y mejores terceros
5. **Pagos** — enlaces Revolut/Vipps + toggle "porra llena" + campo bote total con desglose automático
6. **Emails** — log de últimos 20 emails enviados
7. **Página info** — mensaje personalizado ES/EN para la página pública
8. **Especiales** — resultado oficial (MVP + goleador) + corrección ortográfica + recálculo de puntos especiales
9. **Bracket** — dos sub-secciones:
   - **Terceros confirmados por FIFA** (arriba): grid de todos los 48 equipos divididos por grupo (A–L). El admin marca con checkbox los que ya han sido confirmados por la FIFA como mejores terceros. Al pulsar "Guardar y recalcular puntos" → escribe en `config/general.terceros_confirmados` y llama automáticamente a `recalcularPuntosTerceros()`. El recálculo es inmediato y parcial (funciona con 1 a 8 equipos confirmados). Incluye botón "Borrar todos los confirmados" con confirmación.
   - **Asignación de slots R32** (abajo): función heredada del esquema viejo, ya no tiene utilidad real porque los equipos R32 están hardcodeados; sus escrituras en `config/bracket_eliminatorias` ya no las lee nadie. No se ha eliminado del código, pero es inofensiva.
10. **Bloqueados** — flujo de 2 pasos para partidos de eliminatorias jugados antes de que un jugador pudiera predecirlos:
    - **Paso 1:** marcar (checkbox) qué partidos R32 ya se jugaron con el plazo cerrado, se guarda en `config.partidos_bloqueados`.
    - **Paso 2:** introducir manualmente, para cada partido marcado, las predicciones que el jugador afectado envió por otro medio (email). Escribe directamente en `pred_ko/{uid}_{matchId}` gracias al permiso de admin en las reglas de Firestore.
11. **Integridad** — auditoría en dos niveles (ver descripción en sección anterior). Nivel 2 recalcula desde cero leyendo `resultados`/`predicciones` (grupos) y `res_ko`/`pred_ko` (eliminatorias).
12. **Limpiar Elim.** — herramientas de mantenimiento: borrar todas las predicciones de eliminatorias (`pred_ko`) de todos los jugadores (no afecta a grupos/especiales/terceros), o borrar y recalcular los puntos de tipo `eliminatoria` en la colección `puntos`. Pensado para cuando cambian las reglas de puntuación (ver historial #26) y hay que limpiar antes de recalcular.
13. **Rezagados** — marca jugadores que necesitan más tiempo en eliminatorias (`usuarios/{uid}.rezagado_elim = { activo, motivo }`). Mientras estén marcados pueden seguir prediciendo pasado el plazo, pero no ven las predicciones del resto en "Ver todas las predicciones"; el resto ve su motivo en lugar de sus predicciones. Badge ⏳ visible en la lista de "Jugadores".
14. **Mimimi** — marca jugadores como "quejicas" (`usuarios/{uid}.mimimi`, booleano). Muestra un badge junto a su nombre en Clasificación (dato leído del snapshot hardcodeado, ver sección 5).

### Modales de desglose de puntos (`js/informe-modal.js`)
- **🔍 en Clasificación:** junto a los puntos de cada jugador. Abre modal con desglose completo: grupos (partido a partido), eliminatorias (por ronda, leído de `res_ko`/`pred_ko`), especiales (campeón, subcampeón, MVP, goleador — el champion/subcampeón se deduce de `res_ko['elimfin']`) y **mejores terceros** (cada equipo con ✅/⏳ y puntos o "?" según si está confirmado). El total del modal incluye los 0,5 pts de terceros ya confirmados.
- **🔍 en Resultados:** junto al tag "Confirmado" de cada partido (grupos y eliminatorias). Abre modal con tabla de todos los jugadores mostrando su predicción y puntos, ordenados de mayor a menor. Para eliminatorias lee `res_ko`/`pred_ko`.
- Carga datos frescos de Firestore en cada apertura.
- Textos completamente traducidos ES/EN vía sistema i18n (`informe.*`).
- El modal hace scroll internamente (`max-height: 85vh`, `overflow-y: auto` en `.modal-body`).

### Sistema de notificaciones por email (`js/email.js`)
- Al guardar predicciones (grupos, eliminatorias, especiales, terceros) se dispara un email de confirmación al jugador vía EmailJS.
- El email de eliminatorias muestra cada partido con sus equipos reales (R32, leídos de `PARTIDOS_ELIM_R32`) o placeholders descriptivos para rondas posteriores ("Gan. 16_3 vs Gan. 16_4"), agrupados por fase (1/16, 1/8, Cuartos, Semis, 3er/4º, Final), con marcador y "Pasa: [equipo]" si aplica.
- Aviso diario automático a jugadores sin predicciones completas, disparado por cron-job.org sobre `cron.html`.

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
| Equipo que pasa de grupo como 1º o 2º (c/u) | 1 pt |

### Mejores terceros
| Resultado | Puntos |
|-----------|--------|
| Mejor tercero confirmado por FIFA (c/u) | 0,5 pts |

El cálculo se hace en tiempo real: en cuanto el admin confirma un equipo, los jugadores que lo eligieron reciben sus 0,5 pts inmediatamente. No hay que esperar a los 8.

### Eliminatorias (a 90 minutos)
Dos reglas independientes y sumables (vigente desde 1 jul 2026):

| Regla | Condición | Puntos |
|-------|-----------|--------|
| A — Vencedor / quién pasa acertado | El equipo marcado como ganador por el jugador coincide con el equipo que realmente pasó de ronda. Se comprueba siempre, sin importar si los equipos del cruce predicho eran correctos, si hubo empate en 90' o el marcador. | +2 pts |
| B — Equipos + marcador exacto | Equipo local predicho = equipo local real, equipo visitante predicho = equipo visitante real (por posición en el cuadro FIFA), y marcador predicho idéntico al real (90'). | +2 pts |

El total es la suma de ambas (0, 2 o 4 puntos posibles). Ejemplos:
- Marcador exacto + acierta quién pasa → 4 pts (A+B)
- Marcador exacto de un empate, pero falla quién pasa → 2 pts (solo B)
- Acierta quién pasa (aunque el marcador no sea exacto, o incluso si el cruce predicho era erróneo) → 2 pts (solo A)
- Predijo empate sin acertar el marcador exacto ni quién pasa → 0 pts

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

## 9. DECISIONES TÉCNICAS DEFINITIVAS

Estas decisiones están cerradas y no deben reabrirse:

- **Login:** admite email completo o nombre de usuario (búsqueda del email en Firestore si el campo no contiene `@`).
- **Banderas:** los emojis de bandera no se muestran en Windows. No se implementará ninguna solución (Twemoji ya se intentó y rompió la página).
- **Resultados automáticos (API):** descartado. La API `football-data.org` no funciona desde GitHub Pages por CORS. El admin confirma resultados manualmente, flujo que funciona bien y es suficiente para el torneo.
- **Twemoji:** eliminado definitivamente. `window.parseTwemoji(el)` queda como función vacía para compatibilidad.
- **Servicios externos (Vercel, Netlify, APIs de pago):** no se usan. El stack es Firebase + GitHub Pages únicamente.
- **Esquema de eliminatorias:** migrado en jun 2026 a `pred_ko`/`res_ko` con IDs `elim16_*`…`elimfin`. Las colecciones viejas (`predicciones_elim`, `resultados_elim`, `config/bracket_eliminatorias`) NO se borran (datos históricos), pero no se leen ni se escriben en ningún archivo activo.
- **Equipos R32 hardcodeados:** nunca se leen de Firebase, por fiabilidad. Cualquier cambio de emparejamientos requiere editar `data/partidos_elim.js` directamente.
- **Mejores terceros clasificados:** hardcodeados en `previsiones.js` y `email.js` (no en Firebase), por la misma razón de fiabilidad.
- **No hay bloqueo de predicciones a nivel de código** para partidos individuales de eliminatorias ya jugados. La gestión es operativa: el admin cierra el plazo global de eliminatorias, entra las predicciones que falten en nombre de los jugadores afectados (sección "Bloqueados") y vuelve a abrir el plazo. Se decidió así deliberadamente: primero se deja que todos los jugadores entren sus predicciones con el plazo abierto, y solo después el admin revisa y corrige manualmente si detecta algún "tramposillo" que prediga con el resultado ya conocido.
- **Sin listeners en tiempo real (`onSnapshot`):** quitados el 2 jul 2026 por cuota de Firestore agotada. Todas las vistas cargan una vez y se refrescan manualmente (ver sección 5). No reintroducir sin evaluar de nuevo el consumo de lecturas.
- **Resultados de grupos y usuarios hardcodeados:** desde el 2 jul 2026, lectura estática en las vistas más frecuentes (ver sección 5). Cualquier corrección posterior en Firestore requiere avisar para regenerar `data/resultados-grupos-final.js` / `data/usuarios-final.js`. Decisión explícita: `admin.js`, `previsiones.js` y el login (`auth.js`/`index.html`) siguen en vivo.

---

## 10. CÓMO ACTUALIZAR LA WEB

Los archivos se editan **directamente en GitHub desde el navegador** (sin Git Gui ni terminal):

1. Ir al repositorio en https://github.com/julio097110/porra-mundial-2026
2. Navegar hasta el archivo a editar
3. Pulsar el icono del lápiz (✏️ Edit this file)
4. Hacer los cambios
5. Pulsar **Commit changes** (rama `master`)
6. Esperar 1-2 min → `Cmd+Shift+R` (Mac) o `Ctrl+F5` (Windows) en el navegador para ver los cambios

**Cambios que NO requieren tocar código** (se hacen desde el panel admin):
- Añadir/editar jugadores
- Marcar pagos
- Cambiar fechas límite
- Introducir el bote total
- Confirmar resultados
- Introducir MVP oficial y goleador oficial
- Corregir ortografía de MVP/goleador de jugadores
- Marcar terceros confirmados por FIFA (sección Bracket → Terceros confirmados)
- Introducir predicciones bloqueadas en nombre de un jugador (sección "Bloqueados")
- Marcar/desmarcar jugadores como rezagados o mimimi (secciones "Rezagados" / "Mimimi")

**⚠️ Excepción desde el 2 jul 2026:** confirmar/corregir un resultado de **grupos**, o cambiar
cualquier dato de un jugador que se lea desde el snapshot hardcodeado (`pagado`, `mimimi`,
nombre) sí requiere avisar para regenerar `data/resultados-grupos-final.js` /
`data/usuarios-final.js` y volver a desplegarlos — la escritura en Firestore funciona igual,
pero la vista del jugador (y en el caso de grupos, también la del propio admin en esa pestaña)
no se actualiza sola. Ver sección 5.

**Cambios que SÍ requieren tocar Firestore Rules** (Firebase Console, en español está bajo "Seguridad" → Firestore Database → Reglas, no bajo "Compilación"):
- Añadir permisos a una colección nueva
- Cambiar quién puede leer/escribir una colección existente

---

## 11. ESTADO ACTUAL (2 julio 2026)

- ✅ Web publicada y accesible
- ✅ Firebase Auth + Firestore funcionando
- ✅ Admin puede crear jugadores, marcar pagos, confirmar resultados
- ✅ Jugadores reales creados y usando la app (**9 jugadores**, confirmado por export real de Firestore el 2 jul 2026)
- ✅ Panel admin funcionando correctamente (14 secciones)
- ✅ Login con email completo o nombre de usuario + contraseña
- ✅ EmailJS configurado y funcionando (2 plantillas)
- ✅ Bracket de eliminatorias completo: 16+8+4+2+1+1 partidos, esquema nuevo `elim16_*`…`elimfin`
- ✅ Admin puede introducir MVP oficial y goleador oficial del torneo
- ✅ Admin puede corregir ortografía de MVP/goleador sin perder el original
- ✅ Usuario ve su predicción original + aviso de corrección del admin + resultado oficial con ✅/❌
- ✅ Recálculo de puntos especiales con botón separado
- ✅ Confirmación modal antes de guardar fechas límite (admin)
- ✅ Desempates en tabla de grupos: icono ámbar en filas afectadas + aviso mejorado
- ✅ Resultado real de partidos se muestra correctamente en "Mi porra" (goles_local/goles_visitante)
- ✅ Fechas de los 72 partidos de grupos corregidas con fuente oficial FIFA
- ✅ `data/partidos_elim.js` con 32 partidos de eliminatorias, equipos R32 hardcodeados y `fechaUTC` oficial
- ✅ `prediccion.js` muestra hora correcta y equipos reales en el bracket de eliminatorias
- ✅ Sección admin "Integridad": auditoría en dos niveles con detalle de discrepancias por partido
- ✅ Modal de desglose de puntos por jugador (🔍 en clasificación) — grupos, eliminatorias, especiales, terceros
- ✅ Modal de desglose de puntos por partido (🔍 en resultados grupos y eliminatorias)
- ✅ **Terceros confirmados por FIFA**: admin puede marcar equipos uno a uno desde la sección Bracket. Puntos se recalculan automáticamente al guardar. Vista del jugador muestra ✅/⏳ por equipo. Modal de desglose muestra terceros con puntos parciales.
- ✅ **Vista de resultados de eliminatorias completa**: jugador ve partidos confirmados con marcador real, prórroga/penaltis y botón 🔍. Admin puede confirmar, editar y borrar resultados con aviso de dependencias entre rondas.
- ✅ **Migración completa al esquema nuevo de eliminatorias** (`pred_ko`/`res_ko`, IDs `elim16_*`…`elimfin`) en los 8 archivos relevantes: `partidos_elim.js`, `prediccion.js`, `resultados_elim.js`, `admin.js`, `informe-modal.js`, `previsiones.js`, `clasificacion.js`, `email.js`.
- ✅ Reglas de Firestore actualizadas con bloques `pred_ko`/`res_ko`, incluyendo permiso de admin para escribir predicciones en nombre de jugadores.
- ✅ Email de eliminatorias muestra equipos reales/placeholders agrupados por fase, no solo IDs internos.
- ✅ Empate en la final (`elimfin`) gestionado correctamente: aparece selector "¿quién pasa?" tanto en vista jugador como admin.
- ✅ Nueva regla de puntuación de eliminatorias con dos reglas independientes y sumables (Regla A + Regla B), centralizada en `js/puntos-elim.js`
- ✅ Pestaña "Sugerencias" — texto nunca se guarda, solo cuenta envíos por jugador
- ✅ Sección admin "Rezagados" — jugadores con más tiempo para eliminatorias, con bloqueo de visibilidad hasta que confirmen
- ✅ Sección admin "Mimimi" — badge de jugador "quejica" visible en Clasificación
- ✅ Sección admin "Bloqueados" (promovida a sección propia) — flujo de 2 pasos para partidos R32 jugados antes de tiempo
- ✅ Sección admin "Limpiar Elim." — herramientas de mantenimiento para resetear predicciones/puntos de eliminatorias
- ✅ **Parche de emergencia por cuota de Firestore (2 jul 2026):** quitados los 3 `onSnapshot` en tiempo real, sustituidos por carga única + refresco manual (🔄)
- ✅ **Hardcodeo de `resultados` (grupos) y `usuarios`** en las vistas más frecuentes, para reducir lecturas de Firestore (ver sección 5 para alcance y caveats)

---

## 12. NORMAS DE TRABAJO CON CLAUDE

- **Antes de generar cualquier archivo**, Claude presenta el plan completo y espera confirmación explícita del usuario ("adelante", "genéralo" o similar).
- **Leer el archivo en vivo desde GitHub antes de proponer cambios** — nunca asumir que el contenido coincide con una versión anterior. Usar `curl` contra `raw.githubusercontent.com` (más fiable y completo que fetch desde navegador, que trunca archivos grandes).
- **Entregar archivos completos listos para pegar** — nunca diffs ni reemplazos parciales.
- **Validar sintaxis** con `node --input-type=module --check` antes de entregar cualquier archivo JS.
- **2–3 archivos por lote, completos** — Julio prefiere progreso en bloques, no micro-steps.
- **Siempre en 2 idiomas:** cualquier texto nuevo va en `es.json` Y `en.json` en el mismo lote.
- **Mockup antes de UI:** para cambios visuales, mostrar mockup y esperar aprobación.
- Confiar inmediatamente en los reportes de bugs de Julio (observaciones de primera mano) sin pedir verificación adicional ni revisar de nuevo lo ya confirmado.

---

## 13. CONTEXTO DE DESARROLLO

- **Ordenador principal:** Mac (atajo de limpiar caché: `Cmd+Shift+R`, no `Ctrl+F5`)
- **Dispositivo de pruebas habitual:** iPhone, Chrome iOS — sin acceso a DevTools directamente; errores de consola se consiguen conectando el iPhone a un Mac y usando Safari → Desarrollador, o reproduciendo el error en el navegador del Mac
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
- `window.parseTwemoji(el)` definida como función vacía (Twemoji eliminado definitivamente)
- `setDoc` con claves con notación de punto guarda el nombre de campo literal, NO una ruta anidada — usar `updateDoc` cuando se necesite actualizar un campo anidado vía notación de punto
- `Promise.all` en lecturas de Firestore puede anular silenciosamente el estado dependiente si una sola colección falla — usar bloques `try/catch` independientes por colección cuando una puede fallar sin invalidar las demás
- Safari/iOS: forzar `.blur()` en inputs `type="number"` antes de leer su `.value`, o el valor puede no estar actualizado

---

## 15. HISTORIAL DE CAMBIOS

| # | Fecha | Archivo(s) | Descripción |
|---|-------|-----------|-------------|
| 1 | 21 may 2026 | `js/email.js` | EmailJS configurado con claves reales. Service ID `service_emvnra4`, templates `template_fdn1f0v` (predicciones) y `template_f1g7bgv` (aviso diario). Emails funcionando en producción. |
| 2 | 21 may 2026 | `js/prediccion.js` | Bracket de eliminatorias corregido: añadidos los 8 partidos que faltaban en 1/16 (r32_9 a r32_16), 4 en 1/8 (r16_5 a r16_8), 2 en cuartos (qf_3 y qf_4) y la segunda semifinal (sf_2). Canvas ampliado de 920×940px a 1100×1380px. Mapa de dependencias reescrito completo. |
| 3 | 21 may 2026 | `js/prediccion.js` | Corregido bug en 3er y 4º puesto: el ganador de la semifinal aparecía como los dos equipos del partido. Añadida función `propagarPerdedor()` que propaga el equipo eliminado de cada semifinal al partido de 3er puesto. |
| 4 | 21 may 2026 | `js/admin.js` | Corregido bug en sección "Especiales" del panel admin: mostraba `[object Promise]` porque `renderEspecialesAdmin` era `async`. Extraída la carga de datos a nueva función `cargarEspeciales()` (integrada en el `Promise.all` de `initAdmin`). `renderEspecialesAdmin` convertida a función síncrona que usa la variable de módulo `_especiales`. |
| 5 | 28 may 2026 | `js/admin.js`, `i18n/es.json`, `i18n/en.json` | Confirmación modal antes de guardar fechas límite. `_adminGuardarFechas` ahora abre un modal con las fechas que se van a guardar y pide confirmación explícita antes de escribir en Firestore. Nuevas claves i18n: `admin.dates.confirmTitle/Body/Groups/KO/Btn`. |
| 6 | 28 may 2026 | `js/prediccion.js`, `css/styles.css`, `i18n/es.json`, `i18n/en.json` | Desempates más visibles en la tabla de grupos. La tabla añade una 8ª columna con icono ⚠ en ámbar para los equipos afectados por un empate total. Nuevas claves i18n: `myPool.tiebreakNeeded`, `myPool.tiebreakExplain`, `common.and`. |
| 7 | 12 jun 2026 | `js/prediccion.js` | Bug fix: resultado real mostraba "undefined — undefined". Corregido `res.local`/`res.visitante` → `res.goles_local`/`res.goles_visitante`. |
| 8 | 12 jun 2026 | `data/partidos.js` | Bug fix: todas las `fechaUTC` de los 72 partidos de grupos estaban 1 hora adelantadas. Corregidas con fuente oficial FIFA. |
| 9 | 12 jun 2026 | `data/partidos_elim.js` *(nuevo)* | Creado archivo con los 32 partidos de eliminatorias. Solo contiene datos estáticos: `id`, `ronda`, `fechaUTC`, `sede`, `ciudad`, `pais`. Los equipos eran `null` y se leían de Firestore (esto cambió en la migración de jun 2026, ver #19). |
| 10 | 12 jun 2026 | `js/prediccion.js` | Integración de `partidos_elim.js`: `obtenerPartidos16()` y `obtenerPartidosFase()` enriquecen cada partido con `fechaUTC`. `renderBracketMatch()` usa `formatMatchDate(p.fechaUTC)`. |
| 11 | 20 jun 2026 | `js/admin.js`, `i18n/es.json`, `i18n/en.json` | Nueva sección "Integridad" en el panel admin. Auditoría en dos niveles: nivel 1 compara suma de `puntos` vs `total` en `clasificacion`; nivel 2 recalcula desde cero usando `calcularPuntosPartido` y `calcularPuntosPartidoElim`. Tabla con columna de detalle de partidos con discrepancia. Solo lectura. Nuevas claves i18n: `admin.integrity.*`. |
| 12 | 25 jun 2026 | `js/informe-modal.js` *(nuevo)* | Módulo compartido de modales de desglose de puntos. Exporta `abrirModalJugador(uid, nombre)` y `abrirModalPartido(partidoId, esElim)`. Lógica de cálculo propia (calcGrupo, calcElim, calcEspeciales). Mapa estático de los 72 partidos de grupos. Textos traducidos vía i18n (`informe.*`). |
| 13 | 25 jun 2026 | `js/clasificacion.js` | Botón 🔍 junto a los puntos de cada jugador. Llama a `abrirModalJugador`. |
| 14 | 25 jun 2026 | `js/resultados.js` | Botón 🔍 en partidos de grupos confirmados (vista jugador y admin). Llama a `abrirModalPartido`. |
| 15 | 25 jun 2026 | `js/resultados_elim.js` | Botón 🔍 en partidos de eliminatorias confirmados. Llama a `abrirModalPartido`. |
| 16 | 25 jun 2026 | `css/styles.css` | Modal scrollable internamente (`max-height: 85vh`, `overflow-y: auto` en `.modal-body`). |
| 17 | 25 jun 2026 | `i18n/es.json`, `i18n/en.json` | Nueva sección `informe.*` con claves para modales de desglose. |
| 18 | 25 jun 2026 | `js/admin.js`, `js/resultados.js`, `js/prediccion.js`, `js/informe-modal.js`, `i18n/es.json`, `i18n/en.json` | **Terceros confirmados por FIFA.** Nueva sub-sección en Bracket del admin: grid de 48 equipos por grupo con checkboxes. Al guardar → escribe `config/general.terceros_confirmados` y recalcula puntos inmediatamente (funciona con 1–8 equipos, sin bloqueo). `recalcularPuntosTerceros()` en `resultados.js` ahora lee `config/general.terceros_confirmados` en lugar de los slots del bracket. Vista cerrada del jugador en `prediccion.js` lee la misma fuente. Modal de desglose en `informe-modal.js` implementa la sección de terceros (antes era "🚧 Próximamente") con ✅/⏳ por equipo y resumen parcial. Nuevas claves i18n: `admin.bracket.*`, `informe.no_thirds`, `informe.thirds_confirmed_label`, `informe.thirds_pending_label`. |
| 19 | 29-30 jun 2026 | `data/partidos_elim.js`, `js/prediccion.js`, `js/resultados_elim.js`, `js/admin.js`, `js/informe-modal.js`, `js/previsiones.js`, `js/clasificacion.js`, `js/email.js` | **Migración completa del esquema de eliminatorias (Batches 1–4).** Reemplaza el esquema viejo (`predicciones_elim`/`resultados_elim`, IDs `r32_*`/`r16_*`/`qf_*`/`sf_*`/`tp_1`/`final_1`) por el nuevo (`pred_ko`/`res_ko`, IDs `elim16_*`/`elim8_*`/`elim4_*`/`elim2_*`/`elim34`/`elimfin`). Equipos del R32 ahora hardcodeados en `PARTIDOS_ELIM_R32` (antes se leían de Firestore vía `config/bracket_eliminatorias`). `propagarGanador`/`propagarPerdedor` sin cambios de lógica, solo de IDs. `MAPA_DEPENDENCIAS` reescrito completo con los IDs nuevos en los 3 archivos que lo necesitan. Las colecciones viejas se mantienen en Firestore sin borrar (datos históricos), pero ningún archivo activo las lee ni las escribe ya. |
| 20 | 30 jun 2026 | Firestore Rules | Añadidos bloques `res_ko` (lectura pública, escritura solo admin, igual que `resultados_elim`) y `pred_ko` (lectura usuarios logueados, escritura propio uid o admin). El permiso de admin en `pred_ko` fue una corrección posterior: la regla inicial solo permitía `uid == request.auth.uid`, lo que bloqueaba al admin al intentar introducir predicciones en nombre de un jugador (función "Predicciones bloqueadas"). |
| 21 | 30 jun 2026 | `js/previsiones.js` | Corregido bug: la pestaña Eliminatorias en "Ver todas las predicciones" seguía mostrando predicciones del esquema viejo (`predicciones_elim`, IDs `r32_*` con placeholders genéricos de grupo). Reescrita `cargarTodasPrediccionesElim` para leer `pred_ko`; reescrita `obtenerPartidosDeFase` con IDs nuevos y equipos reales de R32; eliminada `cargarBracket()` y `IDS_TERCEROS` dinámico, sustituidos por `TERCEROS_PASARON` hardcodeado (mismos 8 equipos que en `email.js`). |
| 22 | 30 jun 2026 | `js/clasificacion.js` | Cambiada lectura de `resultados_elim` a `res_ko` en el contador de partidos jugados de eliminatorias. |
| 23 | 30 jun 2026 | `js/email.js` | Sección "BRACKET DE ELIMINATORIAS" del email de confirmación reescrita: usa los IDs nuevos agrupados por fase (antes filtraba por prefijo viejo `r32`/`r16`/etc., dejando la sección vacía tras la migración). Ahora muestra el nombre real de cada equipo (R32 desde `PARTIDOS_ELIM_R32`, importado nuevo en este archivo) o un placeholder descriptivo en rondas posteriores ("Gan. 16_3 vs Gan. 16_4"), junto con el marcador predicho y quién pasa en caso de empate. |
| 24 | 1 jul 2026 | `js/puntos-elim.js` *(nuevo)*, `js/resultados_elim.js`, `js/informe-modal.js`, `js/admin.js`, `i18n/es.json`, `i18n/en.json` | **Nueva regla de puntuación + refactorización a módulo único.** Creado `js/puntos-elim.js` como única fuente de verdad del cálculo de puntos de eliminatorias (Opción B). `calcularPuntosPartidoElim` y `equiposCoincidenElim` ahora viven solo ahí; `resultados_elim.js` y `admin.js` las importan directamente desde ese módulo. `informe-modal.js` elimina la función `calcElim` (duplicada y con lógica obsoleta) y también importa desde `puntos-elim.js`. Nueva regla: si los equipos no coinciden pero `pred.ganador === res.equipo_que_pasa` → 2 puntos. También corregido bug: `hayEmpate90 + pred no empate + ganador correcto` devolvía 0, ahora devuelve 2. Nueva clave i18n `informe.winner_correct` mostrada como etiqueta en el modal de desglose cuando el partido vale 2 pts. ⚠️ Tras desplegar, recalcular puntos desde admin para partidos de eliminatorias ya confirmados. |
| 25 | 1 jul 2026 | `js/previsiones.js` | **Código de colores en "Ver todas las predicciones" → Eliminatorias.** Cargados resultados de `res_ko` en nueva variable `_resultadosElim`. Celda de cada partido ahora muestra marcador y flecha (→ equipo) con colores independientes: verde si acertado, rojo si fallado, sin color si pendiente. El marcador es verde solo si los goles de 90' coinciden exactamente (y los equipos coinciden o no están guardados en el documento — caso habitual en 1/16 donde los equipos son fijos). La flecha es verde si `pred.ganador === res.equipo_que_pasa`. `_predElim` ahora también guarda `equipo_local`/`equipo_visitante` para poder comparar en rondas donde los equipos varían por jugador. |
| 26 | 1 jul 2026 | `js/puntos-elim.js`, `js/clasificacion.js`, `i18n/es.json`, `i18n/en.json` | **Rediseño completo de la puntuación de eliminatorias: dos reglas independientes y sumables.** Detectado que la lógica del #24 seguía dando 0 puntos en un escenario no cubierto: partido decidido en 90' (sin empate real) donde el jugador predijo empate pero acertó el equipo que pasaba — el bloque `if (hayEmpate90)` que comprobaba `pred.ganador === res.equipo_que_pasa` solo se ejecutaba cuando el resultado real SÍ era empate, dejando ese caso sin comprobar nunca. Reescrita `calcularPuntosPartidoElim` en `puntos-elim.js` con dos reglas totalmente independientes que se suman: **Regla A** (vencedor/quién pasa acertado, +2 pts, se comprueba siempre sin condiciones) y **Regla B** (equipo local y visitante predichos coinciden por posición con los reales + marcador exacto, +2 pts). Efecto: el caso "empate no exacto + falla quién pasa" baja de 1 a 0 pts (confirmado); el caso "marcador exacto de empate + falla quién pasa" sube de 1 a 2 pts (confirmado). En `clasificacion.js` se elimina la fila de criterios "Empate acertado + quién pasa" (redundante, ya cubierta por la fila de "Ganador / quién pasa acertado", renombrada desde "Ganador acertado (eliminatorias, 90')"), se actualiza "Solo empate acertado" → "Resultado exacto (empate) pero fallas quién pasa" (1→2 pts), y se añade nota aclaratoria bajo Campeón/Subcampeón indicando que se puntúan por la pestaña de Especiales, no por el bracket. Nueva clave i18n `standings.champRunnerUpNote`; eliminadas `standings.criteria.koDrawPass` y `standings.pts.koDrawPass`. ⚠️ Tras desplegar, hay que reconfirmar (editar y volver a guardar, sin cambiar datos) cada partido de eliminatoria ya confirmado desde el panel admin, para que `recalcularPuntosElim` recalcule los puntos guardados con la lógica nueva — no existe un botón de recálculo masivo, es partido por partido. |
| 27 | *fecha no confirmada, anterior al 2 jul 2026* | `js/sugerencias.js` *(nuevo)*, `js/admin.js`, `app.html`, `i18n/es.json`, `i18n/en.json` | **Nueva pestaña "Sugerencias" + secciones admin "Rezagados", "Mimimi" y "Bloqueados" (promovida).** `sugerencias.js`: 6ª pestaña principal, texto nunca se guarda, solo incrementa `usuarios/{uid}.sugerencias`. Admin → "Rezagados": marca jugadores con `usuarios/{uid}.rezagado_elim = {activo, motivo}`; mientras activo, el jugador puede seguir prediciendo pasado el plazo pero no ve las predicciones del resto en `previsiones.js` (y el resto ve su motivo en vez de sus predicciones). Admin → "Mimimi": marca `usuarios/{uid}.mimimi`, muestra badge en Clasificación. Admin → "Bloqueados": la funcionalidad de introducir predicciones en nombre de un jugador (antes sub-sección de "Bracket") pasa a ser sección propia de nivel superior, con flujo explícito de 2 pasos (marcar partidos jugados antes de tiempo → introducir sus predicciones). |
| 28 | *fecha no confirmada, anterior al 2 jul 2026* | `js/admin.js` | **Nueva sección "Limpiar Elim."** Herramientas de mantenimiento: borrar todas las predicciones de eliminatorias (`pred_ko`) de todos los jugadores, o borrar y recalcular los puntos de tipo `eliminatoria` en `puntos`. Pensada para poder limpiar y recalcular después de cambios de reglas de puntuación como el del #26, sin tener que hacerlo partido por partido. |
| 29 | 2 jul 2026 | `js/clasificacion.js`, `js/resultados.js`, `js/resultados_elim.js`, `i18n/es.json`, `i18n/en.json` | **Parche de emergencia: fin de los listeners en tiempo real.** La app superó la cuota diaria gratuita de lecturas de Firestore. Quitados los 3 `onSnapshot` (`clasificacion.js` sobre `clasificacion`, `resultados.js` sobre `resultados`, `resultados_elim.js` sobre `res_ko`). Cada vista ahora carga los datos una vez al entrar. Añadido botón manual 🔄 de refresco en Clasificación (`window._clRefrescar`) y en Resultados (`window._resRefrescar`, refresca grupos o eliminatorias según la sub-pestaña activa). Nueva clave i18n `common.refresh`. Efecto: otros jugadores conectados ya no ven cambios del admin al instante, deben refrescar manualmente o cambiar de pestaña. |
| 30 | 2 jul 2026 | `data/resultados-grupos-final.js` *(nuevo)*, `data/usuarios-final.js` *(nuevo)*, `js/clasificacion.js`, `js/informe-modal.js`, `js/resultados.js`, `js/prediccion.js` | **Hardcodeo de `resultados` (grupos) y `usuarios` para reducir lecturas de Firestore.** Generados 2 snapshots estáticos a partir de un export real de Firestore (72/72 partidos de grupos confirmados, 9 jugadores confirmados como lista cerrada). Usados en las vistas más frecuentes: `clasificacion.js` (ranking y contador de partidos jugados), `informe-modal.js` (desglose de jugador y de partido de grupo), `resultados.js` (vista de grupos), `prediccion.js` (resultado real en "Mi porra"). Decisión explícita de **no** hardcodear `admin.js`, `previsiones.js` ni el login (`auth.js`/`index.html`), para no arriesgar la capacidad de edición del admin ni el acceso de los jugadores. Caveat operativo: cualquier corrección posterior de un resultado de grupos o dato de un jugador (incluido el badge `mimimi`) requiere avisar para regenerar los archivos y redesplegar. |
