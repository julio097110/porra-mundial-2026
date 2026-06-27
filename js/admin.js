// ============================================================
//  js/admin.js
//  Panel de administración
//  Secciones: resumen, jugadores, predicciones, fechas, pagos,
//             emails, info, especiales, bracket, integridad
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, setDoc,
  updateDoc, deleteDoc, writeBatch, serverTimestamp,
  query, where, orderBy, limit, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t } from './i18n.js';
import {
  crearUsuario, verificarNombreDisponible,
  verificarUsernameDisponible, marcarPago,
  eliminarUsuarioFirestore, obtenerTodosUsuarios
} from './auth.js';
import { GRUPOS, getPartidosPorGrupo, EQUIPOS_48 } from '../data/partidos.js';
import { calcularPuntosPartido, recalcularPuntosTerceros, borrarPuntosTerceros } from './resultados.js';
import { calcularPuntosPartidoElim } from './resultados_elim.js';

// ── Estado ────────────────────────────────────────────────────
let _app         = null;
let _seccionActiva = 'resumen';
let _usuarios    = [];
let _config      = {};
let _emails      = [];
let _especiales  = [];
let _bracket     = {};   // config/bracket_eliminatorias
let _tercerosConfirmados = []; // config/general.terceros_confirmados
let _resultadosGrupos = {}; // resultados confirmados para saber qué grupos están completos
let _paginaJug   = 1;
const POR_PAGINA = 20;
let _integridad  = null; // { filas: [...], generadoEn: Date } | null

// ── Punto de entrada ─────────────────────────────────────────
export async function initAdmin(app) {
  _app = app;
  const contenedor = document.getElementById('adminContent');
  contenedor.innerHTML = `
    <div class="loading-inline">
      <div class="spinner-sm"></div>
      <span>${t('common.loading')}</span>
    </div>`;

  try {
    await Promise.all([
      cargarUsuarios(),
      cargarConfig(),
      cargarEmailLog(),
      cargarBracket(),
      cargarResultadosGrupos()
    ]);
    await cargarEspeciales(); // necesita _usuarios ya cargado
    renderAdmin(contenedor);

    // Refrescar textos al cambiar idioma
    window._refreshTextos = () => {
      const c = document.getElementById('adminContent');
      if (c) renderAdmin(c);
    };

  } catch (e) {
    console.error('[admin]', e);
    contenedor.innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
  }
}

// ── Render shell del panel ────────────────────────────────────
function renderAdmin(contenedor) {
  contenedor.innerHTML = `
    <div style="display:flex; gap:0; margin-top:8px; min-height:60vh;">

      <!-- Sidebar -->
      <div style="width:180px; flex-shrink:0; background:#fff; border:1px solid #dde8cc;
        border-radius:var(--radius); margin-right:14px; padding:12px 0; align-self:flex-start;
        position:sticky; top:calc(var(--topbar-h) + 54px);">

        ${menuItem('resumen',      '📊', t('admin.title').split(' ')[0])}
        ${menuItem('jugadores',    '👥', t('admin.players.title'),
          _usuarios.filter(u => !u.pagado).length || 0)}
        ${menuItem('predicciones', '👁️', 'Ver predicciones')}
        ${menuItem('fechas',       '📅', t('admin.dates.title'))}
        ${menuItem('pagos',        '💳', t('admin.payments.title'))}
        ${menuItem('emails',       '📧', t('admin.emails.title'))}
        ${menuItem('info',         '🌐', t('admin.infoPage.title'))}
        ${menuItem('especiales',   '⭐', t('admin.specials.title'))}
        ${menuItem('bracket',      '🏆', 'Bracket',
          Object.values(_bracket).filter(p => p?.terceroPendiente).length || 0)}
        ${menuItem('integridad',   '🔍', t('admin.integrity.title'))}
        ${menuItem('limpiarElim',  '🗑️', 'Limpiar Elim.')}
        ${menuItem('mimimi',       '😭', 'Mimimi')}
      </div>

      <!-- Contenido -->
      <div style="flex:1; min-width:0;" id="adminSeccion">
        ${renderSeccion()}
      </div>
    </div>`;

  // Handlers de menú
  window._adminSeccion = (sec) => {
    _seccionActiva = sec;
    document.querySelectorAll('.admin-sidebar-item').forEach(el => {
      el.classList.toggle('active', el.dataset.sec === sec);
    });
    document.getElementById('adminSeccion').innerHTML = renderSeccion();
    registrarHandlers();
  };

  registrarHandlers();
}

function menuItem(sec, icon, label, badge = 0) {
  return `
    <div class="admin-sidebar-item ${_seccionActiva === sec ? 'active' : ''}"
      data-sec="${sec}" onclick="window._adminSeccion('${sec}')">
      <span class="si-icon">${icon}</span>
      ${label}
      ${badge > 0
        ? `<span class="admin-sidebar-badge red">${badge}</span>`
        : ''}
    </div>`;
}

// ── Renderiza la sección activa ───────────────────────────────
function renderSeccion() {
  switch (_seccionActiva) {
    case 'resumen':       return renderResumen();
    case 'jugadores':     return renderJugadores();
    case 'predicciones':  return renderPrediccionesAdmin();
    case 'fechas':        return renderFechas();
    case 'pagos':         return renderPagos();
    case 'emails':        return renderEmails();
    case 'info':          return renderInfoPage();
    case 'especiales':    return renderEspecialesAdmin();
    case 'bracket':       return renderBracketAdmin();
    case 'integridad':    return renderIntegridad();
    case 'limpiarElim':   return renderLimpiarElim();
    case 'mimimi':        return renderMimimi();
    default:              return renderResumen();
  }
}

// ══════════════════════════════════════════════════════════════
//  RESUMEN
// ══════════════════════════════════════════════════════════════

function renderResumen() {
  const sinPred  = _usuarios.filter(u => u.predGrupos.estado === 'ninguno' && u.predEsp.estado === 'ninguno' && u.predElim.estado === 'ninguno' && u.predTerceros.estado === 'ninguno').length;
  const pagados  = _usuarios.filter(u => u.pagado).length;
  const diasFin  = diasHastaFecha('2026-06-11T00:00:00+02:00');

  return `
    <div>
      <div style="font-family:'Bebas Neue',sans-serif; font-size:22px; color:var(--gd); letter-spacing:1px; margin-bottom:4px;">
        ${t('admin.title')}
      </div>
      <div style="font-size:12px; color:var(--tm); margin-bottom:16px;">
        ${t('admin.welcome')}, Admin · Mundial 2026 · ${diasFin > 0 ? diasFin + ' ' + t('admin.daysLeft') : 'El Mundial ha comenzado'}
      </div>

      ${sinPred > 0 ? `
        <div class="notice warn" style="margin-bottom:14px;">
          ⚠️ <strong>${sinPred} ${t('admin.alertPending')}</strong>
          ${formatFechaLimite(_config.fecha_limite_grupos)}.
          ${t('admin.emailDaily')}
        </div>` : ''}

      <div class="admin-stats">
        <div class="admin-stat-card">
          <div class="admin-stat-val">${_usuarios.length}</div>
          <div class="admin-stat-label">${t('admin.stats.players')}</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-val red">${sinPred}</div>
          <div class="admin-stat-label">${t('admin.stats.noPred')}</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-val gold">${pagados}</div>
          <div class="admin-stat-label">${t('admin.stats.paid')}</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-val">72</div>
          <div class="admin-stat-label">${t('admin.stats.matches')}</div>
        </div>
      </div>

      <!-- Accesos rápidos -->
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
        <button class="btn btn-secondary btn-sm" onclick="window._adminSeccion('jugadores')">
          👥 ${t('admin.players.title')}
        </button>
        <button class="btn btn-secondary btn-sm" onclick="window._adminSeccion('fechas')">
          📅 ${t('admin.dates.title')}
        </button>
        <button class="btn btn-secondary btn-sm" onclick="window._adminSeccion('pagos')">
          💳 ${t('admin.payments.title')}
        </button>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  JUGADORES
// ══════════════════════════════════════════════════════════════

function renderJugadores() {
  const totalPags = Math.ceil(_usuarios.length / POR_PAGINA);
  const inicio    = (_paginaJug - 1) * POR_PAGINA;
  const pagina    = _usuarios.slice(inicio, inicio + POR_PAGINA);

  return `
    <div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
        <div style="font-size:14px; font-weight:600; color:var(--gd);">👥 ${t('admin.players.title')}</div>
        <button class="btn btn-primary btn-sm" onclick="window._adminAnadirJugador()">
          + ${t('admin.players.addBtn')}
        </button>
      </div>

      <div class="card">
        <div class="card-body" style="padding:0; overflow-x:auto;">
          <table class="admin-table">
            <thead>
              <tr>
                <th>${t('admin.players.name')}</th>
                <th>${t('admin.players.username')}</th>
                <th>${t('admin.players.lang')}</th>
                <th>${t('admin.players.predictions')}</th>
                <th>${t('admin.players.payment')}</th>
                <th>${t('admin.players.actions')}</th>
              </tr>
            </thead>
            <tbody>
              ${pagina.map(u => `
                <tr>
                  <td><span class="player-name">${u.nombre_visible || '—'}</span></td>
                  <td style="color:var(--tm);">${u.username || '—'}</td>
                  <td><span class="lang-tag">${(u.idioma || 'es').toUpperCase()}</span></td>
                  <td>${badgesPred(u)}</td>
                  <td>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                      <input type="checkbox" ${u.pagado ? 'checked' : ''}
                        onchange="window._adminTogglePago('${u.uid}', this.checked)"
                        style="accent-color:var(--gl); width:15px; height:15px;">
                      <span style="font-size:11px; font-weight:600; color:${u.pagado ? 'var(--gl)' : 'var(--r)'};">
                        ${u.pagado ? '✓ ' + t('admin.players.paidYes') : '✗ ' + t('admin.players.paidNo')}
                      </span>
                    </label>
                  </td>
                  <td>
                    <button class="btn btn-secondary btn-sm" style="margin-right:4px;"
                      onclick="window._adminEditarJugador('${u.uid}')">
                      ${t('admin.players.editBtn')}
                    </button>
                    <button class="btn btn-danger btn-sm"
                      onclick="window._adminEliminarJugador('${u.uid}', '${u.nombre_visible}')">
                      ${t('admin.players.deleteBtn')}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      ${totalPags > 1 ? `
        <div class="pagination" style="margin-top:10px;">
          ${Array.from({length:totalPags}, (_,i) => `
            <button class="pag-btn ${i+1 === _paginaJug ? 'active' : ''}"
              onclick="window._adminPagJug(${i+1})">${i+1}</button>
          `).join('')}
          <span class="pag-info">${t('admin.players.showingOf')} ${inicio+1}–${Math.min(inicio+POR_PAGINA,_usuarios.length)} ${t('admin.players.of')} ${_usuarios.length}</span>
        </div>` : ''}
    </div>`;
}

// ── Badges de predicciones (4 tipos en línea) ────────────────
function badgePredTipo(estado, label) {
  if (estado === 'completo') return `<span class="pred-ok" style="font-size:10px; padding:2px 5px;">✓ ${label}</span>`;
  if (estado === 'parcial')  return `<span class="pred-partial" style="font-size:10px; padding:2px 5px;">⚡ ${label}</span>`;
  return `<span class="pred-none" style="font-size:10px; padding:2px 5px;">✗ ${label}</span>`;
}

function badgesPred(u) {
  return `<div style="display:flex; flex-wrap:wrap; gap:3px; align-items:center;">
    ${badgePredTipo(u.predGrupos.estado,   'Grupos')}
    ${badgePredTipo(u.predEsp.estado,      'Esp.')}
    ${badgePredTipo(u.predElim.estado,     'Elim.')}
    ${badgePredTipo(u.predTerceros.estado, 'Terc.')}
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  PREDICCIONES DE TODOS (vista admin)
// ══════════════════════════════════════════════════════════════

function renderPrediccionesAdmin() {
  return `
    <div>
      <div style="font-size:14px; font-weight:600; color:var(--gd); margin-bottom:6px;">
        👁️ Ver predicciones de todos
      </div>
      <div style="font-size:12px; color:var(--tm); margin-bottom:14px;">
        Accede a las predicciones de cualquier jugador o bórralas si es necesario.
      </div>

      <div class="card">
        <div class="card-body" style="padding:0;">
          <table class="admin-table">
            <thead>
              <tr>
                <th>${t('admin.players.name')}</th>
                <th>${t('admin.players.predictions')}</th>
                <th>Ver</th>
                <th>Borrar</th>
              </tr>
            </thead>
            <tbody>
              ${_usuarios.map(u => `
                <tr>
                  <td><span class="player-name">${u.nombre_visible}</span></td>
                  <td>${badgesPred(u)}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm"
                      onclick="window._adminVerPredicciones('${u.uid}', '${u.nombre_visible}')">
                      👁️ Ver
                    </button>
                  </td>
                  <td style="display:flex; gap:4px; flex-wrap:wrap;">
                    <button class="btn btn-danger btn-sm"
                      onclick="window._adminBorrarPredJugador('${u.uid}', '${u.nombre_visible}', 'grupos')">
                      Grupos
                    </button>
                    <button class="btn btn-danger btn-sm"
                      onclick="window._adminBorrarPredJugador('${u.uid}', '${u.nombre_visible}', 'eliminatorias')">
                      Elim.
                    </button>
                    <button class="btn btn-danger btn-sm"
                      onclick="window._adminBorrarPredJugador('${u.uid}', '${u.nombre_visible}', 'especiales')">
                      Esp.
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  FECHAS LÍMITE
// ══════════════════════════════════════════════════════════════

function renderFechas() {
  const fg = _config.fecha_limite_grupos        || '2026-06-11T00:00';
  const fe = _config.fecha_limite_eliminatorias || '2026-06-28T15:00';
  const ft = _config.fecha_limite_terceros      || '2026-07-24T20:30';

  const fgStr = fechaAInput(fg);
  const feStr = fechaAInput(fe);
  const ftStr = fechaAInput(ft);

  const fgPasada = new Date(fg) < new Date();
  const fePasada = new Date(fe) < new Date();
  const ftPasada = new Date(ft) < new Date();

  return `
    <div>
      <div style="font-size:14px; font-weight:600; color:var(--gd); margin-bottom:14px;">
        📅 ${t('admin.dates.title')}
      </div>

      <div class="card">
        <div class="card-body">

          <div class="fecha-row">
            <span class="fecha-icon">⚽</span>
            <div class="fecha-info">
              <div class="fecha-label">${t('admin.dates.groups')}</div>
              <div class="fecha-sub">${t('admin.dates.groupsSub')}</div>
            </div>
            <input class="fecha-input" type="datetime-local" id="inputFechaGrupos"
              value="${fgStr}">
            <span class="fecha-status ${fgPasada ? 'fecha-closed' : 'fecha-open'}">
              ${fgPasada ? t('admin.dates.closed') : t('admin.dates.open')}
            </span>
          </div>

          <div class="fecha-row">
            <span class="fecha-icon">⚔️</span>
            <div class="fecha-info">
              <div class="fecha-label">${t('admin.dates.knockouts')}</div>
              <div class="fecha-sub">${t('admin.dates.knockoutsSub')}</div>
            </div>
            <input class="fecha-input" type="datetime-local" id="inputFechaElim"
              value="${feStr}">
            <span class="fecha-status ${fePasada ? 'fecha-closed' : 'fecha-open'}">
              ${fePasada ? t('admin.dates.closed') : t('admin.dates.open')}
            </span>
          </div>

          <div class="fecha-row">
            <span class="fecha-icon">🥉</span>
            <div class="fecha-info">
              <div class="fecha-label">${t('admin.dates.thirdPlace')}</div>
              <div class="fecha-sub">${t('admin.dates.thirdPlaceSub')}</div>
            </div>
            <input class="fecha-input" type="datetime-local" id="inputFechaTerceros"
              value="${ftStr}">
            <span class="fecha-status ${ftPasada ? 'fecha-closed' : 'fecha-open'}">
              ${ftPasada ? t('admin.dates.closed') : t('admin.dates.open')}
            </span>
          </div>

          <div class="fecha-row">
            <span class="fecha-icon">👁️</span>
            <div class="fecha-info">
              <div class="fecha-label">${t('admin.dates.allPred')}</div>
              <div class="fecha-sub">${t('admin.dates.allPredSub')}</div>
            </div>
            <span class="fecha-status fecha-auto">${t('admin.dates.auto')}</span>
          </div>

          <button class="btn btn-primary" style="margin-top:16px;" onclick="window._adminGuardarFechas()">
            💾 ${t('admin.dates.saveBtn')}
          </button>
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  PAGOS
// ══════════════════════════════════════════════════════════════

function renderPagos() {
  const revolut   = _config.enlace_revolut || 'https://revolut.me/julioz65d?currency=NOK&amount=10000&note=Porra%20mundial';
  const vipps     = _config.enlace_vipps   || 'https://vipps.no/pay/48420588';
  const porraLlena= _config.porra_llena    || false;
  const bote      = _config.bote_total     || '';

  return `
    <div>
      <div style="font-size:14px; font-weight:600; color:var(--gd); margin-bottom:14px;">
        💳 ${t('admin.payments.title')}
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div class="card-header"><span class="card-header-title">🔗 ${t('admin.payments.title')}</span></div>
        <div class="card-body">
          <div class="pago-row">
            <span class="pago-label">Revolut</span>
            <input class="pago-input" type="text" id="inputRevolut" value="${revolut}"
              placeholder="https://revolut.me/...">
          </div>
          <div class="pago-row">
            <span class="pago-label">Vipps</span>
            <input class="pago-input" type="text" id="inputVipps" value="${vipps}"
              placeholder="https://vipps.no/pay/...">
          </div>
          <div class="toggle-row">
            <div class="toggle-info">
              <div class="toggle-label">${t('admin.payments.fullTitle')}</div>
              <div class="toggle-sub">${t('admin.payments.fullSub')}</div>
            </div>
            <div class="toggle-switch ${porraLlena ? 'on' : 'off'}" id="togglePorraLlena"
              onclick="window._adminTogglePorraLlena()"></div>
          </div>
          <button class="btn btn-primary" style="margin-top:14px;" onclick="window._adminGuardarPagos()">
            💾 ${t('admin.payments.saveBtn')}
          </button>
        </div>
      </div>

      <!-- Bote total -->
      <div class="card" style="margin-bottom:14px;">
        <div class="card-header"><span class="card-header-title">💰 ${t('admin.payments.totalTitle')}</span></div>
        <div class="card-body">
          <div style="font-size:12px; color:var(--tm); margin-bottom:10px;">
            ${t('admin.payments.totalSub')}
          </div>
          <div class="pago-row">
            <span class="pago-label">${t('admin.payments.totalLabel')}</span>
            <input class="pago-input" type="number" id="inputBote" value="${bote}"
              placeholder="${t('admin.payments.totalPlaceholder')}" min="0">
          </div>
          ${bote ? `
            <div style="font-size:12px; color:var(--ts); margin-top:8px;">
              🥇 ${Math.round(bote*0.65).toLocaleString()} NOK ·
              🥈 ${Math.round(bote*0.25).toLocaleString()} NOK ·
              🥉 ${Math.round(bote*0.10).toLocaleString()} NOK
            </div>` : ''}
          <button class="btn btn-primary" style="margin-top:14px;" onclick="window._adminGuardarBote()">
            💾 ${t('admin.payments.totalSaveBtn')}
          </button>
        </div>
      </div>

      <!-- Tabla de pagos por jugador -->
      <div class="card">
        <div class="card-header"><span class="card-header-title">👥 Estado de pagos</span></div>
        <div class="card-body" style="padding:0; overflow-x:auto;">
          <table class="admin-table">
            <thead>
              <tr>
                <th>${t('admin.players.name')}</th>
                <th>${t('admin.players.payment')}</th>
              </tr>
            </thead>
            <tbody>
              ${_usuarios.map(u => `
                <tr>
                  <td><span class="player-name">${u.nombre_visible || '—'}</span></td>
                  <td>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                      <input type="checkbox" ${u.pagado ? 'checked' : ''}
                        onchange="window._adminTogglePago('${u.uid}', this.checked)"
                        style="accent-color:var(--gl); width:15px; height:15px;">
                      <span style="font-size:11px; font-weight:600; color:${u.pagado ? 'var(--gl)' : 'var(--r)'};">
                        ${u.pagado ? '✓ ' + t('admin.players.paidYes') : '✗ ' + t('admin.players.paidNo')}
                      </span>
                    </label>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  EMAILS
// ══════════════════════════════════════════════════════════════

function renderEmails() {
  return `
    <div>
      <div style="font-size:14px; font-weight:600; color:var(--gd); margin-bottom:14px;">
        📧 ${t('admin.emails.title')}
      </div>
      <div class="card">
        <div class="card-body">
          ${_emails.length === 0
            ? `<div style="font-size:13px; color:var(--tm); text-align:center; padding:20px 0;">
                Sin emails enviados todavía
              </div>`
            : _emails.map(e => `
              <div class="email-row">
                <div class="email-dot ${e.tipo === 'aviso' ? 'warn' : ''}"></div>
                <div>
                  <div class="email-title">
                    ${e.tipo === 'predicciones'
                      ? `${t('admin.emails.predSaved')} — ${e.jugador}`
                      : `${t('admin.emails.dailyAlert')} (${e.jugadores || 0})`}
                  </div>
                  <div class="email-meta">
                    ${formatFecha(e.timestamp)} · ${e.descripcion || ''}
                  </div>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  PÁGINA INFO
// ══════════════════════════════════════════════════════════════

function renderInfoPage() {
  const infoES = _config.mensaje_es || '';
  const infoEN = _config.mensaje_en || '';

  return `
    <div>
      <div style="font-size:14px; font-weight:600; color:var(--gd); margin-bottom:14px;">
        🌐 ${t('admin.infoPage.title')}
      </div>
      <div class="card">
        <div class="card-body">
          <div class="form-field" style="margin-bottom:12px;">
            <label class="form-label">Mensaje personalizado (Español)</label>
            <textarea id="inputInfoES" rows="4" class="form-input"
              placeholder="Mensaje visible en la página pública en español..."
              style="resize:vertical;">${infoES}</textarea>
          </div>
          <div class="form-field" style="margin-bottom:16px;">
            <label class="form-label">Custom message (English)</label>
            <textarea id="inputInfoEN" rows="4" class="form-input"
              placeholder="Message visible on the public page in English..."
              style="resize:vertical;">${infoEN}</textarea>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="window._adminGuardarInfo()">
              💾 ${t('admin.infoPage.saveBtn')}
            </button>
            <a href="info.html" target="_blank" class="btn btn-secondary">
              👁️ ${t('admin.infoPage.previewBtn')}
            </a>
          </div>
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  PREDICCIONES ESPECIALES (resultado oficial + corrección)
// ══════════════════════════════════════════════════════════════

function renderEspecialesAdmin() {
  const mvpOficial = _config.mvp_oficial      || '';
  const golOficial = _config.goleador_oficial || '';

  return `
    <div>
      <div style="font-size:14px; font-weight:600; color:var(--gd); margin-bottom:6px;">
        ⭐ ${t('admin.specials.title')}
      </div>

      <!-- ── Resultado oficial ── -->
      <div class="card" style="margin-bottom:16px;">
        <div class="card-body">
          <div style="font-size:13px; font-weight:600; color:var(--gd); margin-bottom:6px;">
            🏅 ${t('admin.specials.officialTitle')}
          </div>
          <div style="font-size:12px; color:var(--tm); margin-bottom:12px;">
            ${t('admin.specials.officialSubtitle')}
          </div>
          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
            <div style="flex:1; min-width:180px;">
              <label class="form-label">⭐ ${t('specials.mvp')}</label>
              <input class="form-input" type="text" id="mvpOficial"
                value="${mvpOficial}"
                placeholder="${t('specials.playerPlaceholder')}"
                style="font-size:13px;">
            </div>
            <div style="flex:1; min-width:180px;">
              <label class="form-label">⚽ ${t('specials.topScorer')}</label>
              <input class="form-input" type="text" id="golOficial"
                value="${golOficial}"
                placeholder="${t('specials.playerPlaceholder')}"
                style="font-size:13px;">
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="window._adminGuardarOficial()">
              💾 ${t('admin.specials.saveOfficialBtn')}
            </button>
            <button class="btn btn-secondary" onclick="window._adminRecalcularEspeciales()">
              🔄 ${t('admin.specials.recalcBtn')}
            </button>
          </div>
          ${mvpOficial || golOficial ? `
            <div style="margin-top:10px; font-size:11px; color:var(--gl);">
              ✅ ${t('admin.specials.officialSet')}:
              ${mvpOficial ? `⭐ <strong>${mvpOficial}</strong>` : ''}
              ${mvpOficial && golOficial ? ' · ' : ''}
              ${golOficial ? `⚽ <strong>${golOficial}</strong>` : ''}
            </div>` : ''}
        </div>
      </div>

      <!-- ── Corrección ortográfica ── -->
      <div style="font-size:12px; color:var(--tm); margin-bottom:10px;">
        ${t('admin.specials.subtitle')}
      </div>
      <div class="card">
        <div class="card-body" style="padding:0; overflow-x:auto;">
          <table class="admin-table">
            <thead>
              <tr>
                <th>${t('admin.players.name')}</th>
                <th>🏆 ${t('specials.champion')}</th>
                <th>🥈 ${t('specials.runnerUp')}</th>
                <th>⭐ MVP <span style="font-weight:400; color:var(--tm);">(original)</span></th>
                <th>⭐ ${t('admin.specials.correctedCol')}</th>
                <th>⚽ Goleador <span style="font-weight:400; color:var(--tm);">(original)</span></th>
                <th>⚽ ${t('admin.specials.correctedCol')}</th>
                <th>${t('admin.players.actions')}</th>
              </tr>
            </thead>
            <tbody>
              ${_especiales.map(e => `
                <tr>
                  <td><span class="player-name">${e.nombre}</span></td>
                  <td style="color:var(--tm); font-size:11px;">${e.campeon || '—'}</td>
                  <td style="color:var(--tm); font-size:11px;">${e.subcampeon || '—'}</td>
                  <td style="color:var(--tm); font-size:11px;">${e.mvp_original || e.mvp || '—'}</td>
                  <td>
                    <input class="form-input" type="text"
                      value="${e.mvp_corregido || ''}"
                      id="mvp_${e.uid}"
                      placeholder="${e.mvp_original || e.mvp || ''}"
                      style="font-size:12px; padding:5px 8px;">
                  </td>
                  <td style="color:var(--tm); font-size:11px;">${e.goleador_original || e.goleador || '—'}</td>
                  <td>
                    <input class="form-input" type="text"
                      value="${e.goleador_corregido || ''}"
                      id="gol_${e.uid}"
                      placeholder="${e.goleador_original || e.goleador || ''}"
                      style="font-size:12px; padding:5px 8px;">
                  </td>
                  <td>
                    <button class="btn btn-secondary btn-sm"
                      onclick="window._adminGuardarEsp('${e.uid}')">
                      💾 ${t('common.save')}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  BRACKET — asignación manual de terceros clasificados
// ══════════════════════════════════════════════════════════════

function renderBracketAdmin() {
  const partidosConTercero = [
    { id: 'r32_2',  local: '1º Grupo E', desc: 'Mejor 3º (A/B/C/D/F)',  grupos: ['A','B','C','D','F'] },
    { id: 'r32_5',  local: '1º Grupo I', desc: 'Mejor 3º (C/D/F/G/H)',  grupos: ['C','D','F','G','H'] },
    { id: 'r32_7',  local: '1º Grupo A', desc: 'Mejor 3º (C/E/F/H/I)',  grupos: ['C','E','F','H','I'] },
    { id: 'r32_8',  local: '1º Grupo L', desc: 'Mejor 3º (E/H/I/J/K)',  grupos: ['E','H','I','J','K'] },
    { id: 'r32_9',  local: '1º Grupo D', desc: 'Mejor 3º (B/E/F/I/J)',  grupos: ['B','E','F','I','J'] },
    { id: 'r32_10', local: '1º Grupo G', desc: 'Mejor 3º (A/E/H/I/J)',  grupos: ['A','E','H','I','J'] },
    { id: 'r32_13', local: '1º Grupo B', desc: 'Mejor 3º (E/F/G/I/J)',  grupos: ['E','F','G','I','J'] },
    { id: 'r32_15', local: '1º Grupo K', desc: 'Mejor 3º (D/E/I/J/L)',  grupos: ['D','E','I','J','L'] },
  ];

  const tercerosDisponibles = {};
  GRUPOS.forEach(g => {
    const partidos      = getPartidosPorGrupo(g);
    const grupoCompleto = partidos.every(p => _resultadosGrupos[p.id]?.confirmado);
    const tabla         = calcularTablaGrupoAdmin(g);
    tercerosDisponibles[g] = {
      nombre:   tabla[2]?.nombre || null,
      flag:     tabla[2]?.flag   || '',
      completo: grupoCompleto
    };
  });

  const pendientes = partidosConTercero.filter(p => _bracket[p.id]?.terceroPendiente !== false && !_bracket[p.id]?.equipoVisitante).length;
  const confirmadosSet = new Set(_tercerosConfirmados);
  const nConfirmados = _tercerosConfirmados.length;

  // ── Helper: obtener equipos de un grupo ──────────────────
  function equiposDeGrupo(g) {
    const partidos = getPartidosPorGrupo(g);
    const vistos = new Set();
    const lista = [];
    partidos.forEach(p => {
      if (!vistos.has(p.local))     { vistos.add(p.local);     lista.push({ nombre: p.local,     flag: p.flagLocal }); }
      if (!vistos.has(p.visitante)) { vistos.add(p.visitante); lista.push({ nombre: p.visitante, flag: p.flagVisitante }); }
    });
    return lista;
  }

  let html = `
    <div>
      <div style="font-size:14px; font-weight:600; color:var(--gd); margin-bottom:6px;">
        🏆 Bracket — Terceros clasificados
      </div>

      <!-- ═══════════════════════════════════════════════════
           SECCIÓN 1: TERCEROS CONFIRMADOS POR FIFA
           ═══════════════════════════════════════════════════ -->
      <div class="card" style="margin-bottom:18px; border:2px solid var(--gm);">
        <div class="card-header" style="background:var(--gm);">
          <span class="card-header-title" style="color:#fff;">
            🥉 ${t('admin.bracket.confirmedTitle')}
            <span style="font-weight:400; font-size:11px; margin-left:8px;">${t('admin.bracket.confirmedSub')}</span>
          </span>
        </div>
        <div class="card-body">

          <div style="font-size:12px; color:var(--tm); margin-bottom:14px;">
            ${t('admin.bracket.confirmedHint')}
            <strong style="color:${nConfirmados >= 8 ? 'var(--gl)' : 'var(--gd)'};">
              ${nConfirmados}/8 ${t('admin.bracket.confirmed')}
            </strong>
          </div>

          <!-- Grid de grupos -->
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px; margin-bottom:16px;">
  `;

  GRUPOS.forEach(g => {
    const equipos = equiposDeGrupo(g);
    html += `
      <div style="border:1px solid var(--gp); border-radius:var(--radius); padding:10px 12px;">
        <div style="font-size:10px; font-weight:700; color:var(--gm); text-transform:uppercase;
          letter-spacing:.5px; margin-bottom:8px;">
          ${t('common.group')} ${g}
        </div>
        <div style="display:flex; flex-direction:column; gap:5px;">
    `;
    equipos.forEach(eq => {
      const checked = confirmadosSet.has(eq.nombre) ? 'checked' : '';
      html += `
        <label style="display:flex; align-items:center; gap:7px; cursor:pointer;
          padding:5px 8px; border-radius:6px;
          background:${confirmadosSet.has(eq.nombre) ? 'var(--gl-pale,#f0f7e8)' : '#fafdf6'};
          border:1px solid ${confirmadosSet.has(eq.nombre) ? 'var(--gl)' : '#eee'};
          transition: all .15s;">
          <input type="checkbox"
            class="tc-check"
            data-equipo="${eq.nombre}"
            ${checked}
            style="accent-color:var(--gl); width:14px; height:14px; flex-shrink:0;"
            onchange="window._adminOnTerceroConfirmado(this)">
          <span style="font-size:15px;">${eq.flag}</span>
          <span style="font-size:12px; font-weight:${confirmadosSet.has(eq.nombre) ? '700' : '400'};
            color:${confirmadosSet.has(eq.nombre) ? 'var(--gd)' : 'var(--ts)'};">
            ${eq.nombre}
          </span>
          ${confirmadosSet.has(eq.nombre)
            ? `<span style="margin-left:auto; font-size:10px; color:var(--gl); font-weight:700;">✓</span>`
            : ''}
        </label>
      `;
    });
    html += `</div></div>`;
  });

  html += `
          </div>

          <!-- Lista actual de confirmados -->
          ${nConfirmados > 0 ? `
            <div style="padding:10px 12px; background:#f7faf2; border:1px solid var(--gp);
              border-radius:var(--radius); margin-bottom:12px; font-size:12px;">
              <span style="font-weight:600; color:var(--gd);">
                ${t('admin.bracket.currentConfirmed')}:
              </span>
              ${_tercerosConfirmados.map(n => {
                const eq = EQUIPOS_48.find(e => e.nombre === n);
                return `<span style="display:inline-flex; align-items:center; gap:4px; margin:2px 4px;
                  padding:2px 8px; background:var(--gl); color:#fff; border-radius:12px; font-weight:600;">
                  ${eq?.flag || ''} ${n}
                </span>`;
              }).join('')}
            </div>` : ''}

          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="window._adminGuardarTercerosConfirmados()">
              💾 ${t('admin.bracket.saveConfirmedBtn')}
            </button>
            ${nConfirmados > 0 ? `
              <button class="btn btn-danger btn-sm" onclick="window._adminBorrarTodosConfirmados()">
                🗑️ ${t('admin.bracket.clearConfirmedBtn')}
              </button>` : ''}
            <span style="font-size:11px; color:var(--tm);">
              ${t('admin.bracket.autoRecalc')}
            </span>
          </div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════
           SECCIÓN 2: ASIGNACIÓN DE SLOTS EN EL BRACKET R32
           ═══════════════════════════════════════════════════ -->
      <div style="font-size:13px; font-weight:600; color:var(--gd); margin-bottom:6px;">
        📋 ${t('admin.bracket.slotsTitle')}
      </div>
      <div style="font-size:12px; color:var(--tm); margin-bottom:14px;">
        ${t('admin.bracket.slotsSub')}
      </div>

      ${pendientes > 0 ? `
        <div class="notice warn" style="margin-bottom:14px;">
          ⚠️ <strong>${pendientes} partido${pendientes > 1 ? 's' : ''} pendiente${pendientes > 1 ? 's' : ''}</strong> de asignar tercero
        </div>` : `
        <div class="notice" style="margin-bottom:14px; background:var(--gl-pale,#f0f7e8); border-color:var(--gl);">
          ✅ Todos los terceros asignados
        </div>`}

      <div class="card">
        <div class="card-body" style="display:flex; flex-direction:column; gap:14px;">
  `;

  partidosConTercero.forEach(p => {
    const actual        = _bracket[p.id];
    const equipoActual  = actual?.equipoVisitante || '';
    const flagActual    = actual?.flagVisitante   || '';
    const pendiente     = !equipoActual;

    const opciones = p.grupos.map(g => {
      const tercero = tercerosDisponibles[g];
      if (!tercero.nombre) return null;
      const selected = equipoActual === tercero.nombre ? 'selected' : '';
      const disabled = !tercero.completo ? 'disabled' : '';
      const label    = tercero.completo
        ? `${tercero.flag} ${tercero.nombre} (3º Grupo ${g})`
        : `⏳ Grupo ${g} incompleto`;
      return `<option value="${tercero.nombre}|${tercero.flag}|${g}" ${selected} ${disabled}>${label}</option>`;
    }).filter(Boolean);

    html += `
      <div style="padding:12px; border:1px solid ${pendiente ? 'var(--gold,#e6a817)' : 'var(--gp,#dde8cc)'};
        border-radius:var(--radius); background:${pendiente ? 'var(--gold-pale,#fffbf0)' : '#fff'};">
        <div style="font-size:11px; font-weight:700; color:var(--tm); margin-bottom:8px; text-transform:uppercase; letter-spacing:.5px;">
          ${p.id.replace('r32_', 'Partido ')} · ${pendiente ? '⚠️ Pendiente' : '✅ Asignado'}
        </div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="font-size:13px; font-weight:600; color:var(--gd); min-width:120px;">
            ${actual?.equipoLocal
              ? `${actual.flagLocal || ''} ${actual.equipoLocal}`
              : `<span style="color:var(--tm);">${p.local}</span>`}
          </div>
          <span style="color:var(--tm); font-size:12px;">vs</span>
          <div style="flex:1; min-width:180px;">
            <select id="sel_${p.id}" class="form-input form-select" style="font-size:12px; padding:6px 8px;">
              <option value="">— ${p.desc} —</option>
              ${opciones.join('')}
            </select>
            ${equipoActual ? `
              <div style="font-size:11px; color:var(--gl); margin-top:4px;">
                Actual: ${flagActual} ${equipoActual}
              </div>` : ''}
          </div>
        </div>
      </div>
    `;
  });

  html += `
        </div>
      </div>

      <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="window._adminGuardarTerceros()">
          💾 Guardar terceros
        </button>
        <button class="btn btn-secondary" onclick="window._adminRecargarBracket()">
          🔄 Recargar bracket
        </button>
      </div>
    </div>`;

  return html;
}

function calcularTablaGrupoAdmin(grupo) {
  const partidos = getPartidosPorGrupo(grupo);
  const equiposMap = {};

  partidos.forEach(p => {
    if (!equiposMap[p.local])     equiposMap[p.local]     = { nombre: p.local,     flag: p.flagLocal,     pts: 0, gf: 0, gc: 0 };
    if (!equiposMap[p.visitante]) equiposMap[p.visitante] = { nombre: p.visitante, flag: p.flagVisitante, pts: 0, gf: 0, gc: 0 };
  });

  partidos.forEach(p => {
    const res = _resultadosGrupos[p.id];
    if (!res?.confirmado) return;
    const gl = res.goles_local;
    const gv = res.goles_visitante;
    equiposMap[p.local].gf     += gl;
    equiposMap[p.local].gc     += gv;
    equiposMap[p.visitante].gf += gv;
    equiposMap[p.visitante].gc += gl;
    if (gl > gv)       equiposMap[p.local].pts     += 3;
    else if (gl === gv){ equiposMap[p.local].pts    += 1; equiposMap[p.visitante].pts += 1; }
    else               equiposMap[p.visitante].pts  += 3;
  });

  return Object.values(equiposMap).sort((a, b) => {
    const ptsDiff = b.pts - a.pts;
    if (ptsDiff !== 0) return ptsDiff;
    const gdDiff  = (b.gf - b.gc) - (a.gf - a.gc);
    if (gdDiff !== 0) return gdDiff;
    const gfDiff  = b.gf - a.gf;
    if (gfDiff !== 0) return gfDiff;
    return a.nombre.localeCompare(b.nombre);
  });
}

// ══════════════════════════════════════════════════════════════
//  MODAL AÑADIR / EDITAR JUGADOR
// ══════════════════════════════════════════════════════════════

function modalJugador(uid = null) {
  const u = uid ? _usuarios.find(u => u.uid === uid) : null;

  const bodyHtml = `
    <div class="form-field">
      <label class="form-label">${t('admin.players.newName')} *</label>
      <input class="form-input" type="text" id="mNombre"
        value="${u?.nombre_visible || ''}" placeholder="Nombre visible único">
      <div class="form-hint">${t('admin.players.nameTaken')}</div>
      <div class="form-error hidden" id="mNombreError"></div>
    </div>
    <div class="form-field">
      <label class="form-label">${t('admin.players.newUser')} *</label>
      <input class="form-input" type="text" id="mUser"
        value="${u?.username || ''}" placeholder="nombre_usuario"
        ${u ? 'disabled' : ''}>
      <div class="form-error hidden" id="mUserError"></div>
    </div>
    ${!u ? `
    <div class="form-field">
      <label class="form-label">${t('admin.players.newPass')} *</label>
      <input class="form-input" type="password" id="mPass" placeholder="Mínimo 6 caracteres">
    </div>
    <div class="form-field">
      <label class="form-label">Email *</label>
      <input class="form-input" type="email" id="mEmail" placeholder="email@ejemplo.com">
    </div>` : ''}
    <div class="form-field">
      <label class="form-label">${t('admin.players.newLang')}</label>
      <select class="form-input form-select" id="mIdioma">
        <option value="es" ${(!u || u.idioma === 'es') ? 'selected' : ''}>Español</option>
        <option value="en" ${u?.idioma === 'en' ? 'selected' : ''}>English</option>
      </select>
    </div>`;

  const footerHtml = `
    <button class="btn btn-secondary" onclick="window.appCerrarModal()">
      ${t('common.cancel')}
    </button>
    <button class="btn btn-primary" onclick="window._adminGuardarJugador('${uid || ''}')">
      💾 ${t('common.save')}
    </button>`;

  window.appAbrirModal(
    uid ? t('admin.players.editBtn') : t('admin.players.addBtn'),
    bodyHtml,
    footerHtml
  );
}

// ══════════════════════════════════════════════════════════════
//  INTEGRIDAD
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
//  LIMPIAR PREDICCIONES DE ELIMINATORIAS
// ══════════════════════════════════════════════════════════════

function renderLimpiarElim() {
  return `
    <div>
      <div style="font-size:14px; font-weight:600; color:var(--gd); margin-bottom:4px;">
        🗑️ Limpiar predicciones de eliminatorias
      </div>
      <div style="font-size:12px; color:var(--tm); margin-bottom:16px;">
        Borra las predicciones de eliminatorias de <strong>todos los jugadores</strong> a la vez.
        Útil cuando se ha corregido el bracket y los jugadores necesitan rehacerlo desde cero.
      </div>

      <div class="card" style="margin-bottom:16px; border-left:3px solid var(--r);">
        <div class="card-body">
          <div style="font-size:12px; color:var(--r); font-weight:600; margin-bottom:6px;">
            ⚠️ Acción irreversible
          </div>
          <div style="font-size:12px; color:var(--tm); margin-bottom:12px;">
            Esta acción elimina permanentemente todas las predicciones de eliminatorias
            de la base de datos. Los jugadores deberán rellenarlas de nuevo.
            Las predicciones de grupos, especiales y mejores terceros <strong>no se ven afectadas</strong>.
          </div>
          <button class="btn btn-sm" id="btnContarElim"
            style="background:var(--gm); color:#fff; margin-bottom:0;"
            onclick="window._adminContarElim()">
            🔍 Comprobar cuántas predicciones hay
          </button>
        </div>
      </div>

      <div id="limpiarElimResultado"></div>
    </div>`;
}

function renderLimpiarElimResultado(count) {
  if (count === 0) {
    return `<div class="notice" style="background:var(--succ); color:var(--succt);">
      ✅ No hay predicciones de eliminatorias guardadas. La colección está vacía.
    </div>`;
  }
  return `
    <div class="card" style="border-left:3px solid var(--r);">
      <div class="card-body">
        <div style="font-size:13px; font-weight:600; color:var(--t); margin-bottom:8px;">
          Se encontraron <strong>${count}</strong> predicción${count !== 1 ? 'es' : ''} de eliminatorias.
        </div>
        <div style="font-size:12px; color:var(--tm); margin-bottom:14px;">
          ¿Seguro que quieres borrarlas todas? Esta acción no se puede deshacer.
          Los jugadores recibirán el bracket en blanco la próxima vez que entren.
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm"
            onclick="document.getElementById('limpiarElimResultado').innerHTML=''">
            Cancelar
          </button>
          <button class="btn btn-sm" id="btnBorrarElim"
            style="background:var(--r); color:#fff;"
            onclick="window._adminBorrarElim(${count})">
            🗑️ Sí, borrar las ${count} predicciones
          </button>
        </div>
      </div>
    </div>`;
}

function renderIntegridad() {
  return `
    <div>
      <div style="font-size:14px; font-weight:600; color:var(--gd); margin-bottom:4px;">
        🔍 ${t('admin.integrity.title')}
      </div>
      <div style="font-size:12px; color:var(--tm); margin-bottom:14px;">
        ${t('admin.integrity.subtitle')}
      </div>

      <button class="btn btn-primary btn-sm" id="btnCheckIntegridad"
        onclick="window._adminVerificarIntegridad()">
        🔍 ${t('admin.integrity.checkBtn')}
      </button>

      <div id="integridadResultado" style="margin-top:16px;">
        ${_integridad ? renderResultadoIntegridad() : ''}
      </div>
    </div>`;
}

function renderResultadoIntegridad() {
  const { filas, generadoEn, elimSinDatos, especialesSinDatos } = _integridad;
  const conProblema = filas.filter(f => f.estado !== 'ok');

  const resumenHtml = conProblema.length === 0
    ? `<div class="notice" style="margin-bottom:8px;">${t('admin.integrity.allOk')}</div>`
    : `<div class="notice error" style="margin-bottom:8px;">
         ${t('admin.integrity.foundIssues').replace('{n}', conProblema.length)}
       </div>`;

  const avisoIncompleto = (elimSinDatos || especialesSinDatos)
    ? `<div class="notice" style="margin-bottom:12px; background:#fff8e6; border-color:#f0d27a; color:#7a5d10;">
         ℹ️ ${t('admin.integrity.partialAudit')}
         ${elimSinDatos ? `<br>• ${t('admin.integrity.noElimData')}` : ''}
         ${especialesSinDatos ? `<br>• ${t('admin.integrity.noSpecialsData')}` : ''}
       </div>`
    : '';

  return `
    ${resumenHtml}
    ${avisoIncompleto}
    <div style="font-size:11px; color:var(--tm); margin-bottom:8px;">
      ${t('admin.integrity.lastCheck')}: ${generadoEn.toLocaleString()}
    </div>
    <div class="card">
      <div class="card-body" style="padding:0; overflow-x:auto;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>${t('admin.integrity.player')}</th>
              <th>${t('admin.integrity.calculated')}</th>
              <th>${t('admin.integrity.stored')}</th>
              <th>${t('admin.integrity.recalculated')}</th>
              <th>${t('admin.integrity.diff')}</th>
              <th>${t('admin.integrity.status')}</th>
              <th>${t('admin.integrity.detail')}</th>
            </tr>
          </thead>
          <tbody>
            ${filas.map(f => `
              <tr>
                <td><span class="player-name">${f.nombre}</span></td>
                <td>${f.suma}</td>
                <td>${f.total === null ? '—' : f.total}</td>
                <td>${f.recalculado}</td>
                <td>${f.suma - f.recalculado}</td>
                <td>
                  ${f.estado === 'ok'
                    ? `<span class="admin-sidebar-badge" style="background:var(--gl); color:#fff;">✓ ${t('admin.integrity.ok')}</span>`
                    : f.estado === 'missing'
                      ? `<span class="admin-sidebar-badge red">${t('admin.integrity.missing')}</span>`
                      : `<span class="admin-sidebar-badge red">⚠️ ${t('admin.integrity.mismatch')}</span>`}
                </td>
                <td style="font-size:11px; color:var(--r); max-width:260px;">
                  ${f.detalleDiscrepancias.length
                    ? f.detalleDiscrepancias.map(d => `${d.partido}: ${d.guardado}→${d.recalculado}`).join(', ')
                    : '—'}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  MIMIMI
// ══════════════════════════════════════════════════════════════

function renderMimimi() {
  return `
    <div>
      <div style="font-family:'Bebas Neue',sans-serif; font-size:22px; color:var(--gd); letter-spacing:1px; margin-bottom:4px;">
        😭 Mimimi
      </div>
      <div style="font-size:12px; color:var(--tm); margin-bottom:16px;">
        Marca a los jugadores que se quejan de cómo está montada la porra. Su nombre aparecerá acompañado del correspondiente aviso en la clasificación.
      </div>

      <div class="card">
        <div class="card-body" style="display:flex; flex-direction:column; gap:10px;">
          ${_usuarios.map(u => {
            const mimimi = u.mimimi || false;
            return `
              <label style="display:flex; align-items:center; gap:12px; cursor:pointer;
                padding:10px 12px; border-radius:var(--radius);
                border:1px solid ${mimimi ? 'var(--r)' : 'var(--gp)'};
                background:${mimimi ? 'var(--rp,#fdf2f0)' : '#fff'};
                transition: all .15s;">
                <input type="checkbox" ${mimimi ? 'checked' : ''}
                  onchange="window._adminToggleMimimi('${u.uid}', this.checked)"
                  style="accent-color:var(--r); width:18px; height:18px; flex-shrink:0;">
                <span style="font-size:13px; font-weight:600; color:var(--gd); flex:1;">
                  ${u.nombre_visible}
                </span>
                ${mimimi ? `<span style="font-size:11px; color:var(--r); font-style:italic;">
                  Mimimimi yo quiero la porra así
                </span>` : ''}
              </label>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

function recalcularPuntosGrupoJugador(uid, prediccionesPorPartido, resultadosGrupo) {
  const detalle = {};
  Object.entries(resultadosGrupo).forEach(([partidoId, res]) => {
    if (!res?.confirmado) return;
    const pred = prediccionesPorPartido[`${uid}_${partidoId}`];
    detalle[partidoId] = pred
      ? calcularPuntosPartido(pred, res.goles_local, res.goles_visitante)
      : 0;
  });
  return detalle;
}

function recalcularPuntosElimJugador(uid, prediccionesElimPorPartido, resultadosElim) {
  const detalle = {};
  Object.entries(resultadosElim).forEach(([partidoId, res]) => {
    if (!res?.confirmado) return;
    const pred = prediccionesElimPorPartido[`${uid}_${partidoId}`];
    detalle[partidoId] = pred
      ? calcularPuntosPartidoElim(pred, res)
      : 0;
  });
  return detalle;
}

async function verificarIntegridadPuntos() {
  const puntosSnap = await getDocs(collection(db, 'puntos'));
  const sumas = {};
  const puntosGuardadosPorPartido = {};
  puntosSnap.forEach(d => {
    const { uid, puntos, partido_id } = d.data();
    if (!uid) return;
    sumas[uid] = (sumas[uid] || 0) + (puntos || 0);
    if (!puntosGuardadosPorPartido[uid]) puntosGuardadosPorPartido[uid] = {};
    puntosGuardadosPorPartido[uid][partido_id] = puntos || 0;
  });

  const clasifSnap = await getDocs(collection(db, 'clasificacion'));
  const totales = {};
  clasifSnap.forEach(d => {
    const { uid, total } = d.data();
    if (!uid) return;
    totales[uid] = total ?? 0;
  });

  const resultadosGruposSnap = await getDocs(collection(db, 'resultados'));
  const resultadosGrupo = {};
  resultadosGruposSnap.forEach(d => { resultadosGrupo[d.id] = d.data(); });

  const prediccionesSnap = await getDocs(collection(db, 'predicciones'));
  const prediccionesPorPartido = {};
  prediccionesSnap.forEach(d => {
    const data = d.data();
    if (!data.uid || !data.partido_id) return;
    prediccionesPorPartido[`${data.uid}_${data.partido_id}`] = data;
  });

  const resultadosElimSnap = await getDocs(collection(db, 'resultados_elim'));
  const resultadosElim = {};
  resultadosElimSnap.forEach(d => { resultadosElim[d.id] = d.data(); });

  const prediccionesElimSnap = await getDocs(collection(db, 'predicciones_elim'));
  const prediccionesElimPorPartido = {};
  prediccionesElimSnap.forEach(d => {
    const data = d.data();
    if (!data.uid || !data.partido_id) return;
    prediccionesElimPorPartido[`${data.uid}_${data.partido_id}`] = data;
  });

  const elimSinDatos = Object.values(resultadosElim).every(r => !r?.confirmado);

  const mvpOfi = _config.mvp_oficial      || '';
  const golOfi = _config.goleador_oficial || '';

  const finalRes = resultadosElim['final_1'];
  const finalConfirmada = !!finalRes?.confirmado;
  let campeonReal = '', subcampeonReal = '';
  if (finalConfirmada) {
    campeonReal = finalRes.equipo_que_pasa || '';
    subcampeonReal = campeonReal === finalRes.equipo_local
      ? (finalRes.equipo_visitante || '')
      : (finalRes.equipo_local || '');
  }
  const especialesSinDatos = !mvpOfi && !golOfi && !finalConfirmada;

  const norm = str =>
    (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const especialesSnap = await getDocs(collection(db, 'pred_especiales'));
  const especialesPorUid = {};
  especialesSnap.forEach(d => { especialesPorUid[d.id] = d.data(); });

  const todosUids = new Set([
    ...Object.keys(sumas),
    ...Object.keys(totales),
    ..._usuarios.map(u => u.uid)
  ]);

  const filas = [...todosUids].map(uid => {
    const usuario = _usuarios.find(u => u.uid === uid);
    const nombre = usuario?.nombre_visible || uid;
    const suma = sumas[uid] ?? 0;
    const total = Object.prototype.hasOwnProperty.call(totales, uid) ? totales[uid] : null;

    const detalleGrupo = recalcularPuntosGrupoJugador(uid, prediccionesPorPartido, resultadosGrupo);
    const detalleElim   = recalcularPuntosElimJugador(uid, prediccionesElimPorPartido, resultadosElim);

    let puntosEspeciales = {};
    const esp = especialesPorUid[uid];
    if (esp) {
      const predMvp = norm(esp.mvp_corregido || esp.mvp || '');
      const predGol = norm(esp.goleador_corregido || esp.goleador || '');
      const predCampeon = norm(esp.campeon_corregido || esp.campeon || '');
      const predSubcampeon = norm(esp.subcampeon_corregido || esp.subcampeon || '');

      if (mvpOfi) puntosEspeciales['especial_mvp'] = (predMvp && norm(mvpOfi) === predMvp) ? 3 : 0;
      if (golOfi) puntosEspeciales['especial_goleador'] = (predGol && norm(golOfi) === predGol) ? 3 : 0;
      if (finalConfirmada) {
        puntosEspeciales['especial_campeon'] = (predCampeon && norm(campeonReal) === predCampeon) ? 6 : 0;
        puntosEspeciales['especial_subcampeon'] = (predSubcampeon && norm(subcampeonReal) === predSubcampeon) ? 2 : 0;
      }
    }

    const detalleCompleto = { ...detalleGrupo, ...detalleElim, ...puntosEspeciales };
    const recalculado = Object.values(detalleCompleto).reduce((a, b) => a + b, 0);

    const guardadoPorPartido = puntosGuardadosPorPartido[uid] || {};
    const detalleDiscrepancias = Object.entries(detalleCompleto)
      .filter(([partidoId, valorRecalc]) => (guardadoPorPartido[partidoId] ?? 0) !== valorRecalc)
      .map(([partido, valorRecalc]) => ({
        partido,
        guardado: guardadoPorPartido[partido] ?? 0,
        recalculado: valorRecalc
      }));

    let estado = 'ok';
    if (total === null) estado = 'missing';
    else if (suma !== total || detalleDiscrepancias.length > 0) estado = 'mismatch';

    return { uid, nombre, suma, total, recalculado, detalleDiscrepancias, estado };
  });

  filas.sort((a, b) => {
    if (a.estado !== 'ok' && b.estado === 'ok') return -1;
    if (a.estado === 'ok' && b.estado !== 'ok') return 1;
    return a.nombre.localeCompare(b.nombre);
  });

  return { filas, generadoEn: new Date(), elimSinDatos, especialesSinDatos };
}

// ══════════════════════════════════════════════════════════════
//  HANDLERS
// ══════════════════════════════════════════════════════════════

function registrarHandlers() {

  window._adminVerificarIntegridad = async () => {
    const btn  = document.getElementById('btnCheckIntegridad');
    const cont = document.getElementById('integridadResultado');
    if (btn) { btn.disabled = true; btn.innerHTML = `🔄 ${t('admin.integrity.checking')}`; }
    try {
      _integridad = await verificarIntegridadPuntos();
      if (cont) cont.innerHTML = renderResultadoIntegridad();
    } catch (e) {
      console.error('[verificarIntegridad]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = `🔍 ${t('admin.integrity.checkBtn')}`; }
    }
  };

  window._adminPagJug = (pag) => {
    _paginaJug = pag;
    document.getElementById('adminSeccion').innerHTML = renderSeccion();
    registrarHandlers();
  };

  window._adminAnadirJugador  = () => modalJugador();
  window._adminEditarJugador  = (uid) => modalJugador(uid);

  window._adminGuardarJugador = async (uid) => {
    const nombre = document.getElementById('mNombre')?.value?.trim();
    const idioma = document.getElementById('mIdioma')?.value || 'es';

    if (!nombre) { mostrarErrorModal('mNombreError', 'El nombre es obligatorio'); return; }

    try {
      if (uid) {
        const dispNombre = await verificarNombreDisponible(nombre, uid);
        if (!dispNombre) { mostrarErrorModal('mNombreError', t('admin.players.nameTaken')); return; }
        await updateDoc(doc(db, 'usuarios', uid), {
          nombre_visible:       nombre,
          nombre_visible_lower: nombre.toLowerCase(),
          idioma
        });
        window.mostrarToast('✅ Jugador actualizado');
      } else {
        const email    = document.getElementById('mEmail')?.value?.trim();
        const password = document.getElementById('mPass')?.value;
        const username = document.getElementById('mUser')?.value?.trim().toLowerCase();
        if (!email || !password || !username) { window.mostrarToast('⚠️ Rellena todos los campos', 4000); return; }
        await crearUsuario({ email, password, nombre_visible: nombre, username, idioma });
        window.mostrarToast('✅ Jugador creado');
      }
      window.appCerrarModal();
      await cargarUsuarios();
      document.getElementById('adminSeccion').innerHTML = renderSeccion();
      registrarHandlers();
    } catch (e) {
      if (e.message === 'nombre_taken')    mostrarErrorModal('mNombreError', t('admin.players.nameTaken'));
      else if (e.message === 'username_taken') mostrarErrorModal('mUserError', t('admin.players.userTaken'));
      else { window.mostrarToast('❌ ' + t('common.error'), 5000); console.error('[guardarJugador]', e); }
    }
  };

  window._adminEliminarJugador = (uid, nombre) => {
    window.appAbrirModal(
      t('admin.players.deleteBtn'),
      `<p style="font-size:13px;">¿Seguro que quieres eliminar a <strong>${nombre}</strong>? Esta acción no se puede deshacer.</p>`,
      `<button class="btn btn-secondary" onclick="window.appCerrarModal()">${t('common.cancel')}</button>
       <button class="btn btn-danger" onclick="window._adminConfirmarEliminar('${uid}')">🗑️ ${t('admin.players.deleteBtn')}</button>`
    );
  };

  window._adminConfirmarEliminar = async (uid) => {
    try {
      await eliminarUsuarioFirestore(uid);
      window.appCerrarModal();
      await cargarUsuarios();
      document.getElementById('adminSeccion').innerHTML = renderSeccion();
      registrarHandlers();
      window.mostrarToast('✅ Jugador eliminado');
    } catch (e) {
      console.error('[eliminarJugador]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  window._adminTogglePago = async (uid, pagado) => {
    try {
      await marcarPago(uid, pagado);
      const u = _usuarios.find(u => u.uid === uid);
      if (u) u.pagado = pagado;
      window.mostrarToast(pagado ? '✅ Pago registrado' : '✅ Pago eliminado');
    } catch (e) {
      console.error('[togglePago]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  window._adminTogglePorraLlena = () => {
    const toggle = document.getElementById('togglePorraLlena');
    if (!toggle) return;
    const nuevoEstado = !toggle.classList.contains('on');
    toggle.classList.toggle('on', nuevoEstado);
    toggle.classList.toggle('off', !nuevoEstado);
    _config.porra_llena = nuevoEstado;
  };

  window._adminGuardarPagos = async () => {
    try {
      const revolut    = document.getElementById('inputRevolut')?.value?.trim();
      const vipps      = document.getElementById('inputVipps')?.value?.trim();
      const porraLlena = _config.porra_llena || false;
      await setDoc(doc(db, 'config', 'general'), { enlace_revolut: revolut, enlace_vipps: vipps, porra_llena: porraLlena }, { merge: true });
      _config.enlace_revolut = revolut;
      _config.enlace_vipps   = vipps;
      window.mostrarToast('✅ Configuración de pagos guardada');
    } catch (e) {
      console.error('[guardarPagos]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  window._adminGuardarBote = async () => {
    try {
      const bote = parseInt(document.getElementById('inputBote')?.value || '0');
      await setDoc(doc(db, 'config', 'general'), { bote_total: bote }, { merge: true });
      _config.bote_total = bote;
      window.mostrarToast('✅ Bote guardado: ' + bote.toLocaleString() + ' NOK');
      document.getElementById('adminSeccion').innerHTML = renderSeccion();
      registrarHandlers();
    } catch (e) {
      console.error('[guardarBote]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  // ── Guardar fechas límite — con modal de confirmación ────────
  window._adminGuardarFechas = () => {
    const fg = document.getElementById('inputFechaGrupos')?.value;
    const fe = document.getElementById('inputFechaElim')?.value;
    const ft = document.getElementById('inputFechaTerceros')?.value;

    if (!fg || !fe || !ft) {
      window.mostrarToast('⚠️ Introduce todas las fechas', 4000);
      return;
    }

    const fmt = (v) => new Date(v).toLocaleString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    window.appAbrirModal(
      `📅 ${t('admin.dates.confirmTitle')}`,
      `<p style="font-size:13px; color:var(--ts); margin-bottom:14px;">${t('admin.dates.confirmBody')}</p>
       <div style="display:flex; flex-direction:column; gap:8px; font-size:13px;">
         <div style="display:flex; justify-content:space-between; padding:8px 10px;
           background:var(--bg2,#f7faf2); border-radius:var(--radius); border:1px solid var(--gp,#dde8cc);">
           <span style="color:var(--tm);">⚽ ${t('admin.dates.confirmGroups')}</span>
           <strong>${fmt(fg)}</strong>
         </div>
         <div style="display:flex; justify-content:space-between; padding:8px 10px;
           background:var(--bg2,#f7faf2); border-radius:var(--radius); border:1px solid var(--gp,#dde8cc);">
           <span style="color:var(--tm);">⚔️ ${t('admin.dates.confirmKO')}</span>
           <strong>${fmt(fe)}</strong>
         </div>
         <div style="display:flex; justify-content:space-between; padding:8px 10px;
           background:var(--bg2,#f7faf2); border-radius:var(--radius); border:1px solid var(--gp,#dde8cc);">
           <span style="color:var(--tm);">🥉 ${t('admin.dates.confirmThird')}</span>
           <strong>${fmt(ft)}</strong>
         </div>
       </div>`,
      `<button class="btn btn-secondary" onclick="window.appCerrarModal()">${t('common.cancel')}</button>
       <button class="btn btn-primary" onclick="window._adminConfirmarFechas('${fg}','${fe}','${ft}')">
         💾 ${t('admin.dates.confirmBtn')}
       </button>`
    );
  };

  window._adminConfirmarFechas = async (fg, fe, ft) => {
    try {
      window.appCerrarModal();
      await setDoc(doc(db, 'config', 'general'), {
        fecha_limite_grupos:        new Date(fg).toISOString(),
        fecha_limite_eliminatorias: new Date(fe).toISOString(),
        fecha_limite_terceros:      new Date(ft).toISOString()
      }, { merge: true });

      _config.fecha_limite_grupos        = new Date(fg).toISOString();
      _config.fecha_limite_eliminatorias = new Date(fe).toISOString();
      _config.fecha_limite_terceros      = new Date(ft).toISOString();

      window.mostrarToast('✅ ' + t('admin.dates.saveBtn'));
      document.getElementById('adminSeccion').innerHTML = renderSeccion();
      registrarHandlers();
    } catch (e) {
      console.error('[confirmarFechas]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  window._adminGuardarInfo = async () => {
    try {
      const es = document.getElementById('inputInfoES')?.value || '';
      const en = document.getElementById('inputInfoEN')?.value || '';
      await setDoc(doc(db, 'config', 'info_content'), { mensaje_es: es, mensaje_en: en }, { merge: true });
      window.mostrarToast('✅ ' + t('admin.infoPage.saveBtn'));
    } catch (e) {
      console.error('[guardarInfo]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  window._adminGuardarEsp = async (uid) => {
    try {
      const mvpCorr = document.getElementById(`mvp_${uid}`)?.value?.trim() || '';
      const golCorr = document.getElementById(`gol_${uid}`)?.value?.trim() || '';
      await updateDoc(doc(db, 'pred_especiales', uid), { mvp_corregido: mvpCorr, goleador_corregido: golCorr });
      const idx = _especiales.findIndex(e => e.uid === uid);
      if (idx !== -1) { _especiales[idx].mvp_corregido = mvpCorr; _especiales[idx].goleador_corregido = golCorr; }
      window.mostrarToast('✅ Corrección guardada');
    } catch (e) {
      console.error('[guardarEsp]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  window._adminGuardarOficial = async () => {
    try {
      const mvpOfi = document.getElementById('mvpOficial')?.value?.trim() || '';
      const golOfi = document.getElementById('golOficial')?.value?.trim() || '';
      await setDoc(doc(db, 'config', 'general'), { mvp_oficial: mvpOfi, goleador_oficial: golOfi }, { merge: true });
      _config.mvp_oficial      = mvpOfi;
      _config.goleador_oficial = golOfi;
      window.mostrarToast('✅ Resultado oficial guardado');
      document.getElementById('adminSeccion').innerHTML = renderSeccion();
      registrarHandlers();
    } catch (e) {
      console.error('[guardarOficial]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  window._adminRecalcularEspeciales = async () => {
    try {
      const mvpOfi = _config.mvp_oficial      || '';
      const golOfi = _config.goleador_oficial || '';
      if (!mvpOfi && !golOfi) { window.mostrarToast('⚠️ Primero guarda el MVP oficial y/o el goleador oficial', 4000); return; }

      window.mostrarToast('🔄 Calculando puntos especiales...');
      const norm = str => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const snap  = await getDocs(collection(db, 'pred_especiales'));
      const batch = [];

      snap.forEach(d => {
        const uid  = d.id;
        const data = d.data();
        const predMvp = norm(data.mvp_corregido || data.mvp || '');
        const predGol = norm(data.goleador_corregido || data.goleador || '');
        const ptosMvp = (mvpOfi && predMvp && norm(mvpOfi) === predMvp) ? 3 : 0;
        const ptosGol = (golOfi && predGol && norm(golOfi) === predGol) ? 3 : 0;

        if (mvpOfi) batch.push(setDoc(doc(db, 'puntos', `${uid}_especial_mvp`), { uid, partido_id: 'especial_mvp', puntos: ptosMvp, tipo: 'especial', timestamp: serverTimestamp() }, { merge: true }));
        if (golOfi) batch.push(setDoc(doc(db, 'puntos', `${uid}_especial_goleador`), { uid, partido_id: 'especial_goleador', puntos: ptosGol, tipo: 'especial', timestamp: serverTimestamp() }, { merge: true }));
      });

      await Promise.all(batch);
      const puntosSnap = await getDocs(collection(db, 'puntos'));
      const totales    = {};
      puntosSnap.forEach(d => { const { uid, puntos } = d.data(); if (!uid) return; totales[uid] = (totales[uid] || 0) + (puntos || 0); });
      await Promise.all(Object.entries(totales).map(([uid, total]) => setDoc(doc(db, 'clasificacion', uid), { uid, total, actualizado: serverTimestamp() }, { merge: true })));

      window.mostrarToast('✅ Puntos especiales recalculados correctamente');
    } catch (e) {
      console.error('[recalcularEspeciales]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  window._adminVerPredicciones = async (uid, nombre) => {
    window.appAbrirModal(
      `👁️ Predicciones de ${nombre}`,
      `<div class="loading-inline"><div class="spinner-sm"></div><span>Cargando...</span></div>`,
      ''
    );
    try {
      const [gruposSnap, elimSnap, espSnap, tercerosSnap] = await Promise.all([
        getDocs(query(collection(db, 'predicciones'),     where('uid', '==', uid))),
        getDocs(query(collection(db, 'predicciones_elim'),where('uid', '==', uid))),
        getDoc(doc(db, 'pred_especiales', uid)),
        getDoc(doc(db, 'pred_terceros',   uid))
      ]);

      // Grupos: excluir el doc de desempates del conteo
      let nGrupos = 0;
      gruposSnap.forEach(d => { if (d.data().partido_id !== 'desempates') nGrupos++; });

      const nElim     = elimSnap.size;
      const esp       = espSnap.exists()      ? espSnap.data()      : {};
      const tercData  = tercerosSnap.exists() ? tercerosSnap.data() : {};
      const equiposTerceros = tercData.equipos || [];
      const nTerceros = equiposTerceros.length;

      const colorGrupos   = nGrupos >= 72 ? 'var(--gl)' : nGrupos > 0  ? 'var(--gold)' : 'var(--r)';
      const colorElim     = nElim   >= 32 ? 'var(--gl)' : nElim   > 0  ? 'var(--gold)' : 'var(--tm)';
      const colorTerceros = nTerceros >= 8 ? 'var(--gl)' : nTerceros > 0 ? 'var(--gold)' : 'var(--tm)';

      const espCompleto = esp.campeon && esp.subcampeon && esp.mvp && esp.goleador;
      const espColor    = espCompleto ? 'var(--gl)' : (esp.campeon || esp.subcampeon || esp.mvp || esp.goleador) ? 'var(--gold)' : 'var(--r)';

      document.getElementById('modalBody').innerHTML = `
        <div style="font-size:13px; display:flex; flex-direction:column; gap:10px;">

          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f5e8;">
            <span style="color:var(--ts);">⚽ Predicciones de grupos</span>
            <strong style="color:${colorGrupos};">${nGrupos} / 72</strong>
          </div>

          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f5e8;">
            <span style="color:var(--ts);">⚔️ Predicciones de eliminatorias</span>
            <strong style="color:${colorElim};">${nElim} / 32</strong>
          </div>

          <div style="padding:8px 0; border-bottom:1px solid #f0f5e8;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
              <span style="color:var(--ts);">⭐ Predicciones especiales</span>
              <strong style="color:${espColor};">${espCompleto ? '✓ Completas' : (esp.campeon || esp.subcampeon || esp.mvp || esp.goleador) ? '⚡ Parciales' : '✗ Sin rellenar'}</strong>
            </div>
            <div style="font-size:12px; display:grid; grid-template-columns:1fr 1fr; gap:4px;">
              <span style="color:var(--tm);">🏆 Campeón:</span><strong>${esp.campeon    || '—'}</strong>
              <span style="color:var(--tm);">🥈 Subcampeón:</span><strong>${esp.subcampeon || '—'}</strong>
              <span style="color:var(--tm);">⭐ MVP:</span>
              <strong>${esp.mvp || '—'}${esp.mvp_corregido ? `<span style="color:var(--gl); font-size:10px;"> (corr: ${esp.mvp_corregido})</span>` : ''}</strong>
              <span style="color:var(--tm);">⚽ Goleador:</span>
              <strong>${esp.goleador || '—'}${esp.goleador_corregido ? `<span style="color:var(--gl); font-size:10px;"> (corr: ${esp.goleador_corregido})</span>` : ''}</strong>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; padding:8px 0;">
            <span style="color:var(--ts);">🥉 Mejores terceros</span>
            <strong style="color:${colorTerceros};">${nTerceros} / 8</strong>
          </div>

        </div>`;
      document.getElementById('modalFooter').innerHTML = `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cerrar</button>`;
    } catch (e) {
      document.getElementById('modalBody').innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
    }
  };

  window._adminBorrarPredJugador = (uid, nombre, tipo) => {
    const labels = { grupos: 'grupos', eliminatorias: 'eliminatorias', especiales: 'especiales' };
    window.appAbrirModal(
      `🗑️ Borrar predicciones de ${nombre}`,
      `<p style="font-size:13px;">¿Seguro que quieres borrar las predicciones de <strong>${nombre}</strong> de <strong>${labels[tipo]}</strong>? Esta acción no se puede deshacer.</p>`,
      `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cancelar</button>
       <button class="btn btn-danger" onclick="window._adminConfirmarBorradoPred('${uid}', '${nombre}', '${tipo}')">🗑️ Sí, borrar</button>`
    );
  };

  window._adminConfirmarBorradoPred = async (uid, nombre, tipo) => {
    try {
      window.appCerrarModal();
      window.mostrarToast('🗑️ Borrando...');
      const { deleteDoc: dd } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

      if (tipo === 'grupos') {
        const q = query(collection(db, 'predicciones'), where('uid', '==', uid));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(d => dd(d.ref)));
      } else if (tipo === 'eliminatorias') {
        const q = query(collection(db, 'predicciones_elim'), where('uid', '==', uid));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(d => dd(d.ref)));
      } else if (tipo === 'especiales') {
        await dd(doc(db, 'pred_especiales', uid));
      }

      window.mostrarToast(`✅ Predicciones de ${nombre} borradas`);
      await cargarUsuarios();
      document.getElementById('adminSeccion').innerHTML = renderSeccion();
      registrarHandlers();
    } catch (e) {
      console.error('[adminBorrarPred]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  // ── Limpiar predicciones de eliminatorias (todas) ────────
  window._adminContarElim = async () => {
    const btn = document.getElementById('btnContarElim');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Contando...'; }
    try {
      const snap = await getDocs(collection(db, 'predicciones_elim'));
      const count = snap.size;
      const el = document.getElementById('limpiarElimResultado');
      if (el) el.innerHTML = renderLimpiarElimResultado(count);
    } catch (e) {
      console.error('[adminContarElim]', e);
      window.mostrarToast('❌ Error al contar predicciones', 4000);
    } finally {
      const btn2 = document.getElementById('btnContarElim');
      if (btn2) { btn2.disabled = false; btn2.textContent = '🔍 Comprobar cuántas predicciones hay'; }
    }
  };

  window._adminBorrarElim = async (count) => {
    const btn = document.getElementById('btnBorrarElim');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Borrando...'; }
    try {
      const snap = await getDocs(collection(db, 'predicciones_elim'));
      if (snap.empty) {
        window.mostrarToast('ℹ️ No había predicciones que borrar');
        return;
      }
      // Borrado en lotes de 500 (límite de writeBatch)
      const CHUNK = 500;
      const docs  = snap.docs;
      for (let i = 0; i < docs.length; i += CHUNK) {
        const batch = writeBatch(db);
        docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      window.mostrarToast(`✅ ${docs.length} predicción${docs.length !== 1 ? 'es' : ''} de eliminatorias borrada${docs.length !== 1 ? 's' : ''}`);
      const el = document.getElementById('limpiarElimResultado');
      if (el) el.innerHTML = renderLimpiarElimResultado(0);
    } catch (e) {
      console.error('[adminBorrarElim]', e);
      window.mostrarToast('❌ Error al borrar predicciones', 5000);
    }
  };

  // ── Terceros confirmados por FIFA ─────────────────────────
  window._adminOnTerceroConfirmado = (checkbox) => {
    const nombre = checkbox.dataset.equipo;
    if (!nombre) return;
    if (checkbox.checked) {
      if (!_tercerosConfirmados.includes(nombre)) {
        _tercerosConfirmados = [..._tercerosConfirmados, nombre];
      }
    } else {
      _tercerosConfirmados = _tercerosConfirmados.filter(n => n !== nombre);
    }
    // Re-renderizar solo la sección para reflejar contadores y lista
    document.getElementById('adminSeccion').innerHTML = renderSeccion();
    registrarHandlers();
  };

  window._adminGuardarTercerosConfirmados = async () => {
    try {
      window.mostrarToast('💾 Guardando...');
      await setDoc(doc(db, 'config', 'general'), {
        terceros_confirmados: _tercerosConfirmados
      }, { merge: true });
      _config.terceros_confirmados = _tercerosConfirmados;

      // Recalcular puntos automáticamente
      window.mostrarToast('🔄 Recalculando puntos de terceros...');
      await recalcularPuntosTerceros();

      const n = _tercerosConfirmados.length;
      window.mostrarToast(`✅ ${n} tercero${n !== 1 ? 's' : ''} confirmado${n !== 1 ? 's' : ''} · Puntos actualizados`);
      document.getElementById('adminSeccion').innerHTML = renderSeccion();
      registrarHandlers();
    } catch (e) {
      console.error('[guardarTercerosConfirmados]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  window._adminBorrarTodosConfirmados = () => {
    window.appAbrirModal(
      `🗑️ ${t('admin.bracket.clearConfirmedBtn')}`,
      `<p style="font-size:13px;">${t('admin.bracket.clearConfirmedConfirm')}</p>`,
      `<button class="btn btn-secondary" onclick="window.appCerrarModal()">${t('common.cancel')}</button>
       <button class="btn btn-danger" onclick="window._adminConfirmarBorrarConfirmados()">
         🗑️ ${t('common.confirm')}
       </button>`
    );
  };

  window._adminConfirmarBorrarConfirmados = async () => {
    try {
      window.appCerrarModal();
      _tercerosConfirmados = [];
      await setDoc(doc(db, 'config', 'general'), { terceros_confirmados: [] }, { merge: true });
      _config.terceros_confirmados = [];
      await recalcularPuntosTerceros();
      window.mostrarToast('✅ Terceros confirmados borrados · Puntos actualizados');
      document.getElementById('adminSeccion').innerHTML = renderSeccion();
      registrarHandlers();
    } catch (e) {
      console.error('[borrarConfirmados]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  // ── Guardar terceros del bracket y recalcular puntos ──────
  window._adminGuardarTerceros = async () => {
    try {
      window.mostrarToast('💾 Guardando terceros...');

      const IDS_TERCEROS = ['r32_2','r32_5','r32_7','r32_8','r32_9','r32_10','r32_13','r32_15'];
      const updates = {};
      let cambios = 0;

      IDS_TERCEROS.forEach(id => {
        const sel = document.getElementById(`sel_${id}`);
        if (!sel || !sel.value) return;

        const [nombre, flag] = sel.value.split('|');
        if (!nombre) return;

        updates[`${id}.equipoVisitante`]  = nombre;
        updates[`${id}.flagVisitante`]    = flag || '';
        updates[`${id}.terceroPendiente`] = false;
        updates[`${id}.confirmado`]       = true;

        if (!_bracket[id]) _bracket[id] = {};
        _bracket[id].equipoVisitante  = nombre;
        _bracket[id].flagVisitante    = flag || '';
        _bracket[id].terceroPendiente = false;
        _bracket[id].confirmado       = true;
        cambios++;
      });

      if (cambios === 0) {
        window.mostrarToast('⚠️ No hay cambios que guardar', 3000);
        return;
      }

      await setDoc(doc(db, 'config', 'bracket_eliminatorias'), updates, { merge: true });

      // Si los 8 terceros están asignados, recalcular puntos de terceros
      const todosAsignados = IDS_TERCEROS.every(id => _bracket[id]?.equipoVisitante);
      if (todosAsignados) {
        window.mostrarToast('🔄 Calculando puntos de terceros...');
        await recalcularPuntosTerceros();
        window.mostrarToast(`✅ ${cambios} tercero${cambios > 1 ? 's' : ''} guardado${cambios > 1 ? 's' : ''} · Puntos de terceros calculados`);
      } else {
        window.mostrarToast(`✅ ${cambios} tercero${cambios > 1 ? 's' : ''} guardado${cambios > 1 ? 's' : ''}`);
      }

      document.getElementById('adminSeccion').innerHTML = renderSeccion();
      registrarHandlers();

    } catch (e) {
      console.error('[guardarTerceros]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  window._adminRecargarBracket = async () => {
    window.mostrarToast('🔄 Recargando...');
    await Promise.all([cargarBracket(), cargarResultadosGrupos()]);
    document.getElementById('adminSeccion').innerHTML = renderSeccion();
    registrarHandlers();
    window.mostrarToast('✅ Bracket actualizado');
  };

  // ── Mimimi ────────────────────────────────────────────────
  window._adminToggleMimimi = async (uid, mimimi) => {
    try {
      await updateDoc(doc(db, 'usuarios', uid), { mimimi });
      const u = _usuarios.find(u => u.uid === uid);
      if (u) u.mimimi = mimimi;
      // Re-renderizar la sección para reflejar el cambio visualmente
      document.getElementById('adminSeccion').innerHTML = renderSeccion();
      registrarHandlers();
      window.mostrarToast(mimimi ? '😭 Mimimi activado' : '✅ Mimimi desactivado');
    } catch (e) {
      console.error('[toggleMimimi]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };
}

// ══════════════════════════════════════════════════════════════
//  CARGA DE DATOS
// ══════════════════════════════════════════════════════════════

async function cargarUsuarios() {
  const snap           = await getDocs(collection(db, 'usuarios'));
  const predGruposSnap = await getDocs(collection(db, 'predicciones'));
  const predElimSnap   = await getDocs(collection(db, 'predicciones_elim'));
  const predEspSnap    = await getDocs(collection(db, 'pred_especiales'));
  const predTercSnap   = await getDocs(collection(db, 'pred_terceros'));

  // ── Grupos: contar por uid, excluyendo doc de desempates ──
  const cGrupos = {};
  predGruposSnap.forEach(d => {
    const data = d.data();
    if (!data.partido_id) return;
    const uid = data.uid;
    if (uid) cGrupos[uid] = (cGrupos[uid] || 0) + 1;
  });

  // ── Eliminatorias: contar por uid ──
  const cElim = {};
  predElimSnap.forEach(d => {
    const uid = d.data().uid;
    if (uid) cElim[uid] = (cElim[uid] || 0) + 1;
  });

  // ── Especiales: registrar qué campos tiene cada uid ──
  const cEsp = {};
  predEspSnap.forEach(d => {
    const data = d.data();
    const uid  = d.id;
    const rellenos = [data.campeon, data.subcampeon, data.mvp, data.goleador].filter(Boolean).length;
    cEsp[uid] = rellenos; // 0-4
  });

  // ── Terceros: contar equipos seleccionados por uid ──
  const cTerceros = {};
  predTercSnap.forEach(d => {
    const data   = d.data();
    const uid    = data.uid || d.id;
    const equipos = data.equipos || [];
    cTerceros[uid] = equipos.length;
  });

  // ── Construir objetos de usuario ──
  _usuarios = snap.docs.map(d => {
    const data = d.data();
    const uid  = d.id;

    const nGrupos   = cGrupos[uid]   || 0;
    const nElim     = cElim[uid]     || 0;
    const nEsp      = cEsp[uid]      || 0;
    const nTerceros = cTerceros[uid] || 0;

    const estadoGrupos   = nGrupos   === 0 ? 'ninguno' : nGrupos   < 72 ? 'parcial' : 'completo';
    const estadoElim     = nElim     === 0 ? 'ninguno' : nElim     < 32 ? 'parcial' : 'completo';
    const estadoEsp      = nEsp      === 0 ? 'ninguno' : nEsp      <  4 ? 'parcial' : 'completo';
    const estadoTerceros = nTerceros === 0 ? 'ninguno' : nTerceros <  8 ? 'parcial' : 'completo';

    return {
      uid,
      nombre_visible: data.nombre_visible || '—',
      username:       data.username || '—',
      idioma:         data.idioma   || 'es',
      rol:            data.rol      || 'jugador',
      pagado:         data.pagado   || false,
      mimimi:         data.mimimi   || false,
      predGrupos:   { n: nGrupos,   estado: estadoGrupos   },
      predElim:     { n: nElim,     estado: estadoElim     },
      predEsp:      { n: nEsp,      estado: estadoEsp      },
      predTerceros: { n: nTerceros, estado: estadoTerceros }
    };
  }).sort((a, b) => a.nombre_visible.localeCompare(b.nombre_visible));
}

async function cargarConfig() {
  const snap = await getDoc(doc(db, 'config', 'general'));
  _config = snap.exists() ? snap.data() : {};
  _tercerosConfirmados = _config.terceros_confirmados || [];
  const infoSnap = await getDoc(doc(db, 'config', 'info_content'));
  if (infoSnap.exists()) {
    _config.mensaje_es = infoSnap.data().mensaje_es || '';
    _config.mensaje_en = infoSnap.data().mensaje_en || '';
  }
}

async function cargarEmailLog() {
  try {
    const snap = await getDocs(query(collection(db, 'email_log'), orderBy('timestamp', 'desc'), limit(20)));
    _emails = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { _emails = []; }
}

async function cargarEspeciales() {
  try {
    const snap = await getDocs(collection(db, 'pred_especiales'));
    _especiales = snap.docs.map(d => {
      const u = _usuarios.find(u => u.uid === d.id);
      return { uid: d.id, nombre: u?.nombre_visible || '—', ...d.data() };
    });
  } catch (e) { _especiales = []; }
}

async function cargarBracket() {
  try {
    const snap = await getDoc(doc(db, 'config', 'bracket_eliminatorias'));
    _bracket = snap.exists() ? snap.data() : {};
  } catch (e) { _bracket = {}; }
}

async function cargarResultadosGrupos() {
  try {
    const snap = await getDocs(collection(db, 'resultados'));
    _resultadosGrupos = {};
    snap.forEach(d => { _resultadosGrupos[d.id] = d.data(); });
  } catch (e) { _resultadosGrupos = {}; }
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

function formatFechaLimite(campo) {
  if (!campo) return '—';
  try {
    const d = new Date(campo);
    return d.toLocaleString(undefined, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
  } catch { return '—'; }
}

function formatFecha(ts) {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString(undefined, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
  } catch { return '—'; }
}

function fechaAInput(fecha) {
  if (!fecha) return '';
  try {
    const d = new Date(fecha);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

function diasHastaFecha(fechaISO) {
  const diff = new Date(fechaISO) - new Date();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function mostrarErrorModal(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}
