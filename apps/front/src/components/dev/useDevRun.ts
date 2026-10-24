import { useState } from "react";
import { keys, useInvalidate } from "../../api/queries";
import { useUi } from "../../state/ui";

// Exécute une action de test, invalide les caches puis notifie. Un seul
// indicateur `busy` pour tout le panneau : une action à la fois.
export function useDevRun() {
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await invalidate(keys.me, keys.shop, keys.inventory, keys.daily, keys.profile, keys.stats);
      useUi.getState().toast(label, "ok");
    } catch (e) {
      useUi.getState().toast((e as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  };

  return { busy, run };
}
