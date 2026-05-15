// ============================================================
//  firebase-config.js
//  Configuración e inicialización de Firebase
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyDhIXY8tOLKxKpuXdkSNqZf3Fxaexw3d4c",
  authDomain:        "porra-mundial-2026-ccbda.firebaseapp.com",
  projectId:         "porra-mundial-2026-ccbda",
  storageBucket:     "porra-mundial-2026-ccbda.firebasestorage.app",
  messagingSenderId: "339309866625",
  appId:             "1:339309866625:web:499f0edb4f1b3405d2e780"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
