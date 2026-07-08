// ============================================================
//  js/resultados_elim.js
//  Pestaña "Resultados" — Sub-vista Eliminatorias
//  - Jugadores: ven resultados confirmados de eliminatorias (bracket, solo lectura)
//  - Admin: confirma resultados reales de eliminatorias (bracket editable)
//
//  NUEVO ESQUEMA (jun 2026):
//  · Colección resultados: res_ko  (antes: resultados_elim — no tocar)
//  · Colección predicciones: pred_ko (antes: predicciones_elim)
//  · IDs nuevos: elim16_*, elim8_*, elim4_*, elim2_*, elimfin, elim34
//  · Equipos R32 hardcodeados en PARTIDOS_ELIM_R32 — no se leen de Firebase
//
//  VISTA BRACKET (jul 2026): ambas vistas (jugador y admin) se muestran
//  como árbol de eliminatorias, con el mismo estilo visual que el bracket
//  de "Mi porra" (prediccion.js), pero implementado de forma independiente
//  en este fichero — prediccion.js no se toca. Las cajas de admin son más
//  grandes (escala x1.5) para que quepan los inputs de marcador, el botón
//  de desempate y los botones de confirmar/editar/borrar.
// ============================================================

import { db } from './firebase-config.js';
import {
  doc, getDoc, setDoc, deleteDoc, collection,
  getDocs, serverTimestamp,
  query, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t, formatMatchDate } from './i18n.js';
import { PARTIDOS_ELIM_R32, PARTIDOS_ELIM, MAPA_DEPENDENCIAS, getPartidoElimPorId } from '../data/partidos_elim.js';
import { EQUIPOS_48 } from '../data/partidos.js';
import { abrirModalPartido } from './informe-modal.js';
import { calcularPuntosPartidoElim, equiposCoincidenElim } from './puntos-elim.js';

// ── Estado ────────────────────────────────────────────────────
let _app            = null;
let _resultadosElim = {};   // { partidoId: {...documento res_ko} }

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

  } catch (e) {
    console.error('[resultados_elim]', e);
    contenedor.innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
  }
}

// Refresco manual (sustituye al listener en tiempo real, ver notas
// en CONTEXTO_PROYECTO.md — parche de emergencia por cuota de Firestore)
export async function refrescarResultadosElim() {
  await cargarResultadosElimFirestore();
  const c = document.getElementById('resultadosTabContent');
  if (!c) return;
  if (_app?.esAdmin) {
    renderAdminElim(c);
  } else {
    renderJugadorElim(c);
  }
}

export function detenerResultadosElim() {
  // Ya no hay listener que limpiar (parche de emergencia sin tiempo real),
  // se mantiene la función para no romper las llamadas existentes.
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
      flagLocal:     buscarFlag(p?.local),
      flagVisitante: buscarFlag(p?.visitante),
      listos:        !!(p?.local && p?.visitante)
    };
  }

  if (partidoId === 'elim34') {
    const local     = propagarPerdedorOficial('elim2_1');
    const visitante = propagarPerdedorOficial('elim2_2');
    return {
      local, visitante,
      flagLocal: buscarFlag(local), flagVisitante: buscarFlag(visitante),
      listos: !!(local && visitante)
    };
  }

  const local     = propagarGanadorOficial(partidoId, 'local');
  const visitante = propagarGanadorOficial(partidoId, 'vis');
  return {
    local, visitante,
    flagLocal: buscarFlag(local), flagVisitante: buscarFlag(visitante),
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

function buscarFlag(nombre) {
  if (!nombre) return '';
  const eq = EQUIPOS_48.find(e => e.nombre.toLowerCase() === nombre.toLowerCase());
  return eq ? eq.flag : '';
}

// ══════════════════════════════════════════════════════════════
//  LAYOUT DEL BRACKET (posiciones + conectores)
//  Independiente del bracket de prediccion.js — mismo esquema
//  visual, coordenadas propias. No modificar sin revisar ambas
//  tablas (JUGADOR a escala x1, ADMIN a escala x1.5).
// ══════════════════════════════════════════════════════════════

// ── Posiciones (jugador — cajas normales, igual escala que "Mi porra") ──
const LAYOUT_JUGADOR = [
  // R32 izquierda
  { id: 'elim16_1', left: 0, top: 24,  fase: 'r32' },
  { id: 'elim16_2', left: 0, top: 154, fase: 'r32' },
  { id: 'elim16_3', left: 0, top: 284, fase: 'r32' },
  { id: 'elim16_4', left: 0, top: 414, fase: 'r32' },
  { id: 'elim16_8', left: 0, top: 544, fase: 'r32' },
  { id: 'elim16_7', left: 0, top: 674, fase: 'r32' },
  { id: 'elim16_6', left: 0, top: 804, fase: 'r32' },
  { id: 'elim16_5', left: 0, top: 934, fase: 'r32' },
  // R16 izquierda
  { id: 'elim8_2', left: 145, top: 89,  fase: 'r16' },
  { id: 'elim8_1', left: 145, top: 349, fase: 'r16' },
  { id: 'elim8_5', left: 145, top: 609, fase: 'r16' },
  { id: 'elim8_6', left: 145, top: 869, fase: 'r16' },
  // Cuartos izquierda
  { id: 'elim4_1', left: 290, top: 219, fase: 'qf' },
  { id: 'elim4_2', left: 290, top: 739, fase: 'qf' },
  // Semis
  { id: 'elim2_1', left: 435, top: 479, fase: 'semi' },
  { id: 'elim2_2', left: 735, top: 479, fase: 'semi' },
  // Final y 3er puesto
  { id: 'elimfin', left: 580, top: 479, fase: 'final' },
  { id: 'elim34',  left: 580, top: 618, fase: '3er' },
  // Cuartos derecha
  { id: 'elim4_3', left: 880, top: 219, fase: 'qf' },
  { id: 'elim4_4', left: 880, top: 739, fase: 'qf' },
  // R16 derecha
  { id: 'elim8_3', left: 1025, top: 89,  fase: 'r16' },
  { id: 'elim8_4', left: 1025, top: 349, fase: 'r16' },
  { id: 'elim8_7', left: 1025, top: 609, fase: 'r16' },
  { id: 'elim8_8', left: 1025, top: 869, fase: 'r16' },
  // R32 derecha
  { id: 'elim16_9',  left: 1170, top: 24,  fase: 'r32' },
  { id: 'elim16_10', left: 1170, top: 154, fase: 'r32' },
  { id: 'elim16_11', left: 1170, top: 284, fase: 'r32' },
  { id: 'elim16_12', left: 1170, top: 414, fase: 'r32' },
  { id: 'elim16_16', left: 1170, top: 544, fase: 'r32' },
  { id: 'elim16_15', left: 1170, top: 674, fase: 'r32' },
  { id: 'elim16_14', left: 1170, top: 804, fase: 'r32' },
  { id: 'elim16_13', left: 1170, top: 934, fase: 'r32' },
];

// ── Posiciones (admin — cajas grandes, escala x1.5 respecto a jugador) ──
const LAYOUT_ADMIN = [
  { id: 'elim16_1', left: 0, top: 36,   fase: 'r32' },
  { id: 'elim16_2', left: 0, top: 231,  fase: 'r32' },
  { id: 'elim16_3', left: 0, top: 426,  fase: 'r32' },
  { id: 'elim16_4', left: 0, top: 621,  fase: 'r32' },
  { id: 'elim16_8', left: 0, top: 816,  fase: 'r32' },
  { id: 'elim16_7', left: 0, top: 1011, fase: 'r32' },
  { id: 'elim16_6', left: 0, top: 1206, fase: 'r32' },
  { id: 'elim16_5', left: 0, top: 1401, fase: 'r32' },

  { id: 'elim8_2', left: 218, top: 134,  fase: 'r16' },
  { id: 'elim8_1', left: 218, top: 524,  fase: 'r16' },
  { id: 'elim8_5', left: 218, top: 914,  fase: 'r16' },
  { id: 'elim8_6', left: 218, top: 1304, fase: 'r16' },

  { id: 'elim4_1', left: 435, top: 329,  fase: 'qf' },
  { id: 'elim4_2', left: 435, top: 1109, fase: 'qf' },

  { id: 'elim2_1', left: 653,  top: 719, fase: 'semi' },
  { id: 'elim2_2', left: 1103, top: 719, fase: 'semi' },

  { id: 'elimfin', left: 870, top: 719, fase: 'final' },
  { id: 'elim34',  left: 870, top: 927, fase: '3er' },

  { id: 'elim4_3', left: 1320, top: 329,  fase: 'qf' },
  { id: 'elim4_4', left: 1320, top: 1109, fase: 'qf' },

  { id: 'elim8_3', left: 1538, top: 134,  fase: 'r16' },
  { id: 'elim8_4', left: 1538, top: 524,  fase: 'r16' },
  { id: 'elim8_7', left: 1538, top: 914,  fase: 'r16' },
  { id: 'elim8_8', left: 1538, top: 1304, fase: 'r16' },

  { id: 'elim16_9',  left: 1755, top: 36,   fase: 'r32' },
  { id: 'elim16_10', left: 1755, top: 231,  fase: 'r32' },
  { id: 'elim16_11', left: 1755, top: 426,  fase: 'r32' },
  { id: 'elim16_12', left: 1755, top: 621,  fase: 'r32' },
  { id: 'elim16_16', left: 1755, top: 816,  fase: 'r32' },
  { id: 'elim16_15', left: 1755, top: 1011, fase: 'r32' },
  { id: 'elim16_14', left: 1755, top: 1206, fase: 'r32' },
  { id: 'elim16_13', left: 1755, top: 1401, fase: 'r32' },
];

// ── Conectores SVG (jugador — escala x1, idéntico esquema visual) ──
const SVG_JUGADOR = `
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

  <line class="conn-line" x1="275" y1="127" x2="282" y2="127"/>
  <line class="conn-line" x1="275" y1="387" x2="282" y2="387"/>
  <line class="conn-line" x1="282" y1="127" x2="282" y2="387"/>
  <line class="conn-line" x1="282" y1="257" x2="290" y2="257"/>

  <line class="conn-line" x1="275" y1="647" x2="282" y2="647"/>
  <line class="conn-line" x1="275" y1="907" x2="282" y2="907"/>
  <line class="conn-line" x1="282" y1="647" x2="282" y2="907"/>
  <line class="conn-line" x1="282" y1="777" x2="290" y2="777"/>

  <line class="conn-line" x1="420" y1="257" x2="427" y2="257"/>
  <line class="conn-line" x1="420" y1="777" x2="427" y2="777"/>
  <line class="conn-line" x1="427" y1="257" x2="427" y2="777"/>
  <line class="conn-line" x1="427" y1="517" x2="435" y2="517"/>

  <line class="conn-line" x1="565" y1="517" x2="580" y2="517" stroke-width="2"/>

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

  <line class="conn-line" x1="1025" y1="127" x2="1018" y2="127"/>
  <line class="conn-line" x1="1025" y1="387" x2="1018" y2="387"/>
  <line class="conn-line" x1="1018" y1="127" x2="1018" y2="387"/>
  <line class="conn-line" x1="1018" y1="257" x2="1010" y2="257"/>

  <line class="conn-line" x1="1025" y1="647" x2="1018" y2="647"/>
  <line class="conn-line" x1="1025" y1="907" x2="1018" y2="907"/>
  <line class="conn-line" x1="1018" y1="647" x2="1018" y2="907"/>
  <line class="conn-line" x1="1018" y1="777" x2="1010" y2="777"/>

  <line class="conn-line" x1="880" y1="257" x2="873" y2="257"/>
  <line class="conn-line" x1="880" y1="777" x2="873" y2="777"/>
  <line class="conn-line" x1="873" y1="257" x2="873" y2="777"/>
  <line class="conn-line" x1="873" y1="517" x2="865" y2="517"/>

  <line class="conn-line" x1="735" y1="517" x2="720" y2="517" stroke-width="2"/>

  <line class="conn-line" x1="500" y1="554" x2="500" y2="638" stroke-dasharray="4,3" opacity="0.5"/>
  <line class="conn-line" x1="500" y1="638" x2="580" y2="638" stroke-dasharray="4,3" opacity="0.5"/>
  <line class="conn-line" x1="800" y1="554" x2="800" y2="638" stroke-dasharray="4,3" opacity="0.5"/>
  <line class="conn-line" x1="800" y1="638" x2="720" y2="638" stroke-dasharray="4,3" opacity="0.5"/>
`;

// ── Conectores SVG (admin — escala x1.5, misma geometría que el de arriba) ──
const SVG_ADMIN = `
  <line class="conn-line" x1="195" y1="93" x2="206" y2="93"/>
  <line class="conn-line" x1="195" y1="288" x2="206" y2="288"/>
  <line class="conn-line" x1="206" y1="93" x2="206" y2="288"/>
  <line class="conn-line" x1="206" y1="190" x2="218" y2="190"/>

  <line class="conn-line" x1="195" y1="483" x2="206" y2="483"/>
  <line class="conn-line" x1="195" y1="678" x2="206" y2="678"/>
  <line class="conn-line" x1="206" y1="483" x2="206" y2="678"/>
  <line class="conn-line" x1="206" y1="580" x2="218" y2="580"/>

  <line class="conn-line" x1="195" y1="873" x2="206" y2="873"/>
  <line class="conn-line" x1="195" y1="1068" x2="206" y2="1068"/>
  <line class="conn-line" x1="206" y1="873" x2="206" y2="1068"/>
  <line class="conn-line" x1="206" y1="970" x2="218" y2="970"/>

  <line class="conn-line" x1="195" y1="1263" x2="206" y2="1263"/>
  <line class="conn-line" x1="195" y1="1458" x2="206" y2="1458"/>
  <line class="conn-line" x1="206" y1="1263" x2="206" y2="1458"/>
  <line class="conn-line" x1="206" y1="1360" x2="218" y2="1360"/>

  <line class="conn-line" x1="412" y1="190" x2="423" y2="190"/>
  <line class="conn-line" x1="412" y1="580" x2="423" y2="580"/>
  <line class="conn-line" x1="423" y1="190" x2="423" y2="580"/>
  <line class="conn-line" x1="423" y1="386" x2="435" y2="386"/>

  <line class="conn-line" x1="412" y1="970" x2="423" y2="970"/>
  <line class="conn-line" x1="412" y1="1360" x2="423" y2="1360"/>
  <line class="conn-line" x1="423" y1="970" x2="423" y2="1360"/>
  <line class="conn-line" x1="423" y1="1166" x2="435" y2="1166"/>

  <line class="conn-line" x1="630" y1="386" x2="640" y2="386"/>
  <line class="conn-line" x1="630" y1="1166" x2="640" y2="1166"/>
  <line class="conn-line" x1="640" y1="386" x2="640" y2="1166"/>
  <line class="conn-line" x1="640" y1="776" x2="652" y2="776"/>

  <line class="conn-line" x1="848" y1="776" x2="870" y2="776" stroke-width="2"/>

  <line class="conn-line" x1="1755" y1="93" x2="1744" y2="93"/>
  <line class="conn-line" x1="1755" y1="288" x2="1744" y2="288"/>
  <line class="conn-line" x1="1744" y1="93" x2="1744" y2="288"/>
  <line class="conn-line" x1="1744" y1="190" x2="1732" y2="190"/>

  <line class="conn-line" x1="1755" y1="483" x2="1744" y2="483"/>
  <line class="conn-line" x1="1755" y1="678" x2="1744" y2="678"/>
  <line class="conn-line" x1="1744" y1="483" x2="1744" y2="678"/>
  <line class="conn-line" x1="1744" y1="580" x2="1732" y2="580"/>

  <line class="conn-line" x1="1755" y1="873" x2="1744" y2="873"/>
  <line class="conn-line" x1="1755" y1="1068" x2="1744" y2="1068"/>
  <line class="conn-line" x1="1744" y1="873" x2="1744" y2="1068"/>
  <line class="conn-line" x1="1744" y1="970" x2="1732" y2="970"/>

  <line class="conn-line" x1="1755" y1="1263" x2="1744" y2="1263"/>
  <line class="conn-line" x1="1755" y1="1458" x2="1744" y2="1458"/>
  <line class="conn-line" x1="1744" y1="1263" x2="1744" y2="1458"/>
  <line class="conn-line" x1="1744" y1="1360" x2="1732" y2="1360"/>

  <line class="conn-line" x1="1538" y1="190" x2="1527" y2="190"/>
  <line class="conn-line" x1="1538" y1="580" x2="1527" y2="580"/>
  <line class="conn-line" x1="1527" y1="190" x2="1527" y2="580"/>
  <line class="conn-line" x1="1527" y1="386" x2="1515" y2="386"/>

  <line class="conn-line" x1="1538" y1="970" x2="1527" y2="970"/>
  <line class="conn-line" x1="1538" y1="1360" x2="1527" y2="1360"/>
  <line class="conn-line" x1="1527" y1="970" x2="1527" y2="1360"/>
  <line class="conn-line" x1="1527" y1="1166" x2="1515" y2="1166"/>

  <line class="conn-line" x1="1320" y1="386" x2="1310" y2="386"/>
  <line class="conn-line" x1="1320" y1="1166" x2="1310" y2="1166"/>
  <line class="conn-line" x1="1310" y1="386" x2="1310" y2="1166"/>
  <line class="conn-line" x1="1310" y1="776" x2="1298" y2="776"/>

  <line class="conn-line" x1="1102" y1="776" x2="1080" y2="776" stroke-width="2"/>

  <line class="conn-line" x1="750" y1="831" x2="750" y2="957" stroke-dasharray="4,3" opacity="0.5"/>
  <line class="conn-line" x1="750" y1="957" x2="870" y2="957" stroke-dasharray="4,3" opacity="0.5"/>
  <line class="conn-line" x1="1200" y1="831" x2="1200" y2="957" stroke-dasharray="4,3" opacity="0.5"/>
  <line class="conn-line" x1="1200" y1="957" x2="1080" y2="957" stroke-dasharray="4,3" opacity="0.5"/>
`;

// ── Etiquetas de columna (rondas) ──────────────────────────────
function construirEtiquetasColumnas(tipo) {
  const anchoNormal = tipo === 'admin' ? 195 : 130;
  const anchoFinal  = tipo === 'admin' ? 210 : 140;
  const k = tipo === 'admin' ? 1.5 : 1;

  const colsL = [
    { label: '1/16',    x: 0 },
    { label: '1/8',     x: Math.round(145 * k) },
    { label: 'Cuartos', x: Math.round(290 * k) },
    { label: 'Semis',   x: Math.round(435 * k) },
  ];
  const colsR = [
    { label: 'Semis',   x: Math.round(735 * k) },
    { label: 'Cuartos', x: Math.round(880 * k) },
    { label: '1/8',     x: Math.round(1025 * k) },
    { label: '1/16',    x: Math.round(1170 * k) },
  ];

  let html = '';
  colsL.forEach(c => {
    html += `<div class="bracket-col-label" style="left:${c.x}px;top:6px;width:${anchoNormal}px;">${c.label}</div>`;
  });
  colsR.forEach(c => {
    html += `<div class="bracket-col-label" style="left:${c.x}px;top:6px;width:${anchoNormal}px;">${c.label}</div>`;
  });
  const xFinal = Math.round(580 * k);
  html += `<div class="bracket-col-label" style="left:${xFinal}px;top:6px;width:${anchoFinal}px;text-align:center;">🏆 Final</div>`;
  html += `<div class="bracket-col-label" style="left:${xFinal}px;top:${Math.round(600 * k)}px;width:${anchoFinal}px;text-align:center;color:var(--tm);">🥉 3er puesto</div>`;
  return html;
}

// ══════════════════════════════════════════════════════════════
//  RENDER DE CADA PARTIDO EN EL BRACKET
// ══════════════════════════════════════════════════════════════

function renderMatchBracket(entry, tipo) {
  const { id, left, top, fase } = entry;
  const partido = getPartidoElimPorId(id);
  if (!partido) return '';

  const res        = _resultadosElim[id];
  const confirmado = !!res?.confirmado;
  const equipos    = obtenerEquiposPartidoElim(id);

  const anchoNormal = tipo === 'admin' ? 195 : 130;
  const anchoFinal  = tipo === 'admin' ? 210 : 140;
  const ancho       = (fase === 'final' || fase === '3er') ? anchoFinal : anchoNormal;
  const claseFase   = fase === 'final' ? 'final' : fase === '3er' ? 'third' : '';
  const wrapStyle   = `position:absolute; left:${left}px; top:${top}px; width:${ancho}px;`;

  // ── Equipos aún no determinados (esperando ronda anterior) ──
  if (!equipos.listos && !confirmado) {
    return `
      <div class="bracket-match pending ${claseFase} ${tipo === 'admin' ? 'admin-lg' : ''}" style="${wrapStyle}">
        <div class="bm-date">📅 ${formatMatchDate(partido.fechaUTC)}</div>
        <div class="bm-team"><span class="bm-placeholder">${t('scores.tbd')}</span></div>
        <div class="bm-team"><span class="bm-placeholder">${t('scores.tbd')}</span></div>
        <div class="bm-pts">${t('scores.pending')}</div>
      </div>`;
  }

  const nomL = equipos.local     || res?.equipo_local     || '?';
  const nomV = equipos.visitante || res?.equipo_visitante || '?';

  // ── VISTA JUGADOR (solo lectura) ──
  if (tipo === 'jugador') {
    const claseL = confirmado && res.equipo_que_pasa === nomL ? 'win' : '';
    const claseV = confirmado && res.equipo_que_pasa === nomV ? 'win' : '';
    return `
      <div class="bracket-match ${claseFase}" style="${wrapStyle}">
        <div class="bm-date">📅 ${formatMatchDate(partido.fechaUTC)}</div>
        <div class="bm-team ${claseL}">
          ${equipos.flagLocal ? `<span class="bm-flag">${equipos.flagLocal}</span>` : ''}
          <span class="bm-name">${nomL}</span>
          <span class="bm-score">${confirmado ? res.goles_local : '–'}</span>
        </div>
        <div class="bm-team ${claseV}">
          ${equipos.flagVisitante ? `<span class="bm-flag">${equipos.flagVisitante}</span>` : ''}
          <span class="bm-name">${nomV}</span>
          <span class="bm-score">${confirmado ? res.goles_visitante : '–'}</span>
        </div>
        <div class="bm-pts">
          ${confirmado
            ? `✓ ${t('scores.confirmed')} <button class="bm-info-btn" onclick="window._verDesglosePartido('${id}', true)">🔍</button>`
            : t('scores.pending')}
        </div>
      </div>`;
  }

  // ── VISTA ADMIN — partido ya confirmado ──
  if (confirmado) {
    const claseL = res.equipo_que_pasa === nomL ? 'win' : '';
    const claseV = res.equipo_que_pasa === nomV ? 'win' : '';
    return `
      <div class="bracket-match admin-lg confirmed ${claseFase}" style="${wrapStyle}">
        <div class="bm-date">
          📅 ${formatMatchDate(partido.fechaUTC)}
          <span class="bm-tag-ok">✓ ${t('scores.confirmed')}</span>
          <button class="bm-info-btn" onclick="window._verDesglosePartido('${id}', true)">🔍</button>
        </div>
        <div class="bm-team ${claseL}">
          ${equipos.flagLocal ? `<span class="bm-flag">${equipos.flagLocal}</span>` : ''}
          <span class="bm-name">${nomL}</span>
          <span class="bm-score">${res.goles_local}</span>
        </div>
        <div class="bm-team ${claseV}">
          ${equipos.flagVisitante ? `<span class="bm-flag">${equipos.flagVisitante}</span>` : ''}
          <span class="bm-name">${nomV}</span>
          <span class="bm-score">${res.goles_visitante}</span>
        </div>
        ${res.hay_prorroga_penales
          ? `<div class="bm-note">⚽ Pasa (prórroga/penaltis): <strong>${res.equipo_que_pasa}</strong></div>`
          : ''}
        <div class="bm-admin-actions">
          <button class="btn btn-secondary btn-sm" onclick="window._editarResElim('${id}')">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="window._borrarResElim('${id}')">🗑️ Borrar</button>
        </div>
      </div>`;
  }

  // ── VISTA ADMIN — pendiente de confirmar (equipos ya listos) ──
  const empatado = res?.goles_local !== undefined && res?.goles_local === res?.goles_visitante;

  return `
    <div class="bracket-match admin-lg editable ${claseFase}" style="${wrapStyle}">
      <div class="bm-date">📅 ${formatMatchDate(partido.fechaUTC)}</div>
      <div class="bm-team">
        ${equipos.flagLocal ? `<span class="bm-flag">${equipos.flagLocal}</span>` : ''}
        <span class="bm-name">${nomL}</span>
        <input class="bm-input-lg" type="number" min="0" max="20"
          id="rese_${id}_l" value="${res?.goles_local ?? ''}"
          onchange="window._onMarcadorElimChange('${id}')">
      </div>
      <div class="bm-team">
        ${equipos.flagVisitante ? `<span class="bm-flag">${equipos.flagVisitante}</span>` : ''}
        <span class="bm-name">${nomV}</span>
        <input class="bm-input-lg" type="number" min="0" max="20"
          id="rese_${id}_v" value="${res?.goles_visitante ?? ''}"
          onchange="window._onMarcadorElimChange('${id}')">
      </div>
      <div id="tiebreak_${id}" class="bm-tiebreak" style="display:${empatado ? 'flex' : 'none'};">
        <span class="bm-tb-label">${t('knockouts.whoAdvances')}</span>
        <button type="button" class="bm-tb-btn" id="rese_${id}_pasa_local"
          title="${nomL}" onclick="window._seleccionarPasaElim('${id}', 'local')">${nomL}</button>
        <button type="button" class="bm-tb-btn" id="rese_${id}_pasa_visitante"
          title="${nomV}" onclick="window._seleccionarPasaElim('${id}', 'visitante')">${nomV}</button>
      </div>
      <div class="bm-admin-actions">
        <button class="btn btn-primary btn-sm" onclick="window._confirmarResElim('${id}')">✓ ${t('scores.confirmBtn')}</button>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  VISTA JUGADOR (bracket, solo lectura)
// ══════════════════════════════════════════════════════════════

function renderJugadorElim(contenedor) {
  const scrollPrevio = document.querySelector('.bracket-scroll')?.scrollLeft || 0;

  let matches = '';
  LAYOUT_JUGADOR.forEach(entry => { matches += renderMatchBracket(entry, 'jugador'); });

  contenedor.innerHTML = `
    <div class="bracket-scroll">
      <div class="bracket-canvas" style="position:relative; min-width:1300px; height:1060px;">
        <svg style="position:absolute;top:0;left:0;width:1300px;height:1060px;pointer-events:none;overflow:visible;">
          ${SVG_JUGADOR}
        </svg>
        ${construirEtiquetasColumnas('jugador')}
        ${matches}
      </div>
    </div>
  `;

  if (window.parseTwemoji) window.parseTwemoji(contenedor);

  const nuevoScroll = document.querySelector('.bracket-scroll');
  if (nuevoScroll) nuevoScroll.scrollLeft = scrollPrevio;
}

// ══════════════════════════════════════════════════════════════
//  VISTA ADMIN (bracket editable)
// ══════════════════════════════════════════════════════════════

function renderAdminElim(contenedor) {
  const scrollPrevio = document.querySelector('.bracket-scroll')?.scrollLeft || 0;

  let matches = '';
  LAYOUT_ADMIN.forEach(entry => { matches += renderMatchBracket(entry, 'admin'); });

  contenedor.innerHTML = `
    <div class="notice" style="margin-bottom:8px;">${t('scores.adminOnly')}</div>
    <div class="bracket-scroll">
      <div class="bracket-canvas" style="position:relative; min-width:1950px; height:1590px;">
        <svg style="position:absolute;top:0;left:0;width:1950px;height:1590px;pointer-events:none;overflow:visible;">
          ${SVG_ADMIN}
        </svg>
        ${construirEtiquetasColumnas('admin')}
        ${matches}
      </div>
    </div>
  `;

  if (window.parseTwemoji) window.parseTwemoji(contenedor);

  window._confirmarResElim     = (id) => confirmarResultadoElim(id);
  window._editarResElim        = (id) => editarResultadoElim(id);
  window._borrarResElim        = (id) => confirmarBorrarResultadoElim(id);
  window._onMarcadorElimChange = (id) => onMarcadorElimChange(id);
  window._seleccionarPasaElim  = (id, lado) => seleccionarPasaElim(id, lado);

  const nuevoScroll = document.querySelector('.bracket-scroll');
  if (nuevoScroll) nuevoScroll.scrollLeft = scrollPrevio;
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
  caja.style.display = empatado ? 'flex' : 'none';
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
