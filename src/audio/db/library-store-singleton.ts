import { LibraryStore } from './library-store';

let sharedStore: LibraryStore | null = null;
let initPromise: Promise<LibraryStore> | null = null;

/**
 * Returns a shared LibraryStore instance initialized exactly once per app lifecycle.
 */
export async function getLibraryStore(): Promise<LibraryStore> {
  if (sharedStore) return sharedStore;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const store = new LibraryStore();
    await store.init();
    sharedStore = store;
    return store;
  })();

  return initPromise;
}

