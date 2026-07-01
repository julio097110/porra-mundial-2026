// ============================================================
//  js/resultados_elim.js
//  Pestaña "Resultados" — Sub-vista Eliminatorias
//  - Jugadores: ven resultados confirmados de eliminatorias
//  - Admin: confirma resultados reales de eliminatorias
//
//  NUEVO ESQUEMA (jun 2026):
//  · Colección resultados: res_ko  (antes: resultados_elim — no tocar)
//  · Colección predicciones: pred_ko (antes: predicciones_elim)
//  · IDs nuevos: elim16_*, elim8_*, elim4_*, elim2_*, elimfin, elim34
//  · Equipos R32 hardcodeados en PARTIDOS_ELIM_R32 — no se leen de Firebase
// ============================================================

import { db } from './firebase-config.js';
import {
  doc, getDoc, setDoc, deleteDoc, collection,
  getDocs, onSnapshot, serverTimestamp,
  query, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t, formatMatchDate } from './i18n.js';
import { PARTIDOS_ELIM_R32, PARTIDOS_ELIM, MAPA_DEPENDENCIAS, getPartidoElimPorId } from '../data/partidos_elim.js';
import { abrirModalPartido } from './informe-modal.js';
import { calcularPuntosPartidoElim, equiposCoincidenElim } from './puntos-elim.js';

// ── Estado ────────────────────────────────────────────────────
let _app            = null;
let _resultadosElim = {};   // { partidoId: {...documento res_ko} }
let _unsubscribe    = null;

// Orden de rondas para renderizado agrupado
const ORDEN_RONDAS = ['r32', 'r16', 'qf', 'semi', '3er', 'final'];

// Helper: partidos de una ronda concreta (definido localmente para no
// necesitar exportarlo desde partidos_elim.js)
function getPartidosElimPorRonda(ronda) {
  return PARTIDOS_ELIM.filter(p => p.ronda === ronda);
}

function nombreRonda(ronda) {
  const claves = {
    r32:   'knockouts.round16',
    r16:   'knockouts.round8',
    qf:    'knockouts.quarterFinal',
    semi:  'knockouts.semiFinal',
    '3er': 'knockouts.thirdPlace',
    final: 'knockouts.final'
  };
  return t(claves[ronda]) || ronda;
}

// ── Punto de entrada ─────────────────────────────────────────
export async function initResultadosElim(app, contenedor) {
  _app = app;
  contenedor.innerHTML = `<div class="loading-inline"><div class="spinner-sm"></div><span>${t('common.loading')}</span></div>`;

  try {
    await cargarResultadosElimFirestore();

    window._verDesglosePartido = (id, esElim) => abrirModalPartido(id, esElim);

    if (_app.esAdmin) {
      renderAdminElim(contenedor);
    } else {
      renderJugadorElim(contenedor);
    }

    if (_unsubscribe) _unsubscribe();
    _unsubscribe = onSnapshot(collection(db, 'res_ko'), (snap) => {
      snap.forEach(d => { _resultadosElim[d.id] = d.data(); });
      const c = document.getElementById('resultadosTabContent');
      if (c) {
        if (_app.esAdmin) renderAdminElim(c);
        else renderJugadorElim(c);
      }
    });

  } catch (e) {
    console.error('[resultados_elim]', e);
    contenedor.innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
  }
}

export function detenerResultadosElim() {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
}

// ══════════════════════════════════════════════════════════════
//  RESOLUCIÓN DE EQUIPOS POR PARTIDO
// ══════════════════════════════════════════════════════════════

// Devuelve { local, visitante, flagLocal, flagVisitante, listos }
// R32: siempre listos (hardcoded). R16+: propaga desde res_ko.
function obtenerEquiposPartidoElim(partidoId) {
  const partido = getPartidoElimPorId(partidoId);
  const ronda   = partido?.ronda;

  if (ronda === 'r32') {
    const p = PARTIDOS_ELIM_R32.find(x => x.id === partidoId);
    return {
      local:         p?.local     || null,
      visitante:     p?.visitante || null,
      flagLocal:     '',
      flagVisitante: '',
      listos:        !!(p?.local && p?.visitante)
    };
  }

  if (partidoId === 'elim34') {
    const local     = propagarPerdedorOficial('elim2_1');
    const visitante = propagarPerdedorOficial('elim2_2');
    return {
      local, visitante,
      flagLocal: '', flagVisitante: '',
      listos: !!(local && visitante)
    };
  }

  const local     = propagarGanadorOficial(partidoId, 'local');
  const visitante = propagarGanadorOficial(partidoId, 'vis');
  return {
    local, visitante,
    flagLocal: '', flagVisitante: '',
    listos: !!(local && visitante)
  };
}

// Usa MAPA_DEPENDENCIAS importado — idéntico al de prediccion.js
function propagarGanadorOficial(partidoId, lado) {
  const dep = MAPA_DEPENDENCIAS[partidoId];
  if (!dep) return null;
  const srcId = dep[lado];
  const res   = _resultadosElim[srcId];
  if (!res?.confirmado) return null;
  return res.equipo_que_pasa || null;
}

function propagarPerdedorOficial(srcId) {
  const res = _resultadosElim[srcId];
  if (!res?.confirmado) return null;
  const { equipo_local, equipo_visitante, equipo_que_pasa } = res;
  if (!equipo_que_pasa) return null;
  return equipo_que_pasa === equipo_local ? (equipo_visitante || null) : (equipo_local || null);
}

// ══════════════════════════════════════════════════════════════
//  VISTA JUGADOR
// ══════════════════════════════════════════════════════════════

function renderJugadorElim(contenedor) {
  let html = `<div style="margin-top:8px;">`;

  ORDEN_RONDAS.forEach(ronda => {
    const partidos = getPartidosElimPorRonda(ronda);
    if (!partidos.length) return;

    html += `<div class="group-pill" style="margin:14px 0 8px;">🏆 ${nombreRonda(ronda)}</div>`;
    partidos.forEach(p => {
      html += renderTarjetaResultadoElim(p);
    });
  });

  html += `</div>`;
  contenedor.innerHTML = html;
  if (window.parseTwemoji) window.parseTwemoji(contenedor);
}

function renderTarjetaResultadoElim(p) {
  const res        = _resultadosElim[p.id];
  const confirmado = res?.confirmado;
  const equipos    = obtenerEquiposPartidoElim(p.id);

  if (!equipos.listos && !confirmado) {
    return `
      <div class="match-card no-result">
        <div class="match-meta">
          <span>${formatMatchDate(p.fechaUTC)}</span>
          <span>📍 ${p.ciudad}</span>
          <span class="match-tag pend">${t('scores.pending')}</span>
        </div>
        <div class="match-row">
          <div class="match-team">
            <span class="match-name" style="color:var(--tm);">${t('scores.tbd')}</span>
          </div>
          <span class="score-real" style="color:#ccc;">— — —</span>
          <div class="match-team right">
            <span class="match-name" style="color:var(--tm);">${t('scores.tbd')}</span>
          </div>
        </div>
      </div>
    `;
  }

  const nombreLocal     = equipos.local     || res?.equipo_local     || t('scores.tbd');
  const nombreVisitante = equipos.visitante || res?.equipo_visitante || t('scores.tbd');

  return `
    <div class="match-card ${confirmado ? 'confirmed' : ''}">
      <div class="match-meta">
        <span>${formatMatchDate(p.fechaUTC)}</span>
        <span>📍 ${p.ciudad}</span>
        ${confirmado
          ? `<span class="match-tag ok">✓ ${t('scores.confirmed')}</span>`
          : `<span class="match-tag pend">${t('scores.pending')}</span>`}
        ${confirmado
          ? `<button onclick="window._verDesglosePartido('${p.id}', true)"
              title="Ver puntos de este partido"
              style="background:none; border:none; cursor:pointer; font-size:13px;
                padding:2px 4px; border-radius:4px; line-height:1; color:var(--tm);
                transition:color .15s; margin-left:2px;"
              onmouseover="this.style.color='var(--gm)'"
              onmouseout="this.style.color='var(--tm)'">🔍</button>`
          : ''}
      </div>
      <div class="match-row">
        <div class="match-team">
          <span class="match-flag">${equipos.flagLocal}</span>
          <span class="match-name">${nombreLocal}</span>
        </div>
        ${confirmado
          ? `<span class="score-real confirmed">${res.goles_local} — ${res.goles_visitante}</span>`
          : `<span class="score-real" style="color:#ccc;">— — —</span>`}
        <div class="match-team right">
          <span class="match-flag">${equipos.flagVisitante}</span>
          <span class="match-name">${nombreVisitante}</span>
        </div>
      </div>
      ${confirmado && res.hay_prorroga_penales
        ? `<div class="match-footer"><span style="font-size:11px; color:var(--tm);">⚽ ${t('scores.advances')}: ${res.equipo_que_pasa}</span></div>`
        : ''}
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
//  VISTA ADMIN
// ══════════════════════════════════════════════════════════════

function renderAdminElim(contenedor) {
  let html = `
    <div style="margin-top:8px;">
      <div class="notice">${t('scores.adminOnly')}</div>
  `;

  ORDEN_RONDAS.forEach(ronda => {
    const partidos = getPartidosElimPorRonda(ronda);
    if (!partidos.length) return;

    html += `<div class="group-pill" style="margin:14px 0 8px;">🏆 ${nombreRonda(ronda)}</div>`;
    partidos.forEach(p => {
      html += renderTarjetaAdminElim(p);
    });
  });

  html += `</div>`;
  contenedor.innerHTML = html;
  if (window.parseTwemoji) window.parseTwemoji(contenedor);

  window._confirmarResElim     = (id) => confirmarResultadoElim(id);
  window._editarResElim        = (id) => editarResultadoElim(id);
  window._borrarResElim        = (id) => confirmarBorrarResultadoElim(id);
  window._onMarcadorElimChange = (id) => onMarcadorElimChange(id);
  window._seleccionarPasaElim  = (id, lado) => seleccionarPasaElim(id, lado);
}

function renderTarjetaAdminElim(p) {
  const res        = _resultadosElim[p.id];
  const confirmado = res?.confirmado;
  const equipos    = obtenerEquiposPartidoElim(p.id);

  if (!equipos.listos && !confirmado) {
    return `
      <div class="match-card no-result">
        <div class="match-meta">
          <span>${formatMatchDate(p.fechaUTC)}</span>
          <span>📍 ${p.ciudad}</span>
          <span class="match-tag pend">${t('scores.tbd')}</span>
        </div>
        <div class="match-row">
          <div class="match-team">
            <span class="match-name" style="color:var(--tm);">${t('scores.tbd')}</span>
          </div>
          <span class="score-real" style="color:#ccc;">— — —</span>
          <div class="match-team right">
            <span class="match-name" style="color:var(--tm);">${t('scores.tbd')}</span>
          </div>
        </div>
        <div class="match-footer">
          <span style="font-size:11px; color:var(--tm);">Esperando resultado de ronda anterior</span>
        </div>
      </div>
    `;
  }

  const nombreLocal     = equipos.local     || res?.equipo_local     || '?';
  const nombreVisitante = equipos.visitante || res?.equipo_visitante || '?';

  if (confirmado) {
    return `
      <div class="match-card confirmed">
        <div class="match-meta">
          <span>${formatMatchDate(p.fechaUTC)}</span>
          <span>📍 ${p.ciudad}</span>
          <span class="match-tag ok">✓ ${t('scores.confirmed')}</span>
          <button onclick="window._verDesglosePartido('${p.id}', true)"
            title="Ver puntos de este partido"
            style="background:none; border:none; cursor:pointer; font-size:13px;
              padding:2px 4px; border-radius:4px; line-height:1; color:var(--tm);
              transition:color .15s; margin-left:2px;"
            onmouseover="this.style.color='var(--gm)'"
            onmouseout="this.style.color='var(--tm)'">🔍</button>
        </div>
        <div class="match-row">
          <div class="match-team">
            <span class="match-name">${nombreLocal}</span>
          </div>
          <span class="score-real confirmed">${res.goles_local} — ${res.goles_visitante}</span>
          <div class="match-team right">
            <span class="match-name">${nombreVisitante}</span>
          </div>
        </div>
        ${res.hay_prorroga_penales
          ? `<div class="match-footer"><span style="font-size:11px; color:var(--tm);">⚽ Pasa: <strong>${res.equipo_que_pasa}</strong> (prórroga/penaltis)</span></div>`
          : ''}
        <div class="match-footer">
          <span class="match-confirmed-label">✓ ${t('scores.confirmed')}</span>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="window._editarResElim('${p.id}')">
              ✏️ ${t('scores.editBtn')}
            </button>
            <button class="btn btn-danger btn-sm" onclick="window._borrarResElim('${p.id}')">
              🗑️ Borrar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  const empatado = res?.goles_local !== undefined && res?.goles_local === res?.goles_visitante;

  return `
    <div class="match-card">
      <div class="match-meta">
        <span>${formatMatchDate(p.fechaUTC)}</span>
        <span>📍 ${p.ciudad}</span>
        <span class="match-tag pend">${t('scores.noResult')}</span>
      </div>
      <div class="match-row">
        <div class="match-team">
          <span class="match-name">${nombreLocal}</span>
        </div>
        <div class="score-area">
          <span class="score-label">${t('scores.result')}</span>
          <div class="score-inputs">
            <input class="score-input" type="number" min="0" max="20"
              id="rese_${p.id}_l" value=""
              onchange="window._onMarcadorElimChange('${p.id}')">
            <span class="score-sep">—</span>
            <input class="score-input" type="number" min="0" max="20"
              id="rese_${p.id}_v" value=""
              onchange="window._onMarcadorElimChange('${p.id}')">
          </div>
        </div>
        <div class="match-team right">
          <span class="match-name">${nombreVisitante}</span>
        </div>
      </div>
      <div id="tiebreak_${p.id}" class="tiebreak" style="display:${empatado ? 'block' : 'none'};">
        <div class="tiebreak-label">${t('knockouts.whoAdvances')}</div>
        <div class="tiebreak-opts">
          <button type="button" class="tiebreak-btn" id="rese_${p.id}_pasa_local"
            onclick="window._seleccionarPasaElim('${p.id}', 'local')">${nombreLocal}</button>
          <button type="button" class="tiebreak-btn" id="rese_${p.id}_pasa_visitante"
            onclick="window._seleccionarPasaElim('${p.id}', 'visitante')">${nombreVisitante}</button>
        </div>
      </div>
      <div class="match-footer">
        <span style="font-size:11px; color:var(--tm);">Introducir manualmente</span>
        <button class="btn btn-primary btn-sm" onclick="window._confirmarResElim('${p.id}')">
          ✓ ${t('scores.confirmBtn')}
        </button>
      </div>
    </div>
  `;
}

function seleccionarPasaElim(partidoId, lado) {
  const btnLocal     = document.getElementById(`rese_${partidoId}_pasa_local`);
  const btnVisitante = document.getElementById(`rese_${partidoId}_pasa_visitante`);
  if (!btnLocal || !btnVisitante) return;
  btnLocal.classList.toggle('selected', lado === 'local');
  btnVisitante.classList.toggle('selected', lado === 'visitante');
}

function onMarcadorElimChange(partidoId) {
  const inputL = document.getElementById(`rese_${partidoId}_l`);
  const inputV = document.getElementById(`rese_${partidoId}_v`);
  const caja   = document.getElementById(`tiebreak_${partidoId}`);
  if (!inputL || !inputV || !caja) return;

  const gl = parseInt(inputL.value);
  const gv = parseInt(inputV.value);
  const empatado = !isNaN(gl) && !isNaN(gv) && gl === gv;
  caja.style.display = empatado ? 'block' : 'none';
}

// ══════════════════════════════════════════════════════════════
//  ACCIONES ADMIN
// ══════════════════════════════════════════════════════════════

async function confirmarResultadoElim(partidoId) {
  // Safari/iOS fix
  document.getElementById(`rese_${partidoId}_l`)?.blur();
  document.getElementById(`rese_${partidoId}_v`)?.blur();

  const inputL = document.getElementById(`rese_${partidoId}_l`);
  const inputV = document.getElementById(`rese_${partidoId}_v`);
  if (!inputL || !inputV) return;

  const gl = parseInt(inputL.value);
  const gv = parseInt(inputV.value);

  if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0) {
    window.mostrarToast('⚠️ Introduce un marcador válido', 4000);
    return;
  }

  const equipos = obtenerEquiposPartidoElim(partidoId);
  if (!equipos.listos) {
    window.mostrarToast('⚠️ Los equipos de este partido aún no están determinados', 4000);
    return;
  }

  let equipoQuePasa;
  const hayEmpate = gl === gv;

  if (!hayEmpate) {
    equipoQuePasa = gl > gv ? equipos.local : equipos.visitante;
  } else {
    const btnLocal     = document.getElementById(`rese_${partidoId}_pasa_local`);
    const btnVisitante = document.getElementById(`rese_${partidoId}_pasa_visitante`);
    if (btnLocal?.classList.contains('selected')) {
      equipoQuePasa = equipos.local;
    } else if (btnVisitante?.classList.contains('selected')) {
      equipoQuePasa = equipos.visitante;
    } else {
      equipoQuePasa = '';
    }
    if (!equipoQuePasa) {
      window.mostrarToast('⚠️ Indica qué equipo pasa de ronda (empate en 90\')', 4500);
      return;
    }
  }

  try {
    window.mostrarToast('💾 Guardando...');

    const partido = getPartidoElimPorId(partidoId);

    await setDoc(doc(db, 'res_ko', partidoId), {
      partido_id:           partidoId,
      ronda:                partido?.ronda || '',
      equipo_local:         equipos.local,
      equipo_visitante:     equipos.visitante,
      goles_local:          gl,
      goles_visitante:      gv,
      hay_prorroga_penales: hayEmpate,
      equipo_que_pasa:      equipoQuePasa,
      confirmado:           true,
      confirmado_por:       _app.uid,
      confirmado_en:        serverTimestamp()
    });

    _resultadosElim[partidoId] = {
      partido_id:           partidoId,
      ronda:                partido?.ronda || '',
      equipo_local:         equipos.local,
      equipo_visitante:     equipos.visitante,
      goles_local:          gl,
      goles_visitante:      gv,
      hay_prorroga_penales: hayEmpate,
      equipo_que_pasa:      equipoQuePasa,
      confirmado:           true
    };

    recalcularPuntosElim(partidoId);

    // Si es la final, recalcular también puntos especiales de campeón/subcampeón
    if (partidoId === 'elimfin') {
      const subcampeonReal = equipoQuePasa === equipos.local
        ? equipos.visitante
        : equipos.local;
      recalcularPuntosEspecialesFinal(equipoQuePasa, subcampeonReal);
    }

    window.mostrarToast('✅ Resultado confirmado');

    const c = document.getElementById('resultadosTabContent');
    if (c) renderAdminElim(c);

  } catch (e) {
    console.error('[confirmarResElim]', e);
    window.mostrarToast('❌ ' + t('common.error'), 5000);
  }
}

function editarResultadoElim(partidoId) {
  const dependientes = encontrarDependientesConfirmados(partidoId);
  if (dependientes.length) {
    window.appAbrirModal(
      '⚠️ Aviso',
      `<p style="font-size:13px;">Ya existen resultados confirmados en rondas posteriores que dependen de este partido: <strong>${dependientes.join(', ')}</strong>.</p>
       <p style="font-size:12px; color:var(--r); margin-top:8px;">
         Editar este resultado puede dejarlos inconsistentes. Revísalos manualmente después de guardar el cambio.
       </p>`,
      `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="window.appCerrarModal(); window._ejecutarEdicionResElim('${partidoId}')">
         Continuar y editar
       </button>`
    );
    window._ejecutarEdicionResElim = (id) => {
      if (_resultadosElim[id]) {
        _resultadosElim[id] = { ..._resultadosElim[id], confirmado: false };
      }
      const c = document.getElementById('resultadosTabContent');
      if (c) renderAdminElim(c);
    };
    return;
  }

  if (_resultadosElim[partidoId]) {
    _resultadosElim[partidoId] = { ..._resultadosElim[partidoId], confirmado: false };
  }
  const c = document.getElementById('resultadosTabContent');
  if (c) renderAdminElim(c);
}

function confirmarBorrarResultadoElim(partidoId) {
  const res    = _resultadosElim[partidoId];
  const titulo = res
    ? `${res.equipo_local} ${res.goles_local} — ${res.goles_visitante} ${res.equipo_visitante}`
    : partidoId;

  const dependientes = encontrarDependientesConfirmados(partidoId);
  const avisoDep = dependientes.length
    ? `<p style="font-size:12px; color:var(--r); margin-top:8px;">
         ⚠️ Rondas posteriores ya confirmadas dependen de este resultado: <strong>${dependientes.join(', ')}</strong>.
         Borrar este partido puede dejarlos inconsistentes — revísalos manualmente después.
       </p>`
    : '';

  window.appAbrirModal(
    '🗑️ Borrar resultado',
    `<p style="font-size:13px;">¿Seguro que quieres borrar el resultado de <strong>${titulo}</strong>?</p>
     <p style="font-size:12px; color:var(--r); margin-top:8px;">
       ⚠️ Esto también eliminará los puntos calculados de todos los jugadores para este partido.
     </p>
     ${avisoDep}`,
    `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="window._ejecutarBorradoResElim('${partidoId}')">
       🗑️ Sí, borrar resultado y puntos
     </button>`
  );
}

window._ejecutarBorradoResElim = async (partidoId) => {
  try {
    window.appCerrarModal();
    window.mostrarToast('🗑️ Borrando...');

    await deleteDoc(doc(db, 'res_ko', partidoId));

    const puntosQ    = query(collection(db, 'puntos'), where('partido_id', '==', partidoId));
    const puntosSnap = await getDocs(puntosQ);
    await Promise.all(puntosSnap.docs.map(d => deleteDoc(d.ref)));

    // Si era la final, borrar también puntos especiales de campeón/subcampeón
    if (partidoId === 'elimfin') {
      const [campeonSnap, subcampeonSnap] = await Promise.all([
        getDocs(query(collection(db, 'puntos'), where('partido_id', '==', 'especial_campeon'))),
        getDocs(query(collection(db, 'puntos'), where('partido_id', '==', 'especial_subcampeon')))
      ]);
      await Promise.all([
        ...campeonSnap.docs.map(d => deleteDoc(d.ref)),
        ...subcampeonSnap.docs.map(d => deleteDoc(d.ref))
      ]);
    }

    delete _resultadosElim[partidoId];
    await recalcularTotalesElim();

    window.mostrarToast('✅ Resultado y puntos borrados');
    const c = document.getElementById('resultadosTabContent');
    if (c) renderAdminElim(c);

  } catch (e) {
    console.error('[borrarResultadoElim]', e);
    window.mostrarToast('❌ ' + t('common.error'), 5000);
  }
};

function encontrarDependientesConfirmados(partidoId) {
  const dependientesDirectos = Object.entries(MAPA_DEPENDENCIAS)
    .filter(([, dep]) => dep.local === partidoId || dep.vis === partidoId)
    .map(([id]) => id);

  const confirmados = [];
  dependientesDirectos.forEach(id => {
    if (_resultadosElim[id]?.confirmado) {
      confirmados.push(id);
      confirmados.push(...encontrarDependientesConfirmados(id));
    } else {
      confirmados.push(...encontrarDependientesConfirmados(id));
    }
  });

  return [...new Set(confirmados)];
}

// ══════════════════════════════════════════════════════════════
//  CÁLCULO DE PUNTOS
// ══════════════════════════════════════════════════════════════

async function recalcularPuntosElim(partidoId) {
  try {
    const resultadoReal = _resultadosElim[partidoId];
    if (!resultadoReal?.confirmado) return;

    const q    = query(collection(db, 'pred_ko'), where('partido_id', '==', partidoId));
    const snap = await getDocs(q);

    const batch = [];
    snap.forEach(d => {
      const pred   = d.data();
      const uid    = pred.uid;
      const puntos = calcularPuntosPartidoElim(pred, resultadoReal);

      batch.push(
        setDoc(
          doc(db, 'puntos', `${uid}_${partidoId}`),
          { uid, partido_id: partidoId, puntos, tipo: 'eliminatoria', timestamp: serverTimestamp() },
          { merge: true }
        )
      );
    });

    await Promise.all(batch);
    await recalcularTotalesElim();
  } catch (e) {
    console.error('[recalcularPuntosElim]', e);
  }
}

// Cálculo de puntos: única fuente de verdad en puntos-elim.js,
// usada también por informe-modal.js y admin.js. No reimplementar aquí.


// ── Puntos especiales de campeón/subcampeón (al confirmar la final) ──
async function recalcularPuntosEspecialesFinal(campeonReal, subcampeonReal) {
  try {
    const norm = str =>
      (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const normCampeon    = norm(campeonReal);
    const normSubcampeon = norm(subcampeonReal);

    const snap  = await getDocs(collection(db, 'pred_especiales'));
    const batch = [];

    snap.forEach(d => {
      const uid  = d.id;
      const data = d.data();

      const predCampeon    = norm(data.campeon_corregido    || data.campeon    || '');
      const predSubcampeon = norm(data.subcampeon_corregido || data.subcampeon || '');

      const ptosCampeon    = (normCampeon    && predCampeon    && normCampeon    === predCampeon)    ? 6 : 0;
      const ptosSubcampeon = (normSubcampeon && predSubcampeon && normSubcampeon === predSubcampeon) ? 2 : 0;

      batch.push(setDoc(
        doc(db, 'puntos', `${uid}_especial_campeon`),
        { uid, partido_id: 'especial_campeon', puntos: ptosCampeon, tipo: 'especial', timestamp: serverTimestamp() },
        { merge: true }
      ));
      batch.push(setDoc(
        doc(db, 'puntos', `${uid}_especial_subcampeon`),
        { uid, partido_id: 'especial_subcampeon', puntos: ptosSubcampeon, tipo: 'especial', timestamp: serverTimestamp() },
        { merge: true }
      ));
    });

    await Promise.all(batch);
    await recalcularTotalesElim();
  } catch (e) {
    console.error('[recalcularPuntosEspecialesFinal]', e);
  }
}

async function recalcularTotalesElim() {
  try {
    const puntosSnap = await getDocs(collection(db, 'puntos'));
    const totales    = {};

    puntosSnap.forEach(d => {
      const { uid, puntos } = d.data();
      if (!uid) return;
      totales[uid] = (totales[uid] || 0) + (puntos || 0);
    });

    const batch = Object.entries(totales).map(([uid, total]) =>
      setDoc(
        doc(db, 'clasificacion', uid),
        { uid, total, actualizado: serverTimestamp() },
        { merge: true }
      )
    );

    await Promise.all(batch);
  } catch (e) {
    console.error('[recalcularTotalesElim]', e);
  }
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

async function cargarResultadosElimFirestore() {
  const snap = await getDocs(collection(db, 'res_ko'));
  snap.forEach(d => { _resultadosElim[d.id] = d.data(); });
}
