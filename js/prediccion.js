// ============================================================
//  js/prediccion.js
//  Pestaña "Mi porra" — fase de grupos, eliminatorias,
//  especiales y mejores terceros
// ============================================================

import { db } from './firebase-config.js';
import {
  doc, getDoc, setDoc, updateDoc, collection,
  query, where, getDocs, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t, formatMatchDate } from './i18n.js';
import { plazoAbierto, obtenerConfig } from './auth.js';
import {
  PARTIDOS_GRUPOS, GRUPOS, EQUIPOS_48,
  getPartidosPorGrupo
} from '../data/partidos.js';
import { PARTIDOS_ELIM_R32, MAPA_DEPENDENCIAS } from '../data/partidos_elim.js';

// ── Estado del módulo ─────────────────────────────────────────
let _app         = null;
let _subTab      = 'grupos';   // 'grupos' | 'eliminatorias' | 'especiales' | 'terceros'
let _grupoActivo = 'A';
let _verTodosGrupos = false;
let _predGrupos  = {};
let _predElim    = {};
let _predEsp     = {};
let _predTerceros = [];   // array de hasta 8 nombres de equipos seleccionados
let _resultados  = {};
let _plazoGrupos = true;
let _plazoElim   = true;
let _plazoTerceros = true;
let _config      = {};
let _totalGlobal = null;
let _rezagado    = false;   // true si el admin marcó a este jugador como rezagado en eliminatorias

// ── Punto de entrada ─────────────────────────────────────────
export async function initMiPorra(app) {
  _app = app;
  const contenedor = document.getElementById('miPorraContent');
  contenedor.innerHTML = `<div class="loading-inline"><div class="spinner-sm"></div><span>${t('common.loading')}</span></div>`;

  try {
    [_plazoGrupos, _plazoElim, _plazoTerceros, _config] = await Promise.all([
      plazoAbierto('grupos'),
      plazoAbierto('eliminatorias'),
      plazoAbierto('terceros'),
      obtenerConfig()
    ]);

    try {
      const uSnap = await getDoc(doc(db, 'usuarios', _app.uid));
      _rezagado = !!(uSnap.exists() && uSnap.data().rezagado_elim && uSnap.data().rezagado_elim.activo);
    } catch (e) {
      console.warn('[initMiPorra] rezagado_elim:', e);
      _rezagado = false;
    }

    await Promise.all([
      cargarPrediccionesGrupos(),
      cargarPrediccionesElim(),
      cargarPrediccionesEspeciales(),
      cargarPrediccionesTerceros(),
      cargarResultados(),
      cargarTotalGlobal()
    ]);

    renderMiPorra(contenedor);

    window._refreshTextos = () => {
      const c = document.getElementById('miPorraContent');
      if (c) renderMiPorra(c);
    };

  } catch (e) {
    console.error('[prediccion]', e);
    contenedor.innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
  }
}

// ── Render principal ──────────────────────────────────────────
function renderMiPorra(contenedor) {
  const stats = calcularStats();

  contenedor.innerHTML = `
    <div class="stats-row" style="margin-top:8px;">
      <div class="stat-card">
        <div class="stat-val">${stats.jugados}</div>
        <div class="stat-lbl">${t('myPool.statsPlayed')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-val green">${stats.exactos}</div>
        <div class="stat-lbl">${t('myPool.statsExact')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${stats.ganador}</div>
        <div class="stat-lbl">${t('myPool.statsWinner')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-val green">${stats.puntos}</div>
        <div class="stat-lbl">${t('myPool.statsPoints')}</div>
      </div>
    </div>

    <div class="sub-toggle">
      <button class="sub-btn ${_subTab === 'grupos' ? 'active' : ''}"
        onclick="window._prediccionSetTab('grupos')">${t('subNav.groupStage')}</button>
      <button class="sub-btn ${_subTab === 'eliminatorias' ? 'active' : ''}"
        onclick="window._prediccionSetTab('eliminatorias')">${t('subNav.knockouts')}</button>
      <button class="sub-btn ${_subTab === 'especiales' ? 'active' : ''}"
        onclick="window._prediccionSetTab('especiales')">${t('subNav.specials')}</button>
      <button class="sub-btn ${_subTab === 'terceros' ? 'active' : ''}"
        onclick="window._prediccionSetTab('terceros')">${t('subNav.thirdPlace')}</button>
    </div>

    <div id="prediccionTabContent"></div>
  `;

  window._prediccionSetTab = (tab) => {
    _subTab = tab;
    document.querySelectorAll('.sub-btn').forEach((b, i) => {
      b.classList.toggle('active', ['grupos','eliminatorias','especiales','terceros'][i] === tab);
    });
    renderTabContent();
  };

  window._guardarGrupos     = () => guardarPrediccionesGrupos();
  window._guardarElim       = () => guardarPrediccionesElim();
  window._guardarEspeciales = () => guardarPrediccionesEspeciales();
  window._guardarTerceros   = () => guardarPrediccionesTerceros();

  renderTabContent();
}

// ── Renderiza el contenido de la sub-pestaña activa ───────────
function renderTabContent() {
  const contenedor = document.getElementById('prediccionTabContent');
  if (_subTab === 'grupos')             renderGrupos(contenedor);
  else if (_subTab === 'eliminatorias') renderEliminatorias(contenedor);
  else if (_subTab === 'especiales')    renderEspecialesTab(contenedor);
  else                                  renderTerceros(contenedor);
}

// ══════════════════════════════════════════════════════════════
//  FASE DE GRUPOS
// ══════════════════════════════════════════════════════════════

function renderGrupos(contenedor) {
  const cerrado  = !_plazoGrupos;
  const fechaStr = formatFechaLimite(_config.fecha_limite_grupos);

  const selectorGrupos = GRUPOS.map(g =>
    `<button class="pag-btn ${_grupoActivo === g && !_verTodosGrupos ? 'active' : ''}"
      onclick="window._prediccionSetGrupo('${g}')">${g}</button>`
  ).join('');

  contenedor.innerHTML = `
    ${cerrado
      ? `<div class="notice locked">🔒 ${t('myPool.closedNotice')}</div>`
      : `<div class="notice">🔓 ${t('myPool.openUntil')} <strong>${fechaStr}</strong> ${t('myPool.localTime')}</div>`
    }

    <div class="pag-row" style="flex-wrap:wrap; margin-bottom:8px; gap:4px;">
      ${selectorGrupos}
      <button class="pag-btn ${_verTodosGrupos ? 'active' : ''}"
        onclick="window._prediccionVerTodos()"
        style="min-width:80px;">
        ${_verTodosGrupos ? '← Volver' : 'Ver todos'}
      </button>
    </div>

    <div id="grupoContent"></div>

    ${!cerrado ? `
      <button class="btn btn-primary btn-full" onclick="window._guardarGrupos()">
        💾 ${t('myPool.saveBtn')}
      </button>
      <button class="btn btn-danger btn-full" style="margin-top:8px;"
        onclick="window._borrarPredicciones('grupos')">
        🗑️ Borrar mis predicciones de grupos
      </button>
    ` : ''}
  `;

  window._prediccionSetGrupo = (g) => {
    _grupoActivo = g;
    _verTodosGrupos = false;
    renderGrupos(contenedor);
  };

  window._prediccionVerTodos = () => {
    _verTodosGrupos = !_verTodosGrupos;
    renderGrupos(contenedor);
  };

  window._borrarPredicciones = (tipo) => confirmarBorrado(tipo);

  if (_verTodosGrupos) {
    renderTodosGrupos(document.getElementById('grupoContent'));
  } else {
    renderGrupoDetalle(document.getElementById('grupoContent'));
  }
}

function renderTodosGrupos(contenedor) {
  let html = '';
  GRUPOS.forEach(g => {
    const partidos = getPartidosPorGrupo(g);
    const equipos  = obtenerEquiposGrupo(g);
    const tabla    = calcularTablaGrupo(g, partidos, equipos);

    html += `<div class="group-pill" style="margin-bottom:6px;">⚽ ${t('common.group')} ${g}</div>
    <div class="group-table" style="margin-bottom:14px;">
      <div class="group-table-header">
        <div class="gt-head">#</div>
        <div class="gt-head left">Equipo</div>
        <div class="gt-head">J</div><div class="gt-head">G</div>
        <div class="gt-head">E</div><div class="gt-head">P</div>
        <div class="gt-head">Pts</div>
      </div>`;
    tabla.forEach((eq, i) => {
      html += `
        <div class="group-table-row ${i < 2 ? 'qualifies' : ''}">
          <div class="gt-pos">${i + 1}</div>
          <div class="gt-team">
            <span class="gt-flag">${eq.flag}</span>
            <span class="gt-name">${eq.nombre}</span>
          </div>
          <div class="gt-val">${eq.j}</div><div class="gt-val">${eq.g}</div>
          <div class="gt-val">${eq.e}</div><div class="gt-val">${eq.p}</div>
          <div class="gt-pts">${eq.pts}</div>
        </div>`;
    });
    html += `</div>`;
  });
  contenedor.innerHTML = html;
  if (window.parseTwemoji) window.parseTwemoji(contenedor);
}

function renderGrupoDetalle(contenedor) {
  const partidos = getPartidosPorGrupo(_grupoActivo);
  const cerrado  = !_plazoGrupos;

  let html = `<div class="group-pill">⚽ ${t('common.group')} ${_grupoActivo}</div>`;

  [1, 2, 3].forEach(jornada => {
    const pJornada = partidos.filter(p => p.jornada === jornada);
    if (!pJornada.length) return;

    html += `<div style="font-size:10px; font-weight:600; color:var(--tm); text-transform:uppercase; letter-spacing:.5px; margin:10px 0 6px;">${t('common.matchday')} ${jornada}</div>`;

    pJornada.forEach(p => {
      const pred = _predGrupos[p.id] || { local: '', visitante: '' };
      const res  = _resultados[p.id];
      const clase = res ? clasePredGrupo(pred, res) : 'pred-pending';
      const ptsBadge = res ? badgePuntosGrupo(pred, res) : `<span class="pts-badge pts-pending">${t('myPool.pending')}</span>`;

      html += `
        <div class="match-card ${clase}" id="mc_${p.id}">
          <div class="match-meta">
            <span>${formatMatchDate(p.fechaUTC)}</span>
            <span>📍 ${p.ciudad}</span>
            ${ptsBadge}
          </div>
          <div class="match-row">
            <div class="match-team">
              <span class="match-flag">${p.flagLocal}</span>
              <span class="match-name">${p.local}</span>
            </div>
            <div class="score-area">
              <span class="score-label">${t('myPool.scorePrediction')}</span>
              <div class="score-inputs">
                <input class="score-input" type="number" min="0" max="20"
                  id="sc_${p.id}_l" value="${pred.local !== '' ? pred.local : ''}"
                  ${cerrado ? 'disabled' : ''}
                  onchange="window._onScoreChange('${p.id}')">
                <span class="score-sep">—</span>
                <input class="score-input" type="number" min="0" max="20"
                  id="sc_${p.id}_v" value="${pred.visitante !== '' ? pred.visitante : ''}"
                  ${cerrado ? 'disabled' : ''}
                  onchange="window._onScoreChange('${p.id}')">
              </div>
              ${res ? `
                <span class="score-label">${t('myPool.scoreReal')}</span>
                <span class="score-real">${res.goles_local} — ${res.goles_visitante}</span>
              ` : ''}
            </div>
            <div class="match-team right">
              <span class="match-flag">${p.flagVisitante}</span>
              <span class="match-name">${p.visitante}</span>
            </div>
          </div>
          <div class="match-pts-info">${t('standings.criteria.groupWinner')}: 1pt · ${t('standings.criteria.groupExact')}: 3pts</div>
        </div>
      `;
    });
  });

  html += renderClasificacionGrupo(_grupoActivo, cerrado);

  contenedor.innerHTML = html;
  if (window.parseTwemoji) window.parseTwemoji(contenedor);

  window._onScoreChange = (partidoId) => {
    const l = document.getElementById(`sc_${partidoId}_l`).value;
    const v = document.getElementById(`sc_${partidoId}_v`).value;
    if (!_predGrupos[partidoId]) _predGrupos[partidoId] = {};
    _predGrupos[partidoId].local     = l !== '' ? parseInt(l) : '';
    _predGrupos[partidoId].visitante = v !== '' ? parseInt(v) : '';
    actualizarClasificacionGrupo(_grupoActivo);
  };

  window._onDesempate = (grupo, equipo1, equipo2, ganador) => {
    const key = `${grupo}_${equipo1}_${equipo2}`;
    if (!_predGrupos._desempates) _predGrupos._desempates = {};
    _predGrupos._desempates[key] = ganador;
    actualizarClasificacionGrupo(grupo);
  };
}

function renderClasificacionGrupo(grupo, cerrado) {
  const partidos = getPartidosPorGrupo(grupo);
  const equipos  = obtenerEquiposGrupo(grupo);
  const tabla    = calcularTablaGrupo(grupo, partidos, equipos);

  let html = `
    <div style="margin-top:14px;">
      <div style="font-size:11px; font-weight:700; color:var(--gm); margin-bottom:6px; display:flex; align-items:center; gap:6px;">
        📊 ${t('myPool.classifTitle')}
        <span style="font-size:9px; background:#f0f0f0; color:#888; padding:2px 6px; border-radius:8px;">${t('myPool.autoCalc')}</span>
      </div>
      <div class="group-table" id="tabla_${grupo}">
        <div class="group-table-header">
          <div class="gt-head">#</div>
          <div class="gt-head left">${t('common.group')}</div>
          <div class="gt-head">J</div>
          <div class="gt-head">G</div>
          <div class="gt-head">E</div>
          <div class="gt-head">P</div>
          <div class="gt-head">Pts</div>
          <div class="gt-head"></div>
        </div>
  `;

  const empatesGD = detectarEmpatesGD(tabla);

  tabla.forEach((eq, i) => {
    const pasa = i < 2;
    const esEmpate = empatesGD.some(par => par[0].nombre === eq.nombre || par[1].nombre === eq.nombre);
    html += `
      <div class="group-table-row ${pasa ? 'qualifies' : ''}">
        <div class="gt-pos">${i + 1}</div>
        <div class="gt-team">
          <span class="gt-flag">${eq.flag}</span>
          <span class="gt-name">${eq.nombre}</span>
        </div>
        <div class="gt-val">${eq.j}</div>
        <div class="gt-val">${eq.g}</div>
        <div class="gt-val">${eq.e}</div>
        <div class="gt-val">${eq.p}</div>
        <div class="gt-pts">${eq.pts}</div>
        <div class="gt-tie-icon">${esEmpate && !cerrado ? '⚠' : ''}</div>
      </div>
    `;
  });

  html += `</div>`;

  if (empatesGD.length && !cerrado) {
    empatesGD.forEach(par => {
      const key = `${grupo}_${par[0].nombre}_${par[1].nombre}`;
      const seleccionado = _predGrupos._desempates?.[key] || null;
      html += `
        <div class="tiebreak" style="margin-top:10px; border:1px solid var(--gold,#e6a817);
          border-radius:var(--radius); padding:12px 14px; background:var(--gold-pale,#fffbf0);">
          <div style="font-size:12px; font-weight:600; color:var(--gold-dark,#a07000);
            margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            ⚠ ${t('myPool.tiebreakNeeded')}
          </div>
          <div style="font-size:12px; color:var(--gold-dark,#a07000); margin-bottom:10px;">
            ${par[0].flag} ${par[0].nombre} ${t('common.and') || 'y'} ${par[1].flag} ${par[1].nombre}
            ${t('myPool.tiebreakExplain')}
          </div>
          <div class="tiebreak-opts">
            <button class="tiebreak-btn ${seleccionado === par[0].nombre ? 'selected' : ''}"
              onclick="window._onDesempate('${grupo}','${par[0].nombre}','${par[1].nombre}','${par[0].nombre}')">
              ${par[0].flag} ${par[0].nombre}
            </button>
            <button class="tiebreak-btn ${seleccionado === par[1].nombre ? 'selected' : ''}"
              onclick="window._onDesempate('${grupo}','${par[0].nombre}','${par[1].nombre}','${par[1].nombre}')">
              ${par[1].flag} ${par[1].nombre}
            </button>
          </div>
        </div>
      `;
    });
  }

  html += `
      <div class="group-table-note">
        <div style="width:8px;height:8px;border-radius:2px;background:var(--gg);border:1px solid var(--gp);flex-shrink:0;"></div>
        ${tabla[0]?.nombre && tabla[1]?.nombre
          ? `${tabla[0].nombre} y ${tabla[1].nombre} clasificados según tus predicciones`
          : ''}
      </div>
    </div>
  `;

  return html;
}

function actualizarClasificacionGrupo(grupo) {
  const tablaEl = document.getElementById(`tabla_${grupo}`);
  if (!tablaEl) return;
  const partidos = getPartidosPorGrupo(grupo);
  const equipos  = obtenerEquiposGrupo(grupo);
  const tabla    = calcularTablaGrupo(grupo, partidos, equipos);

  const rows = tablaEl.querySelectorAll('.group-table-row');
  tabla.forEach((eq, i) => {
    if (!rows[i]) return;
    rows[i].classList.toggle('qualifies', i < 2);
    rows[i].querySelector('.gt-pos').textContent  = i + 1;
    rows[i].querySelector('.gt-name').textContent = eq.nombre;
    rows[i].querySelector('.gt-flag').textContent = eq.flag;
    const vals = rows[i].querySelectorAll('.gt-val');
    vals[0].textContent = eq.j;
    vals[1].textContent = eq.g;
    vals[2].textContent = eq.e;
    vals[3].textContent = eq.p;
    rows[i].querySelector('.gt-pts').textContent = eq.pts;
  });
}

function calcularTablaGrupo(grupo, partidos, equipos) {
  const stats = {};
  equipos.forEach(eq => {
    stats[eq.nombre] = { ...eq, j:0, g:0, e:0, p:0, pts:0, gf:0, gc:0, gd:0 };
  });

  partidos.forEach(p => {
    const pred = _predGrupos[p.id];
    if (!pred || pred.local === '' || pred.visitante === '') return;

    const gl = parseInt(pred.local);
    const gv = parseInt(pred.visitante);
    if (isNaN(gl) || isNaN(gv)) return;

    const eqL = stats[p.local];
    const eqV = stats[p.visitante];
    if (!eqL || !eqV) return;

    eqL.j++; eqV.j++;
    eqL.gf += gl; eqL.gc += gv; eqL.gd = eqL.gf - eqL.gc;
    eqV.gf += gv; eqV.gc += gl; eqV.gd = eqV.gf - eqV.gc;

    if (gl > gv)      { eqL.g++; eqL.pts += 3; eqV.p++; }
    else if (gl < gv) { eqV.g++; eqV.pts += 3; eqL.p++; }
    else              { eqL.e++; eqV.e++; eqL.pts++; eqV.pts++; }
  });

  return Object.values(stats).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd  !== a.gd)  return b.gd  - a.gd;
    if (b.gf  !== a.gf)  return b.gf  - a.gf;
    const key = `${grupo}_${a.nombre}_${b.nombre}`;
    const keyRev = `${grupo}_${b.nombre}_${a.nombre}`;
    const des = _predGrupos._desempates || {};
    if (des[key] === b.nombre) return 1;
    if (des[key] === a.nombre) return -1;
    if (des[keyRev] === a.nombre) return -1;
    if (des[keyRev] === b.nombre) return 1;
    return 0;
  });
}

function detectarEmpatesGD(tabla) {
  const empates = [];
  for (let i = 0; i < tabla.length - 1; i++) {
    if (
      tabla[i].pts === tabla[i+1].pts &&
      tabla[i].gd  === tabla[i+1].gd  &&
      tabla[i].gf  === tabla[i+1].gf  &&
      tabla[i].j   > 0
    ) {
      empates.push([tabla[i], tabla[i+1]]);
    }
  }
  return empates;
}

function obtenerEquiposGrupo(grupo) {
  const partidos = getPartidosPorGrupo(grupo);
  const nombres = new Set();
  const equipos = [];
  partidos.forEach(p => {
    if (!nombres.has(p.local)) { nombres.add(p.local); equipos.push({ nombre: p.local, flag: p.flagLocal }); }
    if (!nombres.has(p.visitante)) { nombres.add(p.visitante); equipos.push({ nombre: p.visitante, flag: p.flagVisitante }); }
  });
  return equipos;
}

// ══════════════════════════════════════════════════════════════
//  MEJORES TERCEROS — 4ª sub-pestaña
// ══════════════════════════════════════════════════════════════

function renderTerceros(contenedor) {
  const cerrado  = !_plazoTerceros;
  const fechaStr = formatFechaLimite(_config.fecha_limite_terceros);

  const seleccionados = _predTerceros.length;
  const selPorGrupo = {};
  _predTerceros.forEach(nombre => {
    const partido = PARTIDOS_GRUPOS.find(p => p.local === nombre || p.visitante === nombre);
    if (partido) selPorGrupo[partido.grupo] = nombre;
  });

  const plazoInfo = cerrado
    ? `<div class="notice locked">🔒 ${t('thirdPlace.closedNotice')}</div>`
    : `<div class="notice">🔓 ${t('thirdPlace.openUntil')} <strong>${fechaStr}</strong> ${t('myPool.localTime')}</div>`;

  if (cerrado) {
    const tercerosConfirmados = new Set(_config.terceros_confirmados || []);
    const hayConfirmados = tercerosConfirmados.size > 0;

    let html = `${plazoInfo}`;

    if (_predTerceros.length === 0) {
      html += `<div class="notice" style="margin-top:8px; color:var(--tm);">No guardaste ninguna selección de mejores terceros.</div>`;
    } else {
      html += `<div style="margin-top:12px;">
        <div style="font-size:13px; font-weight:600; color:var(--gd); margin-bottom:10px;">
          🥉 ${t('thirdPlace.title')} — ${t('specials.locked')}
        </div>`;

      if (hayConfirmados) {
        html += `<div style="font-size:11px; color:var(--tm); margin-bottom:8px;">
          ${t('thirdPlace.officialThirds')}: ${[...tercerosConfirmados].join(', ')}
        </div>`;
      }

      _predTerceros.forEach(nombre => {
        const eq = EQUIPOS_48.find(e => e.nombre === nombre);
        const flag = eq?.flag || '';
        const esCorrecto = tercerosConfirmados.has(nombre);
        const icono = hayConfirmados && tercerosConfirmados.size === 8
          ? (esCorrecto ? '✅' : '❌')
          : esCorrecto
            ? '✅'
            : '⏳';
        const color = esCorrecto ? 'var(--gl)' : hayConfirmados ? 'var(--tm)' : 'var(--tm)';
        const textoEstado = esCorrecto
          ? t('thirdPlace.correct') + ' +0.5 pts'
          : (tercerosConfirmados.size === 8 ? t('thirdPlace.missed') : t('thirdPlace.resultPending'));

        html += `
          <div style="display:flex; align-items:center; gap:10px; padding:8px 10px;
            border:1px solid ${esCorrecto ? 'var(--gl)' : '#eee'};
            border-radius:var(--radius); margin-bottom:6px;
            background:${esCorrecto ? 'var(--gl-pale,#f0f7e8)' : '#fff'};">
            <span style="font-size:18px;">${flag}</span>
            <span style="flex:1; font-size:13px; font-weight:500;">${nombre}</span>
            <span style="font-size:12px; font-weight:600; color:${color};">
              ${icono} ${textoEstado}
            </span>
          </div>`;
      });

      if (hayConfirmados) {
        const aciertos = _predTerceros.filter(n => tercerosConfirmados.has(n)).length;
        const totalPosibles = tercerosConfirmados.size;
        html += `
          <div style="margin-top:12px; padding:10px 14px; background:var(--gg); border:1px solid var(--gp);
            border-radius:var(--radius); font-size:13px; font-weight:600; color:var(--gd);">
            ${aciertos}/${totalPosibles} aciertos confirmados · ${(aciertos * 0.5).toFixed(1)} pts
            ${totalPosibles < 8 ? `<span style="font-size:11px; font-weight:400; color:var(--tm); margin-left:8px;">(${8 - totalPosibles} pendiente${8 - totalPosibles !== 1 ? 's' : ''} de confirmar)</span>` : ''}
          </div>`;
      }
      html += `</div>`;
    }

    contenedor.innerHTML = html;
    return;
  }

  let html = `
    ${plazoInfo}
    <div style="margin-top:12px;">
      <div style="font-size:13px; font-weight:600; color:var(--gd); margin-bottom:4px;">
        🥉 ${t('thirdPlace.title')}
      </div>
      <div style="font-size:12px; color:var(--tm); margin-bottom:12px;">
        Elige 1 equipo de cada grupo que crees que pasará como mejor tercero. Máximo 8 grupos.
      </div>

      <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px; padding:8px 12px;
        background:${seleccionados === 8 ? 'var(--gl-pale,#f0f7e8)' : '#f7faf2'};
        border:1px solid ${seleccionados === 8 ? 'var(--gl)' : 'var(--gp)'};
        border-radius:var(--radius);">
        <span style="font-size:22px; font-family:'Bebas Neue',sans-serif; color:${seleccionados === 8 ? 'var(--gl)' : 'var(--gd)'};">
          ${seleccionados}/8
        </span>
        <span style="font-size:12px; color:var(--tm);">${t('thirdPlace.counter')}</span>
        ${seleccionados === 8
          ? `<span style="font-size:11px; color:var(--gl); margin-left:auto;">✓ Listo para guardar</span>`
          : ''}
      </div>
  `;

  GRUPOS.forEach(g => {
    const equiposGrupo = obtenerEquiposGrupo(g);
    const selEnGrupo   = selPorGrupo[g] || null;
    const grupoCompleto = seleccionados >= 8 && !selEnGrupo;

    html += `
      <div style="margin-bottom:10px; padding:10px 12px;
        border:1px solid ${selEnGrupo ? 'var(--gm)' : '#dde8cc'};
        border-radius:var(--radius);
        background:${selEnGrupo ? 'var(--gg)' : '#fff'};">
        <div style="font-size:10px; font-weight:700; color:var(--gm); text-transform:uppercase;
          letter-spacing:.5px; margin-bottom:8px;">
          ${t('common.group')} ${g}
          ${selEnGrupo ? `<span style="color:var(--gl); margin-left:6px;">✓ ${selEnGrupo}</span>` : ''}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
    `;

    equiposGrupo.forEach(eq => {
      const seleccionado = selEnGrupo === eq.nombre;
      const desactivado  = !seleccionado && grupoCompleto;

      html += `
        <label style="display:flex; align-items:center; gap:6px; padding:6px 10px;
          border:1px solid ${seleccionado ? 'var(--gm)' : '#eee'};
          border-radius:20px; cursor:${desactivado ? 'not-allowed' : 'pointer'};
          background:${seleccionado ? 'var(--gm)' : '#fafdf6'};
          opacity:${desactivado ? '0.4' : '1'};
          transition: all .15s;">
          <input type="checkbox"
            id="t_${g}_${eq.nombre.replace(/\s/g,'_')}"
            ${seleccionado ? 'checked' : ''}
            ${desactivado ? 'disabled' : ''}
            onchange="window._onTerceroChange('${g}','${eq.nombre}')"
            style="accent-color:var(--gm); width:14px; height:14px; flex-shrink:0;">
          <span style="font-size:16px;">${eq.flag}</span>
          <span style="font-size:12px; font-weight:${seleccionado ? '700' : '400'};
            color:${seleccionado ? '#fff' : 'var(--gd)'};">${eq.nombre}</span>
        </label>
      `;
    });

    html += `</div></div>`;
  });

  html += `
      ${seleccionados > 0 && seleccionados < 8
        ? `<div class="notice warn" style="margin-top:10px;">
            ⚠️ ${t('thirdPlace.minWarning')}
           </div>`
        : ''}

      <button class="btn btn-primary btn-full" style="margin-top:14px;"
        onclick="window._guardarTerceros()">
        💾 ${t('thirdPlace.saveBtn')}
      </button>
      <button class="btn btn-danger btn-full" style="margin-top:8px;"
        onclick="window._borrarPredicciones('terceros')">
        🗑️ Borrar mi selección de terceros
      </button>
    </div>`;

  contenedor.innerHTML = html;

  window._onTerceroChange = (grupo, nombre) => {
    const anteriorEnGrupo = selPorGrupo[grupo];

    if (anteriorEnGrupo === nombre) {
      _predTerceros = _predTerceros.filter(n => n !== nombre);
    } else {
      if (anteriorEnGrupo) {
        _predTerceros = _predTerceros.filter(n => n !== anteriorEnGrupo);
      }
      if (!anteriorEnGrupo && _predTerceros.length >= 8) {
        window.mostrarToast('⚠️ ' + t('thirdPlace.maxWarning'), 3000);
        const cb = document.getElementById(`t_${grupo}_${nombre.replace(/\s/g,'_')}`);
        if (cb) cb.checked = false;
        return;
      }
      _predTerceros = [..._predTerceros, nombre];
    }
    renderTerceros(contenedor);
  };

  window._borrarPredicciones = (tipo) => confirmarBorrado(tipo);
}

// ══════════════════════════════════════════════════════════════
//  PREDICCIONES ESPECIALES
// ══════════════════════════════════════════════════════════════

function renderEspecialesTab(contenedor) {
  const cerrado = !_plazoGrupos;
  const esp     = _predEsp;
  const fechaStr = formatFechaLimite(_config.fecha_limite_grupos);

  if (cerrado) {
    const mvpOficial = _config.mvp_oficial      || '';
    const golOficial = _config.goleador_oficial || '';

    const norm = str =>
      (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const mvpOriginal  = esp.mvp           || '—';
    const mvpCorregido = esp.mvp_corregido || '';
    const mvpEfectivo  = mvpCorregido || mvpOriginal;
    const mvpAcierto   = mvpOficial && norm(mvpOficial) === norm(mvpEfectivo) && mvpEfectivo !== '—';

    const golOriginal  = esp.goleador           || '—';
    const golCorregido = esp.goleador_corregido || '';
    const golEfectivo  = golCorregido || golOriginal;
    const golAcierto   = golOficial && norm(golOficial) === norm(golEfectivo) && golEfectivo !== '—';

    const infoCorreccion = (original, corregido, oficial, acierto) => {
      let html = `<div class="special-value">${original}</div>`;
      if (corregido && norm(corregido) !== norm(original)) {
        html += `<div style="font-size:11px; color:var(--gd); margin-top:5px;
          background:var(--gl-pale, #f0f7e8); border-left:3px solid var(--gl);
          padding:4px 8px; border-radius:4px;">
          ✏️ El admin lo ha corregido a: <strong>${corregido}</strong>
        </div>`;
      }
      if (oficial) {
        html += `<div style="font-size:11px; margin-top:6px; font-weight:600;
          color:${acierto ? 'var(--gl)' : 'var(--r)'};">
          ${acierto ? '✅ ¡Acertado!' : '❌ No acertado'} · Resultado oficial: <strong>${oficial}</strong>
        </div>`;
      } else {
        html += `<div style="font-size:11px; color:var(--tm); margin-top:4px;">
          ⏳ Resultado oficial pendiente
        </div>`;
      }
      return html;
    };

    contenedor.innerHTML = `
      <div class="notice locked" style="margin-top:8px;">
        🔒 ${t('specials.lockedSince')} ${fechaStr}
      </div>
      <div class="special-card locked-card">
        <div class="special-label">${t('specials.champion')} <span class="special-locked-badge">🔒 ${t('specials.champPts')}</span></div>
        <div class="special-value"><span style="font-size:18px;">${buscarFlag(esp.campeon)}</span> ${esp.campeon || '—'}</div>
      </div>
      <div class="special-card locked-card">
        <div class="special-label">${t('specials.runnerUp')} <span class="special-locked-badge">🔒 ${t('specials.runnerUpPts')}</span></div>
        <div class="special-value"><span style="font-size:18px;">${buscarFlag(esp.subcampeon)}</span> ${esp.subcampeon || '—'}</div>
      </div>
      <div class="special-card locked-card">
        <div class="special-label">${t('specials.mvp')} <span class="special-locked-badge">🔒 ${t('specials.mvpPts')}</span></div>
        ${infoCorreccion(mvpOriginal, mvpCorregido, mvpOficial, mvpAcierto)}
      </div>
      <div class="special-card locked-card">
        <div class="special-label">${t('specials.topScorer')} <span class="special-locked-badge">🔒 ${t('specials.topScorerPts')}</span></div>
        ${infoCorreccion(golOriginal, golCorregido, golOficial, golAcierto)}
      </div>`;
    return;
  }

  contenedor.innerHTML = `
    <div style="margin-top:8px;">
      <div class="notice">🔓 ${t('specials.openUntil')} <strong>${fechaStr}</strong></div>

      <div class="special-card">
        <div class="special-label">${t('specials.champion')} <span class="special-pts-badge">${t('specials.champPts')}</span></div>
        <div class="autocomplete-wrap">
          <input class="special-input" type="text" id="esp_campeon"
            value="${esp.campeon || ''}" placeholder="${t('specials.teamPlaceholder')}"
            oninput="window._onEspInput('campeon', this.value)" autocomplete="off">
          <div class="autocomplete-list hidden" id="ac_campeon"></div>
        </div>
        <div class="special-hint ${!esp.campeon ? 'missing' : ''}" id="hint_campeon">
          ${esp.campeon ? buscarFlag(esp.campeon) + ' ' + esp.campeon : t('specials.missingWarning')}
        </div>
      </div>

      <div class="special-card">
        <div class="special-label">${t('specials.runnerUp')} <span class="special-pts-badge">${t('specials.runnerUpPts')}</span></div>
        <div class="autocomplete-wrap">
          <input class="special-input" type="text" id="esp_subcampeon"
            value="${esp.subcampeon || ''}" placeholder="${t('specials.teamPlaceholder')}"
            oninput="window._onEspInput('subcampeon', this.value)" autocomplete="off">
          <div class="autocomplete-list hidden" id="ac_subcampeon"></div>
        </div>
        <div class="special-hint ${!esp.subcampeon ? 'missing' : ''}" id="hint_subcampeon">
          ${esp.subcampeon ? buscarFlag(esp.subcampeon) + ' ' + esp.subcampeon : t('specials.missingWarning')}
        </div>
      </div>

      <div class="special-card">
        <div class="special-label">${t('specials.mvp')} <span class="special-pts-badge">${t('specials.mvpPts')}</span></div>
        <input class="special-input" type="text" id="esp_mvp"
          value="${esp.mvp || ''}" placeholder="${t('specials.playerPlaceholder')}"
          oninput="window._onEspDirecto('mvp', this.value)">
        <div class="special-hint ${!esp.mvp ? 'missing' : ''}" id="hint_mvp">
          ${esp.mvp ? '✓ ' + esp.mvp : t('specials.missingWarning')}
        </div>
        <div style="font-size:10px; color:var(--tm); margin-top:4px;">${t('specials.adminEditNote')}</div>
      </div>

      <div class="special-card">
        <div class="special-label">${t('specials.topScorer')} <span class="special-pts-badge">${t('specials.topScorerPts')}</span></div>
        <input class="special-input" type="text" id="esp_goleador"
          value="${esp.goleador || ''}" placeholder="${t('specials.playerPlaceholder')}"
          oninput="window._onEspDirecto('goleador', this.value)">
        <div class="special-hint ${!esp.goleador ? 'missing' : ''}" id="hint_goleador">
          ${esp.goleador ? '✓ ' + esp.goleador : t('specials.missingWarning')}
        </div>
        <div style="font-size:10px; color:var(--tm); margin-top:4px;">${t('specials.adminEditNote')}</div>
      </div>

      <button class="btn btn-primary btn-full" onclick="window._guardarEspeciales()">
        💾 ${t('specials.saveBtn')}
      </button>
      <button class="btn btn-danger btn-full" style="margin-top:8px;"
        onclick="window._borrarPredicciones('especiales')">
        🗑️ Borrar mis predicciones especiales
      </button>
    </div>`;
}

// ── Confirmar borrado ─────────────────────────────────────────
function confirmarBorrado(tipo) {
  const labels = {
    grupos:        'predicciones de grupos',
    eliminatorias: 'predicciones de eliminatorias',
    especiales:    'predicciones especiales',
    terceros:      'selección de mejores terceros'
  };
  window.appAbrirModal(
    '🗑️ Borrar ' + labels[tipo],
    `<p style="font-size:13px;">¿Seguro que quieres borrar todas tus <strong>${labels[tipo]}</strong>? Esta acción no se puede deshacer.</p>`,
    `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="window._confirmarBorradoFinal('${tipo}')">🗑️ Sí, borrar</button>`
  );
}

window._confirmarBorradoFinal = async (tipo) => {
  try {
    window.appCerrarModal();
    window.mostrarToast('🗑️ Borrando...');
    const { deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

    if (tipo === 'grupos') {
      const q = query(collection(db, 'predicciones'), where('uid', '==', _app.uid));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      _predGrupos = {};
    } else if (tipo === 'eliminatorias') {
      const q = query(collection(db, 'pred_ko'), where('uid', '==', _app.uid));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      _predElim = {};
    } else if (tipo === 'especiales') {
      await deleteDoc(doc(db, 'pred_especiales', _app.uid));
      _predEsp = {};
    } else if (tipo === 'terceros') {
      await deleteDoc(doc(db, 'pred_terceros', _app.uid));
      _predTerceros = [];
    }

    window.mostrarToast('✅ Predicciones borradas');
    renderTabContent();
  } catch (e) {
    console.error('[borrarPredicciones]', e);
    window.mostrarToast('❌ Error al borrar', 5000);
  }
};

// ══════════════════════════════════════════════════════════════
//  ELIMINATORIAS — BRACKET
// ══════════════════════════════════════════════════════════════

function renderEliminatorias(contenedor) {
  const cerrado  = !_plazoElim && !_rezagado;
  const fechaStr = formatFechaLimite(_config.fecha_limite_eliminatorias);
  const scrollPrevio = document.querySelector('.bracket-scroll')?.scrollLeft || 0;

  contenedor.innerHTML = `
    ${cerrado
      ? `<div class="notice locked">🔒 ${t('knockouts.closedNotice')}</div>`
      : (_rezagado && !_plazoElim
          ? `<div class="notice" style="background:#fff9ec; border-color:#f0d98c;">⏳ Tienes tiempo extra para completar tus predicciones de eliminatorias. Avisa al administrador cuando las tengas listas.</div>`
          : `<div class="notice">🔓 ${t('knockouts.openUntil')} <strong>${fechaStr}</strong> ${t('myPool.localTime')}</div>`)
    }

    <div class="bracket-legend">
      <div class="bl-item"><div class="bl-dot" style="border:1.5px solid var(--gm);"></div>Editable</div>
      <div class="bl-item"><div class="bl-dot" style="background:var(--gg);border:1px solid var(--gp);"></div>Ganador avanzado</div>
      <div class="bl-item"><div class="bl-dot" style="background:#fffbea;border:1px solid #f5e8b0;"></div>Empate — elige quién pasa</div>
    </div>

    <div class="bracket-scroll">
      <div class="bracket-canvas" id="bracketCanvas" style="position:relative; min-width:1300px; height:1060px;">
        ${renderBracketSVG(cerrado)}
        ${renderBracketPartidos(cerrado)}
      </div>
    </div>

    ${!cerrado ? `
      <button class="btn btn-primary btn-full" onclick="window._guardarElim()">
        💾 ${t('myPool.saveBtn')}
      </button>
      <button class="btn btn-danger btn-full" style="margin-top:8px;"
        onclick="window._borrarPredicciones('eliminatorias')">
        🗑️ Borrar mis predicciones de eliminatorias
      </button>
    ` : ''}
  `;

  window._guardarElim = () => guardarPrediccionesElim();
  window._onElimScore = (id) => onElimScoreChange(id);
  window._onElimTB    = (id, ganador) => onElimTiebreak(id, ganador);
  window._borrarPredicciones = (tipo) => confirmarBorrado(tipo);

  const nuevoScroll = document.querySelector('.bracket-scroll');
  if (nuevoScroll) nuevoScroll.scrollLeft = scrollPrevio;
}

function renderBracketSVG(cerrado) {
  return `
    <svg style="position:absolute;top:0;left:0;width:1300px;height:1060px;pointer-events:none;overflow:visible;">
      <!-- ── IZQUIERDA: R32 → R16 ── -->
      <line class="conn-line" x1="130" y1="62"  x2="137" y2="62"/>
      <line class="conn-line" x1="130" y1="192" x2="137" y2="192"/>
      <line class="conn-line" x1="137" y1="62"  x2="137" y2="192"/>
      <line class="conn-line" x1="137" y1="127" x2="145" y2="127"/>

      <line class="conn-line" x1="130" y1="322" x2="137" y2="322"/>
      <line class="conn-line" x1="130" y1="452" x2="137" y2="452"/>
      <line class="conn-line" x1="137" y1="322" x2="137" y2="452"/>
      <line class="conn-line" x1="137" y1="387" x2="145" y2="387"/>

      <line class="conn-line" x1="130" y1="582" x2="137" y2="582"/>
      <line class="conn-line" x1="130" y1="712" x2="137" y2="712"/>
      <line class="conn-line" x1="137" y1="582" x2="137" y2="712"/>
      <line class="conn-line" x1="137" y1="647" x2="145" y2="647"/>

      <line class="conn-line" x1="130" y1="842" x2="137" y2="842"/>
      <line class="conn-line" x1="130" y1="972" x2="137" y2="972"/>
      <line class="conn-line" x1="137" y1="842" x2="137" y2="972"/>
      <line class="conn-line" x1="137" y1="907" x2="145" y2="907"/>

      <!-- ── IZQUIERDA: R16 → QF ── -->
      <line class="conn-line" x1="275" y1="127" x2="282" y2="127"/>
      <line class="conn-line" x1="275" y1="387" x2="282" y2="387"/>
      <line class="conn-line" x1="282" y1="127" x2="282" y2="387"/>
      <line class="conn-line" x1="282" y1="257" x2="290" y2="257"/>

      <line class="conn-line" x1="275" y1="647" x2="282" y2="647"/>
      <line class="conn-line" x1="275" y1="907" x2="282" y2="907"/>
      <line class="conn-line" x1="282" y1="647" x2="282" y2="907"/>
      <line class="conn-line" x1="282" y1="777" x2="290" y2="777"/>

      <!-- ── IZQUIERDA: QF → SF ── -->
      <line class="conn-line" x1="420" y1="257" x2="427" y2="257"/>
      <line class="conn-line" x1="420" y1="777" x2="427" y2="777"/>
      <line class="conn-line" x1="427" y1="257" x2="427" y2="777"/>
      <line class="conn-line" x1="427" y1="517" x2="435" y2="517"/>

      <!-- ── IZQUIERDA: SF → FINAL ── -->
      <line class="conn-line" x1="565" y1="517" x2="580" y2="517" stroke-width="2"/>

      <!-- ── DERECHA: R32 → R16 ── -->
      <line class="conn-line" x1="1170" y1="62"  x2="1163" y2="62"/>
      <line class="conn-line" x1="1170" y1="192" x2="1163" y2="192"/>
      <line class="conn-line" x1="1163" y1="62"  x2="1163" y2="192"/>
      <line class="conn-line" x1="1163" y1="127" x2="1155" y2="127"/>

      <line class="conn-line" x1="1170" y1="322" x2="1163" y2="322"/>
      <line class="conn-line" x1="1170" y1="452" x2="1163" y2="452"/>
      <line class="conn-line" x1="1163" y1="322" x2="1163" y2="452"/>
      <line class="conn-line" x1="1163" y1="387" x2="1155" y2="387"/>

      <line class="conn-line" x1="1170" y1="582" x2="1163" y2="582"/>
      <line class="conn-line" x1="1170" y1="712" x2="1163" y2="712"/>
      <line class="conn-line" x1="1163" y1="582" x2="1163" y2="712"/>
      <line class="conn-line" x1="1163" y1="647" x2="1155" y2="647"/>

      <line class="conn-line" x1="1170" y1="842" x2="1163" y2="842"/>
      <line class="conn-line" x1="1170" y1="972" x2="1163" y2="972"/>
      <line class="conn-line" x1="1163" y1="842" x2="1163" y2="972"/>
      <line class="conn-line" x1="1163" y1="907" x2="1155" y2="907"/>

      <!-- ── DERECHA: R16 → QF ── -->
      <line class="conn-line" x1="1025" y1="127" x2="1018" y2="127"/>
      <line class="conn-line" x1="1025" y1="387" x2="1018" y2="387"/>
      <line class="conn-line" x1="1018" y1="127" x2="1018" y2="387"/>
      <line class="conn-line" x1="1018" y1="257" x2="1010" y2="257"/>

      <line class="conn-line" x1="1025" y1="647" x2="1018" y2="647"/>
      <line class="conn-line" x1="1025" y1="907" x2="1018" y2="907"/>
      <line class="conn-line" x1="1018" y1="647" x2="1018" y2="907"/>
      <line class="conn-line" x1="1018" y1="777" x2="1010" y2="777"/>

      <!-- ── DERECHA: QF → SF ── -->
      <line class="conn-line" x1="880" y1="257" x2="873" y2="257"/>
      <line class="conn-line" x1="880" y1="777" x2="873" y2="777"/>
      <line class="conn-line" x1="873" y1="257" x2="873" y2="777"/>
      <line class="conn-line" x1="873" y1="517" x2="865" y2="517"/>

      <!-- ── DERECHA: SF → FINAL ── -->
      <line class="conn-line" x1="735" y1="517" x2="720" y2="517" stroke-width="2"/>

      <!-- ── 3er PUESTO (dashed) ── -->
      <line class="conn-line" x1="500" y1="554" x2="500" y2="638" stroke-dasharray="4,3" opacity="0.5"/>
      <line class="conn-line" x1="500" y1="638" x2="580" y2="638" stroke-dasharray="4,3" opacity="0.5"/>
      <line class="conn-line" x1="800" y1="554" x2="800" y2="638" stroke-dasharray="4,3" opacity="0.5"/>
      <line class="conn-line" x1="800" y1="638" x2="720" y2="638" stroke-dasharray="4,3" opacity="0.5"/>
    </svg>
  `;
}

function renderBracketPartidos(cerrado) {
  let html = '';

  // ── Etiquetas de columnas ──────────────────────────────────
  const colsL = [
    { label: '1/16',    x: 0   },
    { label: '1/8',     x: 145 },
    { label: 'Cuartos', x: 290 },
    { label: 'Semis',   x: 435 },
  ];
  colsL.forEach(c => {
    html += `<div class="bracket-col-label" style="left:${c.x}px;top:6px;width:130px;">${c.label}</div>`;
  });
  html += `<div class="bracket-col-label" style="left:580px;top:6px;width:140px;text-align:center;">🏆 Final</div>`;
  const colsR = [
    { label: 'Semis',   x: 735  },
    { label: 'Cuartos', x: 880  },
    { label: '1/8',     x: 1025 },
    { label: '1/16',    x: 1170 },
  ];
  colsR.forEach(c => {
    html += `<div class="bracket-col-label" style="left:${c.x}px;top:6px;width:130px;">${c.label}</div>`;
  });
  html += `<div class="bracket-col-label" style="left:580px;top:600px;width:140px;text-align:center;color:var(--tm);">🥉 3er puesto</div>`;

  // ── R32 izquierda ──────────────────────────────────────────
  // Visual: 1-4 arriba (slots 0-3), 8-5 abajo (slots 4-7 invertidos)
  const r32Todos = obtenerPartidos16();
  const posR32L = [
    { id: 'elim16_1', top: 24  }, { id: 'elim16_2', top: 154 },
    { id: 'elim16_3', top: 284 }, { id: 'elim16_4', top: 414 },
    { id: 'elim16_8', top: 544 }, { id: 'elim16_7', top: 674 },
    { id: 'elim16_6', top: 804 }, { id: 'elim16_5', top: 934 },
  ];
  posR32L.forEach(({ id, top }) => {
    const p = r32Todos.find(x => x.id === id);
    if (p) html += renderBracketMatch(p, 0, top, cerrado, '1/16');
  });

  // ── R16 izquierda ──────────────────────────────────────────
  const partidos8 = obtenerPartidosFase('1/8');
  const posR16L = [
    { id: 'elim8_2', top: 89  },
    { id: 'elim8_1', top: 349 },
    { id: 'elim8_5', top: 609 },
    { id: 'elim8_6', top: 869 },
  ];
  posR16L.forEach(({ id, top }) => {
    const p = partidos8.find(x => x.id === id);
    if (p) html += renderBracketMatch(p, 145, top, cerrado, '1/8');
  });

  // ── QF izquierda ───────────────────────────────────────────
  const partidosCuartos = obtenerPartidosFase('1/4');
  const posQFL = [
    { id: 'elim4_1', top: 219 },
    { id: 'elim4_2', top: 739 },
  ];
  posQFL.forEach(({ id, top }) => {
    const p = partidosCuartos.find(x => x.id === id);
    if (p) html += renderBracketMatch(p, 290, top, cerrado, '1/4');
  });

  // ── Semis ──────────────────────────────────────────────────
  const partidosSemis = obtenerPartidosFase('semi');
  const sf1 = partidosSemis.find(x => x.id === 'elim2_1');
  if (sf1) html += renderBracketMatch(sf1, 435, 479, cerrado, 'semi');

  // ── Final ──────────────────────────────────────────────────
  const final = obtenerPartidosFase('final')[0];
  if (final) {
    html += renderBracketMatch({ ...final, esFinal: true }, 580, 479, cerrado, 'final');
    const pred     = _predElim[final.id] || {};
    const campeon  = pred.ganador || '—';
    const coincide = campeon === _predEsp.campeon;
    html += `
      <div class="champ-badge" style="position:absolute;left:580px;top:${479-40}px;width:140px;">
        🥇 ${campeon}
      </div>
      <div class="champ-sub" style="position:absolute;left:580px;top:${479-22}px;width:140px;font-size:8px;color:#aaa;text-align:center;">
        ${coincide && campeon !== '—'
          ? '✓ Coincide con tu predicción especial · +6 pts'
          : campeon !== '—' ? 'Diferente a tu predicción especial' : ''}
      </div>`;
  }

  // ── 3er puesto ─────────────────────────────────────────────
  const tercero = obtenerPartidosFase('3er')[0];
  if (tercero) html += renderBracketMatch(tercero, 580, 618, cerrado, '3er');

  // ── Semis derecha ──────────────────────────────────────────
  const sf2 = partidosSemis.find(x => x.id === 'elim2_2');
  if (sf2) html += renderBracketMatch(sf2, 735, 479, cerrado, 'semi');

  // ── QF derecha ─────────────────────────────────────────────
  const posQFR = [
    { id: 'elim4_3', top: 219 },
    { id: 'elim4_4', top: 739 },
  ];
  posQFR.forEach(({ id, top }) => {
    const p = partidosCuartos.find(x => x.id === id);
    if (p) html += renderBracketMatch(p, 880, top, cerrado, '1/4');
  });

  // ── R16 derecha ────────────────────────────────────────────
  const posR16R = [
    { id: 'elim8_3', top: 89  },
    { id: 'elim8_4', top: 349 },
    { id: 'elim8_7', top: 609 },
    { id: 'elim8_8', top: 869 },
  ];
  posR16R.forEach(({ id, top }) => {
    const p = partidos8.find(x => x.id === id);
    if (p) html += renderBracketMatch(p, 1025, top, cerrado, '1/8');
  });

  // ── R32 derecha ────────────────────────────────────────────
  // Visual: 9-12 arriba (slots 0-3), 16-13 abajo (slots 4-7 invertidos)
  const posR32R = [
    { id: 'elim16_9',  top: 24  }, { id: 'elim16_10', top: 154 },
    { id: 'elim16_11', top: 284 }, { id: 'elim16_12', top: 414 },
    { id: 'elim16_16', top: 544 }, { id: 'elim16_15', top: 674 },
    { id: 'elim16_14', top: 804 }, { id: 'elim16_13', top: 934 },
  ];
  posR32R.forEach(({ id, top }) => {
    const p = r32Todos.find(x => x.id === id);
    if (p) html += renderBracketMatch(p, 1170, top, cerrado, '1/16');
  });

  return html;
}

function renderBracketMatch(p, left, top, cerrado, fase) {
  const pred    = _predElim[p.id] || {};
  const anchura = fase === 'final' || fase === '3er' ? 140 : 130;
  const eqL     = p.equipoLocal     || `<span class="bm-placeholder">${p.placeholderLocal    || '?'}</span>`;
  const eqV     = p.equipoVisitante || `<span class="bm-placeholder">${p.placeholderVisitante|| '?'}</span>`;
  const flagL   = p.flagLocal    || '';
  const flagV   = p.flagVisitante|| '';
  const ganador = pred.ganador   || null;
  const esEmpate = (pred.local !== undefined && pred.visitante !== undefined &&
    parseInt(pred.local) === parseInt(pred.visitante) &&
    !isNaN(parseInt(pred.local)));

  const claseL = ganador === (p.equipoLocal || p.placeholderLocal) ? 'win' : '';
  const claseV = ganador === (p.equipoVisitante || p.placeholderVisitante) ? 'win' : '';
  const locked = cerrado;

  let html = `
    <div class="bracket-match ${locked ? 'lock' : 'edit'} ${fase === 'final' ? 'final' : fase === '3er' ? 'third' : ''}"
      style="position:absolute; left:${left}px; top:${top}px; width:${anchura}px;">
      <div class="bm-date">📅 ${p.fechaUTC ? formatMatchDate(p.fechaUTC) : (p.fecha || '—')} · ${p.ciudad || '—'}</div>
      <div class="bm-team ${claseL}">
        ${flagL ? `<span class="bm-flag">${flagL}</span>` : ''}
        ${typeof eqL === 'string' && eqL.startsWith('<') ? eqL : `<span class="bm-name">${eqL}</span>`}
        <input class="bm-input" type="number" min="0" max="20"
          id="be_${p.id}_l" value="${pred.local ?? ''}"
          ${locked ? 'disabled' : ''}
          onchange="window._onElimScore('${p.id}')">
      </div>
      <div class="bm-team ${claseV}">
        ${flagV ? `<span class="bm-flag">${flagV}</span>` : ''}
        ${typeof eqV === 'string' && eqV.startsWith('<') ? eqV : `<span class="bm-name">${eqV}</span>`}
        <input class="bm-input" type="number" min="0" max="20"
          id="be_${p.id}_v" value="${pred.visitante ?? ''}"
          ${locked ? 'disabled' : ''}
          onchange="window._onElimScore('${p.id}')">
      </div>
      ${esEmpate ? `
        <div class="bm-tiebreak">
          <span class="bm-tb-label">⚠️ ¿Pasa?</span>
          <button class="bm-tb-btn ${pred.ganador === (p.equipoLocal || p.placeholderLocal) ? 'selected' : ''}"
            onclick="window._onElimTB('${p.id}','${p.equipoLocal || p.placeholderLocal}')">
            ${flagL} ${(p.equipoLocal || p.placeholderLocal || '?').substring(0,3)}
          </button>
          <button class="bm-tb-btn ${pred.ganador === (p.equipoVisitante || p.placeholderVisitante) ? 'selected' : ''}"
            onclick="window._onElimTB('${p.id}','${p.equipoVisitante || p.placeholderVisitante}')">
            ${flagV} ${(p.equipoVisitante || p.placeholderVisitante || '?').substring(0,3)}
          </button>
        </div>
      ` : ''}
      <div class="bm-pts">Exacto(90')=4pts · Gan.=2pts</div>
    </div>
  `;
  return html;
}

// ── Obtener partidos R32 (hardcodeados) ───────────────────────
function obtenerPartidos16() {
  return PARTIDOS_ELIM_R32.map(p => ({
    id:                   p.id,
    equipoLocal:          p.local,
    equipoVisitante:      p.visitante,
    flagLocal:            buscarFlag(p.local),
    flagVisitante:        buscarFlag(p.visitante),
    placeholderLocal:     p.local,
    placeholderVisitante: p.visitante,
    fechaUTC:             p.fechaUTC,
    ciudad:               p.ciudad,
    desbloqueado:         true
  }));
}

// ── Obtener partidos de fases posteriores (R16 en adelante) ───
function obtenerPartidosFase(fase) {
  const fases = {
    '1/8': [
      { id: 'elim8_2',  pL: 'Gan. 16_1',  pV: 'Gan. 16_2',  fechaUTC: '2026-07-04T17:00:00Z', ciudad: 'Los Ángeles'      },
      { id: 'elim8_1',  pL: 'Gan. 16_3',  pV: 'Gan. 16_4',  fechaUTC: '2026-07-04T23:00:00Z', ciudad: 'Houston'          },
      { id: 'elim8_5',  pL: 'Gan. 16_8',  pV: 'Gan. 16_7',  fechaUTC: '2026-07-06T19:00:00Z', ciudad: 'Arlington'        },
      { id: 'elim8_6',  pL: 'Gan. 16_6',  pV: 'Gan. 16_5',  fechaUTC: '2026-07-07T00:00:00Z', ciudad: 'Seattle'          },
      { id: 'elim8_3',  pL: 'Gan. 16_9',  pV: 'Gan. 16_10', fechaUTC: '2026-07-05T20:00:00Z', ciudad: 'East Rutherford'  },
      { id: 'elim8_4',  pL: 'Gan. 16_11', pV: 'Gan. 16_12', fechaUTC: '2026-07-06T00:00:00Z', ciudad: 'Ciudad de México' },
      { id: 'elim8_7',  pL: 'Gan. 16_16', pV: 'Gan. 16_15', fechaUTC: '2026-07-07T16:00:00Z', ciudad: 'Atlanta'          },
      { id: 'elim8_8',  pL: 'Gan. 16_13', pV: 'Gan. 16_14', fechaUTC: '2026-07-07T20:00:00Z', ciudad: 'Vancouver'        },
    ],
    '1/4': [
      { id: 'elim4_1',  pL: 'Gan. 8_1',   pV: 'Gan. 8_2',   fechaUTC: '2026-07-09T20:00:00Z', ciudad: 'Los Ángeles'      },
      { id: 'elim4_2',  pL: 'Gan. 8_5',   pV: 'Gan. 8_6',   fechaUTC: '2026-07-10T19:00:00Z', ciudad: 'East Rutherford'  },
      { id: 'elim4_3',  pL: 'Gan. 8_3',   pV: 'Gan. 8_4',   fechaUTC: '2026-07-11T21:00:00Z', ciudad: 'Dallas'           },
      { id: 'elim4_4',  pL: 'Gan. 8_7',   pV: 'Gan. 8_8',   fechaUTC: '2026-07-12T01:00:00Z', ciudad: 'Kansas City'      },
    ],
    'semi': [
      { id: 'elim2_1',  pL: 'Gan. QF1',   pV: 'Gan. QF2',   fechaUTC: '2026-07-14T19:00:00Z', ciudad: 'Arlington'        },
      { id: 'elim2_2',  pL: 'Gan. QF3',   pV: 'Gan. QF4',   fechaUTC: '2026-07-15T19:00:00Z', ciudad: 'Atlanta'          },
    ],
    '3er': [
      { id: 'elim34',   pL: 'Perd. SF1',  pV: 'Perd. SF2',  fechaUTC: '2026-07-18T21:00:00Z', ciudad: 'Miami Gardens'    },
    ],
    'final': [
      { id: 'elimfin',  pL: 'Gan. SF1',   pV: 'Gan. SF2',   fechaUTC: '2026-07-19T19:00:00Z', ciudad: 'East Rutherford'  },
    ]
  };

  return (fases[fase] || []).map(c => {
    const esTercero = c.id === 'elim34';
    const equipL = (esTercero ? propagarPerdedor('elim2_1') : propagarGanador(c.id, 'local')) || null;
    const equipV = (esTercero ? propagarPerdedor('elim2_2') : propagarGanador(c.id, 'vis'))   || null;
    return {
      ...c,
      desbloqueado:    true,
      equipoLocal:     equipL,
      equipoVisitante: equipV,
      flagLocal:       buscarFlag(equipL) || '',
      flagVisitante:   buscarFlag(equipV) || '',
    };
  });
}

// ── Propagar ganador a través del bracket ─────────────────────
// Usa MAPA_DEPENDENCIAS importado de partidos_elim.js.
// Nunca modificar esta función sin actualizar el mapa.
function propagarGanador(partidoId, lado) {
  const dep = MAPA_DEPENDENCIAS[partidoId];
  if (!dep) return null;
  const srcId = dep[lado];
  const pred  = _predElim[srcId];
  return pred?.ganador || null;
}

// ── Propagar perdedor (para 3er puesto) ───────────────────────
function propagarPerdedor(srcId) {
  const pred = _predElim[srcId];
  if (!pred?.ganador) return null;
  const local = propagarGanador(srcId, 'local');
  const vis   = propagarGanador(srcId, 'vis');
  if (!local && !vis) return null;
  return pred.ganador === local ? (vis || null) : (local || null);
}

function onElimScoreChange(id) {
  // Safari/iOS fix: forzar blur antes de leer el valor
  document.getElementById(`be_${id}_l`)?.blur();
  document.getElementById(`be_${id}_v`)?.blur();

  const l = document.getElementById(`be_${id}_l`)?.value;
  const v = document.getElementById(`be_${id}_v`)?.value;
  if (!_predElim[id]) _predElim[id] = {};
  _predElim[id].local     = l !== '' ? parseInt(l) : '';
  _predElim[id].visitante = v !== '' ? parseInt(v) : '';

  if (l !== '' && v !== '' && parseInt(l) !== parseInt(v)) {
    const partido = buscarPartidoBracket(id);
    if (parseInt(l) > parseInt(v)) {
      _predElim[id].ganador = partido?.equipoLocal || partido?.placeholderLocal || null;
    } else {
      _predElim[id].ganador = partido?.equipoVisitante || partido?.placeholderVisitante || null;
    }
  } else if (parseInt(l) === parseInt(v)) {
    _predElim[id].ganador = null;
  }

  renderEliminatorias(document.getElementById('prediccionTabContent'));
}

function onElimTiebreak(id, ganador) {
  if (!_predElim[id]) _predElim[id] = {};
  _predElim[id].ganador = ganador;
  renderEliminatorias(document.getElementById('prediccionTabContent'));
}

function buscarPartidoBracket(id) {
  const todos = [
    ...obtenerPartidos16(),
    ...obtenerPartidosFase('1/8'),
    ...obtenerPartidosFase('1/4'),
    ...obtenerPartidosFase('semi'),
    ...obtenerPartidosFase('final'),
    ...obtenerPartidosFase('3er'),
  ];
  return todos.find(p => p.id === id) || null;
}

// ══════════════════════════════════════════════════════════════
//  GUARDAR EN FIRESTORE
// ══════════════════════════════════════════════════════════════

async function guardarPrediccionesGrupos() {
  if (!_plazoGrupos) return;
  try {
    window.mostrarToast('💾 Guardando...');

    const batch = [];
    Object.entries(_predGrupos).forEach(([id, pred]) => {
      if (id === '_desempates') return;
      if (!id || pred.local == null || pred.visitante == null || pred.local === '' || pred.visitante === '') return;
      batch.push(setDoc(
        doc(db, 'predicciones', `${_app.uid}_${id}`),
        { uid: _app.uid, partido_id: id, local: pred.local, visitante: pred.visitante, timestamp: serverTimestamp() },
        { merge: true }
      ));
    });

    if (_predGrupos._desempates) {
      batch.push(setDoc(
        doc(db, 'predicciones', `${_app.uid}_desempates`),
        { uid: _app.uid, desempates: _predGrupos._desempates, timestamp: serverTimestamp() },
        { merge: true }
      ));
    }

    await Promise.all(batch);
    window.mostrarToast('✅ ' + t('myPool.savedOk'));

    try {
      const { enviarEmailPredicciones } = await import('./email.js');
      await enviarEmailPredicciones(_app.usuario, _predGrupos, 'grupos');
    } catch (e) { console.warn('[email]', e); }

  } catch (e) {
    console.error('[guardarGrupos]', e);
    window.mostrarToast('❌ ' + t('myPool.savedError'), 5000);
  }
}

async function guardarPrediccionesElim() {
  if (!_plazoElim && !_rezagado) return;
  try {
    window.mostrarToast('💾 Guardando...');

    const batch = [];
    Object.entries(_predElim).forEach(([id, pred]) => {
      const partido = buscarPartidoBracket(id);
      const equipoLocalPred     = partido?.equipoLocal     || partido?.placeholderLocal     || null;
      const equipoVisitantePred = partido?.equipoVisitante || partido?.placeholderVisitante || null;

      batch.push(setDoc(
        doc(db, 'pred_ko', `${_app.uid}_${id}`),
        {
          uid:               _app.uid,
          partido_id:        id,
          local:             pred.local ?? '',
          visitante:         pred.visitante ?? '',
          ganador:           pred.ganador || null,
          equipo_local:      equipoLocalPred,
          equipo_visitante:  equipoVisitantePred,
          timestamp:         serverTimestamp()
        },
        { merge: true }
      ));
    });

    await Promise.all(batch);
    window.mostrarToast('✅ ' + t('myPool.savedOk'));

    try {
      const { enviarEmailPredicciones } = await import('./email.js');
      await enviarEmailPredicciones(_app.usuario, _predElim, 'eliminatorias');
    } catch (e) { console.warn('[email]', e); }

  } catch (e) {
    console.error('[guardarElim]', e);
    window.mostrarToast('❌ ' + t('myPool.savedError'), 5000);
  }
}

async function guardarPrediccionesEspeciales() {
  if (!_plazoGrupos) return;
  try {
    window.mostrarToast('💾 Guardando...');
    await setDoc(
      doc(db, 'pred_especiales', _app.uid),
      {
        uid:        _app.uid,
        campeon:    _predEsp.campeon    || '',
        subcampeon: _predEsp.subcampeon || '',
        mvp:        _predEsp.mvp        || '',
        goleador:   _predEsp.goleador   || '',
        bloqueado:  false,
        timestamp:  serverTimestamp()
      },
      { merge: true }
    );
    window.mostrarToast('✅ ' + t('myPool.savedOk'));

    try {
      const { enviarEmailPredicciones } = await import('./email.js');
      await enviarEmailPredicciones(_app.usuario, _predEsp, 'especiales');
    } catch (e) { console.warn('[email]', e); }

  } catch (e) {
    console.error('[guardarEsp]', e);
    window.mostrarToast('❌ ' + t('myPool.savedError'), 5000);
  }
}

async function guardarPrediccionesTerceros() {
  if (!_plazoTerceros) return;

  if (_predTerceros.length < 8) {
    window.mostrarToast('⚠️ ' + t('thirdPlace.minWarning'), 4000);
    return;
  }
  if (_predTerceros.length > 8) {
    window.mostrarToast('⚠️ ' + t('thirdPlace.maxWarning'), 4000);
    return;
  }

  try {
    window.mostrarToast('💾 Guardando...');
    await setDoc(
      doc(db, 'pred_terceros', _app.uid),
      {
        uid:       _app.uid,
        equipos:   _predTerceros,
        timestamp: serverTimestamp()
      },
      { merge: true }
    );
    window.mostrarToast('✅ ' + t('thirdPlace.savedOk'));

    try {
      const { enviarEmailPredicciones } = await import('./email.js');
      await enviarEmailPredicciones(_app.usuario, _predTerceros, 'terceros');
    } catch (e) { console.warn('[email]', e); }

  } catch (e) {
    console.error('[guardarTerceros]', e);
    window.mostrarToast('❌ ' + t('thirdPlace.savedError'), 5000);
  }
}

// ══════════════════════════════════════════════════════════════
//  CARGAR DESDE FIRESTORE
// ══════════════════════════════════════════════════════════════

async function cargarPrediccionesGrupos() {
  const q = query(collection(db, 'predicciones'), where('uid', '==', _app.uid));
  const snap = await getDocs(q);
  snap.forEach(d => {
    const data = d.data();
    if (!data.partido_id) return;
    if (data.partido_id === 'desempates') {
      _predGrupos._desempates = data.desempates || {};
    } else {
      _predGrupos[data.partido_id] = { local: data.local, visitante: data.visitante };
    }
  });
}

async function cargarPrediccionesElim() {
  // Lee de la nueva colección pred_ko (IDs nuevos elim16_*, elim8_*, etc.)
  // Los documentos viejos en predicciones_elim no se tocan.
  const q = query(collection(db, 'pred_ko'), where('uid', '==', _app.uid));
  const snap = await getDocs(q);
  snap.forEach(d => {
    const data = d.data();
    if (data.partido_id) {
      _predElim[data.partido_id] = {
        local:     data.local,
        visitante: data.visitante,
        ganador:   data.ganador
      };
    }
  });
}

async function cargarPrediccionesEspeciales() {
  const snap = await getDoc(doc(db, 'pred_especiales', _app.uid));
  if (snap.exists()) _predEsp = snap.data();
}

async function cargarPrediccionesTerceros() {
  try {
    const snap = await getDoc(doc(db, 'pred_terceros', _app.uid));
    if (snap.exists()) _predTerceros = snap.data().equipos || [];
  } catch (e) {
    _predTerceros = [];
  }
}

async function cargarResultados() {
  const snap = await getDocs(collection(db, 'resultados'));
  snap.forEach(d => { _resultados[d.id] = d.data(); });
}

async function cargarTotalGlobal() {
  const snap = await getDoc(doc(db, 'clasificacion', _app.uid));
  _totalGlobal = snap.exists() ? (snap.data().total ?? null) : null;
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

function calcularStats() {
  let jugados = 0, exactos = 0, ganador = 0, puntos = 0;
  PARTIDOS_GRUPOS.forEach(p => {
    const res  = _resultados[p.id];
    const pred = _predGrupos[p.id];
    if (!res || !pred) return;
    jugados++;
    if (pred.local === res.goles_local && pred.visitante === res.goles_visitante) {
      exactos++; puntos += 3;
    } else if (signo(pred.local, pred.visitante) === signo(res.goles_local, res.goles_visitante)) {
      ganador++; puntos += 1;
    }
  });
  return { jugados, exactos, ganador, puntos: _totalGlobal ?? puntos };
}

function signo(a, b) {
  if (a > b)  return 1;
  if (a < b)  return -1;
  return 0;
}

function clasePredGrupo(pred, res) {
  if (pred.local === res.goles_local && pred.visitante === res.goles_visitante) return 'pred-exact';
  if (signo(pred.local, pred.visitante) === signo(res.goles_local, res.goles_visitante)) return 'pred-winner';
  return 'pred-miss';
}

function badgePuntosGrupo(pred, res) {
  if (pred.local === res.goles_local && pred.visitante === res.goles_visitante) {
    return `<span class="pts-badge pts-exact">+3 pts ${t('myPool.exactResult')}</span>`;
  }
  if (signo(pred.local, pred.visitante) === signo(res.goles_local, res.goles_visitante)) {
    return `<span class="pts-badge pts-winner">+1 pt ${t('myPool.winnerOk')}</span>`;
  }
  return `<span class="pts-badge pts-miss">0 pts ${t('myPool.missed')}</span>`;
}

function buscarFlag(nombre) {
  if (!nombre) return '';
  const eq = EQUIPOS_48.find(e => e.nombre.toLowerCase() === nombre.toLowerCase());
  return eq ? eq.flag : '';
}

function formatFechaLimite(campo) {
  if (!campo) return '—';
  try {
    const d = campo.toDate ? campo.toDate() : new Date(campo);
    return d.toLocaleString(undefined, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
  } catch { return '—'; }
}

// ── Autocompletado de equipos ──────────────────────────────────
window._onEspInput = (campo, valor) => {
  _predEsp[campo] = valor;
  const lista = document.getElementById(`ac_${campo}`);
  if (!lista) return;
  if (valor.length < 2) { lista.classList.add('hidden'); return; }

  const matches = EQUIPOS_48.filter(e =>
    e.nombre.toLowerCase().includes(valor.toLowerCase())
  ).slice(0, 6);

  if (!matches.length) { lista.classList.add('hidden'); return; }

  lista.innerHTML = matches.map(e =>
    `<div class="autocomplete-item" onclick="window._seleccionarEquipo('${campo}','${e.nombre}','${e.flag}')">
      <span style="font-size:16px;">${e.flag}</span> ${e.nombre}
    </div>`
  ).join('');
  lista.classList.remove('hidden');
};

window._seleccionarEquipo = (campo, nombre, flag) => {
  _predEsp[campo] = nombre;
  const input = document.getElementById(`esp_${campo}`);
  const lista  = document.getElementById(`ac_${campo}`);
  const hint   = document.getElementById(`hint_${campo}`);
  if (input) input.value = nombre;
  if (lista) lista.classList.add('hidden');
  if (hint)  { hint.textContent = flag + ' ' + nombre; hint.classList.remove('missing'); }
};

window._onEspDirecto = (campo, valor) => {
  _predEsp[campo] = valor;
  const hint = document.getElementById(`hint_${campo}`);
  if (hint) {
    hint.textContent = valor ? '✓ ' + valor : t('specials.missingWarning');
    hint.classList.toggle('missing', !valor);
  }
};

window._guardarEspeciales = () => guardarPrediccionesEspeciales();

document.addEventListener('click', (e) => {
  if (!e.target.closest('.autocomplete-wrap')) {
    document.querySelectorAll('.autocomplete-list').forEach(l => l.classList.add('hidden'));
  }
});
