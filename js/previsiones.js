// ============================================================
//  js/previsiones.js
//  Pestaña "Ver todas las predicciones"
//  - Solo visible tras el cierre del plazo de grupos
//  - Tabla comparativa paginada con buscador
//  - Muestra predicciones de grupos, eliminatorias,
//    mejores terceros y especiales
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t } from './i18n.js';
import { plazoAbierto } from './auth.js';
import { PARTIDOS_GRUPOS, GRUPOS, getPartidosPorGrupo } from '../data/partidos.js';

// ── Estado ────────────────────────────────────────────────────
let _app           = null;
let _usuarios      = [];   // [{ uid, nombre }]
let _predicciones  = {};   // { uid: { partidoId: {local,visitante} } }
let _predEsp       = {};   // { uid: { campeon, subcampeon, mvp, goleador } }
let _predElim      = {};   // { uid: { partidoId: {local,visitante,ganador} } }
let _predTerceros  = {};   // { uid: string[] }
let _resultados    = {};   // { partidoId: { goles_local, goles_visitante } }
let _resultadosElim = {}; // { partidoId: { ...doc res_ko } } — resultados confirmados de eliminatorias

// ── Mejores terceros clasificados (hardcodeados jun 2026) ─────
const TERCEROS_PASARON = new Set([
  'Bosnia y Herzegovina', 'Suecia', 'Ecuador', 'Paraguay',
  'Senegal', 'Argelia', 'RD Congo', 'Ghana'
]);
let _plazoAbierto  = true;
let _plazoElim     = true;
let _plazoTerceros = true;
let _paginaActual  = 1;
let _busqueda      = '';
let _grupoActivo   = 'A';
let _faseActiva    = '1/16';  // fase activa en la vista de eliminatorias
let _vistaActiva   = 'grupos'; // 'grupos' | 'eliminatorias' | 'terceros' | 'especiales'
const POR_PAGINA   = 20;

// ── Definición de fases de eliminatorias ─────────────────────
const FASES_ELIM = [
  { id: '1/16', label: '1/16',    prefijo: 'elim16', partidos: 16 },
  { id: '1/8',  label: '1/8',     prefijo: 'elim8',  partidos: 8  },
  { id: '1/4',  label: 'Cuartos', prefijo: 'elim4',  partidos: 4  },
  { id: 'semi', label: 'Semis',   prefijo: 'elim2',  partidos: 2  },
  { id: '3er',  label: '3er/4º',  prefijo: 'elim34', partidos: 1  },
  { id: 'final',label: 'Final',   prefijo: 'elimfin',partidos: 1  },
];

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
    // Cargar los tres plazos de forma independiente
    try { _plazoAbierto  = await plazoAbierto('grupos');        } catch(e) { _plazoAbierto  = true;  }
    try { _plazoElim     = await plazoAbierto('eliminatorias'); } catch(e) { _plazoElim     = true;  }
    try { _plazoTerceros = await plazoAbierto('terceros');      } catch(e) { _plazoTerceros = true;  }

    if (_plazoAbierto) {
      contenedor.innerHTML = `
        <div style="margin-top:16px;">
          <div class="notice locked" style="flex-direction:column; align-items:flex-start; gap:6px;">
            <strong>🔒 ${t('allPredictions.lockedNotice')}</strong>
            <span style="font-size:11px;">Las predicciones de los demás jugadores estarán disponibles cuando se cierre el plazo de predicciones.</span>
          </div>
        </div>`;
      return;
    }

    // Cargar datos base siempre
    await Promise.all([
      cargarUsuarios(),
      cargarTodasPredicciones(),
      cargarTodasEspeciales(),
      cargarResultados(),
    ]);

    // Cargar eliminatorias y terceros de forma independiente (no bloquean si fallan)
    try { await cargarTodasPrediccionesElim();    } catch(e) { console.warn('[previsiones] elim:', e); }
    try { await cargarResultadosElim();           } catch(e) { console.warn('[previsiones] res_elim:', e); }
    try { await cargarTodasPrediccionesTerceros();} catch(e) { console.warn('[previsiones] terceros:', e); }

    renderPrevisiones(contenedor);

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

  // Toggle de 4 vistas
  html += `
    <div class="sub-toggle" style="margin-bottom:12px;">
      <button class="sub-btn ${_vistaActiva === 'grupos' ? 'active' : ''}"
        onclick="window._prevVista('grupos')">${t('subNav.groupStage')}</button>
      <button class="sub-btn ${_vistaActiva === 'eliminatorias' ? 'active' : ''}"
        onclick="window._prevVista('eliminatorias')">${t('subNav.knockouts')}</button>
      <button class="sub-btn ${_vistaActiva === 'terceros' ? 'active' : ''}"
        onclick="window._prevVista('terceros')">${t('subNav.thirdPlace')}</button>
      <button class="sub-btn ${_vistaActiva === 'especiales' ? 'active' : ''}"
        onclick="window._prevVista('especiales')">${t('subNav.specials')}</button>
    </div>`;

  if (_vistaActiva === 'grupos') {
    html += renderVistaGrupos(pagina);
  } else if (_vistaActiva === 'eliminatorias') {
    html += renderVistaEliminatorias(pagina);
  } else if (_vistaActiva === 'terceros') {
    html += renderVistaTerceros(pagina);
  } else {
    html += renderVistaEspeciales(pagina);
  }

  // Paginación (solo en vistas con tabla de jugadores)
  if (_vistaActiva !== 'eliminatorias' || !_plazoElim) {
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
  }

  html += `<div class="prev-legend">${t('allPredictions.legend')}</div>`;
  html += `</div>`;

  contenedor.innerHTML = html;

  // Handlers globales
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
  window._prevFase = (f) => {
    _faseActiva   = f;
    const c = document.getElementById('previsionesContent');
    if (c) renderPrevisiones(c);
  };
}

// ══════════════════════════════════════════════════════════════
//  VISTA GRUPOS
// ══════════════════════════════════════════════════════════════

function renderVistaGrupos(pagina) {
  const selectorGrupo = `
    <div class="pag-row" style="flex-wrap:wrap; margin-bottom:12px;">
      ${GRUPOS.map(g => `
        <button class="pag-btn ${_grupoActivo === g ? 'active' : ''}"
          onclick="window._prevGrupo('${g}')">${g}</button>
      `).join('')}
    </div>`;

  const partidos = getPartidosPorGrupo(_grupoActivo);

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

          const exacto  = pred.local === res.goles_local && pred.visitante === res.goles_visitante;
          const ganador = !exacto && signo(pred.local, pred.visitante) === signo(res.goles_local, res.goles_visitante);

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
//  VISTA ELIMINATORIAS
// ══════════════════════════════════════════════════════════════

function renderVistaEliminatorias(pagina) {
  // Plazo aún abierto → bloqueado para todos
  if (_plazoElim) {
    return `
      <div class="notice locked" style="margin-top:4px;">
        🔒 Las predicciones de eliminatorias estarán visibles cuando se cierre el plazo.
      </div>`;
  }

  // El propio jugador está marcado como rezagado → no ve nada del resto todavía
  const yo = _usuarios.find(u => u.uid === _app.uid);
  if (yo && yo.rezagado_elim && yo.rezagado_elim.activo) {
    return `
      <div class="notice locked" style="margin-top:4px;">
        ⏳ ${t('allPredictions.delayedNotice')}
      </div>`;
  }

  // Selector de fase
  const selectorFase = `
    <div class="pag-row" style="flex-wrap:wrap; margin-bottom:12px;">
      ${FASES_ELIM.map(f => `
        <button class="pag-btn ${_faseActiva === f.id ? 'active' : ''}"
          onclick="window._prevFase('${f.id}')">${f.label}</button>
      `).join('')}
    </div>`;

  const fase = FASES_ELIM.find(f => f.id === _faseActiva);
  if (!fase) return selectorFase;

  // Obtener los partidos de esta fase desde el bracket
  const partidosFase = obtenerPartidosDeFase(_faseActiva);

  let html = selectorFase;

  html += `
    <div class="prev-table-wrap">
      <div class="prev-header">
        <div class="prev-col-name">${t('standings.player')}</div>
        ${partidosFase.map(p => {
          const eqL = p.equipoLocal    || p.placeholderLocal    || '?';
          const eqV = p.equipoVisitante|| p.placeholderVisitante|| '?';
          return `<div class="prev-col-match" style="font-size:9px; line-height:1.3;">
            ${abreviar(eqL, 4)}<br>vs<br>${abreviar(eqV, 4)}
          </div>`;
        }).join('')}
      </div>`;

  pagina.forEach(u => {
    const esYo  = u.uid === _app.uid;
    const predU = _predElim[u.uid] || {};
    const rezagado = u.rezagado_elim && u.rezagado_elim.activo;

    if (rezagado) {
      const motivo = u.rezagado_elim.motivo || 'Aún no ha confirmado sus predicciones.';
      html += `
        <div class="prev-row ${esYo ? 'me' : ''}">
          <div class="prev-cell-name">
            ${u.nombre}
            ${esYo ? `<span class="s-you" style="font-size:9px;">${t('allPredictions.you')}</span>` : ''}
          </div>
          <div class="prev-cell" style="grid-column: span ${partidosFase.length}; text-align:left; font-size:11px; color:var(--tm); font-style:italic; padding:8px;">
            ⏳ Pendiente — ${motivo}
          </div>
        </div>`;
      return;
    }

    html += `
      <div class="prev-row ${esYo ? 'me' : ''}">
        <div class="prev-cell-name">
          ${u.nombre}
          ${esYo ? `<span class="s-you" style="font-size:9px;">${t('allPredictions.you')}</span>` : ''}
        </div>
        ${partidosFase.map(p => {
          const pred = predU[p.id];
          if (!pred) return `<div class="prev-cell">—</div>`;

          const local    = pred.local     ?? '';
          const visitante= pred.visitante ?? '';
          const ganador  = pred.ganador   || null;

          if (local === '' && visitante === '') {
            return `<div class="prev-cell">—</div>`;
          }

          const res = _resultadosElim[p.id];

          // Partido concreto (equipos reales) que ESTE jugador predijo para esta ronda.
          // Solo a partir de octavos: en 1/16 el partido ya es real y fijo en la cabecera.
          let equiposTexto = '';
          if (fase.id !== '1/16') {
            const eqL = pred.equipo_local     ? abreviar(pred.equipo_local, 4)     : '?';
            const eqV = pred.equipo_visitante ? abreviar(pred.equipo_visitante, 4) : '?';
            equiposTexto = `<div style="font-size:9px; color:var(--tm); margin-bottom:2px;">${eqL} vs ${eqV}</div>`;
          }

          // Color del marcador: verde si equipos Y goles coinciden exactamente (90'),
          // rojo si hay resultado confirmado pero no coincide, sin color si pendiente.
          let scoreColor = '';
          if (res) {
            const equiposOk = !pred.equipo_local ||
                              (pred.equipo_local     === res.equipo_local &&
                               pred.equipo_visitante === res.equipo_visitante);
            const golesOk   = parseInt(local)    === res.goles_local &&
                              parseInt(visitante) === res.goles_visitante;
            scoreColor = (equiposOk && golesOk) ? 'color:#639922; font-weight:700;'
                                                 : 'color:#c0392b; font-weight:700;';
          }

          const scoreTexto = (local !== '' && visitante !== '')
            ? `<span style="${scoreColor}">${local}—${visitante}</span>`
            : '?—?';

          // Color de la flecha: verde si acertó quién pasa, rojo si no, gris neutro si pendiente.
          let ganadorColor = 'color:var(--gm);';
          if (res && ganador) {
            ganadorColor = (ganador === res.equipo_que_pasa)
              ? 'color:#639922;'
              : 'color:#c0392b;';
          }

          const ganadorTexto = ganador
            ? `<br><span style="font-size:9px; ${ganadorColor} font-weight:600;">→ ${abreviar(ganador, 8)}</span>`
            : '';

          return `<div class="prev-cell" style="font-size:10px; line-height:1.4;">
            ${equiposTexto}${scoreTexto}${ganadorTexto}
          </div>`;
        }).join('')}
      </div>`;
  });

  html += `</div>`;

  // Paginación para eliminatorias
  const usuariosFiltrados = filtrarUsuarios();
  const totalPags = Math.ceil(usuariosFiltrados.length / POR_PAGINA);
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

  return html;
}

// ── Obtener partidos de una fase con equipos reales/placeholders ──
function obtenerPartidosDeFase(faseId) {
  const definicion = {
    '1/16': [
      { id:'elim16_1',  pL:'Sudáfrica',           pV:'Canadá'               },
      { id:'elim16_2',  pL:'Países Bajos',         pV:'Marruecos'            },
      { id:'elim16_3',  pL:'Alemania',             pV:'Paraguay'             },
      { id:'elim16_4',  pL:'Francia',              pV:'Suecia'               },
      { id:'elim16_5',  pL:'Bélgica',              pV:'Senegal'              },
      { id:'elim16_6',  pL:'EEUU',                 pV:'Bosnia y Herzegovina' },
      { id:'elim16_7',  pL:'España',               pV:'Austria'              },
      { id:'elim16_8',  pL:'Portugal',             pV:'Croacia'              },
      { id:'elim16_9',  pL:'Brasil',               pV:'Japón'                },
      { id:'elim16_10', pL:'Costa de Marfil',      pV:'Noruega'              },
      { id:'elim16_11', pL:'México',               pV:'Ecuador'              },
      { id:'elim16_12', pL:'Inglaterra',           pV:'RD Congo'             },
      { id:'elim16_13', pL:'Suiza',                pV:'Argelia'              },
      { id:'elim16_14', pL:'Colombia',             pV:'Ghana'                },
      { id:'elim16_15', pL:'Australia',            pV:'Egipto'               },
      { id:'elim16_16', pL:'Argentina',            pV:'Cabo Verde'           },
    ],
    '1/8': [
      { id:'elim8_2',  pL:'Gan. 16_1',  pV:'Gan. 16_2'  },
      { id:'elim8_1',  pL:'Gan. 16_3',  pV:'Gan. 16_4'  },
      { id:'elim8_5',  pL:'Gan. 16_8',  pV:'Gan. 16_7'  },
      { id:'elim8_6',  pL:'Gan. 16_6',  pV:'Gan. 16_5'  },
      { id:'elim8_3',  pL:'Gan. 16_9',  pV:'Gan. 16_10' },
      { id:'elim8_4',  pL:'Gan. 16_11', pV:'Gan. 16_12' },
      { id:'elim8_7',  pL:'Gan. 16_16', pV:'Gan. 16_15' },
      { id:'elim8_8',  pL:'Gan. 16_13', pV:'Gan. 16_14' },
    ],
    '1/4': [
      { id:'elim4_1',  pL:'Gan. 8_1',  pV:'Gan. 8_2'  },
      { id:'elim4_2',  pL:'Gan. 8_5',  pV:'Gan. 8_6'  },
      { id:'elim4_3',  pL:'Gan. 8_3',  pV:'Gan. 8_4'  },
      { id:'elim4_4',  pL:'Gan. 8_7',  pV:'Gan. 8_8'  },
    ],
    'semi': [
      { id:'elim2_1',  pL:'Gan. QF1',   pV:'Gan. QF2'  },
      { id:'elim2_2',  pL:'Gan. QF3',   pV:'Gan. QF4'  },
    ],
    '3er': [
      { id:'elim34',   pL:'Perd. SF1',  pV:'Perd. SF2' },
    ],
    'final': [
      { id:'elimfin',  pL:'Gan. SF1',   pV:'Gan. SF2'  },
    ],
  };

  return (definicion[faseId] || []).map(c => ({
    id:                   c.id,
    equipoLocal:          c.pL,
    equipoVisitante:      c.pV,
    placeholderLocal:     c.pL,
    placeholderVisitante: c.pV,
  }));
}

// ══════════════════════════════════════════════════════════════
//  VISTA MEJORES TERCEROS
// ══════════════════════════════════════════════════════════════

function renderVistaTerceros(pagina) {
  // Plazo aún abierto → bloqueado
  if (_plazoTerceros) {
    return `
      <div class="notice locked" style="margin-top:4px;">
        🔒 Las predicciones de mejores terceros estarán visibles cuando se cierre el plazo.
      </div>`;
  }

  // ── Helpers ───────────────────────────────────────────────
  const grupoDeEquipo = (nombre) => {
    const p = PARTIDOS_GRUPOS.find(p => p.local === nombre || p.visitante === nombre);
    return p?.grupo || null;
  };

  const flagDeEquipo = (nombre) => {
    const p = PARTIDOS_GRUPOS.find(p => p.local === nombre || p.visitante === nombre);
    if (!p) return '';
    return p.local === nombre ? (p.flagLocal || '') : (p.flagVisitante || '');
  };

  // ── Terceros clasificados (hardcodeados jun 2026) ─────────
  const tercerosPasaron = TERCEROS_PASARON;
  const hayTercerosBracket = true;

  // ── Columnas: los 12 grupos fijos A–L ─────────────────────
  const gruposOrdenados = ['A','B','C','D','E','F','G','H','I','J','K','L'];

  // Verificar si hay alguna predicción guardada
  const hayPreds = Object.values(_predTerceros).some(arr => Array.isArray(arr) && arr.length > 0);
  if (!hayPreds) {
    return `<div class="notice" style="margin-top:8px;">Aún no hay predicciones de mejores terceros guardadas.</div>`;
  }

  // ── Cabecera: Grupo A … Grupo L ───────────────────────────
  const grupoLabel = t('common.group');

  let html = `
    <div class="prev-table-wrap">
      <div class="prev-header">
        <div class="prev-col-name">${t('standings.player')}</div>
        ${gruposOrdenados.map(g => `
          <div class="prev-col-match" style="font-size:10px; font-weight:700; letter-spacing:.5px;">
            ${grupoLabel} ${g}
          </div>
        `).join('')}
      </div>`;

  pagina.forEach(u => {
    const esYo  = u.uid === _app.uid;
    const preds = _predTerceros[u.uid] || [];

    // Mapear cada equipo elegido a su grupo
    const equipoPorGrupo = {};
    preds.forEach(nombre => {
      const g = grupoDeEquipo(nombre);
      if (g) equipoPorGrupo[g] = nombre;
    });

    html += `
      <div class="prev-row ${esYo ? 'me' : ''}">
        <div class="prev-cell-name">
          ${u.nombre}
          ${esYo ? `<span class="s-you" style="font-size:9px;">${t('allPredictions.you')}</span>` : ''}
        </div>
        ${gruposOrdenados.map(g => {
          const equipo = equipoPorGrupo[g];
          if (!equipo) {
            return `<div class="prev-cell" style="font-size:10px; color:#ccc;">—</div>`;
          }
          const flag = flagDeEquipo(equipo);
          const nombre = abreviar(equipo, 10);

          if (!hayTercerosBracket) {
            // Aún no se conocen los terceros: mostrar sin color
            return `<div class="prev-cell" style="font-size:10px; line-height:1.3;">
              ${flag} ${nombre}
            </div>`;
          }

          const acerto = tercerosPasaron.has(equipo);
          return `<div class="prev-cell ${acerto ? 'exact' : 'miss'}" style="font-size:10px; line-height:1.3;">
            ${flag} ${nombre}
          </div>`;
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
    nombre: d.data().nombre_visible || d.data().username || '—',
    rezagado_elim: d.data().rezagado_elim || { activo: false, motivo: '' }
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

async function cargarResultadosElim() {
  const snap = await getDocs(collection(db, 'res_ko'));
  snap.forEach(d => {
    const data = d.data();
    if (data.confirmado && data.partido_id) {
      _resultadosElim[data.partido_id] = data;
    }
  });
}

async function cargarTodasPrediccionesElim() {
  const snap = await getDocs(collection(db, 'pred_ko'));
  snap.forEach(d => {
    const data = d.data();
    if (!data.uid || !data.partido_id) return;
    if (!_predElim[data.uid]) _predElim[data.uid] = {};
    _predElim[data.uid][data.partido_id] = {
      local:            data.local,
      visitante:        data.visitante,
      ganador:          data.ganador          || null,
      equipo_local:     data.equipo_local     || null,
      equipo_visitante: data.equipo_visitante || null,
    };
  });
}

async function cargarTodasPrediccionesTerceros() {
  const snap = await getDocs(collection(db, 'pred_terceros'));
  snap.forEach(d => {
    const data = d.data();
    if (!data.uid) return;
    _predTerceros[data.uid] = data.equipos || [];
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
