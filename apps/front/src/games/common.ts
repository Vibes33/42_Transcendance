import { useEffect, useRef, useState } from "react";
import type { RoundState } from "@loltr/shared";
import { get, post } from "../api/client";
import { useLang } from "../i18n";

// Petites briques des jeux ajoutés après le lancement : textes bilingues fournis par le serveur,
// fin de chrono et plateau partagé des jeux de groupe.

export type Bi = { fr: string; en: string };

/** Texte du contenu (question, ligne de portrait…) dans la langue du site. */
export function useBi() {
  const lang = useLang((s) => s.lang);
  return (x: Bi | null | undefined) => (x ? x[lang] ?? x.fr : "");
}

/** Chrono écoulé : on redemande la clôture au serveur jusqu'à ce qu'il l'accepte (marge réseau). */
export function useTimeUp(timeUp: boolean, finish: () => Promise<void>) {
  const busy = useRef(false);
  useEffect(() => {
    if (!timeUp) return;
    const id = setInterval(() => {
      if (busy.current) return;
      busy.current = true;
      finish().finally(() => (busy.current = false));
    }, 700);
    return () => clearInterval(id);
  }, [timeUp]);
}

/** Plateau partagé d'un jeu de groupe : relu chaque seconde, et après chaque action. */
export function useParty<V>(roundId: string, demo?: boolean) {
  const [data, setData] = useState<{ view: V; round: RoundState } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (demo) return;
    let live = true;
    const load = () => get<{ view: V; round: RoundState }>(`/api/jeux/party/${roundId}`).then((d) => live && setData(d)).catch(() => {});
    load();
    const id = setInterval(load, 1000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [roundId, demo]);
  const act = async (action: Record<string, unknown>) => {
    setError(null);
    try {
      setData(await post<{ view: V; round: RoundState }>(`/api/jeux/party/${roundId}/act`, action));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  return { view: data?.view ?? null, over: !!data?.round.over, act, error };
}
