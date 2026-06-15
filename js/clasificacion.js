// ============================================================
//  js/clasificacion.js
//  Pestaña "Clasificación"
//  - Ranking de jugadores con puntos y premios
//  - Soporta empates: jugadores con el mismo total comparten posición
//    visual (salto puro de números) y los premios de las posiciones
//    "absorbidas" por el empate se suman y reparten entre los
//    pagadores empatados.
//  - Criterios de puntuación al final
//  - Escucha cambios en tiempo real
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs,
  onSnapshot, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t } from './i18n.js';

// ── Estado ────────────────────────────────────────────────────
let _app         = null;
let _ranking     = [];    // [{ uid, nombre, total, pagado, esYo }]
let _config      = {};    // config general (bote_total)
let _paginaActual= 1;
const POR_PAGINA = 20;
let _unsubscribe = null;

// ── Punto de entrada ─────────────────────────────────────────
export async function initClasificacion(app) {
  _app = app;
  const contenedor = document.getElementById('clasificacionContent');
  contenedor.innerHTML = `
    <div class="loading-inline">
      <div class="spinner-sm"></div>
      <span>${t('common.loading')}</span>
    </div>`;

  try {
    // Cargar config (bote_total)
    const configSnap = await getDoc(doc(db, 'config', 'general'));
    _config = configSnap.exists() ? configSnap.data() : {};

    // Cargar ranking inicial
    await cargarRanking();
    renderClasificacion(contenedor);

    // Refrescar textos al cambiar idioma sin recargar desde Firestore
    window._refreshTextos = () => {
      const c = document.getElementById('clasificacionContent');
      if (c) renderClasificacion(c);
    };

    // Escuchar cambios en tiempo real en clasificacion
    _unsubscribe = onSnapshot(
      collection(db, 'clasificacion'),
      async () => {
        await cargarRanking();
        const c = document.getElementById('clasificacionContent');
        if (c) renderClasificacion(c);
      }
    );

  } catch (e) {
    console.error('[clasificacion]', e);
    contenedor.innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
  }
}

// ── Cargar y ordenar ranking ──────────────────────────────────
async function cargarRanking() {
  try {
    // Obtener todos los usuarios
    const usuariosSnap = await getDocs(collection(db, 'usuarios'));
    const usuarios = {};
    usuariosSnap.forEach(d => {
      usuarios[d.id] = d.data();
    });

    // Obtener puntuaciones
    const clSnap = await getDocs(collection(db, 'clasificacion'));
    const puntos = {};
    clSnap.forEach(d => {
      puntos[d.id] = d.data().total || 0;
    });

    // Combinar y ordenar — incluimos el campo pagado para el reparto de premios
    _ranking = Object.entries(usuarios)
      .map(([uid, u]) => ({
        uid,
        nombre:  u.nombre_visible || u.username || '—',
        total:   puntos[uid] || 0,
        pagado:  u.pagado || false,
        esYo:    uid === _app.uid
      }))
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        // Empate → orden alfabético
        return a.nombre.localeCompare(b.nombre);
      });

  } catch (e) {
    console.error('[cargarRanking]', e);
  }
}

// ── Calcula la posición visual de cada jugador (con saltos por empate) ──
// Devuelve un Map: uid → posición visual (1-indexed)
// Si hay 2 jugadores empatados en posición 1, ambos reciben pos=1 y el
// siguiente jugador recibe pos=3 (salto puro de números).
function calcularPosicionesVisuales() {
  const posiciones = new Map();
  let pos = 1;

  for (let i = 0; i < _ranking.length; i++) {
    if (i > 0 && _ranking[i].total === _ranking[i - 1].total) {
      // Mismo total que el anterior → misma posición
      posiciones.set(_ranking[i].uid, posiciones.get(_ranking[i - 1].uid));
    } else {
      posiciones.set(_ranking[i].uid, pos);
    }
    pos++;
  }

  return posiciones;
}

// ── Calcula a qué jugador corresponde cada premio (solo pagadores, con cascada) ──
// Tiene en cuenta empates: si 2+ jugadores comparten posición visual y esa
// posición cae dentro de las 3 premiadas, los importes de las posiciones
// "absorbidas" por el grupo se suman y reparten a partes iguales entre los
// pagadores de ese grupo. Si ningún jugador del grupo ha pagado, esas
// posiciones de premio se liberan hacia el siguiente grupo (cascada).
// Devuelve un Map: uid → { puesto: number, importe: number }
function calcularPremios(bote) {
  if (!bote) return new Map();

  const importes = [
    Math.round(bote * 0.65),
    Math.round(bote * 0.25),
    Math.round(bote * 0.10)
  ];

  const premios = new Map();
  let puestosPremio = 0; // nº de posiciones de premio (0,1,2 → 1º,2º,3º) ya consumidas
  let i = 0;

  while (i < _ranking.length && puestosPremio < 3) {
    // Identificar el grupo de empate que comienza en i
    let j = i;
    while (j + 1 < _ranking.length && _ranking[j + 1].total === _ranking[i].total) {
      j++;
    }
    const grupo = _ranking.slice(i, j + 1);
    const tamanoGrupo = grupo.length;

    // Cuántas posiciones de premio "ocupa" este grupo (sin pasarse de 3)
    const posicionesDisponibles = 3 - puestosPremio;
    const posicionesOcupadas = Math.min(tamanoGrupo, posicionesDisponibles);

    if (posicionesOcupadas > 0) {
      // Suma de los importes de las posiciones ocupadas por este grupo
      let sumaImporte = 0;
      for (let k = 0; k < posicionesOcupadas; k++) {
        sumaImporte += importes[puestosPremio + k];
      }

      // Pagadores dentro del grupo
      const pagadores = grupo.filter(j2 => j2.pagado);

      if (pagadores.length > 0) {
        const importePorCabeza = Math.round(sumaImporte / pagadores.length);
        const puestoVisual = puestosPremio + 1; // 1-indexed, posición más alta del grupo
        pagadores.forEach(jugador => {
          premios.set(jugador.uid, {
            puesto:  puestoVisual,
            importe: importePorCabeza
          });
        });
      }
      // Si no hay pagadores en el grupo, las posiciones quedan sin asignar
      // y se "liberan" hacia el siguiente grupo (cascada natural, ya que
      // puestosPremio avanza igualmente).

      puestosPremio += posicionesOcupadas;
    }

    i = j + 1;
  }

  return premios;
}

// ── Render principal ──────────────────────────────────────────
function renderClasificacion(contenedor) {
  const bote    = _config.bote_total || 0;
  const premios = calcularPremios(bote);
  const posiciones = calcularPosicionesVisuales();

  // Importes para mostrar en la tarjeta resumen
  const p1 = bote ? Math.round(bote * 0.65) : null;
  const p2 = bote ? Math.round(bote * 0.25) : null;
  const p3 = bote ? Math.round(bote * 0.10) : null;

  // Encontrar posición del usuario actual
  const miIndex = _ranking.findIndex(r => r.uid === _app.uid);
  const miPos = miIndex >= 0 ? posiciones.get(_app.uid) : 0;

  // Paginación
  const totalPags  = Math.ceil(_ranking.length / POR_PAGINA);
  const inicio     = (_paginaActual - 1) * POR_PAGINA;
  const pagina     = _ranking.slice(inicio, inicio + POR_PAGINA);

  // Si el usuario no está en la página actual, asegurarse de mostrarlo
  const usuarioEnPagina = pagina.some(r => r.uid === _app.uid);

  let html = `<div style="margin-top:8px;">`;

  // Notice de jornada
  html += `
    <div class="notice">
      📊 ${t('standings.matchday')} ${t('standings.played')} · ${contarPartidosJugados()} ${t('standings.matches')} 72
    </div>`;

  // Tarjeta bote total (si existe)
  if (bote > 0) {
    // Contar cuántos pagadores hay para mostrar el aviso si hay menos de 3
    const numPagadores = _ranking.filter(r => r.pagado).length;
    html += `
      <div style="background:var(--goldp); border:1px solid #f0d88a; border-radius:10px; padding:12px 14px; margin-bottom:14px;">
        <div style="font-size:12px; color:#856404; font-weight:500; margin-bottom:4px;">
          💰 ${t('standings.prizes.total')}
        </div>
        <div style="font-family:'Bebas Neue',sans-serif; font-size:28px; color:#6d4c00; letter-spacing:1px; margin-bottom:8px;">
          ${bote.toLocaleString()} NOK
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <span style="font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; background:rgba(200,168,50,.15); color:#6d4c00;">
            🥇 ${p1.toLocaleString()} NOK
          </span>
          <span style="font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; background:rgba(200,168,50,.15); color:#6d4c00;">
            🥈 ${p2.toLocaleString()} NOK
          </span>
          <span style="font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; background:rgba(200,168,50,.15); color:#6d4c00;">
            🥉 ${p3.toLocaleString()} NOK
          </span>
        </div>
        ${numPagadores < 3 ? `
          <div style="font-size:10px; color:#856404; margin-top:8px; opacity:.8;">
            ⚠️ Solo ${numPagadores} jugador${numPagadores === 1 ? '' : 'es'} ha${numPagadores === 1 ? '' : 'n'} pagado — el premio se asigna en cascada a los primeros pagadores de la clasificación
          </div>` : `
          <div style="font-size:10px; color:#856404; margin-top:8px; opacity:.8;">
            El premio se reparte entre los 3 primeros clasificados que hayan pagado
          </div>`}
      </div>`;
  }

  // Si el usuario no está en la página visible, mostrar su posición arriba
  if (!usuarioEnPagina && miIndex >= 0) {
    const yo = _ranking[miIndex];
    html += renderFilaStandings(yo, miPos, premios, bote, true);
    html += `<div style="text-align:center; font-size:11px; color:var(--tm); margin:4px 0 10px;">· · · tu posición · · ·</div>`;
  }

  // Tabla
  html += `
    <div class="standings-wrap">
      <div class="standings-header">
        <div class="sh sh-pos">#</div>
        <div class="sh sh-name left">${t('standings.player')}</div>
        <div class="sh sh-pts">${t('standings.points')}</div>
        <div class="sh sh-diff">${t('standings.diff')}</div>
        ${bote ? `<div class="sh sh-prize" style="text-align:right;">${t('standings.prizeCol')}</div>` : ''}
      </div>`;

  pagina.forEach((jugador) => {
    const pos = posiciones.get(jugador.uid);
    html += renderFilaStandings(jugador, pos, premios, bote, false);
  });

  html += `</div>`;

  // Paginación
  if (totalPags > 1) {
    html += `<div class="pagination">`;
    if (_paginaActual > 1) {
      html += `<button class="pag-btn" onclick="window._clPagina(${_paginaActual - 1})">‹</button>`;
    }
    for (let i = 1; i <= totalPags; i++) {
      html += `<button class="pag-btn ${i === _paginaActual ? 'active' : ''}"
        onclick="window._clPagina(${i})">${i}</button>`;
    }
    if (_paginaActual < totalPags) {
      html += `<button class="pag-btn" onclick="window._clPagina(${_paginaActual + 1})">›</button>`;
    }
    html += `<span class="pag-info">${_ranking.length} ${t('standings.player').toLowerCase()} · ${t('common.page')} ${_paginaActual} de ${totalPags}</span>`;
    html += `</div>`;
  }

  // Criterios de puntuación + reparto
  html += renderCriterios(bote, p1, p2, p3);

  html += `</div>`;
  contenedor.innerHTML = html;
  if (window.parseTwemoji) window.parseTwemoji(contenedor);

  // Handler paginación
  window._clPagina = (pag) => {
    _paginaActual = pag;
    const c = document.getElementById('clasificacionContent');
    if (c) renderClasificacion(c);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
}

// ── Fila de la tabla de standings ────────────────────────────
// pos: posición visual del jugador (puede repetirse entre filas si hay empate)
// premios: Map { uid → { puesto, importe } } generado por calcularPremios()
// bote: número total (0 si no hay bote)
function renderFilaStandings(jugador, pos, premios, bote, destacado = false) {
  const lider    = _ranking[0]?.total || 0;
  const diff     = jugador.total - lider;
  const diffStr  = pos === 1 ? '—' : diff.toString();
  const rowClass = jugador.esYo ? 'me' : '';

  let posClass = '';
  if (pos === 1)      posClass = 'gold';
  else if (pos === 2) posClass = 'silver';
  else if (pos === 3) posClass = 'bronze';

  // Premio: solo si hay bote y el jugador está en el Map de premios
  let premioHtml = '';
  if (bote > 0) {
    const premio = premios.get(jugador.uid);
    if (premio) {
      const clases = ['prize-1', 'prize-2', 'prize-3'];
      const claseIdx = Math.min(premio.puesto, 3) - 1;
      premioHtml = `<div class="s-prize ${clases[claseIdx]}">${premio.importe.toLocaleString()} NOK</div>`;
    } else if (!jugador.pagado) {
      // No ha pagado — se indica claramente
      premioHtml = `<div class="s-prize prize-none" title="No ha pagado">sin pago</div>`;
    } else {
      // Ha pagado pero no está en top 3 pagadores
      premioHtml = `<div class="s-prize prize-none">—</div>`;
    }
  }

  const medallaEmoji = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '';

  return `
    <div class="standings-row ${rowClass} ${pos <= 3 ? 'top3' : ''}">
      <div class="s-pos ${posClass}">${pos}</div>
      <div class="s-name">
        <span class="s-name-text">${medallaEmoji ? medallaEmoji + ' ' : ''}${jugador.nombre}</span>
        ${jugador.esYo ? `<span class="s-you">${t('standings.you')}</span>` : ''}
      </div>
      <div class="s-pts">${jugador.total}</div>
      <div class="s-diff ${diff < 0 ? 'neg' : ''}">${diffStr}</div>
      ${premioHtml}
    </div>`;
}

// ── Criterios de puntuación + reparto ────────────────────────
function renderCriterios(bote, p1, p2, p3) {
  return `
    <div class="criteria-box" style="margin-top:14px;">
      <div class="criteria-title">📋 ${t('standings.criteriaTitle')}</div>

      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.groupWinner')}</span>
        <span class="criteria-pts">${t('standings.pts.groupWinner')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.groupExact')}</span>
        <span class="criteria-pts">${t('standings.pts.groupExact')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.groupThrough')}</span>
        <span class="criteria-pts">${t('standings.pts.groupThrough')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.groupTie')}</span>
        <span class="criteria-pts">${t('standings.pts.groupTie')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.koWinner')}</span>
        <span class="criteria-pts">${t('standings.pts.koWinner')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.koExact')}</span>
        <span class="criteria-pts">${t('standings.pts.koExact')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.koDrawPass')}</span>
        <span class="criteria-pts">${t('standings.pts.koDrawPass')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.koDrawOnly')}</span>
        <span class="criteria-pts">${t('standings.pts.koDrawOnly')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.champion')}</span>
        <span class="criteria-pts">${t('standings.pts.champion')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.runnerUp')}</span>
        <span class="criteria-pts">${t('standings.pts.runnerUp')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.mvp')}</span>
        <span class="criteria-pts">${t('standings.pts.mvp')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.topScorer')}</span>
        <span class="criteria-pts">${t('standings.pts.topScorer')}</span>
      </div>

      ${bote ? `
        <div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(192,221,151,.4);">
          <div class="criteria-title">💰 ${t('standings.prizes.title')}</div>
          <div class="criteria-row">
            <span class="criteria-text">🥇 ${t('standings.prizes.first')}</span>
            <span class="criteria-pts" style="color:var(--gold);">${t('standings.prizes.firstPct')} · ${p1?.toLocaleString()} NOK</span>
          </div>
          <div class="criteria-row">
            <span class="criteria-text">🥈 ${t('standings.prizes.second')}</span>
            <span class="criteria-pts" style="color:#888;">${t('standings.prizes.secondPct')} · ${p2?.toLocaleString()} NOK</span>
          </div>
          <div class="criteria-row">
            <span class="criteria-text">🥉 ${t('standings.prizes.third')}</span>
            <span class="criteria-pts" style="color:#a0522d;">${t('standings.prizes.thirdPct')} · ${p3?.toLocaleString()} NOK</span>
          </div>
        </div>
      ` : `
        <div style="margin-top:10px; font-size:11px; color:var(--tm);">
          ${t('standings.prizes.noTotal')}
        </div>
      `}
    </div>`;
}

// ── Helper: contar partidos jugados ──────────────────────────
function contarPartidosJugados() {
  return Object.values(
    (window._resultadosCache || {})
  ).filter(r => r.confirmado).length;
}
