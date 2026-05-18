// ============================================================
//  js/previsiones.js
//  Pestaña "Ver todas las predicciones"
//  - Solo visible tras el cierre del plazo de grupos
//  - Tabla comparativa paginada con buscador
//  - Muestra predicciones de grupos y especiales
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, query, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t } from './i18n.js';
import { plazoAbierto } from './auth.js';
import { PARTIDOS_GRUPOS, GRUPOS, getPartidosPorGrupo } from '../data/partidos.js';

// ── Estado ────────────────────────────────────────────────────
let _app          = null;
let _usuarios     = [];   // [{ uid, nombre }]
let _predicciones = {};   // { uid: { partidoId: {local,visitante} } }
let _predEsp      = {};   // { uid: { campeon, subcampeon, mvp, goleador } }
let _resultados   = {};   // { partidoId: { goles_local, goles_visitante } }
let _plazoAbierto = true;
let _paginaActual = 1;
let _busqueda     = '';
let _grupoActivo  = 'A';
let _vistaActiva  = 'grupos'; // 'grupos' | 'especiales'
const POR_PAGINA  = 20;

// ── Punto de entrada ─────────────────────────────────────────
export async function initPrevisiones(app) {
  _app = app;
  const contenedor = document.getElementById('previsionesContent');
  contenedor.innerHTML = `
    <div class="loading-inline">
      <div class="spinner-sm"></div>
      <span>${t('common.loading')}</span>
    </div>`;

  try {
    _plazoAbierto = await plazoAbierto('grupos');

    if (_plazoAbierto) {
      // Plazo aún abierto → no se pueden ver las predicciones de los demás
      contenedor.innerHTML = `
        <div style="margin-top:16px;">
          <div class="notice locked" style="flex-direction:column; align-items:flex-start; gap:6px;">
            <strong>🔒 ${t('allPredictions.lockedNotice')}</strong>
            <span style="font-size:11px;">Las predicciones de los demás jugadores estarán disponibles cuando se cierre el plazo de predicciones.</span>
          </div>
        </div>`;
      return;
    }

    // Cargar todos los datos en paralelo
    await Promise.all([
      cargarUsuarios(),
      cargarTodasPredicciones(),
      cargarTodasEspeciales(),
      cargarResultados()
    ]);

    renderPrevisiones(contenedor);

    // Refrescar textos al cambiar idioma
    window._refreshTextos = () => {
      const c = document.getElementById('previsionesContent');
      if (c) renderPrevisiones(c);
    };

  } catch (e) {
    console.error('[previsiones]', e);
    contenedor.innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
  }
}

// ── Render principal ──────────────────────────────────────────
function renderPrevisiones(contenedor) {
  const usuariosFiltrados = filtrarUsuarios();
  const totalPags = Math.ceil(usuariosFiltrados.length / POR_PAGINA);
  const inicio    = (_paginaActual - 1) * POR_PAGINA;
  const pagina    = usuariosFiltrados.slice(inicio, inicio + POR_PAGINA);

  let html = `<div style="margin-top:8px;">`;

  // Buscador
  html += `
    <div class="prev-search">
      <span class="prev-search-icon">🔍</span>
      <input
        class="prev-search-input"
        type="text"
        placeholder="${t('allPredictions.searchPlaceholder')}"
        value="${_busqueda}"
        oninput="window._prevBuscar(this.value)"
      >
    </div>`;

  // Toggle grupos / especiales
  html += `
    <div class="sub-toggle" style="margin-bottom:12px;">
      <button class="sub-btn ${_vistaActiva === 'grupos' ? 'active' : ''}"
        onclick="window._prevVista('grupos')">${t('subNav.groupStage')}</button>
      <button class="sub-btn ${_vistaActiva === 'especiales' ? 'active' : ''}"
        onclick="window._prevVista('especiales')">${t('subNav.specials')}</button>
    </div>`;

  if (_vistaActiva === 'grupos') {
    html += renderVistaGrupos(pagina);
  } else {
    html += renderVistaEspeciales(pagina);
  }

  // Paginación
  if (totalPags > 1) {
    html += `<div class="pagination" style="margin-top:10px;">`;
    if (_paginaActual > 1) {
      html += `<button class="pag-btn" onclick="window._prevPagina(${_paginaActual - 1})">‹</button>`;
    }
    const maxBtns = 5;
    let start = Math.max(1, _paginaActual - 2);
    let end   = Math.min(totalPags, start + maxBtns - 1);
    if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);

    for (let i = start; i <= end; i++) {
      html += `<button class="pag-btn ${i === _paginaActual ? 'active' : ''}"
        onclick="window._prevPagina(${i})">${i}</button>`;
    }
    if (_paginaActual < totalPags) {
      html += `<button class="pag-btn" onclick="window._prevPagina(${_paginaActual + 1})">›</button>`;
    }
    html += `<span class="pag-info">${usuariosFiltrados.length} ${t('allPredictions.players')} · ${t('allPredictions.page')} ${_paginaActual} ${t('allPredictions.of')} ${totalPags}</span>`;
    html += `</div>`;
  }

  html += `<div class="prev-legend">${t('allPredictions.legend')}</div>`;
  html += `</div>`;

  contenedor.innerHTML = html;

  // Handlers
  window._prevBuscar = (val) => {
    _busqueda     = val;
    _paginaActual = 1;
    const c = document.getElementById('previsionesContent');
    if (c) renderPrevisiones(c);
  };
  window._prevPagina = (pag) => {
    _paginaActual = pag;
    const c = document.getElementById('previsionesContent');
    if (c) renderPrevisiones(c);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  window._prevVista = (vista) => {
    _vistaActiva  = vista;
    _paginaActual = 1;
    const c = document.getElementById('previsionesContent');
    if (c) renderPrevisiones(c);
  };
  window._prevGrupo = (g) => {
    _grupoActivo  = g;
    const c = document.getElementById('previsionesContent');
    if (c) renderPrevisiones(c);
  };
}

// ══════════════════════════════════════════════════════════════
//  VISTA GRUPOS
// ══════════════════════════════════════════════════════════════

function renderVistaGrupos(pagina) {
  // Selector de grupo
  const selectorGrupo = `
    <div class="pag-row" style="flex-wrap:wrap; margin-bottom:12px;">
      ${GRUPOS.map(g => `
        <button class="pag-btn ${_grupoActivo === g ? 'active' : ''}"
          onclick="window._prevGrupo('${g}')">${g}</button>
      `).join('')}
    </div>`;

  const partidos = getPartidosPorGrupo(_grupoActivo);

  // Cabecera de la tabla: columnas = partidos del grupo seleccionado
  // Mostramos máximo 6 columnas (todos los partidos del grupo)
  const colsPartidos = partidos.map(p => {
    const teamL = abreviar(p.local, 3);
    const teamV = abreviar(p.visitante, 3);
    return `${p.flagLocal}${teamL}<br>vs<br>${p.flagVisitante}${teamV}`;
  });

  let html = selectorGrupo;

  html += `
    <div class="prev-table-wrap">
      <div class="prev-header">
        <div class="prev-col-name">${t('standings.player')}</div>
        ${colsPartidos.map(c => `
          <div class="prev-col-match" style="font-size:9px; line-height:1.3;">${c}</div>
        `).join('')}
      </div>`;

  // Filas por jugador
  pagina.forEach(u => {
    const esYo = u.uid === _app.uid;
    const predU = _predicciones[u.uid] || {};

    html += `
      <div class="prev-row ${esYo ? 'me' : ''}">
        <div class="prev-cell-name">
          ${u.nombre}
          ${esYo ? `<span class="s-you" style="font-size:9px;">${t('allPredictions.you')}</span>` : ''}
        </div>
        ${partidos.map(p => {
          const pred = predU[p.id];
          const res  = _resultados[p.id];

          if (!pred || pred.local === '' || pred.visitante === '') {
            return `<div class="prev-cell">—</div>`;
          }

          const texto = `${pred.local}—${pred.visitante}`;

          if (!res) {
            return `<div class="prev-cell">${texto}</div>`;
          }

          // Comparar con resultado real
          const exacto  = pred.local === res.goles_local && pred.visitante === res.goles_visitante;
          const ganador = !exacto && signo(pred.local, pred.visitante) === signo(res.goles_local, res.goles_visitante);
          const fallo   = !exacto && !ganador;

          if (exacto)  return `<div class="prev-cell exact">${texto} ${t('allPredictions.exact')}</div>`;
          if (ganador) return `<div class="prev-cell">${texto}</div>`;
          return `<div class="prev-cell miss">${texto} ${t('allPredictions.missed')}</div>`;
        }).join('')}
      </div>`;
  });

  html += `</div>`;
  return html;
}

// ══════════════════════════════════════════════════════════════
//  VISTA ESPECIALES
// ══════════════════════════════════════════════════════════════

function renderVistaEspeciales(pagina) {
  let html = `
    <div class="prev-table-wrap">
      <div class="prev-header" style="display:grid; grid-template-columns:100px 1fr 1fr 1fr 1fr; min-width:500px;">
        <div class="prev-col-name">${t('standings.player')}</div>
        <div class="prev-col-match">🏆 ${t('specials.champion')}</div>
        <div class="prev-col-match">🥈 ${t('specials.runnerUp')}</div>
        <div class="prev-col-match">⭐ ${t('specials.mvp')}</div>
        <div class="prev-col-match">⚽ ${t('specials.topScorer')}</div>
      </div>`;

  pagina.forEach(u => {
    const esYo = u.uid === _app.uid;
    const esp  = _predEsp[u.uid] || {};

    html += `
      <div class="prev-row ${esYo ? 'me' : ''}" style="display:grid; grid-template-columns:100px 1fr 1fr 1fr 1fr; min-width:500px;">
        <div class="prev-cell-name" style="width:100px; flex-shrink:0;">
          ${u.nombre}
          ${esYo ? `<span class="s-you" style="font-size:9px;">${t('allPredictions.you')}</span>` : ''}
        </div>
        <div class="prev-cell" style="font-size:11px; text-align:left; padding-left:8px;">
          ${esp.campeon    || '—'}
        </div>
        <div class="prev-cell" style="font-size:11px; text-align:left; padding-left:8px;">
          ${esp.subcampeon || '—'}
        </div>
        <div class="prev-cell" style="font-size:11px; text-align:left; padding-left:8px;">
          ${esp.mvp        || '—'}
        </div>
        <div class="prev-cell" style="font-size:11px; text-align:left; padding-left:8px;">
          ${esp.goleador   || '—'}
        </div>
      </div>`;
  });

  html += `</div>`;
  return html;
}

// ══════════════════════════════════════════════════════════════
//  CARGA DE DATOS
// ══════════════════════════════════════════════════════════════

async function cargarUsuarios() {
  const snap = await getDocs(collection(db, 'usuarios'));
  _usuarios = snap.docs.map(d => ({
    uid:    d.id,
    nombre: d.data().nombre_visible || d.data().username || '—'
  })).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function cargarTodasPredicciones() {
  const snap = await getDocs(collection(db, 'predicciones'));
  snap.forEach(d => {
    const data = d.data();
    if (!data.uid || !data.partido_id) return;
    if (!_predicciones[data.uid]) _predicciones[data.uid] = {};
    if (data.partido_id === 'desempates') return;
    _predicciones[data.uid][data.partido_id] = {
      local:     data.local,
      visitante: data.visitante
    };
  });
}

async function cargarTodasEspeciales() {
  const snap = await getDocs(collection(db, 'pred_especiales'));
  snap.forEach(d => {
    _predEsp[d.id] = d.data();
  });
}

async function cargarResultados() {
  const snap = await getDocs(collection(db, 'resultados'));
  snap.forEach(d => {
    _resultados[d.id] = d.data();
  });
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

function filtrarUsuarios() {
  if (!_busqueda.trim()) return _usuarios;
  const b = _busqueda.toLowerCase().trim();
  return _usuarios.filter(u => u.nombre.toLowerCase().includes(b));
}

function abreviar(nombre, max) {
  if (!nombre) return '?';
  const palabras = nombre.split(' ');
  if (palabras[0].length <= max) return palabras[0];
  return palabras[0].substring(0, max);
}

function signo(a, b) {
  const na = parseInt(a), nb = parseInt(b);
  if (na > nb)  return 1;
  if (na < nb)  return -1;
  return 0;
}
