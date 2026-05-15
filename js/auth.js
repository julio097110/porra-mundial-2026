// ============================================================
//  js/auth.js
//  Gestión de autenticación y perfil de usuario
//  Exporta helpers usados por otros módulos
// ============================================================

import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Constantes ───────────────────────────────────────────────
export const ROL_ADMIN   = 'admin';
export const ROL_JUGADOR = 'jugador';

// ── Obtener perfil de usuario desde Firestore ────────────────
export async function obtenerPerfil(uid) {
  const snap = await getDoc(doc(db, 'usuarios', uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() };
}

// ── Crear cuenta de usuario (solo admin) ─────────────────────
// Nota: Firebase Auth no permite crear usuarios desde el cliente
// sin cerrar la sesión actual. Usamos la REST API de Firebase
// con la apiKey para crear el usuario sin afectar la sesión admin.
export async function crearUsuario({
  email,
  password,
  nombre_visible,
  username,
  idioma = 'es',
  rol = ROL_JUGADOR
}) {
  const FIREBASE_API_KEY = 'AIzaSyDhIXY8tOLKxKpuXdkSNqZf3Fxaexw3d4c';

  // 1. Verificar que el nombre_visible no esté en uso
  const nombreDisponible = await verificarNombreDisponible(nombre_visible);
  if (!nombreDisponible) {
    throw new Error('nombre_taken');
  }

  // 2. Verificar que el username no esté en uso
  const usernameDisponible = await verificarUsernameDisponible(username);
  if (!usernameDisponible) {
    throw new Error('username_taken');
  }

  // 3. Crear usuario en Firebase Auth via REST API
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: false
      })
    }
  );

  const data = await res.json();
  if (data.error) {
    if (data.error.message === 'EMAIL_EXISTS') throw new Error('email_exists');
    throw new Error(data.error.message);
  }

  const newUid = data.localId;

  // 4. Crear documento en Firestore
  await setDoc(doc(db, 'usuarios', newUid), {
    email,
    nombre_visible:       nombre_visible.trim(),
    nombre_visible_lower: nombre_visible.trim().toLowerCase(),
    username:             username.trim().toLowerCase(),
    idioma,
    rol,
    pagado:               false,
    creado_en:            serverTimestamp()
  });

  return newUid;
}

// ── Verificar disponibilidad de nombre visible ───────────────
export async function verificarNombreDisponible(nombre, excluirUid = null) {
  const q = query(
    collection(db, 'usuarios'),
    where('nombre_visible_lower', '==', nombre.trim().toLowerCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return true;
  if (excluirUid) {
    return snap.docs.every(d => d.id === excluirUid);
  }
  return false;
}

// ── Verificar disponibilidad de username ─────────────────────
export async function verificarUsernameDisponible(username, excluirUid = null) {
  const q = query(
    collection(db, 'usuarios'),
    where('username', '==', username.trim().toLowerCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return true;
  if (excluirUid) {
    return snap.docs.every(d => d.id === excluirUid);
  }
  return false;
}

// ── Actualizar nombre visible del jugador ────────────────────
export async function actualizarNombreVisible(uid, nuevoNombre) {
  const disponible = await verificarNombreDisponible(nuevoNombre, uid);
  if (!disponible) throw new Error('nombre_taken');

  await updateDoc(doc(db, 'usuarios', uid), {
    nombre_visible:       nuevoNombre.trim(),
    nombre_visible_lower: nuevoNombre.trim().toLowerCase()
  });
}

// ── Buscar email por username (para login con nombre de usuario) ─
export async function buscarEmailPorUsername(username) {
  const q = query(
    collection(db, 'usuarios'),
    where('username', '==', username.trim().toLowerCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data().email;
}

// ── Cambiar contraseña del usuario actual ────────────────────
export async function cambiarContrasena(passwordActual, passwordNuevo) {
  const user = auth.currentUser;
  if (!user) throw new Error('no_user');

  // Reautenticar antes de cambiar contraseña
  const credential = EmailAuthProvider.credential(user.email, passwordActual);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, passwordNuevo);
}

// ── Actualizar idioma del usuario ────────────────────────────
export async function actualizarIdioma(uid, idioma) {
  await updateDoc(doc(db, 'usuarios', uid), { idioma });
}

// ── Logout ───────────────────────────────────────────────────
export async function cerrarSesion() {
  await signOut(auth);
}

// ── Escuchar cambios de sesión ───────────────────────────────
export function escucharSesion(callback) {
  return onAuthStateChanged(auth, callback);
}

// ── Marcar pago de un jugador (solo admin) ───────────────────
export async function marcarPago(uid, pagado) {
  await updateDoc(doc(db, 'usuarios', uid), { pagado });
}

// ── Eliminar usuario (solo admin) ────────────────────────────
// Elimina el documento de Firestore. El admin elimina el usuario
// de Auth manualmente desde Firebase Console si es necesario.
export async function eliminarUsuarioFirestore(uid) {
  const { deleteDoc } = await import(
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
  );
  await deleteDoc(doc(db, 'usuarios', uid));
}

// ── Obtener todos los usuarios (solo admin) ──────────────────
export async function obtenerTodosUsuarios() {
  const snap = await getDocs(collection(db, 'usuarios'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// ── Obtener estado de predicciones de un usuario ─────────────
// Devuelve: 'completo' | 'parcial' | 'ninguno'
export async function estadoPredicciones(uid) {
  try {
    // Comprobar si tiene predicciones de grupos
    const gruposSnap = await getDocs(
      query(collection(db, 'predicciones'), where('uid', '==', uid))
    );
    const totalGrupos = 72;
    const tieneGrupos = gruposSnap.size;

    // Comprobar predicciones especiales
    const espSnap = await getDoc(doc(db, 'pred_especiales', uid));
    const tieneEspeciales = espSnap.exists() &&
      espSnap.data().campeon &&
      espSnap.data().subcampeon;

    if (tieneGrupos === 0) return 'ninguno';
    if (tieneGrupos < totalGrupos || !tieneEspeciales) return 'parcial';
    return 'completo';
  } catch (e) {
    console.error('[estadoPredicciones]', e);
    return 'ninguno';
  }
}

// ── Helper: comprobar si el plazo está abierto ───────────────
export async function plazoAbierto(tipo = 'grupos') {
  try {
    const snap = await getDoc(doc(db, 'config', 'general'));
    if (!snap.exists()) return true; // si no hay config, asumimos abierto

    const config = snap.data();
    const campo  = tipo === 'grupos'
      ? 'fecha_limite_grupos'
      : 'fecha_limite_eliminatorias';

    if (!config[campo]) return true;

    const limite = config[campo].toDate
      ? config[campo].toDate()
      : new Date(config[campo]);

    return new Date() < limite;
  } catch (e) {
    console.error('[plazoAbierto]', e);
    return true;
  }
}

// ── Helper: obtener config general ──────────────────────────
export async function obtenerConfig() {
  const snap = await getDoc(doc(db, 'config', 'general'));
  return snap.exists() ? snap.data() : {};
}
