import { useState } from "react";
import type { FriendEntry } from "@loltr/shared";
import { del, post } from "../api/client";
import { keys, useFriends, useInvalidate } from "../api/queries";
import { useT } from "../i18n";
import { avatarOf } from "../lib/chibi";
import { useMe } from "../state/app";
import { useLive } from "../state/live";
import { useUi } from "../state/ui";
import { Crown, Close } from "./icons";
import { CloseBtn } from "./ui";

// Tiroir d'amis façon client de jeu : groupe (6 joueurs), amis en ligne puis hors ligne,
// demandes d'ami (à accepter), blocage et signalement, ajout par pseudo ou pseudo#tag.

const DOT: Record<string, string> = { online: "var(--ok)", game: "var(--warn)", away: "var(--warn)" };

function ago(t: (s: string, p?: Record<string, string | number>) => string, at: number | null) {
  if (!at) return t("Hors ligne");
  const m = Math.round((Date.now() - at) / 60_000);
  if (m < 60) return t("Vu il y a {n} min", { n: Math.max(1, m) });
  const h = Math.round(m / 60);
  if (h < 48) return t("Vu il y a {n} h", { n: h });
  return t("Vu il y a {n} j", { n: Math.round(h / 24) });
}

export function FriendsDrawer() {
  const t = useT();
  const ui = useUi();
  const me = useMe();
  const invalidate = useInvalidate();
  const friends = useFriends(me.isUser);
  const presence = useLive((s) => s.presence);
  const [addQ, setAddQ] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [reporting, setReporting] = useState<FriendEntry | null>(null);

  const run = async (fn: () => Promise<unknown>, after?: string) => {
    try {
      await fn();
      if (after) setMsg({ text: after, ok: true });
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    } finally {
      await invalidate(keys.friends, keys.group);
    }
  };

  const list = (friends.data?.friends ?? []).map((f) => ({ ...f, presence: presence[f.userId]?.state ?? f.presence, note: presence[f.userId]?.note ?? f.note }));
  const isOn = (f: FriendEntry) => f.presence !== "offline";
  const online = list.filter(isOn);
  const offline = list.filter((f) => !isOn(f));
  const group = me.group;
  const myId = me.profile?.userId;
  const isLeader = group?.leader === myId;
  const inGroupIds = new Set(group?.members.map((m) => m.userId) ?? []);
  const requests = friends.data?.requests ?? [];
  const invites = friends.data?.invites ?? [];
  const full = (group?.members.length ?? 0) >= 6;

  const noteOf = (f: FriendEntry) =>
    f.presence === "online" ? f.note || t("En ligne") : f.presence === "game" ? f.note || t("En partie") : f.presence === "away" ? t("Absent") : ago(t, f.lastSeen);

  const addFriend = () => {
    const q = addQ.trim();
    if (!q) return setMsg({ text: t("Entre le pseudo d’un joueur."), ok: false });
    if (q.length < 3) return setMsg({ text: t("Un pseudo fait au moins 3 caractères."), ok: false });
    run(async () => {
      const r = await post<{ status: string; player: { pseudo: string } }>("/api/social/friends/request", { query: q });
      setAddQ("");
      setMsg({ text: r.status === "friends" ? t("{name} est maintenant ton ami.", { name: r.player.pseudo }) : t("Demande envoyée à {name}.", { name: r.player.pseudo }), ok: true });
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div onClick={() => ui.setFriends(false)} aria-hidden="true" className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--bg) 35%, transparent)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }} />
      <aside
        className="drawer relative h-full box-border flex flex-col bg-surf border-l border-line"
        style={{ width: "min(100%, 400px)", boxShadow: "-24px 0 60px rgba(0,0,0,.35)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-amis"
        onKeyDown={(e) => e.key === "Escape" && ui.setFriends(false)}
      >
        <div className="flex items-start justify-between gap-3 px-[22px] pt-[22px] pb-4">
          <div className="flex flex-col gap-0.5">
            <h2 id="titre-amis" className="m-0 font-d font-bold text-[26px] tracking-[0.02em] uppercase">
              {t("Amis")}
            </h2>
            <span className="text-[13.5px] text-mut">{t("{on} en ligne · {n} amis", { on: online.length, n: list.length })}</span>
          </div>
          <CloseBtn onClick={() => ui.setFriends(false)} label={t("Fermer la liste d’amis")} />
        </div>

        <div className="flex-auto min-h-0 overflow-y-auto scroll flex flex-col gap-5 px-[22px] pt-0.5 pb-[26px]">
          {invites.length > 0 && (
            <section aria-labelledby="titre-invit" className="flex flex-col gap-1.5">
              <span id="titre-invit" className="text-[12.5px] font-bold tracking-[0.08em] uppercase text-mut pb-0.5">
                {t("Invitations de groupe")}
              </span>
              {invites.map((i) => (
                <div key={i.groupId} className="flex items-center gap-2.5 py-[7px] pr-2 pl-1.5 bg-surf2 cut-sm">
                  <span className="basis-[38px] shrink-0 h-[38px] overflow-hidden cut-sm bg-surf">
                    <img src={avatarOf(i.from)} alt="" className="block w-full h-full object-cover" />
                  </span>
                  <span className="flex-auto min-w-0 flex flex-col gap-px">
                    <span className="font-bold text-[14.5px]">{i.from.pseudo}</span>
                    <span className="text-[12.5px] text-mut">{t("T’invite dans son groupe")}</span>
                  </span>
                  <SmallBtn acc onClick={() => run(() => post("/api/social/group/accept", { groupId: i.groupId }))}>
                    {t("Rejoindre")}
                  </SmallBtn>
                  <SmallBtn onClick={() => run(() => post("/api/social/group/decline", { groupId: i.groupId }))}>{t("Refuser")}</SmallBtn>
                </div>
              ))}
            </section>
          )}

          <section aria-label={t("Groupe")} className="p-[1.5px] cut-md" style={{ background: group ? "var(--acc)" : "var(--line)" }}>
            <div className="flex flex-col gap-2.5 p-4 bg-surf2 cut-md">
              {!group ? (
                <>
                  <span className="font-d font-bold text-lg uppercase">{t("Groupe")}</span>
                  <span className="text-sm leading-normal text-mut">{t("Crée un groupe pour faire le défi du jour ou les jeux classiques en coop, jusqu’à 6 joueurs.")}</span>
                  <button
                    type="button"
                    onClick={() => run(() => post("/api/social/group"))}
                    className="self-start h-[46px] px-[30px] border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase"
                  >
                    {t("Créer un groupe")}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="font-d font-bold text-lg uppercase">
                      {t("Mon groupe")} <span className="text-acc">{group.members.filter((m) => m.status === "member").length}/6</span>
                    </span>
                    <SmallBtn surf onClick={() => run(() => post("/api/social/group/leave"))}>
                      {t("Quitter")}
                    </SmallBtn>
                  </div>
                  <div role="list" className="flex flex-col gap-1.5">
                    {[...group.members].sort((a, b) => Number(b.userId === myId) - Number(a.userId === myId)).map((m) => {
                      const mine = m.userId === myId;
                      const invited = m.status === "invited";
                      return (
                        <div
                          role="listitem"
                          key={m.userId}
                          className="flex items-center gap-3 p-1.5 cut-sm"
                          style={{ background: mine ? "color-mix(in srgb, var(--acc) 18%, var(--surf))" : "var(--surf)", paddingRight: mine ? 10 : 6 }}
                        >
                          <span className="basis-10 shrink-0 h-10 overflow-hidden cut-sm" style={{ opacity: invited ? 0.55 : 1 }}>
                            <img src={mine ? me.meImg : avatarOf(m)} alt="" className="block w-full h-full object-cover" />
                          </span>
                          <span className="flex-auto min-w-0 flex flex-col gap-px">
                            <span className="font-bold text-[15px]">
                              {m.pseudo}
                              {mine ? " " + t("(toi)") : ""}
                            </span>
                            <span className="text-[12.5px]" style={{ color: m.leader ? "var(--acc)" : invited ? "var(--mut)" : "var(--ok)" }}>
                              {m.leader ? t("Chef du groupe") : invited ? t("Invitation envoyée…") : t("Prêt")}
                            </span>
                          </span>
                          {m.leader && <Crown className="text-acc" />}
                          {isLeader && !mine && (
                            <button
                              type="button"
                              onClick={() => run(() => post("/api/social/group/kick", { userId: m.userId }))}
                              aria-label={invited ? t("Annuler l’invitation de {name}", { name: m.pseudo }) : t("Retirer {name}", { name: m.pseudo })}
                              className="w-[34px] h-[34px] flex items-center justify-center p-0 border-0 bg-surf2 text-mut cut-sm cursor-pointer"
                            >
                              <Close size={14} w={2.6} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {group.members.length === 1 && <span className="text-[13.5px] text-mut">{t("Invite des amis en ligne avec le bouton « Inviter » ci-dessous.")}</span>}
                </>
              )}
            </div>
          </section>

          <section aria-labelledby="titre-en-ligne" className="flex flex-col gap-1">
            <span id="titre-en-ligne" className="text-[12.5px] font-bold tracking-[0.08em] uppercase text-mut pb-1">
              {t("En ligne — {n}", { n: online.length })}
            </span>
            {online
              .filter((f) => !inGroupIds.has(f.userId))
              .map((f) => (
                <FriendRow key={f.userId} f={f} note={noteOf(f)} open={menu === f.userId} onMenu={() => setMenu(menu === f.userId ? null : f.userId)} onAction={run} onReport={() => setReporting(f)}>
                  {group && !full && (
                    <SmallBtn acc onClick={() => run(() => post("/api/social/group/invite", { userId: f.userId }))} aria-label={t("Inviter {name} dans le groupe", { name: f.pseudo })}>
                      {t("Inviter")}
                    </SmallBtn>
                  )}
                </FriendRow>
              ))}
          </section>

          <section aria-labelledby="titre-hors-ligne" className="flex flex-col gap-1">
            <span id="titre-hors-ligne" className="text-[12.5px] font-bold tracking-[0.08em] uppercase text-mut pb-1">
              {t("Hors ligne — {n}", { n: offline.length })}
            </span>
            {offline.map((f) => (
              <FriendRow key={f.userId} f={f} note={noteOf(f)} open={menu === f.userId} onMenu={() => setMenu(menu === f.userId ? null : f.userId)} onAction={run} onReport={() => setReporting(f)} />
            ))}
          </section>

          {requests.length > 0 && (
            <section aria-labelledby="titre-demandes" className="flex flex-col gap-1.5">
              <span id="titre-demandes" className="text-[12.5px] font-bold tracking-[0.08em] uppercase text-mut pb-0.5">
                {t("Demandes d’ami")}
              </span>
              {requests.map((r) => (
                <div key={r.userId + r.direction} className="flex items-center gap-2.5 py-[7px] pr-2 pl-1.5 bg-surf2 cut-sm">
                  <span className="basis-[38px] shrink-0 h-[38px] overflow-hidden cut-sm bg-surf">
                    <img src={avatarOf(r)} alt="" className="block w-full h-full object-cover" />
                  </span>
                  <span className="flex-auto min-w-0 flex flex-col gap-px">
                    <span className="font-bold text-[14.5px]">{r.pseudo}</span>
                    <span className="text-[12.5px] text-mut">{r.direction === "incoming" ? t("Veut t’ajouter en ami") : t("Demande envoyée, en attente")}</span>
                  </span>
                  {r.direction === "incoming" ? (
                    <>
                      <SmallBtn acc onClick={() => run(() => post("/api/social/friends/accept", { userId: r.userId }))}>
                        {t("Accepter")}
                      </SmallBtn>
                      <SmallBtn surf onClick={() => run(() => post("/api/social/friends/decline", { userId: r.userId }))} aria-label={t("Refuser la demande de {name}", { name: r.pseudo })}>
                        {t("Refuser")}
                      </SmallBtn>
                    </>
                  ) : (
                    <SmallBtn surf onClick={() => run(() => post("/api/social/friends/cancel", { userId: r.userId }))} aria-label={t("Annuler la demande envoyée à {name}", { name: r.pseudo })}>
                      {t("Annuler")}
                    </SmallBtn>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="flex flex-col gap-2 px-[22px] pt-4 pb-[22px] border-t border-line">
          <label htmlFor="ajout-ami" className="text-[12.5px] font-bold tracking-[0.08em] uppercase text-mut">
            {t("Ajouter un ami")}
          </label>
          <div className="flex gap-2">
            <div className="fr-in flex-auto p-[1.5px] bg-line cut-sm">
              <input
                id="ajout-ami"
                type="text"
                value={addQ}
                onChange={(e) => {
                  setAddQ(e.target.value);
                  setMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addFriend();
                  }
                }}
                placeholder={t("Pseudo ou pseudo#tag")}
                autoComplete="off"
                spellCheck={false}
                maxLength={40}
                className="block w-full box-border h-[46px] px-3.5 border-0 outline-none bg-surf text-ink cut-sm font-b text-[15px] font-semibold"
              />
            </div>
            <button type="button" onClick={addFriend} className="shrink-0 h-[49px] px-[22px] border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-sm tracking-[0.05em] uppercase">
              {t("Ajouter")}
            </button>
          </div>
          {msg && (
            <span role="status" className="text-[13.5px] font-semibold" style={{ color: msg.ok ? "var(--ok)" : "var(--danger)" }}>
              {msg.text}
            </span>
          )}
          {me.tag && <span className="text-[12.5px] text-mut">{t("Ton identifiant : {id}", { id: `${me.pseudo}#${me.tag}` })}</span>}
        </div>

        {reporting && <ReportDialog friend={reporting} onClose={() => setReporting(null)} onDone={(text) => setMsg({ text, ok: true })} />}
      </aside>
    </div>
  );
}

function SmallBtn({ acc, surf, children, ...rest }: { acc?: boolean; surf?: boolean; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="h-[34px] px-3.5 border-0 cut-sm cursor-pointer font-bold text-[13px] shrink-0"
      style={{ background: acc ? "var(--acc)" : surf ? "var(--surf)" : "var(--surf2)", color: acc ? "var(--on-acc)" : "var(--ink)" }}
      {...rest}
    >
      {children}
    </button>
  );
}

function FriendRow({
  f,
  note,
  open,
  onMenu,
  onAction,
  onReport,
  children
}: {
  f: FriendEntry;
  note: string;
  open: boolean;
  onMenu: () => void;
  onAction: (fn: () => Promise<unknown>, after?: string) => void;
  onReport: () => void;
  children?: React.ReactNode;
}) {
  const t = useT();
  const on = f.presence !== "offline";
  return (
    <div className="flex flex-col">
      <div className="fr-row flex items-center gap-3 py-[7px] pr-2 pl-1.5 cut-sm">
        <span className="relative basis-[42px] shrink-0 h-[42px]">
          <span className="block w-full h-full overflow-hidden bg-surf2 cut-sm">
            <img src={avatarOf(f)} alt="" className="block w-full h-full object-cover" style={{ filter: on ? "none" : "grayscale(1) brightness(0.6)" }} />
          </span>
          <span aria-hidden="true" className="absolute -right-[3px] -bottom-[3px] w-3 h-3 box-border rounded-full border-2 border-surf" style={{ background: on ? DOT[f.presence] : "var(--line)" }} />
        </span>
        <span className="flex-auto min-w-0 flex flex-col gap-px">
          <span className="font-bold text-[15px]" style={{ color: on ? "var(--ink)" : "var(--mut)" }}>
            {f.pseudo}
          </span>
          <span className="text-[12.5px]" style={{ color: f.presence === "online" ? "var(--ok)" : "var(--mut)" }}>
            {note}
          </span>
        </span>
        {children}
        <button type="button" onClick={onMenu} aria-expanded={open} aria-label={t("Actions pour {name}", { name: f.pseudo })} className="w-[30px] h-[34px] border-0 bg-transparent text-mut cursor-pointer font-bold text-lg leading-none">
          ⋯
        </button>
      </div>
      {open && (
        <div className="flex flex-wrap gap-1.5 pl-[60px] pb-2">
          <button type="button" className="h-8 px-3 border-0 bg-surf2 text-ink cut-sm cursor-pointer text-[12.5px] font-bold" onClick={() => onAction(() => del(`/api/social/friends/${f.userId}`), t("{name} a été retiré de tes amis.", { name: f.pseudo }))}>
            {t("Retirer")}
          </button>
          <button type="button" className="h-8 px-3 border-0 bg-surf2 text-ink cut-sm cursor-pointer text-[12.5px] font-bold" onClick={() => onAction(() => post("/api/social/block", { userId: f.userId }), t("{name} est bloqué.", { name: f.pseudo }))}>
            {t("Bloquer")}
          </button>
          <button type="button" className="h-8 px-3 border-0 cut-sm cursor-pointer text-[12.5px] font-bold" style={{ background: "color-mix(in srgb, var(--danger) 18%, var(--surf2))", color: "var(--ink)" }} onClick={onReport}>
            {t("Signaler")}
          </button>
        </div>
      )}
    </div>
  );
}

function ReportDialog({ friend, onClose, onDone }: { friend: FriendEntry; onClose: () => void; onDone: (text: string) => void }) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const send = async () => {
    if (!reason.trim()) return setErr(t("Décris le problème en quelques mots."));
    try {
      await post("/api/social/report", { userId: friend.userId, reason: reason.trim() });
      onDone(t("Signalement envoyé. Merci !"));
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-5" style={{ background: "color-mix(in srgb, var(--bg) 60%, transparent)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="titre-signal" className="w-full p-[2px] bg-acc cut-md">
        <div className="flex flex-col gap-3 p-5 bg-surf cut-md">
          <h3 id="titre-signal" className="m-0 font-d font-bold text-xl uppercase">
            {t("Signaler {name}", { name: friend.pseudo })}
          </h3>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            rows={4}
            placeholder={t("Que s’est-il passé ?")}
            className="w-full box-border p-3 border border-line bg-surf2 text-ink font-b text-sm outline-none focus:border-acc resize-none"
          />
          {err && <span className="text-[13px] font-semibold text-danger">{err}</span>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="h-10 px-4 border-0 bg-surf2 text-ink para cursor-pointer font-d font-bold text-sm uppercase">
              {t("Annuler")}
            </button>
            <button type="button" onClick={send} className="h-10 px-5 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-sm uppercase">
              {t("Envoyer")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
