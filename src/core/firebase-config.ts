/* ============ firebase-config.ts — conexión con tu proyecto de Firebase ============
 * Pega aquí la configuración de tu app web de Firebase (Consola de Firebase >
 * Configuración del proyecto > Tus apps > SDK setup and configuration > Config).
 * Los pasos completos están en docs/FIREBASE.md.
 *
 * Estos datos NO son secretos: Firebase los diseña para ir en la web. Lo que
 * protege las partidas son las reglas de Firestore (firestore.rules).
 *
 * Si se pone a null, el juego funciona en modo local (sólo en el navegador).
 */
import { register } from './registry';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  databaseURL: string;
}

// Proyecto pokesurvivor-free (desde el 12-10-2026): autenticación normal de Firebase,
// SIN Identity Platform, así las cuentas son gratis sin límite. ¡No pulsar nunca
// "Actualizar a Identity Platform" en su consola! (El viejo era pokesurvivor-jpter.)
const FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: 'AIzaSyB1LpJcsnT7gj7c8cpRMGjhswLPr8-dnBw',
  authDomain: 'pokesurvivor-free.firebaseapp.com',
  projectId: 'pokesurvivor-free',
  storageBucket: 'pokesurvivor-free.firebasestorage.app',
  messagingSenderId: '798271504277',
  appId: '1:798271504277:web:dcac4409f969239e87009c',
  databaseURL: 'https://pokesurvivor-free-default-rtdb.europe-west1.firebasedatabase.app'
};

register('FIREBASE_CONFIG', FIREBASE_CONFIG);
export { FIREBASE_CONFIG };
export default FIREBASE_CONFIG;
