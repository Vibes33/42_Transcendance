// Vide tout ce que le navigateur persiste (localStorage, session, IndexedDB,
// caches, workers) puis recharge. Utile si un vieux réglage coince l'affichage.
export async function wipeBrowserStorage(): Promise<void> {
  try {
    localStorage.clear();
  } catch {}
  try {
    sessionStorage.clear();
  } catch {}
  try {
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(
      dbs.map(
        (d) =>
          d.name &&
          new Promise<void>((res) => {
            const req = indexedDB.deleteDatabase(d.name as string);
            req.onsuccess = req.onerror = req.onblocked = () => res();
          })
      )
    );
  } catch {}
  try {
    for (const k of await caches.keys()) await caches.delete(k);
  } catch {}
  try {
    for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister();
  } catch {}
  location.reload();
}
