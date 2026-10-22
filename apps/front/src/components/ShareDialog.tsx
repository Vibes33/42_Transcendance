import { useQueries } from "@tanstack/react-query";
import { useState } from "react";
import type { DailyState, RoundState } from "@loltr/shared";
import { get } from "../api/client";
import { keys } from "../api/queries";
import { fmt, useLang, useT } from "../i18n";
import { CARD_BY_KEY } from "../lib/games";
import { CloseBtn, Dialog } from "./ui";

// Carte de résultat sans spoiler, façon Wordle : grille d'indices du Champion du jour et bilan des
// autres jeux, à copier ou à enregistrer en image pour Discord et X.

const SQ: Record<string, string> = { g: "🟩", p: "🟨", r: "🟥", u: "🔼", d: "🔽" };
const COLOR: Record<string, string> = { g: "#2E9C68", p: "#C9821F", r: "#B8443C", u: "#B8443C", d: "#B8443C" };

export function ShareDialog({ daily, onClose }: { daily: DailyState; onClose: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [copied, setCopied] = useState(false);
  const rounds = useQueries({
    queries: daily.games.map((g) => ({ queryKey: keys.round(g.roundId ?? ""), queryFn: () => get<RoundState<any>>(`/api/jeux/rounds/${g.roundId}`), enabled: !!g.roundId }))
  });
  const byGame = Object.fromEntries(daily.games.map((g, i) => [g.key, rounds[i]?.data]));
  const cdj = byGame.cdj?.public as { guesses: { codes: string[] }[]; found: boolean } | undefined;
  const grid = (cdj?.guesses ?? []).slice(-6).map((g) => g.codes);

  const line = (key: string): string => {
    const r = byGame[key];
    const p = r?.public as any;
    if (!r || !p) return "—";
    if (key === "cdj") return p.found ? t("trouvé en {n}", { n: p.tries }) : t("raté ({n} essais)", { n: p.tries });
    if (key === "meli") return t("{n} champions", { n: p.champions });
    if (key === "se") return t("{n} sorts", { n: p.correct });
    if (key === "splash") return (p.found ? t("trouvé en {n}", { n: p.misses.length + 1 }) : t("raté")) + (p.skinPick !== null && p.found ? " · skin" : "");
    return "";
  };

  const dateLabel = new Date(daily.day + "T12:00:00").toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "long" });
  const text = [
    t("LolTR · défi du {date}", { date: dateLabel }),
    ...grid.map((row) => row.map((c) => SQ[c]).join("")),
    ...daily.games.map((g) => `${g.done ? "✅" : "⬜"} ${t(CARD_BY_KEY[g.key].name)} : ${line(g.key)}`),
    t("{n} points prévisionnels", { n: fmt(daily.projectedTotal) }),
    location.origin
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const download = () => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 630;
    const x = c.getContext("2d")!;
    const css = getComputedStyle(document.documentElement);
    const acc = css.getPropertyValue("--acc").trim() || "#A195FF";
    x.fillStyle = "#0F1115";
    x.fillRect(0, 0, 1200, 630);
    const grad = x.createRadialGradient(900, 300, 20, 900, 300, 520);
    grad.addColorStop(0, acc + "55");
    grad.addColorStop(1, "transparent");
    x.fillStyle = grad;
    x.fillRect(0, 0, 1200, 630);
    x.fillStyle = "#EEF0F3";
    x.font = "700 56px 'Chakra Petch', sans-serif";
    x.fillText("LolTR", 70, 110);
    x.fillStyle = acc;
    x.font = "700 30px 'Chakra Petch', sans-serif";
    x.fillText(t("Défi du {date}", { date: dateLabel }).toUpperCase(), 70, 160);
    grid.forEach((row, i) =>
      row.forEach((code, j) => {
        x.fillStyle = COLOR[code];
        x.fillRect(70 + j * 58, 200 + i * 58, 50, 50);
      })
    );
    x.font = "600 28px 'Manrope', sans-serif";
    daily.games.forEach((g, i) => {
      x.fillStyle = g.done ? "#EEF0F3" : "#A9B0BC";
      x.fillText(`${t(CARD_BY_KEY[g.key].name)} : ${line(g.key)}`, 560, 230 + i * 62);
    });
    x.fillStyle = acc;
    x.font = "700 40px 'Chakra Petch', sans-serif";
    x.fillText(t("{n} points", { n: fmt(daily.projectedTotal) }), 560, 520);
    x.fillStyle = "#A9B0BC";
    x.font = "500 22px 'Manrope', sans-serif";
    x.fillText(location.host, 70, 580);
    c.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `loltr-${daily.day}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  };

  return (
    <Dialog labelledBy="titre-partage" width={520} onClose={onClose}>
      <CloseBtn onClick={onClose} label={t("Fermer")} className="absolute top-3.5 right-3.5" />
      <h2 id="titre-partage" className="m-0 font-d font-bold text-[28px] uppercase">
        {t("Partager mon")} <span className="text-acc">{t("résultat")}</span>
      </h2>
      <p className="m-0 text-sm text-mut">{t("Sans spoiler : seules les couleurs de tes essais apparaissent.")}</p>
      <pre className="w-full box-border m-0 p-4 bg-surf2 cut-sm text-left text-[15px] leading-[1.5] whitespace-pre-wrap font-b">{text}</pre>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={copy} className="h-[50px] px-8 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
          {copied ? t("Copié !") : t("Copier le texte")}
        </button>
        <button type="button" onClick={download} className="h-[50px] px-8 border-0 bg-surf2 text-ink para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
          {t("Enregistrer l’image")}
        </button>
      </div>
    </Dialog>
  );
}
