import type { Unsubscribe } from 'firebase/firestore'
import { requireFirebase } from '../lib/firebaseLoader'
import { applyPalette, getPalette, parsePalette, type PaletteId } from '../lib/palette'

/*
 * The palette has its own document, apart from the budget, so budget merges and
 * history restores never change it. The cloud copy wins at sign-in, which keeps
 * the look the same on every device.
 */
let syncedUid: string | null = null
let stopWatching: Unsubscribe | null = null
let reportError: (message: string) => void = () => {}

function preferencesRef(uid: string) {
  const { doc, db } = requireFirebase()
  return doc(db, 'users', uid, 'settings', 'preferences')
}

function upload(uid: string, palette: PaletteId) {
  const { serverTimestamp, setDoc } = requireFirebase()
  setDoc(preferencesRef(uid), { palette, updatedAt: serverTimestamp() }).catch(() => {
    reportError('Could not save your palette to the cloud. It still applies on this device.')
  })
}

export function startPaletteSync(uid: string, onError: (message: string) => void) {
  stopPaletteSync()
  syncedUid = uid
  reportError = onError
  stopWatching = requireFirebase().onSnapshot(
    preferencesRef(uid),
    (snap) => {
      // Echo of this device's own unacknowledged save.
      if (snap.metadata.hasPendingWrites) return
      if (!snap.exists()) {
        // First sign-in with this feature: this device's choice becomes the account's.
        if (!snap.metadata.fromCache) upload(uid, getPalette())
        return
      }
      const palette = parsePalette(snap.data().palette)
      if (palette && palette !== getPalette()) applyPalette(palette)
    },
    () => onError('Could not load your palette from the cloud.'),
  )
}

export function stopPaletteSync() {
  stopWatching?.()
  stopWatching = null
  syncedUid = null
}

/** The person picked a palette: apply it here and, when signed in, everywhere. */
export function choosePalette(palette: PaletteId) {
  applyPalette(palette)
  if (syncedUid) upload(syncedUid, palette)
}
