/*
 * Everything the app uses from the Firebase SDK, in one module so it can be loaded on demand.
 * Only firebaseLoader imports this at runtime. A static import would put Firebase back on the
 * first-load path.
 */
export {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
export { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
export { auth, db, googleProvider } from './firebase'
