import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAYHEM_GROUP_DAYS, MAYHEM_TEAMS, groupRecord, mayhemWins, type MayhemMatch, type MayhemTournament } from "@loltr/content/lite";
import { get } from "../api/client";
import { EndDialog, GameBar, modeSub } from "../components/game";
import { useT } from "../i18n";
import { useMe } from "../state/app";
import { useLive } from "../state/live";
import { Bracket } from "./mayhem/Bracket";
import { CrestPicker } from "./mayhem/CrestPicker";
import { Broadcast } from "./mayhem/Broadcast";
import { Draft } from "./mayhem/Draft";
import { Groups } from "./mayhem/Groups";
import { entrantName, type MayhemPub } from "./mayhem/util";
import type { GameProps } from "./types";

// World Mayhem : draft des rosters des Worlds 2020-2025, puis tournoi simulé par le serveur :
// phase de poules (3 journées), puis phase finale. Chaque partie de mon équipe est retransmise et
// s'enchaîne sur la suivante ; les poules et l'arbre se dévoilent au fil de ce qui a été regardé.

/** Une partie de mon équipe à regarder. */
interface Step {
  kind: "group" | "bracket";
  /** Journée de poule (0 à 2) ou tour de la phase finale (0 quarts, 1 demies, 2 finale). */
  index: number;
  match: MayhemMatch;
  game: number;
}

export function WorldMayhem({ round, act, flow, groupSize }: GameProps<MayhemPub>) {
  const t = useT();
  const me = useMe();
  const session = useLive((s) => s.session);
  const pub = round.public;
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState<string | null>(null);
  const [groupTour, setGroupTour] = useState<{ tour: MayhemTournament; me: number } | null>(null);
  const [members, setMembers] = useState<{ userId: string; locked: boolean; gone: boolean }[]>([]);
  // Le parcours reprend là où il en était (enregistré côté serveur) après une sortie ou un rechargement
  const [view, setView] = useState<{ step: number; watching: boolean }>({ step: pub.watched ?? 0, watching: false });
  const [tab, setTab] = useState<"groups" | "bracket" | null>(null);
  // Mon parcours fini, je peux dévoiler le tournoi complet (et alors regarder n'importe quel match)
  const [spec, setSpec] = useState<{ key: string; match: MayhemMatch; game: number; label: string } | null>(null);
  useEffect(() => {
    if (view.step > (pub.watched ?? 0) && !round.over) act({ type: "watched", step: view.step }).catch(() => {});
  }, [view.step, pub.watched, round.over, act]);
  const rollTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => () => clearInterval(rollTimer.current), []);

  const tour = pub.tournament ?? groupTour?.tour ?? null;
  const mine = pub.tournament ? pub.me : (groupTour?.me ?? 0);
  const myId = me.profile?.userId;
  const names = useMemo(() => Object.fromEntries((session?.members ?? []).map((m) => [m.userId, m.pseudo])), [session?.members]);

  // En groupe : on attend que tout le groupe ait validé, puis le serveur calcule le tournoi
  const waiting = pub.locked && !tour && !!round.sessionId;
  useEffect(() => {
    if (!waiting) return;
    let live = true;
    const poll = async () => {
      const r = await get<{ members: typeof members; tournament: MayhemTournament | null; me: number }>(`/api/jeux/mayhem/group/${round.sessionId}`).catch(() => null);
      if (!live || !r) return;
      setMembers(r.members);
      if (r.tournament) setGroupTour({ tour: r.tournament, me: r.me });
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [waiting, round.sessionId]);

  // Après chaque choix (ou joker), les équipes défilent puis la nouvelle s'arrête
  const roll = () => {
    clearInterval(rollTimer.current);
    let n = 0;
    rollTimer.current = setInterval(() => {
      n++;
      setRolling(MAYHEM_TEAMS[(n * 5) % MAYHEM_TEAMS.length].id);
      if (n >= 12) {
        clearInterval(rollTimer.current);
        setRolling(null);
      }
    }, 90);
  };
  const send = async (action: Record<string, unknown>, rolls = false) => {
    setBusy(true);
    try {
      const res = await act(action);
      if (res && rolls && !res.feedback?.locked) roll();
    } finally {
      setBusy(false);
    }
  };

  const myGroup = tour?.groups?.find((g) => g.members.includes(mine)) ?? null;
  const steps = useMemo<Step[]>(() => {
    if (!tour || !myGroup) return [];
    const out: Step[] = [];
    for (let d = 0; d < MAYHEM_GROUP_DAYS; d++) {
      const m = myGroup.matches.slice(d * 2, d * 2 + 2).find((x) => x.a === mine || x.b === mine);
      if (m) out.push({ kind: "group", index: d, match: m, game: 0 });
    }
    tour.rounds.forEach((r, ri) => {
      const m = r.find((x) => x.a === mine || x.b === mine);
      m?.games.forEach((_, gi) => out.push({ kind: "bracket", index: ri, match: m, game: gi }));
    });
    return out;
  }, [tour, myGroup, mine]);

  const stageName = (ri: number) => [t("Quart de finale"), t("Demi-finale"), t("Finale")][ri];
  const done = view.step >= steps.length;
  // Ce qui a été regardé se dévoile : journées de poule, puis tours de la phase finale. Rien au-dessus
  // de mon tour n'est rempli d'avance : après mon parcours, la suite se dévoile tour par tour.
  const days = done ? MAYHEM_GROUP_DAYS : Math.min(MAYHEM_GROUP_DAYS, steps.slice(0, view.step).filter((s) => s.kind === "group").length);
  const groupsDone = days >= MAYHEM_GROUP_DAYS;
  const roundShown = (ri: number) => {
    const idx = steps.map((s, i) => (s.kind === "bracket" && s.index === ri ? i : -1)).filter((i) => i >= 0);
    return idx.length > 0 && idx[idx.length - 1] < view.step;
  };
  // Le tournoi avance avec moi : un tour se remplit quand j'ai joué (ou passé) mon match du tour d'avant
  // Mon parcours fini (éliminé ou champion), le tournoi se met à jour tout seul jusqu'au bout
  const finished = done;
  const shown = finished ? 3 : [0, 1, 2].filter(roundShown).length;
  const known = groupsDone ? Math.min(3, shown + 1) : 0;
  const revealed = (ri: number) => ri < shown;

  const stepLabel = (s: Step) => {
    if (s.kind === "group") return t("Poule {g} · journée {n}", { g: myGroup!.name, n: s.index + 1 });
    const before = s.match.games.slice(0, s.game);
    const w = [before.filter((g) => g.winner === s.match.a).length, before.filter((g) => g.winner === s.match.b).length];
    return `${stageName(s.index)} · Bo${s.match.bo}` + (s.match.bo > 1 ? ` · ${t("partie {n}", { n: s.game + 1 })} · ${w[0]}–${w[1]}` : "");
  };
  const nextLabel = (cur: Step | undefined, nxt: Step) => {
    if (cur && cur.kind === "bracket" && nxt.kind === "bracket" && cur.index === nxt.index) return t("Partie suivante");
    if (nxt.kind === "group") return t("Journée suivante");
    if (cur?.kind === "group") return t("Phase finale : {stage}", { stage: stageName(nxt.index).toLowerCase() });
    return t("Match suivant : {stage}", { stage: stageName(nxt.index).toLowerCase() });
  };

  const shell = (children: ReactNode) => (
    <div className="relative flex flex-col min-h-[calc(100svh-var(--header-h,85px))] lg:h-[calc(100svh-var(--header-h,85px))] lg:overflow-hidden" style={{ background: "radial-gradient(1100px 640px at 50% 52%, color-mix(in srgb, var(--acc) 12%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar game={round.game} sub={modeSub(t, flow, groupSize)} counterLabel={t("Note")} counter={pub.rating.rating || "–"} onQuit={flow.onQuit} />
      {children}
    </div>
  );

  if (!pub.locked && !pub.crest) return shell(<CrestPicker busy={busy} onConfirm={(id, name) => send({ type: "crest", id, name })} />);

  if (!pub.locked) return shell(<Draft pub={pub} busy={busy} rolling={rolling} onPick={(i) => send({ type: "pick", index: i }, true)} onReroll={() => send({ type: "reroll" }, true)} onLock={() => send({ type: "lock" })} />);

  if (!tour || !myGroup)
    return shell(
      <div className="flex flex-col items-center gap-5 py-16 gutter text-center">
        <h1 className="m-0 font-d font-bold text-[40px] uppercase">
          {t("En attente du")} <span className="text-acc">{t("groupe")}</span>
        </h1>
        <p className="m-0 max-w-[520px] text-mut">{t("Ton équipe est validée. Le tournoi démarre dès que tout le groupe a validé la sienne.")}</p>
        <ul className="m-0 p-0 list-none flex flex-col gap-2 w-[min(100%,420px)]">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 h-12 px-4 bg-surf cut-sm">
              <strong>{m.userId === myId ? t("Toi") : (names[m.userId] ?? "…")}</strong>
              <span className="text-sm font-bold" style={{ color: m.locked ? "var(--ok)" : "var(--mut)" }}>
                {m.locked ? t("Équipe validée") : m.gone ? t("A quitté") : t("Draft en cours…")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );

  const wins = mayhemWins(tour, mine);
  const qualified = myGroup.standings.slice(0, 2).includes(mine);
  const finalWins = tour.rounds.flat().filter((m) => m.winner === mine).length;
  const place = tour.champion === mine ? t("Champion") : !qualified ? t("Phase de poules") : finalWins === 2 ? t("Finaliste") : finalWins === 1 ? t("Demi-finale") : t("Quart de finale");

  // Match d'autres équipes, lancé depuis les poules ou l'arbre
  if (spec) {
    const last = spec.game >= spec.match.games.length - 1;
    const back = () => setSpec(null);
    return shell(
      <Broadcast
        key={spec.key + spec.game}
        tour={tour}
        game={spec.match.games[spec.game]}
        mine={mine}
        names={names}
        myId={myId}
        stage={spec.label + (spec.match.bo > 1 ? ` · ${t("partie {n}", { n: spec.game + 1 })}` : "")}
        autoReturn={last}
        next={last ? { label: t("Retour au tournoi"), go: back } : { label: t("Partie suivante"), go: () => setSpec({ ...spec, game: spec.game + 1 }) }}
        overview={{ label: t("Retour au tournoi"), go: back }}
      />
    );
  }

  // Retransmission d'une partie
  if (view.watching && !done) {
    const cur = steps[view.step];
    const nxt = steps[view.step + 1];
    return shell(
      <Broadcast
        key={view.step}
        tour={tour}
        game={cur.match.games[cur.game]}
        mine={mine}
        names={names}
        myId={myId}
        stage={stepLabel(cur)}
        autoReturn={!(nxt && nxt.kind === "bracket" && cur.kind === "bracket" && nxt.index === cur.index)}
        next={nxt ? { label: nextLabel(cur, nxt), go: () => setView({ step: view.step + 1, watching: true }) } : { label: t("Voir les résultats du tournoi"), go: () => setView({ step: view.step + 1, watching: false }) }}
        overview={{
          label: cur.kind === "group" ? t("Voir les poules") : t("Voir l’arbre du tournoi"),
          go: () => {
            setTab(cur.kind === "group" ? "groups" : "bracket");
            setView({ step: view.step + 1, watching: false });
          }
        }}
      />
    );
  }

  // Vue d'ensemble : poules puis arbre, et mon parcours
  const next = steps[view.step];
  // Passer la phase en cours seulement (les poules, ou le tour de l'arbre où j'en suis), puis continuer
  const skipPhase = () => {
    if (!next) return;
    const after = steps.findIndex((s, i) => i > view.step && (next.kind === "group" ? s.kind === "bracket" : s.kind === "bracket" && s.index > next.index));
    const step = after < 0 ? steps.length : after;
    setView({ step, watching: false });
    setTab(steps[step]?.kind === "group" ? "groups" : step >= steps.length && !myGroup.standings.slice(0, 2).includes(mine) ? "groups" : "bracket");
  };
  // Pendant mon parcours, seul mon prochain match se regarde ; une fois le tournoi complet dévoilé, tous
  const canWatch = (ri: number, mi: number) => {
    const m = tour.rounds[ri][mi];
    return finished || ((m.a === mine || m.b === mine) && !revealed(ri) && next?.kind === "bracket" && next.index === ri);
  };
  const watchBracket = (ri: number, mi: number) => {
    const m = tour.rounds[ri][mi];
    if (!finished) return setView({ step: view.step, watching: true });
    setSpec({ key: `b${ri}-${mi}`, match: m, game: 0, label: `${stageName(ri)} · Bo${m.bo}` });
  };
  const shownTab = tab ?? (done ? (qualified ? "bracket" : "groups") : next?.kind === "group" ? "groups" : "bracket");
  const myMatch = (ri: number) => tour.rounds[ri].find((x) => x.a === mine || x.b === mine);
  const opponentOf = (m: MayhemMatch) => entrantName(t, tour.entrants[m.a === mine ? m.b : m.a], names, myId);
  const rec = groupRecord(myGroup, mine, days);
  const rank = myGroup.standings.indexOf(mine) + 1;
  const path: { title: string; detail: string; state: "won" | "lost" | "todo" }[] = [
    {
      title: t("Poule {g}", { g: myGroup.name }),
      detail: groupsDone ? t("{w}–{l} · {rank}ᵉ de la poule", { w: rec.wins, l: rec.losses, rank }) : days > 0 ? t("{w}–{l} après {n} journée(s)", { w: rec.wins, l: rec.losses, n: days }) : t("3 matchs en Bo1"),
      state: groupsDone ? (qualified ? "won" : "lost") : "todo"
    },
    ...[0, 1, 2].map((ri) => {
      const m = myMatch(ri);
      const reached = ri < known && !!m;
      const seen = !!m && (ri < shown || (m.a === mine || m.b === mine ? roundShown(ri) : false));
      return {
        title: stageName(ri),
        detail: done && !m ? t("Pas qualifié") : !groupsDone || ri >= known ? t("Si tu passes le tour précédent") : !m ? t("Pas qualifié") : seen ? t("{score} contre {team}", { score: `${m.a === mine ? m.wins[0] : m.wins[1]}–${m.a === mine ? m.wins[1] : m.wins[0]}`, team: opponentOf(m) }) : t("Contre {team}", { team: opponentOf(m) }),
        state: (seen ? (m!.winner === mine ? "won" : "lost") : reached ? "todo" : "todo") as "won" | "lost" | "todo"
      };
    })
  ];

  return shell(
    <>
      <div className="flex-1 min-h-0 grid gap-5 pt-3 pb-4 gutter grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] max-lg:overflow-y-auto">
        <section aria-label={t("Tournoi")} className="min-h-0 flex flex-col gap-3">
          <div role="tablist" aria-label={t("Phase du tournoi")} className="shrink-0 flex gap-1.5">
            {(["groups", "bracket"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={shownTab === k} onClick={() => setTab(k)} className="h-11 px-5 border-0 para cursor-pointer font-d font-bold text-sm tracking-[0.04em] uppercase" style={{ background: shownTab === k ? "var(--acc)" : "var(--surf2)", color: shownTab === k ? "var(--on-acc)" : "var(--ink)" }}>
                {k === "groups" ? t("Phase de poules") : t("Phase finale")}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0">{shownTab === "groups" ? <Groups tour={tour} mine={mine} names={names} myId={myId} days={days} /> : <Bracket tour={tour} mine={mine} names={names} myId={myId} known={known} revealed={revealed} canWatch={canWatch} onWatch={watchBracket} />}</div>
        </section>
        <aside aria-label={t("Ton parcours")} className="min-h-0 flex flex-col">
          <div className="p-[1.5px] bg-acc cut-md">
            <div className="flex flex-col gap-3.5 p-5 bg-surf cut-md">
              <span className="label !text-acc">{t("Ton parcours")}</span>
              <ol className="m-0 p-0 list-none flex flex-col gap-2.5">
                {path.map((p, i) => (
                  <li key={i} className="flex gap-3 items-start">
                    <span className="basis-7 shrink-0 h-7 flex items-center justify-center cut-sm font-d font-bold text-sm" style={{ background: p.state === "won" ? "var(--acc)" : p.state === "lost" ? "var(--danger)" : "var(--surf2)", color: p.state === "won" ? "var(--on-acc)" : p.state === "lost" ? "#FFFFFF" : "var(--mut)" }}>
                      {i + 1}
                    </span>
                    <span className="flex flex-col">
                      <strong className="text-[15px]">{p.title}</strong>
                      <span className="text-[13px] text-mut">{p.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {!done && next ? (
                <button type="button" onClick={() => setView({ step: view.step, watching: true })} className="h-[52px] border-0 para bg-acc text-on-acc cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
                  {t("Regarder : {stage}", { stage: next.kind === "group" ? t("journée {n}", { n: next.index + 1 }) : stageName(next.index).toLowerCase() })}
                </button>
              ) : (
                <>
                  <span className="font-d font-bold text-2xl">{tour.champion === mine ? t("Champion du World Mayhem !") : t("Éliminé : {place}", { place: place.toLowerCase() })}</span>
                  <span className="text-[13px] text-mut text-center">{t("Clique un match de l’arbre pour le regarder.")}</span>
                  <button type="button" onClick={() => send({ type: "done" })} disabled={busy || round.over} className="h-[52px] border-0 para bg-acc text-on-acc cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
                    {t("Voir les résultats")}
                  </button>
                </>
              )}
              {!done && next && (
                <button type="button" className="tl self-center min-h-11 text-sm" onClick={skipPhase}>
                  {next.kind === "group" ? t("Passer la phase de poules") : t("Passer le match : {stage}", { stage: stageName(next.index).toLowerCase() })}
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
      {round.over && (
        <EndDialog
          flow={flow}
          label={`${t("World Mayhem")} · ${t("classique")} · ${flow.multi ? t("groupe") : t("solo")}`}
          title={
            tour.champion === mine ? (
              <>
                {t("Champion du")} <span className="text-acc">{t("World Mayhem")}</span>
              </>
            ) : (
              <>
                {t("Éliminé :")} <span className="text-acc">{place.toLowerCase()}</span>
              </>
            )
          }
          stats={[
            { v: pub.rating.rating, l: t("Note d’équipe"), acc: true },
            { v: wins, l: t("Victoires") },
            { v: pub.rating.rating + 2 * wins, l: t("Score du jour") }
          ]}
        />
      )}
    </>
  );
}
