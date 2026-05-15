# 🐛 Checklist de Debugging — Porra Mundial 2026

Sigue esta lista en orden, de arriba a abajo. Cada sección construye sobre la anterior —
si algo falla en la sección 1, no tiene sentido continuar a la sección 2 hasta resolverlo.

**Cómo usar este archivo:** Cambia `[ ]` por `[x]` cuando un punto esté verificado.
Guarda con `Ctrl+S` (Windows) o `Cmd+S` (Mac).

---

## ✅ Sección 1 — Infraestructura base

*Objetivo: confirmar que los archivos se cargan y Firebase responde antes de hacer nada más.*

- [ ] Live Server está activo y Chrome muestra `http://127.0.0.1:5500/index.html`
- [ ] La consola del navegador (F12) está abierta en la pestaña "Console"
- [ ] `index.html` carga sin errores rojos en la consola
- [ ] `info.html` carga sin errores rojos en la consola (`http://127.0.0.1:5500/info.html`)
- [ ] En `info.html` el selector ES/EN cambia todos los textos correctamente
- [ ] En `info.html` el número de jugadores inscritos muestra un número (aunque sea 0 o —)
  > Si muestra `—` con un error de Firestore en la consola, revisa las reglas de seguridad del paso 2.1 de la guía.
- [ ] En `info.html` los botones de Revolut y Vipps aparecen y sus enlaces son correctos
- [ ] No aparece ningún error de tipo `Failed to load module` ni `404` en la consola
  > Si aparece un 404, significa que un archivo JS o JSON no está en la ruta correcta. Revisa la estructura de carpetas.

---

## ✅ Sección 2 — Autenticación y login

*Objetivo: confirmar que el sistema de login funciona completo.*

- [ ] La pantalla de login se ve correctamente con el diseño verde
- [ ] El selector ES/EN en la pantalla de login funciona
- [ ] Al intentar login con credenciales incorrectas aparece el mensaje de error en rojo
- [ ] Al introducir las credenciales del admin y pulsar "Entrar" redirige a `app.html`
  > Si no redirige, abre la consola — probablemente hay un error de Firebase Auth o el documento del usuario no existe en Firestore.
- [ ] En `app.html` aparece el nombre "Julio S." en la cabecera
- [ ] En `app.html` aparece el badge "Admin" junto al nombre
- [ ] Aparecen las 4 pestañas normales **más** la pestaña ⚙️ Admin
- [ ] El botón "Cerrar sesión" funciona y vuelve a `index.html`
- [ ] Si intentas acceder a `app.html` sin estar logueado, redirige automáticamente a `index.html`
- [ ] El selector ES/EN en la cabecera de `app.html` cambia todos los textos de la interfaz

---

## ✅ Sección 3 — Pestaña "Mi porra" (fase de grupos)

*Objetivo: verificar que el módulo de predicciones de grupos funciona completo.*

- [ ] La pestaña "Mi porra" carga sin errores en la consola
- [ ] Aparecen las 4 tarjetas de estadísticas arriba (Jugados, Exactos, Ganador, Pts)
- [ ] Los botones "Fase de grupos" y "Eliminatorias" son visibles
- [ ] El selector de grupo A–L funciona y cambia los partidos mostrados
- [ ] Los partidos del grupo A se muestran correctamente con bandera, nombre, fecha y sede
- [ ] Las fechas de los partidos se muestran en la hora local de tu ordenador
- [ ] Se pueden introducir marcadores en los inputs numéricos
- [ ] Al cambiar un marcador, la tabla de clasificación calculada se actualiza automáticamente
- [ ] La tabla de clasificación muestra los 4 equipos del grupo correctamente ordenados
- [ ] Los dos primeros equipos de la tabla aparecen con fondo verde (clasificados)
- [ ] El selector de desempate solo aparece cuando dos equipos empatan a puntos Y goles (no en empates normales de partido)
- [ ] Al pulsar "Guardar predicciones" aparece el toast "Predicciones guardadas correctamente"
- [ ] Si recargas la página, las predicciones guardadas siguen apareciendo
  > Si no persisten, hay un problema con la escritura en Firestore — revisa la consola.
- [ ] Las predicciones especiales aparecen al final del grupo A
- [ ] El autocompletado de equipos funciona al escribir en el campo "Campeón"
- [ ] Se puede escribir libremente en los campos MVP y Goleador
- [ ] Al pulsar "Guardar predicciones especiales" se guarda correctamente

---

## ✅ Sección 4 — Pestaña "Mi porra" (eliminatorias)

*Objetivo: verificar que el bracket funciona y los ganadores se propagan.*

- [ ] Al pulsar "Eliminatorias" se muestra el bracket horizontal
- [ ] El bracket es desplazable horizontalmente
- [ ] Se ven las 6 columnas: 1/16, 1/8, Cuartos, Semis, Final y el partido por el 3er puesto
- [ ] Los conectores SVG entre columnas están bien dibujados (una línea por partido)
- [ ] Los placeholders "1º Grupo A", "Gan. 1/16 P1", etc. son visibles en los cruces sin confirmar
- [ ] Se pueden introducir marcadores en los partidos de 1/16
- [ ] Al introducir un resultado no empate, el input del ganador del siguiente cruce se pre-rellena automáticamente
- [ ] Al introducir un empate, aparece el selector de quién pasa en prórroga
- [ ] El badge del campeón aparece debajo de la final
- [ ] Si el equipo elegido como finalista coincide con la predicción especial, aparece el texto de confirmación
- [ ] Al pulsar "Guardar predicciones de eliminatorias" funciona correctamente
- [ ] Si recargas, el bracket mantiene los valores guardados

---

## ✅ Sección 5 — Pestaña "Resultados" (vista jugador)

*Objetivo: verificar que los jugadores ven los resultados confirmados.*

- [ ] La pestaña "Resultados" carga sin errores
- [ ] Si no hay resultados confirmados, aparecen los partidos con "Pendiente"
- [ ] Los partidos se agrupan por grupo correctamente

*Para probar con resultados reales, primero confirma uno desde el panel de admin (sección 8) y vuelve aquí.*

- [ ] Los resultados confirmados por el admin aparecen con el marcador correcto
- [ ] Los partidos confirmados tienen el fondo gris neutro (variante 3) y contraste legible
- [ ] Los partidos pendientes aparecen atenuados

---

## ✅ Sección 6 — Pestaña "Resultados" (vista admin)

*Objetivo: verificar que el admin puede confirmar resultados.*

- [ ] La vista del admin muestra los inputs editables en cada partido
- [ ] Los botones "Actualizar API" y "Actualizar equipos clasificados" son visibles
- [ ] Al pulsar "Actualizar API", aparece el toast de "Consultando API..." y luego "Datos actualizados"
  > Si aparece error de API, es posible que el Mundial 2026 aún no haya empezado y no haya datos — es normal.
- [ ] Se pueden editar manualmente los marcadores en los inputs
- [ ] Al pulsar "Confirmar" en un partido, el partido pasa al estado "Confirmado" con fondo gris
- [ ] El botón "Editar" permite volver a modificar un resultado ya confirmado
- [ ] Tras confirmar un resultado, la clasificación se actualiza automáticamente

---

## ✅ Sección 7 — Pestaña "Clasificación"

*Objetivo: verificar el ranking y los premios.*

- [ ] La pestaña "Clasificación" carga y muestra la lista de jugadores
- [ ] Los jugadores están ordenados por puntos de mayor a menor
- [ ] Tu posición (Julio S.) aparece destacada en verde con la etiqueta "tú"
- [ ] El top 3 tiene los emojis 🥇🥈🥉 correctamente
- [ ] La diferencia de puntos respecto al líder es correcta (negativa para todos menos el primero)
- [ ] La paginación funciona si hay más de 20 jugadores
- [ ] Al final de la página aparecen los criterios de puntuación completos
- [ ] Si el admin ha introducido el bote total: aparece la tarjeta dorada arriba con el desglose
- [ ] Los premios en NOK aparecen en la columna derecha de la tabla (🥇 dorado, 🥈 gris, 🥉 bronce)
- [ ] El reparto de premios aparece también al final junto a los criterios

---

## ✅ Sección 8 — Pestaña "Ver todas las predicciones"

*Objetivo: verificar que la pestaña funciona correctamente según el estado del plazo.*

**Antes del cierre del plazo:**
- [ ] La pestaña muestra el aviso de que las predicciones no son visibles hasta el cierre del plazo

**Después del cierre del plazo** *(para simular esto, cambia temporalmente la fecha límite en el panel admin a una fecha pasada)*:
- [ ] La tabla con las predicciones de todos los jugadores es visible
- [ ] El buscador filtra jugadores en tiempo real al escribir
- [ ] El selector de grupo A–L funciona y cambia las columnas de partidos
- [ ] Las predicciones propias (Julio S.) aparecen destacadas en verde
- [ ] Las predicciones exactas aparecen en verde con ✓
- [ ] Las predicciones falladas aparecen en rojo con ✗
- [ ] Las pendientes aparecen sin color
- [ ] El toggle "Fase de grupos / Predicciones especiales" funciona
- [ ] La vista de especiales muestra campeón, subcampeón, MVP y goleador de cada jugador
- [ ] La paginación funciona correctamente

---

## ✅ Sección 9 — Panel de Admin (gestión de jugadores)

*Objetivo: verificar la creación y gestión de usuarios.*

- [ ] La pestaña ⚙️ Admin carga sin errores
- [ ] El menú lateral muestra las 7 secciones correctamente
- [ ] La sección "Resumen" muestra las estadísticas de jugadores, pagos y predicciones
- [ ] El botón "+ Añadir jugador" abre un modal con los campos correctos
- [ ] Se puede crear un jugador de prueba (nombre, usuario, contraseña, email, idioma)
  > Si aparece error "nombre_taken" o "username_taken", el nombre/usuario ya existe.
- [ ] El jugador creado aparece en la tabla de jugadores
- [ ] El checkbox de "Pagado" funciona y se actualiza en tiempo real
- [ ] El botón "Editar" abre el modal con los datos del jugador pre-rellenados
- [ ] El botón "Eliminar" pide confirmación antes de borrar
- [ ] El jugador de prueba creado puede iniciar sesión correctamente
  > Abre una ventana de incógnito para probar el login del jugador sin cerrar tu sesión de admin.

---

## ✅ Sección 10 — Panel de Admin (fechas y pagos)

*Objetivo: verificar la configuración del panel.*

- [ ] La sección "Fechas límite" muestra las dos fechas configuradas correctamente
- [ ] Se puede cambiar una fecha y guardar — el toast de confirmación aparece
- [ ] La sección "Pagos" muestra los enlaces de Revolut y Vipps correctos
- [ ] El toggle "Porra llena" funciona visualmente (cambia de gris a verde)
- [ ] Al activar "Porra llena" y guardar, en `info.html` desaparecen los botones de pago
- [ ] El campo "Bote total" acepta números y guarda correctamente
- [ ] Al introducir un bote (ej: 2300), aparece el desglose automático debajo (1495 / 575 / 230 NOK)
- [ ] En la clasificación aparece la tarjeta dorada con ese bote después de guardarlo
- [ ] La sección "Página info" permite editar el mensaje personalizado en ES y EN
- [ ] Al guardar el mensaje, aparece en `info.html` en la sección correspondiente

---

## ✅ Sección 11 — Panel de Admin (corrección especiales)

*Objetivo: verificar que el admin puede corregir la ortografía de MVP y goleador.*

- [ ] La sección "Predicciones especiales" muestra todos los jugadores con sus predicciones de MVP y goleador
- [ ] Se puede editar el campo MVP de un jugador y guardar
- [ ] El cambio se refleja en la pestaña "Ver todas las predicciones" → vista de especiales
- [ ] Los puntos del jugador no cambian al corregir la ortografía (se verificará cuando haya resultado real)

---

## ✅ Sección 12 — Emails

*Objetivo: verificar que EmailJS está correctamente configurado.*

> Antes de hacer estas pruebas, asegúrate de haber completado el paso 4 de la guía de instalación (EmailJS) y de haber sustituido los 4 placeholders en `email.js`.

- [ ] Los 4 valores de EmailJS están configurados en `js/email.js` (sin ningún `TU_XXX_AQUI`)
- [ ] Al guardar predicciones de grupos, unos segundos después llega un email a `pool2026mundial@gmail.com`
- [ ] El email contiene el resumen de predicciones en el cuerpo (grupo a grupo con marcadores)
- [ ] Al guardar predicciones de eliminatorias, llega otro email con el resumen del bracket
- [ ] Al guardar predicciones especiales, llega el email correspondiente
- [ ] En el panel admin, sección "Emails enviados", aparecen los registros de los emails enviados
- [ ] El log muestra correctamente el nombre del jugador y la fecha/hora

---

## ✅ Sección 13 — Página pública info.html

*Objetivo: verificar la página pública completa.*

- [ ] `info.html` es accesible directamente sin estar logueado
- [ ] El selector ES/EN funciona y cambia todos los textos (incluyendo el nombre de la app)
- [ ] El número de jugadores inscritos es correcto
- [ ] La sección "Cómo funciona" muestra los 4 pasos
- [ ] La tabla de puntuación está completa y correcta
- [ ] Los ejemplos prácticos son correctos
- [ ] La sección de premios muestra el bote introducido por el admin (o `— NOK` si no se ha introducido aún)
- [ ] Las fechas límite son correctas (11 jun y 28 jun)
- [ ] Los botones de Revolut y Vipps llevan a las URLs correctas
- [ ] El mensaje personalizado del admin aparece si se ha introducido uno
- [ ] El botón "Iniciar sesión" lleva a `index.html`
- [ ] Si la porra está marcada como llena, los botones de pago no aparecen

---

## ✅ Sección 14 — Prueba end-to-end completa

*Objetivo: simular el recorrido completo de un jugador desde cero.*

Abre una **ventana de incógnito** en Chrome para hacer esta prueba sin interferir con tu sesión de admin.

- [ ] El jugador accede a `info.html` y puede leer las normas sin necesidad de cuenta
- [ ] El jugador hace login con sus credenciales desde `index.html`
- [ ] Ve las 4 pestañas (sin la pestaña de admin)
- [ ] Rellena las predicciones de todos los partidos del grupo A
- [ ] Guarda y las predicciones persisten al recargar
- [ ] Rellena las predicciones especiales
- [ ] Rellena el bracket de eliminatorias con algunos partidos
- [ ] El jugador puede ver la clasificación con su posición correctamente
- [ ] La pestaña "Ver todas las predicciones" muestra el aviso de "plazo abierto" (o la tabla si el plazo está cerrado)
- [ ] El jugador cambia el idioma a EN y toda la interfaz cambia correctamente
- [ ] El jugador cambia su nombre visible desde... *(esta funcionalidad se añadiría en una versión futura si se quiere)*

---

## ✅ Sección 15 — Publicación en GitHub Pages

*Objetivo: verificar que la web funciona igual en producción que en local.*

- [ ] Los archivos están subidos correctamente a GitHub (`git push` sin errores)
- [ ] GitHub Pages está activado en Settings → Pages → branch main
- [ ] La URL `https://julio097110.github.io/porra-mundial-2026` carga correctamente
- [ ] El login funciona en producción igual que en local
- [ ] `info.html` carga correctamente en producción
- [ ] No hay errores de CORS ni de módulos en la consola de producción
- [ ] La web funciona correctamente en el móvil (abre la URL desde el móvil)
- [ ] El diseño responsive se adapta bien a la pantalla del móvil
- [ ] Las pestañas de navegación aparecen en la parte inferior en móvil

---

## 🗒️ Notas de debugging

*Usa este espacio para anotar errores encontrados y sus soluciones.*

---

**Error 1:**
- Descripción:
- Solución:

---

**Error 2:**
- Descripción:
- Solución:

---

**Error 3:**
- Descripción:
- Solución:

---

*Checklist de debugging para Porra Mundial 2026 · mayo 2026*
