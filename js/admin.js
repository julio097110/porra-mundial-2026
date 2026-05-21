// ============================================================
//  js/admin.js
//  Panel de administración
//  Secciones: resumen, jugadores, fechas, pagos, emails, info
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, setDoc,
  updateDoc, deleteDoc, serverTimestamp,
  query, where, orderBy, limit, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t } from './i18n.js';
import {
  crearUsuario, verificarNombreDisponible,
  verificarUsernameDisponible, marcarPago,
  eliminarUsuarioFirestore, obtenerTodosUsuarios
} from './auth.js';

// ── Estado ────────────────────────────────────────────────────
let _app         = null;
let _seccionActiva = 'resumen';
let _usuarios    = [];
let _config      = {};
let _emails      = [];
let _especiales  = [];
let _paginaJug   = 1;
const POR_PAGINA = 20;

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
      cargarEspeciales()
    ]);
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
    default:              return renderResumen();
  }
}

// ══════════════════════════════════════════════════════════════
//  RESUMEN
// ══════════════════════════════════════════════════════════════

function renderResumen() {
  const sinPred  = _usuarios.filter(u => u.estadoPred === 'ninguno').length;
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
                  <td>${badgePred(u.estadoPred)}</td>
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

function badgePred(estado) {
  if (estado === 'completo')  return `<span class="pred-ok">✓ ${t('admin.players.predFull')}</span>`;
  if (estado === 'parcial')   return `<span class="pred-partial">⚡ ${t('admin.players.predPartial')}</span>`;
  return `<span class="pred-none">✗ ${t('admin.players.predNone')}</span>`;
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
                  <td>${badgePred(u.estadoPred)}</td>
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

  const fgStr = fechaAInput(fg);
  const feStr = fechaAInput(fe);
  const fgPasada = new Date(fg) < new Date();
  const fePasada = new Date(fe) < new Date();

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
//  PREDICCIONES ESPECIALES (corrección ortográfica)
// ══════════════════════════════════════════════════════════════

function renderEspecialesAdmin() {
  const especiales = _especiales.map(e => ({
    ...e,
    nombre: _usuarios.find(u => u.uid === e.uid)?.nombre_visible || '—'
  }));

  return `
    <div>
      <div style="font-size:14px; font-weight:600; color:var(--gd); margin-bottom:6px;">
        ⭐ ${t('admin.specials.title')}
      </div>
      <div style="font-size:12px; color:var(--tm); margin-bottom:14px;">
        ${t('admin.specials.subtitle')}
      </div>
      <div class="card">
        <div class="card-body" style="padding:0; overflow-x:auto;">
          <table class="admin-table">
            <thead>
              <tr>
                <th>${t('admin.players.name')}</th>
                <th>⭐ ${t('specials.mvp')}</th>
                <th>⚽ ${t('specials.topScorer')}</th>
                <th>${t('admin.players.actions')}</th>
              </tr>
            </thead>
            <tbody>
              ${especiales.map(e => `
                <tr>
                  <td><span class="player-name">${e.nombre}</span></td>
                  <td>
                    <input class="form-input" type="text" value="${e.mvp || ''}"
                      id="mvp_${e.uid}" style="font-size:12px; padding:5px 8px;">
                  </td>
                  <td>
                    <input class="form-input" type="text" value="${e.goleador || ''}"
                      id="gol_${e.uid}" style="font-size:12px; padding:5px 8px;">
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
//  HANDLERS (registrados tras cada render)
// ══════════════════════════════════════════════════════════════

function registrarHandlers() {

  // Paginación jugadores
  window._adminPagJug = (pag) => {
    _paginaJug = pag;
    document.getElementById('adminSeccion').innerHTML = renderSeccion();
    registrarHandlers();
  };

  // Abrir modal añadir jugador
  window._adminAnadirJugador = () => modalJugador();

  // Abrir modal editar jugador
  window._adminEditarJugador = (uid) => modalJugador(uid);

  // Guardar jugador (crear o editar)
  window._adminGuardarJugador = async (uid) => {
    const nombre = document.getElementById('mNombre')?.value?.trim();
    const idioma = document.getElementById('mIdioma')?.value || 'es';

    if (!nombre) {
      mostrarErrorModal('mNombreError', 'El nombre es obligatorio');
      return;
    }

    try {
      if (uid) {
        // Editar: solo nombre e idioma
        const dispNombre = await verificarNombreDisponible(nombre, uid);
        if (!dispNombre) {
          mostrarErrorModal('mNombreError', t('admin.players.nameTaken'));
          return;
        }
        await updateDoc(doc(db, 'usuarios', uid), {
          nombre_visible:       nombre,
          nombre_visible_lower: nombre.toLowerCase(),
          idioma
        });
        window.mostrarToast('✅ Jugador actualizado');
      } else {
        // Crear nuevo
        const email    = document.getElementById('mEmail')?.value?.trim();
        const password = document.getElementById('mPass')?.value;
        const username = document.getElementById('mUser')?.value?.trim().toLowerCase();

        if (!email || !password || !username) {
          window.mostrarToast('⚠️ Rellena todos los campos', 4000);
          return;
        }

        await crearUsuario({ email, password, nombre_visible: nombre, username, idioma });
        window.mostrarToast('✅ Jugador creado');
      }

      window.appCerrarModal();
      await cargarUsuarios();
      document.getElementById('adminSeccion').innerHTML = renderSeccion();
      registrarHandlers();

    } catch (e) {
      if (e.message === 'nombre_taken') {
        mostrarErrorModal('mNombreError', t('admin.players.nameTaken'));
      } else if (e.message === 'username_taken') {
        mostrarErrorModal('mUserError', t('admin.players.userTaken'));
      } else {
        window.mostrarToast('❌ ' + t('common.error'), 5000);
        console.error('[guardarJugador]', e);
      }
    }
  };

  // Eliminar jugador
  window._adminEliminarJugador = (uid, nombre) => {
    window.appAbrirModal(
      t('admin.players.deleteBtn'),
      `<p style="font-size:13px;">¿Seguro que quieres eliminar a <strong>${nombre}</strong>? Esta acción no se puede deshacer.</p>`,
      `
        <button class="btn btn-secondary" onclick="window.appCerrarModal()">${t('common.cancel')}</button>
        <button class="btn btn-danger" onclick="window._adminConfirmarEliminar('${uid}')">
          🗑️ ${t('admin.players.deleteBtn')}
        </button>`
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

  // Toggle pago
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

  // Toggle porra llena
  window._adminTogglePorraLlena = () => {
    const toggle = document.getElementById('togglePorraLlena');
    if (!toggle) return;
    const nuevoEstado = !toggle.classList.contains('on');
    toggle.classList.toggle('on', nuevoEstado);
    toggle.classList.toggle('off', !nuevoEstado);
    _config.porra_llena = nuevoEstado;
  };

  // Guardar enlaces de pago
  window._adminGuardarPagos = async () => {
    try {
      const revolut    = document.getElementById('inputRevolut')?.value?.trim();
      const vipps      = document.getElementById('inputVipps')?.value?.trim();
      const porraLlena = _config.porra_llena || false;

      await setDoc(doc(db, 'config', 'general'), {
        enlace_revolut: revolut,
        enlace_vipps:   vipps,
        porra_llena:    porraLlena
      }, { merge: true });

      _config.enlace_revolut = revolut;
      _config.enlace_vipps   = vipps;

      window.mostrarToast('✅ Configuración de pagos guardada');
    } catch (e) {
      console.error('[guardarPagos]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  // Guardar bote total
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

  // Guardar fechas límite
  window._adminGuardarFechas = async () => {
    try {
      const fg = document.getElementById('inputFechaGrupos')?.value;
      const fe = document.getElementById('inputFechaElim')?.value;

      if (!fg || !fe) {
        window.mostrarToast('⚠️ Introduce ambas fechas', 4000);
        return;
      }

      await setDoc(doc(db, 'config', 'general'), {
        fecha_limite_grupos:        new Date(fg).toISOString(),
        fecha_limite_eliminatorias: new Date(fe).toISOString()
      }, { merge: true });

      _config.fecha_limite_grupos        = new Date(fg).toISOString();
      _config.fecha_limite_eliminatorias = new Date(fe).toISOString();

      window.mostrarToast('✅ ' + t('admin.dates.saveBtn'));
    } catch (e) {
      console.error('[guardarFechas]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  // Guardar mensaje info
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

  // Guardar corrección ortográfica especiales
  window._adminGuardarEsp = async (uid) => {
    try {
      const mvp      = document.getElementById(`mvp_${uid}`)?.value?.trim() || '';
      const goleador = document.getElementById(`gol_${uid}`)?.value?.trim() || '';
      await updateDoc(doc(db, 'pred_especiales', uid), { mvp, goleador });
      window.mostrarToast('✅ Corregido correctamente');
    } catch (e) {
      console.error('[guardarEsp]', e);
      window.mostrarToast('❌ ' + t('common.error'), 5000);
    }
  };

  // Ver predicciones de un jugador — abre un modal con el resumen
  window._adminVerPredicciones = async (uid, nombre) => {
    window.appAbrirModal(
      `👁️ Predicciones de ${nombre}`,
      `<div class="loading-inline"><div class="spinner-sm"></div><span>Cargando...</span></div>`,
      ''
    );
    try {
      const [gruposSnap, elimSnap, espSnap] = await Promise.all([
        getDocs(query(collection(db, 'predicciones'),     where('uid', '==', uid))),
        getDocs(query(collection(db, 'predicciones_elim'),where('uid', '==', uid))),
        getDoc(doc(db, 'pred_especiales', uid))
      ]);

      const nGrupos = gruposSnap.size;
      const nElim   = elimSnap.size;
      const esp     = espSnap.exists() ? espSnap.data() : {};

      document.getElementById('modalBody').innerHTML = `
        <div style="font-size:13px; display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f5e8;">
            <span style="color:var(--ts);">⚽ Predicciones de grupos</span>
            <strong style="color:${nGrupos >= 72 ? 'var(--gl)' : nGrupos > 0 ? 'var(--gold)' : 'var(--r)'};">
              ${nGrupos} / 72
            </strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f5e8;">
            <span style="color:var(--ts);">⚔️ Predicciones de eliminatorias</span>
            <strong style="color:${nElim > 0 ? 'var(--gl)' : 'var(--tm)'};">${nElim} partidos</strong>
          </div>
          <div style="padding:8px 0; border-bottom:1px solid #f0f5e8;">
            <div style="color:var(--ts); margin-bottom:6px;">⭐ Predicciones especiales</div>
            <div style="font-size:12px; display:grid; grid-template-columns:1fr 1fr; gap:4px;">
              <span style="color:var(--tm);">🏆 Campeón:</span><strong>${esp.campeon    || '—'}</strong>
              <span style="color:var(--tm);">🥈 Subcampeón:</span><strong>${esp.subcampeon || '—'}</strong>
              <span style="color:var(--tm);">⭐ MVP:</span><strong>${esp.mvp        || '—'}</strong>
              <span style="color:var(--tm);">⚽ Goleador:</span><strong>${esp.goleador   || '—'}</strong>
            </div>
          </div>
        </div>`;

      document.getElementById('modalFooter').innerHTML =
        `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cerrar</button>`;
    } catch (e) {
      document.getElementById('modalBody').innerHTML =
        `<div class="notice error">⚠️ ${t('common.error')}</div>`;
    }
  };

  // Borrar predicciones de un jugador con confirmación
  window._adminBorrarPredJugador = (uid, nombre, tipo) => {
    const labels = { grupos: 'grupos', eliminatorias: 'eliminatorias', especiales: 'especiales' };
    window.appAbrirModal(
      `🗑️ Borrar predicciones de ${nombre}`,
      `<p style="font-size:13px;">¿Seguro que quieres borrar las predicciones de <strong>${nombre}</strong> de <strong>${labels[tipo]}</strong>? Esta acción no se puede deshacer.</p>`,
      `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cancelar</button>
       <button class="btn btn-danger" onclick="window._adminConfirmarBorradoPred('${uid}', '${nombre}', '${tipo}')">
         🗑️ Sí, borrar
       </button>`
    );
  };

  window._adminConfirmarBorradoPred = async (uid, nombre, tipo) => {
    try {
      window.appCerrarModal();
      window.mostrarToast('🗑️ Borrando...');
      const { deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

      if (tipo === 'grupos') {
        const q    = query(collection(db, 'predicciones'), where('uid', '==', uid));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      } else if (tipo === 'eliminatorias') {
        const q    = query(collection(db, 'predicciones_elim'), where('uid', '==', uid));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      } else if (tipo === 'especiales') {
        await deleteDoc(doc(db, 'pred_especiales', uid));
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
}

// ══════════════════════════════════════════════════════════════
//  CARGA DE DATOS
// ══════════════════════════════════════════════════════════════

async function cargarUsuarios() {
  const snap = await getDocs(collection(db, 'usuarios'));
  const predSnap = await getDocs(collection(db, 'predicciones'));

  // Contar predicciones por usuario
  const conteo = {};
  predSnap.forEach(d => {
    const uid = d.data().uid;
    if (uid) conteo[uid] = (conteo[uid] || 0) + 1;
  });

  _usuarios = snap.docs.map(d => {
    const data = d.data();
    const n    = conteo[d.id] || 0;
    return {
      uid:          d.id,
      nombre_visible: data.nombre_visible || '—',
      username:     data.username || '—',
      idioma:       data.idioma   || 'es',
      rol:          data.rol      || 'jugador',
      pagado:       data.pagado   || false,
      estadoPred:   n === 0 ? 'ninguno' : n < 72 ? 'parcial' : 'completo'
    };
  }).sort((a, b) => a.nombre_visible.localeCompare(b.nombre_visible));
}

async function cargarConfig() {
  const snap = await getDoc(doc(db, 'config', 'general'));
  _config = snap.exists() ? snap.data() : {};

  // Cargar mensaje info
  const infoSnap = await getDoc(doc(db, 'config', 'info_content'));
  if (infoSnap.exists()) {
    _config.mensaje_es = infoSnap.data().mensaje_es || '';
    _config.mensaje_en = infoSnap.data().mensaje_en || '';
  }
}

async function cargarEmailLog() {
  try {
    const snap = await getDocs(
      query(collection(db, 'email_log'), orderBy('timestamp', 'desc'), limit(20))
    );
    _emails = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    _emails = [];
  }
}

async function cargarEspeciales() {
  try {
    const snap = await getDocs(collection(db, 'pred_especiales'));
    _especiales = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  } catch (e) {
    _especiales = [];
  }
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

function formatFechaLimite(campo) {
  if (!campo) return '—';
  try {
    const d = new Date(campo);
    return d.toLocaleString(undefined, {
      day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'
    });
  } catch { return '—'; }
}

function formatFecha(ts) {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString(undefined, {
      day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'
    });
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
