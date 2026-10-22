import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CHIBI_BY_KEY, LITE_BY_ID, RANDOM_ART } from "@loltr/content/lite";
import type { GameKey } from "@loltr/shared";
import { useRound } from "../api/queries";
import { ChibiView } from "../components/ChibiView";
import { ShareDialog } from "../components/ShareDialog";
import { SITE_TOUR, Tutorial, markTutorial } from "../components/Tutorial";
import { fmt, plural, useT } from "../i18n";
import { skinLabel } from "../lib/chibi";
import { CARD_BY_KEY } from "../lib/games";
import { partieUrl, startDefiSolo, startGroup } from "../lib/play";
import { hoursMinutes, localTime, useNow } from "../lib/time";
import { useMe } from "../state/app";
import { useLang } from "../i18n";
import { useLive } from "../state/live";

// Accueil : la rotation du jour (Champion du jour + 3 jeux), les boutons solo et groupe, et le
// chibi équipé en grand. Une fois le défi terminé : le champion du jour et le partage du résultat.

const LIT = "brightness(1) drop-shadow(0 0 26px color-mix(in srgb, var(--acc) 45%, transparent))";

export function Accueil() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const nav = useNavigate();
  const me = useMe();
  const now = useNow(30_000);
  const session = useLive((s) => s.session);
  const [share, setShare] = useState(false);
  const daily = me.daily;
  const cdjRound = useRound(daily?.games.find((g) => g.key === "cdj")?.roundId ?? null);
  const namesLang = me.profile?.namesLang ?? lang;

  const done = daily?.status === "done" || daily?.status === "closed";
  const started = !!daily && daily.games.some((g) => g.done || g.roundId);
  const dayChamp = daily?.cdjChampion ? LITE_BY_ID[daily.cdjChampion] : null;
  const dayChibi = daily?.cdjChampion ? CHIBI_BY_KEY[daily.cdjChampion] : null;
  const found = !!daily?.cdjFound;
  const showTour = me.isUser && me.profile?.onboarded && !me.profile.tutorials?.site;

  // Héros : chibi équipé ; en aléatoire, le chibi du champion du jour une fois trouvé
  const random = me.random;
  const heroCut = !random ? (me.skin?.cut ?? null) : found && dayChibi ? dayChibi.skins[0].cut : null;
  const heroArt = !random ? (me.skin?.art ?? RANDOM_ART) : found && dayChibi ? dayChibi.skins[0].art : RANDOM_ART;
  const model3d = !random && me.profile ? (CHIBI_BY_KEY[me.profile.chibi]?.model3d ?? null) : null;
  const heroPlate = !random && me.skin && me.profile ? skinLabel(CHIBI_BY_KEY[me.profile.chibi], me.skin, lang) : found && dayChamp ? dayChamp.names[namesLang] : t("Chibi aléatoire");
  const heroSub = !random ? t("Ton chibi") : found && dayChamp ? dayChamp.titles[namesLang] : t("Change à chaque visite");

  const nextIdx = daily?.games.findIndex((g) => !g.done) ?? 0;
  const cdjTries = (cdjRound.data?.public as { tries?: number } | undefined)?.tries;
  const groupSession = session && session.kind === "group" && session.context === "defi" && session.phase !== "done" ? session : null;

  const solo = () => {
    if (me.inGroup) return;
    startDefiSolo(nav, daily?.status);
  };
  const group = () => {
    if (groupSession) return nav(partieUrl("defi", groupSession.games[groupSession.index], groupSession.id));
    startGroup(nav, { isUser: me.isUser, inGroup: me.inGroup, mates: me.mates.filter((m) => m.status === "member").length, context: "defi", dailyMode: daily?.mode });
  };

  return (
    <div className="relative flex-auto flex flex-col">
      <main className="flex-auto w-full max-w-[1760px] mx-auto min-h-[calc(100vh-85px)] box-border flex flex-wrap items-center justify-center gap-x-24 gap-y-8 pt-7 pb-9 gutter">
        <div className="flex-[1_1_460px] min-w-0">
          {!done ? (
            <div className="flex flex-col items-start gap-[22px]" style={{ width: "min(100%, 620px)" }}>
              <div className="text-xl font-medium text-mut">{t("Rotation du jour")}</div>
              <h1 className="m-0 font-d font-bold leading-[0.98] tracking-[-0.01em]" style={{ fontSize: "clamp(40px, 5vw, 72px)" }}>
                {t("4 jeux,")}
                <br />
                <span className="text-acc">{t("un seul défi")}</span>
              </h1>
              <p className="m-0 max-w-[560px] text-[16.5px] leading-relaxed text-mut">
                {t("Enchaîne les quatre jeux du jour d’une traite, seul ou en équipe avec tes amis. La rotation change chaque jour à {time}.", { time: daily ? localTime(daily.nextRotationAt) : "3:00" })}
              </p>
              <ol aria-label={t("Les 4 jeux de la rotation, dans l’ordre")} className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 gap-2.5 self-stretch" data-tuto="rotation">
                {(daily?.games ?? []).map((g, i) => {
                  const card = CARD_BY_KEY[g.key];
                  const isCdj = g.key === "cdj";
                  const img = isCdj ? (found && dayChibi ? dayChibi.skins[0].art : RANDOM_ART) : card.img;
                  return (
                    <li key={g.key} className="flex items-center gap-3 py-2 pr-3.5 pl-2 cut-sm" style={{ background: started && i === nextIdx ? "color-mix(in srgb, var(--acc) 16%, var(--surf))" : "var(--surf)" }}>
                      <span className="basis-[30px] shrink-0 h-[30px] flex items-center justify-center bg-acc text-on-acc cut-sm font-d font-bold text-[15px]">{i + 1}</span>
                      <span className="basis-12 shrink-0 h-12 overflow-hidden bg-surf2 cut-sm">
                        <img src={img} alt="" className="block w-full h-full object-cover" style={{ filter: isCdj && !g.done ? "grayscale(1) brightness(0.35) blur(3px)" : "none" }} />
                      </span>
                      <span className="min-w-0 flex flex-col gap-0.5 text-left">
                        <span className="font-d font-bold text-base">{t(card.name)}</span>
                        <span className="text-[12.5px] text-mut">{isCdj && g.done && dayChamp ? t("Trouvé : {name}", { name: dayChamp.names[namesLang] }) : t(card.short ?? card.tags)}</span>
                      </span>
                      {g.done && <span className="ml-auto font-d font-bold text-sm text-ok">✓ +{g.projected}</span>}
                    </li>
                  );
                })}
              </ol>
              <div className="flex flex-wrap justify-center gap-x-[18px] gap-y-3 self-stretch" data-tuto="play">
                <span className="tipw">
                  <button
                    type="button"
                    onClick={solo}
                    aria-disabled={me.inGroup}
                    aria-describedby="tip-solo-accueil"
                    className="h-14 px-10 border-0 para font-d font-bold text-base tracking-[0.05em] uppercase"
                    style={{ background: me.inGroup ? "var(--surf2)" : "var(--acc)", color: me.inGroup ? "var(--mut)" : "var(--on-acc)", cursor: me.inGroup ? "not-allowed" : "pointer" }}
                  >
                    {started ? t("Continuer en solo") : t("Jouer en solo")}
                  </button>
                  {me.inGroup && (
                    <span role="tooltip" id="tip-solo-accueil" className="tip">
                      {t("Tu es dans un groupe : tu ne peux pas rejoindre une partie solo. Quitte le groupe pour jouer seul.")}
                    </span>
                  )}
                </span>
                <button type="button" onClick={group} className="relative h-14 px-10 border-0 bg-ink text-ink para cursor-pointer font-d font-bold text-base tracking-[0.05em] uppercase">
                  <span aria-hidden="true" className="absolute inset-[2px] para" style={{ background: me.inGroup ? "color-mix(in srgb, var(--acc) 18%, var(--surf))" : "var(--surf)" }} />
                  <span className="relative">{started ? t("Continuer avec des amis") : t("Jouer avec des amis")}</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-x-10 gap-y-4 pt-[22px] border-t border-line self-stretch">
                <Stat label={t("Série en cours")} value={t("{n} " + plural(me.streak, "jour", "jours"), { n: me.streak })} />
                <Stat label={t("Points du jour")} value={fmt(daily?.projectedTotal ?? 0)} hint={t("prévisionnels")} />
                <Stat label={t("Nouvelle rotation dans")} value={daily ? hoursMinutes(daily.nextRotationAt - now) : "—"} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-[26px]">
              <div className="text-[22px] font-medium text-mut">{found ? t("Défi du jour réussi") : t("Défi du jour terminé")}</div>
              <h1 className="m-0 font-d font-bold leading-[0.98] tracking-[-0.01em]" style={{ fontSize: "clamp(44px, 6.2vw, 92px)" }}>
                {found ? t("Bien joué,") : t("Pas cette fois,")}
                <br />
                {t("c’était")} <span className="text-acc">{dayChamp?.names[namesLang] ?? "…"}</span>
              </h1>
              <p className="m-0 max-w-[540px] text-[17px] leading-[1.65] text-mut">
                {found
                  ? t("Tu as démasqué {name}, {title}. Tes points sont prévisionnels : le bonus de classement est définitif à {time}.", { name: dayChamp?.names[namesLang] ?? "", title: dayChamp?.titles[namesLang] ?? "", time: daily ? localTime(daily.nextRotationAt) : "3:00" })
                  : t("{name}, {title}, t’a échappé aujourd’hui. Nouveau défi à {time}.", { name: dayChamp?.names[namesLang] ?? "", title: dayChamp?.titles[namesLang] ?? "", time: daily ? localTime(daily.nextRotationAt) : "3:00" })}
              </p>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                <button type="button" onClick={() => nav("/jeux")} className="h-14 px-11 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-[17px] tracking-[0.05em] uppercase">
                  {t("Jouer aux mini-jeux")}
                </button>
                <button type="button" className="tl min-h-14 text-[17px]" onClick={() => setShare(true)}>
                  {t("Partager mon résultat")}
                </button>
              </div>
              {(me.classement?.today.unlocks.length ?? 0) > 0 && (
                <div role="status" className="flex flex-wrap items-center gap-2.5 py-2.5 pl-3 pr-4 cut-sm" style={{ background: "color-mix(in srgb, var(--acc) 16%, var(--surf))" }}>
                  <span className="label !text-acc">{t("Débloqué aujourd’hui")}</span>
                  {me.classement!.today.unlocks.map((i) => (
                    <span key={i} className="font-d font-bold text-base">
                      {t(CARD_BY_KEY[i.slice(5) as GameKey]?.name ?? i)}
                    </span>
                  ))}
                  <span className="text-[13.5px] text-mut">{t("jouable sans limite en mode classique")}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-x-10 gap-y-4 pt-[22px] border-t border-line">
                <Stat label={found ? t("Trouvé en") : t("Essais")} value={cdjTries !== undefined ? t("{n} " + plural(cdjTries, "essai", "essais"), { n: cdjTries }) : "—"} />
                <Stat label={t("Points du jour")} value={"+" + fmt(daily?.projectedTotal ?? 0)} accent />
                <Stat label={t("Série en cours")} value={t("{n} " + plural(me.streak, "jour", "jours"), { n: me.streak })} />
                <Stat label={t("Nouvelle rotation dans")} value={daily ? hoursMinutes(daily.nextRotationAt - now) : "—"} />
              </div>
            </div>
          )}
        </div>

        <div className="flex-[1_1_380px] min-w-0 flex justify-center">
          <div className="relative h-[620px] max-sm:h-[480px]" style={{ width: "min(100%, 520px)" }}>
            <div aria-hidden="true" className="absolute -left-[45%] -right-[45%] -top-1/4 -bottom-1/4 pointer-events-none" style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--acc) 30%, transparent), transparent)" }} />
            <div className="absolute inset-x-0 top-[70px] bottom-[70px] bg-acc cut-lg">
              <div className="absolute inset-[2px] cut-lg overflow-hidden" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--acc) 22%, var(--surf)), var(--surf))" }}>
                <img src={heroArt} alt="" className="block w-full h-full object-cover opacity-90" style={{ filter: heroCut || model3d ? "blur(10px) saturate(1.1)" : "none", transform: "scale(1.12)", transition: "opacity .9s ease" }} />
              </div>
            </div>
            <ChibiView
              img={heroCut}
              model3d={model3d}
              alt={heroPlate}
              className="absolute -top-14 left-0 w-full h-[610px] max-sm:h-[460px] object-contain"
              style={{ objectPosition: "50% 100%", filter: LIT, transition: "opacity .7s ease, transform .7s ease" }}
            />
            <div className="absolute left-5 bottom-[30px] p-[1.5px] bg-acc cut-sm">
              <div className="flex flex-col gap-0.5 px-[22px] py-3 bg-surf cut-sm">
                <span className="font-d font-bold text-[22px] text-acc">{heroPlate}</span>
                <span className="text-sm text-mut">{heroSub}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
      {share && daily && <ShareDialog daily={daily} onClose={() => setShare(false)} />}
      {showTour && <Tutorial steps={SITE_TOUR} onDone={() => markTutorial("site")} />}
    </div>
  );
}

function Stat({ label, value, accent, hint }: { label: string; value: string; accent?: boolean; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <span className={`font-d font-bold text-[26px] ${accent ? "text-acc" : ""}`}>
        {value}
        {hint && <span className="ml-2 font-b font-medium text-[13px] text-mut normal-case">{hint}</span>}
      </span>
    </div>
  );
}

