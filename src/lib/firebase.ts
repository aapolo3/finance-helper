import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyDzVQcfqK4S8q-0QXJKgugZgeFxfxn1f28',
  authDomain: 'finance-helper-274a9.firebaseapp.com',
  projectId: 'finance-helper-274a9',
  storageBucket: 'finance-helper-274a9.firebasestorage.app',
  messagingSenderId: '1084207161847',
  appId: '1:1084207161847:web:955633ff59c91e4af1cef2',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const db = getFirestore(firebaseApp)
export const googleProvider = new GoogleAuthProvider()
