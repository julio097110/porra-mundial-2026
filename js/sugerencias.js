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
      window.mostrarToast(t('suggestions.confirmMsg'), 6000);
    } catch (e) {
      console.error('[sugerencias]', e);
      window.mostrarToast(t('common.error'), 4000);
    } finally {
      btn.disabled = false;
    }
  };
}
