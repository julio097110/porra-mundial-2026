// ============================================================
//  js/sugerencias.js
//  Pestaña "Sugerencias"
//  - Cualquier jugador puede escribir una sugerencia
//  - El texto NUNCA se guarda ni se envía a ningún sitio,
//    se descarta en el cliente al enviar
//  - Solo se incrementa el contador `sugerencias` del propio
//    usuario en Firestore (usuarios/{uid}), para que el admin
//    pueda ver quién ha mandado sugerencias y cuántas
// ============================================================

import { db } from './firebase-config.js';
import {
  doc, updateDoc, increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t } from './i18n.js';

// ── Estado ────────────────────────────────────────────────────
let _app = null;

// ── Punto de entrada ─────────────────────────────────────────
export async function initSugerencias(app) {
  _app = app;
  const contenedor = document.getElementById('sugerenciasContent');
  renderSugerencias(contenedor);

  window._refreshTextos = () => {
    const c = document.getElementById('sugerenciasContent');
    if (c) renderSugerencias(c);
  };
}

// ── Render ──────────────────────────────────────────────────
function renderSugerencias(contenedor) {
  contenedor.innerHTML = `
    <div>
      <div style="font-size:14px; font-weight:600; color:var(--gd); margin-bottom:6px;">
        💡 ${t('suggestions.title')}
      </div>
      <div style="font-size:12px; color:var(--tm); margin-bottom:14px;">
        ${t('suggestions.subtitle')}
      </div>

      <div id="sugerenciaConfirmBox" class="hidden" style="
        position:relative; background:#e8f4d8; border:2px solid var(--gp,#dde8cc);
        border-radius:var(--radius); padding:18px 40px 18px 18px; margin-bottom:14px;
      ">
        <button
          onclick="window._cerrarConfirmSugerencia()"
          aria-label="Cerrar"
          style="
            position:absolute; top:8px; right:10px; background:none; border:none;
            font-size:20px; line-height:1; color:var(--gd); cursor:pointer; padding:4px;
          "
        >✕</button>
        <div id="sugerenciaConfirmTexto" style="
          font-size:28px; line-height:1.25; font-weight:600;
          letter-spacing:0.5px; color:var(--gd);
        "></div>
      </div>

      <div class="card">
        <div class="card-body">
          <textarea
            id="sugerenciaTexto"
            rows="5"
            placeholder="${t('suggestions.placeholder')}"
            style="width:100%; resize:vertical; padding:10px; border:1px solid var(--gp,#dde8cc);
              border-radius:var(--radius); font-family:inherit; font-size:13px; box-sizing:border-box;"
          ></textarea>

          <button
            class="btn btn-primary"
            style="margin-top:10px;"
            onclick="window._enviarSugerencia()"
            id="btnEnviarSugerencia"
          >
            ${t('suggestions.sendBtn')}
          </button>
        </div>
      </div>
    </div>`;

  window._cerrarConfirmSugerencia = () => {
    const box = document.getElementById('sugerenciaConfirmBox');
    if (box) box.classList.add('hidden');
  };

  window._enviarSugerencia = async () => {
    const textarea = document.getElementById('sugerenciaTexto');
    const btn      = document.getElementById('btnEnviarSugerencia');

    // El texto no se lee ni se envía a ningún sitio; solo se vacía.
    textarea.value = '';

    btn.disabled = true;
    try {
      await updateDoc(doc(db, 'usuarios', _app.uid), {
        sugerencias: increment(1)
      });
      const box   = document.getElementById('sugerenciaConfirmBox');
      const texto = document.getElementById('sugerenciaConfirmTexto');
      if (box && texto) {
        texto.textContent = t('suggestions.confirmMsg');
        box.classList.remove('hidden');
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (e) {
      console.error('[sugerencias]', e);
      window.mostrarToast(t('common.error'), 4000);
    } finally {
      btn.disabled = false;
    }
  };
}
