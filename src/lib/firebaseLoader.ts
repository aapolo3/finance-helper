export type FirebaseApi = typeof import('./firebaseApi')

let loaded: FirebaseApi | null = null
let loading: Promise<FirebaseApi> | null = null

/** Loads the SDK once. A failed load (offline) is not remembered, so a later call tries again. */
export function loadFirebase(): Promise<FirebaseApi> {
  if (loaded) return Promise.resolve(loaded)
  if (!loading) {
    loading = import('./firebaseApi').then(
      (api) => {
        loaded = api
        loading = null
        return api
      },
      (err: unknown) => {
        loading = null
        throw new Error('Could not reach the sign-in service. Check your connection.', { cause: err })
      },
    )
  }
  return loading
}

/** The SDK if it has loaded. Lets callers skip an await where timing matters, as in a click handler. */
export function loadedFirebase(): FirebaseApi | null {
  return loaded
}

/** For code that only runs once someone is signed in, which means the SDK has already loaded. */
export function requireFirebase(): FirebaseApi {
  if (!loaded) throw new Error('Firebase used before it loaded')
  return loaded
}
