// ============================================================
//  js/resultados.js
//  Pestaña "Resultados"
//  - Jugadores: ven resultados confirmados
//  - Admin: confirma resultados desde la API + botón actualizar equipos
// ============================================================

import { db } from './firebase-config.js';
import {
  doc, getDoc, setDoc, deleteDoc, collection,
  getDocs, onSnapshot, serverTimestamp,
  query, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t, formatMatchDate } from './i18n.js';
import { PARTIDOS_GRUPOS, GRUPOS, getPartidosPorGrupo } from '../data/partidos.js';

// ── Config ────────────────────────────────────────────────────
const API_KEY      = '28872f0758074a58859f45fb56bd712b';
const API_BASE     = 'https://api.football-data.org/v4';
const WC_2026_ID   = 2000; // ID del Mundial 2026 en football-data.org

// ── Estado ────────────────────────────────────────────────────
let _app         = null;
let _resultados  = {};   // { partidoId: { goles_local, goles_visitante, confirmado } }
let _apiData     = {};   // datos crudos de la API
let _unsubscribe = null;

// ── Punto de entrada ─────────────────────────────────────────
export async function initResultados(app) {
  _app = app;
  const contenedor = document.getElementById('resultadosContent');
  contenedor.innerHTML = `<div class="loading-inline"><div class="spinner-sm"></div><span>${t('common.loading')}</span></div>`;

  try {
    await cargarResultadosFirestore();

    if (_app.esAdmin) {
      await cargarDatosAPI();
      renderAdmin(contenedor);
    } else {
      renderJugador(contenedor);
    }

    // Refrescar textos al cambiar idioma
    window._refreshTextos = () => {
      const c = document.getElementById('resultadosContent');
      if (!c) return;
      if (_app.esAdmin) renderAdmin(c);
      else renderJugador(c);
    };

    // Escuchar cambios en tiempo real
    _unsubscribe = onSnapshot(collection(db, 'resultados'), (snap) => {
      snap.forEach(d => { _resultados[d.id] = d.data(); });
      const c = document.getElementById('resultadosContent');
      if (c) {
        if (_app.esAdmin) renderAdmin(c);
        else renderJugador(c);
      }
    });

  } catch (e) {
    console.error('[resultados]', e);
    contenedor.innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
  }
}

// ══════════════════════════════════════════════════════════════
//  VISTA JUGADOR
// ══════════════════════════════════════════════════════════════

function renderJugador(contenedor) {
  const hoy    = new Date();
  const grupos = agruparPartidosPorFechaYGrupo();

  let html = `<div style="margin-top:8px;">`;

  // Partidos de hoy / recientes
  const recientes = filtrarRecientes(grupos);
  if (recientes.length) {
    html += `<div class="group-pill" style="margin-bottom:10px;">📅 ${t('scores.confirmed')} — hoy</div>`;
    recientes.forEach(p => {
      html += renderTarjetaResultado(p, false);
    });
  }

  // Por grupo
  GRUPOS.forEach(g => {
    const partidos = getPartidosPorGrupo(g);
    const conRes   = partidos.filter(p => _resultados[p.id]?.confirmado);
    if (!conRes.length) return;

    html += `<div class="group-pill" style="margin:14px 0 8px;">⚽ ${t('common.group')} ${g}</div>`;
    conRes.forEach(p => {
      html += renderTarjetaResultado(p, false);
    });
  });

  // Próximos sin resultado
  const proximos = PARTIDOS_GRUPOS.filter(p => !_resultados[p.id]?.confirmado)
    .sort((a, b) => new Date(a.fechaUTC) - new Date(b.fechaUTC))
    .slice(0, 6);

  if (proximos.length) {
    html += `<div style="font-size:12px; color:var(--tm); padding:14px 0 8px; display:flex; align-items:center; gap:5px;">
      ⏳ ${t('scores.pending')}
    </div>`;
    proximos.forEach(p => {
      html += renderTarjetaResultado(p, false, true);
    });
  }

  html += `</div>`;
  contenedor.innerHTML = html;
  if (window.parseTwemoji) window.parseTwemoji(contenedor);
}

// ══════════════════════════════════════════════════════════════
//  VISTA ADMIN
// ══════════════════════════════════════════════════════════════

function renderAdmin(contenedor) {
  const hoy = new Date().toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });

  let html = `
    <div style="margin-top:8px;">
      <div class="notice">${t('scores.adminOnly')}</div>

      <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" onclick="window._refreshAPI()">
          🔄 ${t('scores.refreshBtn')}
        </button>
        <button class="btn btn-secondary btn-sm" onclick="window._actualizarEquipos()">
          🏳️ ${t('scores.updateTeams')}
        </button>
        <span style="font-size:11px; color:var(--tm); align-self:center;" id="lastUpdateLabel">
          ${_apiData._lastUpdate
            ? `${t('scores.lastUpdate')}: ${new Date(_apiData._lastUpdate).toLocaleTimeString()}`
            : ''}
        </span>
      </div>
  `;

  // Partidos del día con datos de la API
  const hoyPartidos = obtenerPartidosHoy();
  if (hoyPartidos.length) {
    html += `<div class="group-pill" style="margin-bottom:10px;">📅 Partidos de hoy · ${hoy}</div>`;
    hoyPartidos.forEach(p => {
      html += renderTarjetaAdmin(p);
    });
    html += `<div style="height:16px;"></div>`;
  }

  // Todos los grupos
  GRUPOS.forEach(g => {
    const partidos = getPartidosPorGrupo(g);
    html += `<div class="group-pill" style="margin:14px 0 8px;">⚽ ${t('common.group')} ${g}</div>`;
    partidos.forEach(p => {
      html += renderTarjetaAdmin(p);
    });
  });

  html += `</div>`;
  contenedor.innerHTML = html;
  if (window.parseTwemoji) window.parseTwemoji(contenedor);

  // Handlers
  window._refreshAPI        = () => refreshAPI();
  window._actualizarEquipos = () => actualizarEquiposDesdeAPI();
  window._confirmarRes      = (id) => confirmarResultado(id);
  window._editarRes         = (id) => editarResultado(id);
  window._borrarRes         = (id) => confirmarBorrarResultado(id);
}

// ── Tarjeta resultado (jugador, solo lectura) ─────────────────
function renderTarjetaResultado(p, esAdmin, sinResultado = false) {
  const res = _resultados[p.id];
  const confirmado = res?.confirmado;

  return `
    <div class="match-card ${confirmado ? 'confirmed' : sinResultado ? 'no-result' : ''}">
      <div class="match-meta">
        <span>${formatMatchDate(p.fechaUTC)}</span>
        <span>📍 ${p.ciudad}</span>
        ${confirmado
          ? `<span class="match-tag ok">✓ ${t('scores.confirmed')}</span>`
          : `<span class="match-tag pend">${t('scores.pending')}</span>`}
      </div>
      <div class="match-row">
        <div class="match-team">
          <span class="match-flag">${p.flagLocal}</span>
          <span class="match-name">${p.local}</span>
        </div>
        ${confirmado
          ? `<span class="score-real confirmed">${res.goles_local} — ${res.goles_visitante}</span>`
          : `<span class="score-real" style="color:#ccc;">— — —</span>`}
        <div class="match-team right">
          <span class="match-flag">${p.flagVisitante}</span>
          <span class="match-name">${p.visitante}</span>
        </div>
      </div>
    </div>
  `;
}

// ── Tarjeta resultado (admin, con inputs y botón confirmar) ───
function renderTarjetaAdmin(p) {
  const res     = _resultados[p.id];
  const apiRes  = _apiData[p.id];
  const confirmado = res?.confirmado;

  // Valores a mostrar en los inputs
  const valL = confirmado ? res.goles_local    : (apiRes?.goles_local    ?? '');
  const valV = confirmado ? res.goles_visitante: (apiRes?.goles_visitante ?? '');

  if (confirmado) {
    return `
      <div class="match-card confirmed">
        <div class="match-meta">
          <span>${formatMatchDate(p.fechaUTC)}</span>
          <span>📍 ${p.ciudad}</span>
          <span class="match-tag ok">✓ ${t('scores.confirmed')}</span>
        </div>
        <div class="match-row">
          <div class="match-team">
            <span class="match-flag">${p.flagLocal}</span>
            <span class="match-name">${p.local}</span>
          </div>
          <span class="score-real confirmed">${res.goles_local} — ${res.goles_visitante}</span>
          <div class="match-team right">
            <span class="match-flag">${p.flagVisitante}</span>
            <span class="match-name">${p.visitante}</span>
          </div>
        </div>
        <div class="match-footer">
          <span class="match-confirmed-label">✓ ${t('scores.confirmed')}</span>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="window._editarRes('${p.id}')">
              ✏️ ${t('scores.editBtn')}
            </button>
            <button class="btn btn-danger btn-sm" onclick="window._borrarRes('${p.id}')">
              🗑️ Borrar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="match-card ${apiRes ? 'pending-api' : ''}">
      <div class="match-meta">
        <span>${formatMatchDate(p.fechaUTC)}</span>
        <span>📍 ${p.ciudad}</span>
        ${apiRes
          ? `<span class="match-tag api">↻ ${t('scores.apiSuggested')}</span>`
          : `<span class="match-tag pend">${t('scores.noResult')}</span>`}
      </div>
      <div class="match-row">
        <div class="match-team">
          <span class="match-flag">${p.flagLocal}</span>
          <span class="match-name">${p.local}</span>
        </div>
        <div class="score-area">
          <span class="score-label">${t('scores.result')}</span>
          <div class="score-inputs">
            <input class="score-input" type="number" min="0" max="20"
              id="res_${p.id}_l" value="${valL}">
            <span class="score-sep">—</span>
            <input class="score-input" type="number" min="0" max="20"
              id="res_${p.id}_v" value="${valV}">
          </div>
        </div>
        <div class="match-team right">
          <span class="match-flag">${p.flagVisitante}</span>
          <span class="match-name">${p.visitante}</span>
        </div>
      </div>
      <div class="match-footer">
        ${apiRes
          ? `<span style="font-size:11px; color:var(--gm);">↻ football-data.org</span>`
          : `<span style="font-size:11px; color:var(--tm);">Sin datos de la API</span>`}
        <button class="btn btn-primary btn-sm" onclick="window._confirmarRes('${p.id}')">
          ✓ ${t('scores.confirmBtn')}
        </button>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
//  ACCIONES ADMIN
// ══════════════════════════════════════════════════════════════

async function confirmarResultado(partidoId) {
  const inputL = document.getElementById(`res_${partidoId}_l`);
  const inputV = document.getElementById(`res_${partidoId}_v`);
  if (!inputL || !inputV) return;

  const gl = parseInt(inputL.value);
  const gv = parseInt(inputV.value);

  if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0) {
    window.mostrarToast('⚠️ Introduce un marcador válido', 4000);
    return;
  }

  try {
    window.mostrarToast('💾 Guardando...');

    const partido = PARTIDOS_GRUPOS.find(p => p.id === partidoId);

    await setDoc(doc(db, 'resultados', partidoId), {
      partido_id:     partidoId,
      goles_local:    gl,
      goles_visitante:gv,
      confirmado:     true,
      confirmado_por: _app.uid,
      confirmado_en:  serverTimestamp(),
      equipo_local:   partido?.local    || '',
      equipo_visitante: partido?.visitante || ''
    });

    _resultados[partidoId] = { goles_local: gl, goles_visitante: gv, confirmado: true };

    // Recalcular puntos en segundo plano
    recalcularPuntos(partidoId, gl, gv);

    window.mostrarToast('✅ Resultado confirmado');
  } catch (e) {
    console.error('[confirmarRes]', e);
    window.mostrarToast('❌ ' + t('common.error'), 5000);
  }
}

function editarResultado(partidoId) {
  if (_resultados[partidoId]) {
    _resultados[partidoId] = { ..._resultados[partidoId], confirmado: false };
  }
  const c = document.getElementById('resultadosContent');
  if (c) renderAdmin(c);
}

// ── Confirmar borrado de resultado + puntos ───────────────────
function confirmarBorrarResultado(partidoId) {
  const partido = PARTIDOS_GRUPOS.find(p => p.id === partidoId);
  const res     = _resultados[partidoId];
  const titulo  = partido ? `${partido.local} ${res.goles_local} — ${res.goles_visitante} ${partido.visitante}` : partidoId;

  window.appAbrirModal(
    '🗑️ Borrar resultado',
    `<p style="font-size:13px;">¿Seguro que quieres borrar el resultado de <strong>${titulo}</strong>?</p>
     <p style="font-size:12px; color:var(--r); margin-top:8px;">
       ⚠️ Esto también eliminará los puntos calculados de todos los jugadores para este partido.
     </p>`,
    `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="window._ejecutarBorradoRes('${partidoId}')">
       🗑️ Sí, borrar resultado y puntos
     </button>`
  );
}

window._ejecutarBorradoRes = async (partidoId) => {
  try {
    window.appCerrarModal();
    window.mostrarToast('🗑️ Borrando...');

    const { deleteDoc } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );

    // 1. Borrar el documento de resultado
    await deleteDoc(doc(db, 'resultados', partidoId));

    // 2. Borrar todos los documentos de puntos de este partido
    const puntosQ    = query(
      collection(db, 'puntos'),
      where('partido_id', '==', partidoId)
    );
    const puntosSnap = await getDocs(puntosQ);
    await Promise.all(puntosSnap.docs.map(d => deleteDoc(d.ref)));

    // 3. Actualizar localmente
    delete _resultados[partidoId];

    // 4. Recalcular totales de clasificación sin este partido
    await recalcularTotales();

    window.mostrarToast('✅ Resultado y puntos borrados');
    const c = document.getElementById('resultadosContent');
    if (c) renderAdmin(c);

  } catch (e) {
    console.error('[borrarResultado]', e);
    window.mostrarToast('❌ ' + t('common.error'), 5000);
  }
};

// ── Refresh datos de la API ───────────────────────────────────
async function refreshAPI() {
  window.mostrarToast('🔄 Consultando API...');
  try {
    await cargarDatosAPI();
    const c = document.getElementById('resultadosContent');
    if (c) renderAdmin(c);
    window.mostrarToast('✅ Datos actualizados');
  } catch (e) {
    console.error('[refreshAPI]', e);
    window.mostrarToast('⚠️ No se pudo conectar con la API', 4000);
  }
}

// ── Actualizar equipos clasificados desde la API ──────────────
async function actualizarEquiposDesdeAPI() {
  window.mostrarToast('🔄 Actualizando equipos clasificados...');
  try {
    const res = await fetch(`${API_BASE}/competitions/${WC_2026_ID}/matches?stage=LAST_32`, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();

    const bracket = {};
    (data.matches || []).forEach(m => {
      const id = mapearIdPartidoElim(m);
      if (!id) return;
      bracket[id] = {
        equipoLocal:     m.homeTeam?.name     || null,
        equipoVisitante: m.awayTeam?.name     || null,
        flagLocal:       equipoAFlag(m.homeTeam?.name) || '',
        flagVisitante:   equipoAFlag(m.awayTeam?.name) || '',
        fecha:           formatearFechaCorta(m.utcDate),
        ciudad:          m.venue || ''
      };
    });

    bracket._lastUpdate = new Date().toISOString();

    await setDoc(doc(db, 'config', 'bracket_eliminatorias'), bracket, { merge: true });
    window.mostrarToast('✅ Equipos actualizados');
  } catch (e) {
    console.error('[actualizarEquipos]', e);
    window.mostrarToast('⚠️ No se pudieron actualizar los equipos', 4000);
  }
}

// ══════════════════════════════════════════════════════════════
//  API football-data.org
// ══════════════════════════════════════════════════════════════

async function cargarDatosAPI() {
  try {
    // Obtener partidos del Mundial 2026 fase de grupos
    const res = await fetch(
      `${API_BASE}/competitions/${WC_2026_ID}/matches?stage=GROUP_STAGE&status=FINISHED`,
      { headers: { 'X-Auth-Token': API_KEY } }
    );
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();

    ;(data.matches || []).forEach(m => {
      const id = mapearIdPartido(m);
      if (!id) return;
      if (m.score?.fullTime?.home === null) return;
      _apiData[id] = {
        goles_local:    m.score.fullTime.home,
        goles_visitante:m.score.fullTime.away,
        estado:         m.status
      };
    });

    _apiData._lastUpdate = new Date().toISOString();
  } catch (e) {
    console.warn('[cargarDatosAPI]', e);
    // No es fatal — seguimos sin datos de la API
  }
}

// ── Mapear nombre de equipo de la API a nuestro ID de partido ─
function mapearIdPartido(match) {
  const localAPI = match.homeTeam?.name?.toLowerCase() || '';
  const visitAPI = match.awayTeam?.name?.toLowerCase()  || '';

  const partido = PARTIDOS_GRUPOS.find(p => {
    const localNorm = normalizarNombre(p.local);
    const visitNorm = normalizarNombre(p.visitante);
    return (
      (localNorm.includes(localAPI.split(' ')[0]) ||
       localAPI.includes(localNorm.split(' ')[0])) &&
      (visitNorm.includes(visitAPI.split(' ')[0]) ||
       visitAPI.includes(visitNorm.split(' ')[0]))
    );
  });

  return partido?.id || null;
}

function mapearIdPartidoElim(match) {
  // Los IDs de partidos de eliminatoria vienen del stage de la API
  const stageMap = {
    'LAST_32':       'r32',
    'LAST_16':       'r16',
    'QUARTER_FINALS':'qf',
    'SEMI_FINALS':   'sf',
    'THIRD_PLACE':   'tp',
    'FINAL':         'final'
  };
  const prefix = stageMap[match.stage];
  if (!prefix) return null;
  // Usar el matchday como número
  const num = match.matchday || 1;
  return `${prefix}_${num}`;
}

function normalizarNombre(nombre) {
  return (nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '');
}

function equipoAFlag(nombre) {
  if (!nombre) return '';
  // Importación dinámica para no crear dependencia circular
  const mapFlags = {
    'Mexico':'🇲🇽', 'South Africa':'🇿🇦', 'Korea Republic':'🇰🇷', 'Czechia':'🇨🇿',
    'Canada':'🇨🇦', 'Bosnia and Herzegovina':'🇧🇦', 'Qatar':'🇶🇦', 'Switzerland':'🇨🇭',
    'Brazil':'🇧🇷', 'Morocco':'🇲🇦', 'Haiti':'🇭🇹', 'Scotland':'🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    'USA':'🇺🇸', 'Paraguay':'🇵🇾', 'Australia':'🇦🇺', 'Türkiye':'🇹🇷',
    'Germany':'🇩🇪', 'Curaçao':'🇨🇼', "Ivory Coast":"🇨🇮", 'Ecuador':'🇪🇨',
    'Netherlands':'🇳🇱', 'Japan':'🇯🇵', 'Sweden':'🇸🇪', 'Tunisia':'🇹🇳',
    'Belgium':'🇧🇪', 'Egypt':'🇪🇬', 'Iran':'🇮🇷', 'New Zealand':'🇳🇿',
    'Spain':'🇪🇸', 'Cape Verde':'🇨🇻', 'Saudi Arabia':'🇸🇦', 'Uruguay':'🇺🇾',
    'France':'🇫🇷', 'Senegal':'🇸🇳', 'Iraq':'🇮🇶', 'Norway':'🇳🇴',
    'Argentina':'🇦🇷', 'Algeria':'🇩🇿', 'Austria':'🇦🇹', 'Jordan':'🇯🇴',
    'Portugal':'🇵🇹', 'DR Congo':'🇨🇩', 'Uzbekistan':'🇺🇿', 'Colombia':'🇨🇴',
    'England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia':'🇭🇷', 'Ghana':'🇬🇭', 'Panama':'🇵🇦'
  };
  return mapFlags[nombre] || '';
}

function formatearFechaCorta(utcDate) {
  if (!utcDate) return '—';
  const d = new Date(utcDate);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ══════════════════════════════════════════════════════════════
//  CÁLCULO DE PUNTOS (trigger al confirmar resultado)
// ══════════════════════════════════════════════════════════════

async function recalcularPuntos(partidoId, golesLocal, golesVisitante) {
  try {
    // Obtener todas las predicciones de este partido
    const { query, where, getDocs: gd } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );
    const q = query(
      collection(db, 'predicciones'),
      where('partido_id', '==', partidoId)
    );
    const snap = await gd(q);

    const batch = [];
    snap.forEach(d => {
      const pred  = d.data();
      const uid   = pred.uid;
      const puntos = calcularPuntosPartido(pred, golesLocal, golesVisitante);

      batch.push(
        setDoc(
          doc(db, 'puntos', `${uid}_${partidoId}`),
          {
            uid,
            partido_id: partidoId,
            puntos,
            tipo:       'grupo',
            timestamp:  serverTimestamp()
          },
          { merge: true }
        )
      );
    });

    await Promise.all(batch);

    // Recalcular totales
    await recalcularTotales();
  } catch (e) {
    console.error('[recalcularPuntos]', e);
  }
}

function calcularPuntosPartido(pred, golesLocalReal, golesVisitanteReal) {
  const pl = parseInt(pred.local);
  const pv = parseInt(pred.visitante);
  if (isNaN(pl) || isNaN(pv)) return 0;

  // Resultado exacto
  if (pl === golesLocalReal && pv === golesVisitanteReal) return 3;

  // Solo ganador/empate
  const signoPred = Math.sign(pl - pv);
  const signoReal = Math.sign(golesLocalReal - golesVisitanteReal);
  if (signoPred === signoReal) return 1;

  return 0;
}

async function recalcularTotales() {
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
    console.error('[recalcularTotales]', e);
  }
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

async function cargarResultadosFirestore() {
  const snap = await getDocs(collection(db, 'resultados'));
  snap.forEach(d => { _resultados[d.id] = d.data(); });
}

function agruparPartidosPorFechaYGrupo() {
  return PARTIDOS_GRUPOS.reduce((acc, p) => {
    const fecha = new Date(p.fechaUTC).toDateString();
    if (!acc[fecha]) acc[fecha] = [];
    acc[fecha].push(p);
    return acc;
  }, {});
}

function filtrarRecientes(grupos) {
  const hoy = new Date().toDateString();
  const ayer = new Date(Date.now() - 86400000).toDateString();
  return [
    ...(grupos[hoy]  || []),
    ...(grupos[ayer] || [])
  ].filter(p => _resultados[p.id]?.confirmado);
}

function obtenerPartidosHoy() {
  const hoy = new Date().toDateString();
  return PARTIDOS_GRUPOS.filter(p => {
    return new Date(p.fechaUTC).toDateString() === hoy;
  });
}
