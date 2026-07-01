// ============================================================
//  js/informe-modal.js
//  Módulo compartido: modales de desglose de puntos
//
//  Exporta:
//    abrirModalJugador(uid, nombre)
//      → modal con desglose completo de un jugador
//        (grupos, clasificados de grupo, eliminatorias, especiales, terceros)
//    abrirModalPartido(partidoId, esElim)
//      → modal con puntos de todos los jugadores en un partido
//
//  Carga datos frescos de Firestore cada vez que se abre
//  el modal (igual que informe.html). No depende de caché.
// ============================================================

import { db } from './firebase-config.js';
import { t } from './i18n.js';
import {
  collection, doc, getDoc, getDocs, query, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { calcularPuntosPartidoElim } from './puntos-elim.js';

// ── Mapa estático de los 72 partidos de grupos ────────────────
const PARTIDOS_GRUPOS_MAP = {
  "A1":{"local":"México","visitante":"Sudáfrica","grupo":"A"},
  "A2":{"local":"Corea del Sur","visitante":"Chequia","grupo":"A"},
  "A3":{"local":"Chequia","visitante":"Sudáfrica","grupo":"A"},
  "A4":{"local":"México","visitante":"Corea del Sur","grupo":"A"},
  "A5":{"local":"Chequia","visitante":"México","grupo":"A"},
  "A6":{"local":"Sudáfrica","visitante":"Corea del Sur","grupo":"A"},
  "B1":{"local":"Canadá","visitante":"Bosnia y Herzegovina","grupo":"B"},
  "B2":{"local":"Qatar","visitante":"Suiza","grupo":"B"},
  "B3":{"local":"Suiza","visitante":"Bosnia y Herzegovina","grupo":"B"},
  "B4":{"local":"Canadá","visitante":"Qatar","grupo":"B"},
  "B5":{"local":"Suiza","visitante":"Canadá","grupo":"B"},
  "B6":{"local":"Bosnia y Herzegovina","visitante":"Qatar","grupo":"B"},
  "C1":{"local":"Brasil","visitante":"Marruecos","grupo":"C"},
  "C2":{"local":"Haití","visitante":"Escocia","grupo":"C"},
  "C3":{"local":"Escocia","visitante":"Marruecos","grupo":"C"},
  "C4":{"local":"Brasil","visitante":"Haití","grupo":"C"},
  "C5":{"local":"Escocia","visitante":"Brasil","grupo":"C"},
  "C6":{"local":"Marruecos","visitante":"Haití","grupo":"C"},
  "D1":{"local":"EEUU","visitante":"Paraguay","grupo":"D"},
  "D2":{"local":"Australia","visitante":"Türkiye","grupo":"D"},
  "D3":{"local":"EEUU","visitante":"Australia","grupo":"D"},
  "D4":{"local":"Türkiye","visitante":"Paraguay","grupo":"D"},
  "D5":{"local":"Türkiye","visitante":"EEUU","grupo":"D"},
  "D6":{"local":"Paraguay","visitante":"Australia","grupo":"D"},
  "E1":{"local":"Alemania","visitante":"Curazao","grupo":"E"},
  "E2":{"local":"Costa de Marfil","visitante":"Ecuador","grupo":"E"},
  "E3":{"local":"Alemania","visitante":"Costa de Marfil","grupo":"E"},
  "E4":{"local":"Ecuador","visitante":"Curazao","grupo":"E"},
  "E5":{"local":"Curazao","visitante":"Costa de Marfil","grupo":"E"},
  "E6":{"local":"Ecuador","visitante":"Alemania","grupo":"E"},
  "F1":{"local":"Países Bajos","visitante":"Japón","grupo":"F"},
  "F2":{"local":"Suecia","visitante":"Túnez","grupo":"F"},
  "F3":{"local":"Países Bajos","visitante":"Suecia","grupo":"F"},
  "F4":{"local":"Túnez","visitante":"Japón","grupo":"F"},
  "F5":{"local":"Japón","visitante":"Suecia","grupo":"F"},
  "F6":{"local":"Túnez","visitante":"Países Bajos","grupo":"F"},
  "G1":{"local":"Bélgica","visitante":"Egipto","grupo":"G"},
  "G2":{"local":"Irán","visitante":"Nueva Zelanda","grupo":"G"},
  "G3":{"local":"Bélgica","visitante":"Irán","grupo":"G"},
  "G4":{"local":"Nueva Zelanda","visitante":"Egipto","grupo":"G"},
  "G5":{"local":"Egipto","visitante":"Irán","grupo":"G"},
  "G6":{"local":"Nueva Zelanda","visitante":"Bélgica","grupo":"G"},
  "H1":{"local":"España","visitante":"Cabo Verde","grupo":"H"},
  "H2":{"local":"Arabia Saudí","visitante":"Uruguay","grupo":"H"},
  "H3":{"local":"España","visitante":"Arabia Saudí","grupo":"H"},
  "H4":{"local":"Uruguay","visitante":"Cabo Verde","grupo":"H"},
  "H5":{"local":"Cabo Verde","visitante":"Arabia Saudí","grupo":"H"},
  "H6":{"local":"Uruguay","visitante":"España","grupo":"H"},
  "I1":{"local":"Francia","visitante":"Senegal","grupo":"I"},
  "I2":{"local":"Irak","visitante":"Noruega","grupo":"I"},
  "I3":{"local":"Francia","visitante":"Irak","grupo":"I"},
  "I4":{"local":"Noruega","visitante":"Senegal","grupo":"I"},
  "I5":{"local":"Noruega","visitante":"Francia","grupo":"I"},
  "I6":{"local":"Senegal","visitante":"Irak","grupo":"I"},
  "J1":{"local":"Argentina","visitante":"Argelia","grupo":"J"},
  "J2":{"local":"Austria","visitante":"Jordania","grupo":"J"},
  "J3":{"local":"Argentina","visitante":"Austria","grupo":"J"},
  "J4":{"local":"Jordania","visitante":"Argelia","grupo":"J"},
  "J5":{"local":"Argelia","visitante":"Austria","grupo":"J"},
  "J6":{"local":"Jordania","visitante":"Argentina","grupo":"J"},
  "K1":{"local":"Portugal","visitante":"RD Congo","grupo":"K"},
  "K2":{"local":"Uzbekistán","visitante":"Colombia","grupo":"K"},
  "K3":{"local":"Portugal","visitante":"Uzbekistán","grupo":"K"},
  "K4":{"local":"Colombia","visitante":"RD Congo","grupo":"K"},
  "K5":{"local":"Colombia","visitante":"Portugal","grupo":"K"},
  "K6":{"local":"RD Congo","visitante":"Uzbekistán","grupo":"K"},
  "L1":{"local":"Inglaterra","visitante":"Croacia","grupo":"L"},
  "L2":{"local":"Ghana","visitante":"Panamá","grupo":"L"},
  "L3":{"local":"Inglaterra","visitante":"Ghana","grupo":"L"},
  "L4":{"local":"Panamá","visitante":"Croacia","grupo":"L"},
  "L5":{"local":"Panamá","visitante":"Inglaterra","grupo":"L"},
  "L6":{"local":"Croacia","visitante":"Ghana","grupo":"L"}
};

// Nombre legible de ronda de eliminatorias (usa claves i18n existentes)
function nombreRonda(ronda) {
  const claves = {
    r32:   'knockouts.round16',
    r16:   'knockouts.round8',
    qf:    'knockouts.quarterFinal',
    semi:  'knockouts.semiFinal',
    '3er': 'knockouts.thirdPlace',
    final: 'knockouts.final'
  };
  return t(claves[ronda] || '') || ronda;
}

// ── Helpers de cálculo ────────────────────────────────────────

function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function calcGrupo(pred, gl, gv) {
  if (!pred) return 0;
  const pl = parseInt(pred.local ?? pred.goles_local ?? -1);
  const pv = parseInt(pred.visitante ?? pred.goles_visitante ?? -1);
  if (isNaN(pl) || isNaN(pv)) return 0;
  if (pl === gl && pv === gv) return 3;
  const sr = Math.sign(gl - gv);
  const sp = Math.sign(pl - pv);
  return sr === sp ? 1 : 0;
}

// (cálculo de puntos de eliminatoria: ver calcularPuntosPartidoElim,
// importada desde puntos-elim.js — única fuente de verdad)


// ── Badge de puntos ───────────────────────────────────────────
function ptsBadge(pts) {
  const colores = {
    0: 'background:#f0f5e8; color:#bdd4a0;',
    1: 'background:#ddefc8; color:#3b6d11;',
    2: 'background:#c8e6a0; color:#3b6d11;',
    3: 'background:#3b6d11; color:#fff;',
    4: 'background:#1e3d0a; color:#fff;',
    6: 'background:#c8a832; color:#fff;'
  };
  const style = colores[Math.min(pts, 6)] || colores[0];
  const label = pts > 0 ? `+${pts}` : '0';
  return `<span style="display:inline-flex; align-items:center; justify-content:center;
    width:32px; height:32px; border-radius:50%; font-size:12px; font-weight:700;
    flex-shrink:0; ${style}">${label}</span>`;
}

// ── Helpers para clasificados de grupo ────────────────────────

function _getPartidosDeGrupo(grupo) {
  return Object.entries(PARTIDOS_GRUPOS_MAP)
    .filter(([, info]) => info.grupo === grupo)
    .map(([id, info]) => ({ id, local: info.local, visitante: info.visitante }));
}

function _sortTabla(equipos) {
  return equipos.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdA = a.gf - a.gc, gdB = b.gf - b.gc;
    if (gdB !== gdA) return gdB - gdA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.nombre.localeCompare(b.nombre);
  });
}

function _calcTablaGrupoReal(grupo, resGrupos) {
  const partidos = _getPartidosDeGrupo(grupo);
  const map = {};
  partidos.forEach(p => {
    map[p.local]     = map[p.local]     || { nombre: p.local,     pts: 0, gf: 0, gc: 0 };
    map[p.visitante] = map[p.visitante] || { nombre: p.visitante, pts: 0, gf: 0, gc: 0 };
  });
  partidos.forEach(p => {
    const r = resGrupos[p.id];
    if (!r?.confirmado) return;
    const gl = r.goles_local, gv = r.goles_visitante;
    map[p.local].gf     += gl; map[p.local].gc     += gv;
    map[p.visitante].gf += gv; map[p.visitante].gc += gl;
    if      (gl > gv)  { map[p.local].pts += 3; }
    else if (gl === gv){ map[p.local].pts += 1; map[p.visitante].pts += 1; }
    else               { map[p.visitante].pts += 3; }
  });
  return _sortTabla(Object.values(map));
}

function _calcTablaGrupoPrediccion(grupo, predGrupos) {
  const partidos = _getPartidosDeGrupo(grupo);
  const map = {};
  partidos.forEach(p => {
    map[p.local]     = map[p.local]     || { nombre: p.local,     pts: 0, gf: 0, gc: 0 };
    map[p.visitante] = map[p.visitante] || { nombre: p.visitante, pts: 0, gf: 0, gc: 0 };
  });
  partidos.forEach(p => {
    const pred = predGrupos[p.id];
    if (!pred) return;
    const gl = parseInt(pred.local     ?? pred.goles_local     ?? '');
    const gv = parseInt(pred.visitante ?? pred.goles_visitante ?? '');
    if (isNaN(gl) || isNaN(gv)) return;
    map[p.local].gf     += gl; map[p.local].gc     += gv;
    map[p.visitante].gf += gv; map[p.visitante].gc += gl;
    if      (gl > gv)  { map[p.local].pts += 3; }
    else if (gl === gv){ map[p.local].pts += 1; map[p.visitante].pts += 1; }
    else               { map[p.visitante].pts += 3; }
  });
  return _sortTabla(Object.values(map));
}

// ── Estilos del modal ─────────────────────────────────────────
const CSS_MODAL = `
  .im-section-title {
    font-size:11px; font-weight:700; text-transform:uppercase;
    letter-spacing:.6px; color:#4a6630; padding:10px 0 6px;
    border-bottom:2px solid #dde8cc; margin-bottom:4px;
    display:flex; align-items:center; gap:6px;
  }
  .im-row {
    display:flex; align-items:center; gap:8px;
    padding:6px 0; border-bottom:1px solid #f5f9ef;
    font-size:12px; color:#1a2e0a;
  }
  .im-row:last-child { border-bottom:none; }
  .im-match { flex:1; min-width:0; }
  .im-match-name { font-weight:500; }
  .im-result { font-weight:700; color:#639922; margin:0 4px; }
  .im-pred { font-size:11px; color:#7a9460; margin-top:1px; }
  .im-tag-ganador {
    font-size:10px; font-weight:700; color:#3b6d11;
    background:#e8f3da; border-radius:5px; padding:1px 6px;
    display:inline-block; margin-top:3px;
  }
  .im-empty { font-size:12px; color:#7a9460; padding:10px 0; font-style:italic; }
  .im-pending { font-size:12px; color:#7a9460; padding:10px 0;
    background:#f8faf6; border-radius:8px; text-align:center;
    border:1px dashed #c0dd97; margin-top:4px; }
  .im-header {
    background:#1e3d0a; border-radius:10px; padding:14px 16px;
    display:flex; align-items:center; justify-content:space-between;
    margin-bottom:14px;
  }
  .im-header-name {
    font-family:'Bebas Neue',sans-serif; font-size:22px;
    letter-spacing:1px; color:#c0dd97;
  }
  .im-header-pts {
    font-family:'Bebas Neue',sans-serif; font-size:36px;
    color:#fff; line-height:1;
  }
  .im-header-label {
    font-size:10px; color:rgba(192,221,151,.7);
    font-weight:600; text-transform:uppercase;
    letter-spacing:.5px; text-align:right;
  }
  .im-partido-header {
    background:#1e3d0a; border-radius:10px; padding:14px 16px;
    margin-bottom:14px; text-align:center;
  }
  .im-partido-title {
    font-family:'Bebas Neue',sans-serif; font-size:18px;
    letter-spacing:1px; color:#c0dd97; margin-bottom:4px;
  }
  .im-partido-score {
    font-family:'Bebas Neue',sans-serif; font-size:32px;
    color:#fff; letter-spacing:2px;
  }
  .im-table { width:100%; border-collapse:collapse; font-size:12px; }
  .im-table th {
    font-size:10px; font-weight:700; text-transform:uppercase;
    letter-spacing:.5px; color:#7a9460; padding:6px 8px;
    border-bottom:2px solid #dde8cc; text-align:left;
    background:#fafdf6;
  }
  .im-table th:last-child { text-align:center; }
  .im-table td { padding:7px 8px; border-bottom:1px solid #f0f6e8; vertical-align:middle; }
  .im-table td:last-child { text-align:center; }
  .im-table tr:last-child td { border-bottom:none; }
  .im-table tr:hover td { background:#fafdf6; }
`;

function inyectarCSS() {
  if (document.getElementById('informe-modal-css')) return;
  const style = document.createElement('style');
  style.id = 'informe-modal-css';
  style.textContent = CSS_MODAL;
  document.head.appendChild(style);
}

// ════════════════════════════════════════════════════════════════
//  MODAL JUGADOR
// ════════════════════════════════════════════════════════════════

export async function abrirModalJugador(uid, nombre) {
  inyectarCSS();

  // Mostrar modal con spinner mientras carga
  window.appAbrirModal(
    t('informe.title_player'),
    `<div style="text-align:center; padding:30px; color:#7a9460; font-size:13px;">
       <div class="spinner-sm" style="margin:0 auto 10px;"></div>
       ${t('informe.loading')}
     </div>`,
    `<button class="btn btn-secondary" onclick="window.appCerrarModal()">${t('informe.close')}</button>`
  );

  try {
    // ── Cargar datos en paralelo ──────────────────────────────
    const [
      resGruposSnap, predGruposSnap,
      resElimSnap,   predElimSnap,
      espSnap,       configSnap,
      predTercerosSnap
    ] = await Promise.all([
      getDocs(collection(db, 'resultados')),
      getDocs(query(collection(db, 'predicciones'), where('uid', '==', uid))),
      getDocs(collection(db, 'res_ko')),
      getDocs(query(collection(db, 'pred_ko'), where('uid', '==', uid))),
      getDoc(doc(db, 'pred_especiales', uid)),
      getDoc(doc(db, 'config', 'general')),
      getDoc(doc(db, 'pred_terceros', uid))
    ]);

    // Resultados de grupos
    const resGrupos = {};
    resGruposSnap.forEach(d => { resGrupos[d.id] = d.data(); });

    // Predicciones de grupos del jugador
    const predGrupos = {};
    predGruposSnap.forEach(d => {
      const x = d.data();
      if (x.partido_id && x.partido_id !== 'desempates') predGrupos[x.partido_id] = x;
    });

    // Resultados de eliminatorias
    const resElim = {};
    resElimSnap.forEach(d => { resElim[d.id] = d.data(); });

    // Predicciones de eliminatorias del jugador
    const predElim = {};
    predElimSnap.forEach(d => {
      const x = d.data();
      if (x.partido_id) predElim[x.partido_id] = x;
    });

    const esp    = espSnap.exists() ? espSnap.data() : null;
    const config = configSnap.exists() ? configSnap.data() : {};

    // Terceros del jugador y confirmados por FIFA
    const predTercerosData    = predTercerosSnap.exists() ? predTercerosSnap.data() : null;
    const equiposTerceros     = predTercerosData?.equipos || [];
    const tercerosConfirmados = new Set(config.terceros_confirmados || []);

    // ── Calcular total ────────────────────────────────────────
    let total = 0;

    // Grupos confirmados, orden alfabético por id
    const gruposConfirmados = Object.entries(resGrupos)
      .filter(([, r]) => r.confirmado)
      .sort(([a], [b]) => a.localeCompare(b));

    gruposConfirmados.forEach(([, r]) => {
      const pred = predGrupos[r.partido_id || ''] ||
                   Object.values(predGrupos).find(p => p.partido_id === r.partido_id);
    });

    // Recalcular total sumando grupos + elim + especiales
    gruposConfirmados.forEach(([id, r]) => {
      total += calcGrupo(predGrupos[id], r.goles_local, r.goles_visitante);
    });

    const elimConfirmados = Object.entries(resElim)
      .filter(([, r]) => r.confirmado)
      .sort(([a], [b]) => a.localeCompare(b));

    elimConfirmados.forEach(([id, r]) => {
      total += calcularPuntosPartidoElim(predElim[id], r);
    });

    const itemsEsp = calcEspeciales(esp, config, resElim);
    itemsEsp.forEach(e => { total += e.pts; });

    // Puntos de terceros: 0,5 por cada equipo confirmado
    equiposTerceros.forEach(nombre => {
      if (tercerosConfirmados.has(nombre)) total += 0.5;
    });

    // ── Clasificados de grupo ─────────────────────────────────
    const GRUPOS_LETRAS = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    const clasificadosGrupos = [];

    GRUPOS_LETRAS.forEach(grupo => {
      const partidos = _getPartidosDeGrupo(grupo);
      const todoConfirmado = partidos.every(p => resGrupos[p.id]?.confirmado);
      if (!todoConfirmado) return;

      const tablaReal = _calcTablaGrupoReal(grupo, resGrupos);
      const realesSet = new Set([tablaReal[0]?.nombre, tablaReal[1]?.nombre].filter(Boolean));
      const real1     = tablaReal[0]?.nombre || '?';
      const real2     = tablaReal[1]?.nombre || '?';

      const tablaPred = _calcTablaGrupoPrediccion(grupo, predGrupos);
      const pred1     = tablaPred[0]?.nombre || '?';
      const pred2     = tablaPred[1]?.nombre || '?';

      let puntos = 0;
      if (pred1 !== '?' && realesSet.has(pred1)) puntos++;
      if (pred2 !== '?' && realesSet.has(pred2)) puntos++;

      clasificadosGrupos.push({ grupo, pred1, pred2, real1, real2, realesSet, puntos });
      total += puntos;
    });

    // ── Render ────────────────────────────────────────────────
    const bodyHtml = renderModalJugador(
      nombre, total,
      gruposConfirmados, predGrupos,
      clasificadosGrupos,
      elimConfirmados, predElim,
      itemsEsp,
      equiposTerceros, tercerosConfirmados
    );

    document.getElementById('modalBody').innerHTML    = bodyHtml;
    document.getElementById('modalFooter').innerHTML  =
      `<button class="btn btn-secondary" onclick="window.appCerrarModal()">${t('informe.close')}</button>`;

  } catch (e) {
    console.error('[abrirModalJugador]', e);
    document.getElementById('modalBody').innerHTML =
      `<div class="notice error">⚠️ ${t('informe.error')}</div>`;
  }
}

// ── Calcular especiales (igual que informe.html) ──────────────
function calcEspeciales(esp, config, resElim) {
  if (!esp) return [];
  const items = [];
  const mvpOfi = config.mvp_oficial    || '';
  const golOfi = config.goleador_oficial || '';
  const finalRes = resElim['elimfin'];
  let campeon = '', subcampeon = '';
  if (finalRes?.confirmado) {
    campeon    = finalRes.equipo_que_pasa || '';
    subcampeon = campeon === finalRes.equipo_local
      ? (finalRes.equipo_visitante || '')
      : (finalRes.equipo_local    || '');
  }

  const predCamp = norm(esp.campeon_corregido    || esp.campeon    || '');
  const predSub  = norm(esp.subcampeon_corregido || esp.subcampeon || '');
  const predMvp  = norm(esp.mvp_corregido        || esp.mvp        || '');
  const predGol  = norm(esp.goleador_corregido   || esp.goleador   || '');

  items.push({
    id: 'Campeón',
    predTexto: esp.campeon    || '—',
    realTexto: campeon        || null,
    pts: (campeon    && predCamp && norm(campeon)    === predCamp) ? 6 : 0,
    pendiente: !campeon
  });
  items.push({
    id: 'Subcampeón',
    predTexto: esp.subcampeon || '—',
    realTexto: subcampeon     || null,
    pts: (subcampeon && predSub  && norm(subcampeon) === predSub)  ? 2 : 0,
    pendiente: !subcampeon
  });
  items.push({
    id: 'MVP',
    predTexto: esp.mvp        || '—',
    realTexto: mvpOfi         || null,
    pts: (mvpOfi     && predMvp  && norm(mvpOfi)     === predMvp)  ? 3 : 0,
    pendiente: !mvpOfi
  });
  items.push({
    id: 'Goleador',
    predTexto: esp.goleador   || '—',
    realTexto: golOfi         || null,
    pts: (golOfi     && predGol  && norm(golOfi)     === predGol)  ? 3 : 0,
    pendiente: !golOfi
  });

  return items;
}

// ── Render del cuerpo del modal jugador ──────────────────────
function renderModalJugador(nombre, total, gruposConf, predGrupos, clasificadosGrupos, elimConf, predElim, itemsEsp, equiposTerceros, tercerosConfirmados) {
  let html = '';

  // Cabecera con nombre y total
  html += `
    <div class="im-header">
      <span class="im-header-name">${nombre}</span>
      <div>
        <div class="im-header-pts">${total}</div>
        <div class="im-header-label">${t('informe.pts_label')}</div>
      </div>
    </div>`;

  // ── GRUPOS ────────────────────────────────────────────────
  html += `<div class="im-section-title">${t('informe.section_groups')}</div>`;
  if (!gruposConf.length) {
    html += `<div class="im-empty">${t('informe.no_groups')}</div>`;
  } else {
    gruposConf.forEach(([id, res]) => {
      const info = PARTIDOS_GRUPOS_MAP[id] || {};
      const pred = predGrupos[id];
      const pts  = calcGrupo(pred, res.goles_local, res.goles_visitante);
      const predStr = pred
        ? `${parseInt(pred.local ?? pred.goles_local ?? '?')}–${parseInt(pred.visitante ?? pred.goles_visitante ?? '?')}`
        : '—';
      const nombreLocal     = info.local     || res.equipo_local     || id;
      const nombreVisitante = info.visitante || res.equipo_visitante || '?';

      html += `
        <div class="im-row">
          <div class="im-match">
            <div class="im-match-name">
              ${nombreLocal}
              <span class="im-result">${res.goles_local}–${res.goles_visitante}</span>
              ${nombreVisitante}
            </div>
            <div class="im-pred">${t('informe.pred_label')}: ${predStr}</div>
          </div>
          ${ptsBadge(pts)}
        </div>`;
    });
  }

  // ── CLASIFICADOS DE GRUPO ─────────────────────────────────
  html += `<div class="im-section-title" style="margin-top:10px;">${t('informe.section_qualified')}</div>`;
  if (!clasificadosGrupos.length) {
    html += `<div class="im-empty">${t('informe.no_qualified')}</div>`;
  } else {
    clasificadosGrupos.forEach(({ grupo, pred1, pred2, real1, real2, realesSet, puntos }) => {
      const p1ok = realesSet.has(pred1);
      const p2ok = realesSet.has(pred2);
      html += `
        <div class="im-row">
          <div class="im-match">
            <div class="im-match-name" style="font-size:11px; font-weight:700; color:#4a6630; letter-spacing:.4px;">
              ${t('common.group')} ${grupo}
            </div>
            <div class="im-pred">
              ${t('informe.pred_label')}:
              <span style="color:${p1ok ? '#639922' : '#c0392b'}; font-weight:600;">${pred1}</span>
              ·
              <span style="color:${p2ok ? '#639922' : '#c0392b'}; font-weight:600;">${pred2}</span>
            </div>
            <div class="im-pred">
              ${t('informe.real_label')}: ${real1} · ${real2}
            </div>
          </div>
          ${ptsBadge(puntos)}
        </div>`;
    });
  }

  // ── ELIMINATORIAS ─────────────────────────────────────────
  html += `<div class="im-section-title" style="margin-top:10px;">${t('informe.section_knockouts')}</div>`;
  if (!elimConf.length) {
    html += `<div class="im-empty">Sin partidos confirmados todavía.</div>`;
  } else {
    elimConf.forEach(([id, res]) => {
      const pred   = predElim[id];
      const pts    = calcularPuntosPartidoElim(pred, res);
      const ronda  = nombreRonda(res.ronda) || id;
      const local  = res.equipo_local     || '?';
      const visit  = res.equipo_visitante || '?';
      const pasa   = res.equipo_que_pasa  || '';

      let predStr = '—';
      if (pred) {
        predStr = `${pred.local ?? '?'}–${pred.visitante ?? '?'}`;
        if (pred.ganador) predStr += ` (${pred.ganador})`;
      }

      const pasaStr = (res.hay_prorroga_penales && pasa)
        ? ` → ${pasa} (p.p.)`
        : (pasa && pasa !== (res.goles_local > res.goles_visitante ? local : visit))
          ? ` → ${pasa}`
          : '';

      const tagGanadorAcertado = pts === 2
        ? `<div class="im-tag-ganador">${t('informe.winner_correct')}</div>`
        : '';

      html += `
        <div class="im-row">
          <div class="im-match">
            <div class="im-match-name">
              <span style="font-size:10px; color:#7a9460; font-weight:700; margin-right:4px;">${ronda}</span>
              ${local}
              <span class="im-result">${res.goles_local}–${res.goles_visitante}</span>
              ${visit}${pasaStr}
            </div>
            <div class="im-pred">${t('informe.pred_label')}: ${predStr}</div>
            ${tagGanadorAcertado}
          </div>
          ${ptsBadge(pts)}
        </div>`;
    });
  }

  // ── ESPECIALES ────────────────────────────────────────────
  html += `<div class="im-section-title" style="margin-top:10px;">${t('informe.section_specials')}</div>`;
  if (!itemsEsp.length) {
    html += `<div class="im-empty">${t('informe.no_specials')}</div>`;
  } else {
    itemsEsp.forEach(e => {
      const realStr = e.pendiente ? t('informe.pending') : (e.realTexto || '—');
      html += `
        <div class="im-row">
          <div class="im-match">
            <div class="im-match-name">
              <span style="font-size:10px; color:#7a9460; font-weight:700; margin-right:4px;">${e.id}</span>
              ${t('informe.real_label')}: <span class="im-result" style="color:${e.pendiente ? '#7a9460' : '#639922'};">${realStr}</span>
            </div>
            <div class="im-pred">${t('informe.pred_label')}: ${e.predTexto}</div>
          </div>
          ${e.pendiente
            ? `<span style="font-size:10px; color:#7a9460; font-style:italic; flex-shrink:0;">?</span>`
            : ptsBadge(e.pts)}
        </div>`;
    });
  }

  // ── TERCEROS ──────────────────────────────────────────────
  html += `<div class="im-section-title" style="margin-top:10px;">${t('informe.section_thirds')}</div>`;

  if (!equiposTerceros || equiposTerceros.length === 0) {
    html += `<div class="im-empty">${t('informe.no_thirds')}</div>`;
  } else {
    equiposTerceros.forEach(nombre => {
      const confirmado = tercerosConfirmados.has(nombre);
      const pts = confirmado ? 0.5 : null; // null = pendiente

      html += `
        <div class="im-row">
          <div class="im-match">
            <div class="im-match-name" style="font-weight:500;">${nombre}</div>
            <div class="im-pred" style="color:${confirmado ? 'var(--gl)' : 'var(--tm)'};">
              ${confirmado
                ? `✅ ${t('thirdPlace.correct')}`
                : `⏳ ${t('thirdPlace.resultPending')}`}
            </div>
          </div>
          ${confirmado
            ? ptsBadge(0.5)
            : `<span style="font-size:11px; color:var(--tm); font-style:italic; flex-shrink:0; width:32px; text-align:center;">?</span>`}
        </div>`;
    });

    // Resumen
    const aciertos = equiposTerceros.filter(n => tercerosConfirmados.has(n)).length;
    const totalConf = tercerosConfirmados.size;
    if (totalConf > 0) {
      html += `
        <div style="margin-top:8px; padding:8px 12px; background:var(--gg);
          border:1px solid var(--gp); border-radius:8px;
          font-size:12px; color:var(--gd); font-weight:600;">
          ${aciertos}/${totalConf} ${t('informe.thirds_confirmed_label')} · ${(aciertos * 0.5).toFixed(1)} pts
          ${totalConf < 8
            ? `<span style="font-weight:400; color:var(--tm); margin-left:6px;">(${8 - totalConf} ${t('informe.thirds_pending_label')})</span>`
            : ''}
        </div>`;
    }
  }

  return html;
}

// ════════════════════════════════════════════════════════════════
//  MODAL PARTIDO
// ════════════════════════════════════════════════════════════════

export async function abrirModalPartido(partidoId, esElim) {
  inyectarCSS();

  window.appAbrirModal(
    t('informe.title_match'),
    `<div style="text-align:center; padding:30px; color:#7a9460; font-size:13px;">
       <div class="spinner-sm" style="margin:0 auto 10px;"></div>
       ${t('informe.loading')}
     </div>`,
    `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cerrar</button>`
  );

  try {
    if (esElim) {
      await _modalPartidoElim(partidoId);
    } else {
      await _modalPartidoGrupo(partidoId);
    }
  } catch (e) {
    console.error('[abrirModalPartido]', e);
    document.getElementById('modalBody').innerHTML =
      `<div class="notice error">⚠️ ${t('informe.error')}</div>`;
  }
}

// ── Modal partido de grupo ────────────────────────────────────
async function _modalPartidoGrupo(partidoId) {
  const [resSnap, predSnap, usuSnap] = await Promise.all([
    getDoc(doc(db, 'resultados', partidoId)),
    getDocs(query(collection(db, 'predicciones'), where('partido_id', '==', partidoId))),
    getDocs(collection(db, 'usuarios'))
  ]);

  if (!resSnap.exists() || !resSnap.data().confirmado) {
    document.getElementById('modalBody').innerHTML =
      `<div class="notice">Este partido aún no tiene resultado confirmado.</div>`;
    return;
  }

  const res   = resSnap.data();
  const info  = PARTIDOS_GRUPOS_MAP[partidoId] || {};
  const local = info.local     || res.equipo_local     || partidoId;
  const visit = info.visitante || res.equipo_visitante || '?';

  // Mapa de nombres de jugadores
  const nombres = {};
  usuSnap.forEach(d => {
    const u = d.data();
    nombres[d.id] = u.nombre_visible || u.username || d.id.slice(0, 6);
  });

  // Predicciones indexadas por uid
  const preds = {};
  predSnap.forEach(d => {
    const x = d.data();
    if (x.uid) preds[x.uid] = x;
  });

  // Construir filas: todos los jugadores (con o sin predicción)
  const filas = Object.entries(nombres)
    .filter(([, n]) => n) // excluir entradas vacías
    .map(([uid, nombre]) => {
      const pred = preds[uid];
      const pts  = calcGrupo(pred, res.goles_local, res.goles_visitante);
      const predStr = pred
        ? `${parseInt(pred.local ?? pred.goles_local ?? '?')}–${parseInt(pred.visitante ?? pred.goles_visitante ?? '?')}`
        : '—';
      return { nombre, predStr, pts };
    })
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      return a.nombre.localeCompare(b.nombre);
    });

  document.getElementById('modalBody').innerHTML =
    _renderCabeceraPartido(local, visit, res.goles_local, res.goles_visitante, null, null) +
    _renderTablaPartido(filas);
  document.getElementById('modalFooter').innerHTML =
    `<button class="btn btn-secondary" onclick="window.appCerrarModal()">${t('informe.close')}</button>`;
}

// ── Modal partido de eliminatorias ────────────────────────────
async function _modalPartidoElim(partidoId) {
  const [resSnap, predSnap, usuSnap] = await Promise.all([
    getDoc(doc(db, 'res_ko', partidoId)),
    getDocs(query(collection(db, 'pred_ko'), where('partido_id', '==', partidoId))),
    getDocs(collection(db, 'usuarios'))
  ]);

  if (!resSnap.exists() || !resSnap.data().confirmado) {
    document.getElementById('modalBody').innerHTML =
      `<div class="notice">Este partido aún no tiene resultado confirmado.</div>`;
    return;
  }

  const res   = resSnap.data();
  const ronda = nombreRonda(res.ronda) || partidoId;
  const local = res.equipo_local     || '?';
  const visit = res.equipo_visitante || '?';
  const pasa  = res.equipo_que_pasa  || '';

  // Mapa de nombres de jugadores
  const nombres = {};
  usuSnap.forEach(d => {
    const u = d.data();
    if (u.rol !== 'admin') nombres[d.id] = u.nombre_visible || u.username || d.id.slice(0, 6);
  });

  // Predicciones indexadas por uid
  const preds = {};
  predSnap.forEach(d => {
    const x = d.data();
    if (x.uid) preds[x.uid] = x;
  });

  // Construir filas
  const filas = Object.entries(nombres).map(([uid, nombre]) => {
    const pred = preds[uid];
    const pts  = calcularPuntosPartidoElim(pred, res);
    let predStr = '—';
    if (pred) {
      predStr = `${pred.local ?? '?'}–${pred.visitante ?? '?'}`;
      if (pred.ganador) predStr += ` (${pred.ganador})`;
    }
    return { nombre, predStr, pts };
  }).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    return a.nombre.localeCompare(b.nombre);
  });

  document.getElementById('modalBody').innerHTML =
    _renderCabeceraPartido(local, visit, res.goles_local, res.goles_visitante, ronda, pasa) +
    _renderTablaPartido(filas);
  document.getElementById('modalFooter').innerHTML =
    `<button class="btn btn-secondary" onclick="window.appCerrarModal()">${t('informe.close')}</button>`;
}

// ── Cabecera del modal de partido ─────────────────────────────
function _renderCabeceraPartido(local, visit, gl, gv, ronda, pasa) {
  return `
    <div class="im-partido-header">
      ${ronda ? `<div style="font-size:11px; color:rgba(192,221,151,.7); font-weight:700; margin-bottom:4px;">${ronda}</div>` : ''}
      <div class="im-partido-title">${local} vs ${visit}</div>
      <div class="im-partido-score">${gl} — ${gv}</div>
      ${pasa ? `<div style="font-size:12px; color:#c0dd97; margin-top:4px;">→ ${t('informe.advances')}: <strong>${pasa}</strong></div>` : ''}
    </div>`;
}

// ── Tabla de jugadores en el modal de partido ─────────────────
function _renderTablaPartido(filas) {
  if (!filas.length) {
    return `<div class="im-empty">${t('informe.no_match_preds')}</div>`;
  }

  const rows = filas.map(f => `
    <tr>
      <td style="font-weight:500;">${f.nombre}</td>
      <td style="color:#7a9460;">${f.predStr}</td>
      <td>${ptsBadge(f.pts)}</td>
    </tr>`).join('');

  return `
    <table class="im-table">
      <thead>
        <tr>
          <th>${t('informe.col_player')}</th>
          <th>${t('informe.col_prediction')}</th>
          <th style="text-align:center;">${t('informe.col_points')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}
