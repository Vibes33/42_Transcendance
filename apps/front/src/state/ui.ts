import { create } from "zustand";

// État d'interface partagé : tiroir d'amis, fenêtres, notifications.

export type LoginReason = "compte" | "profil" | "amis" | "boutique" | "classement" | "stream";
export type NeedGroup = "aucun" | "vide" | null;

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "ok" | "danger";
  action?: { label: string; run: () => void };
}

interface UiState {
  friendsOpen: boolean;
  login: LoginReason | null;
  needGroup: NeedGroup;
  toasts: Toast[];
  /** Navigation du routeur, utilisable hors des composants (notifications). */
  go: (path: string) => void;
  setFriends: (open: boolean) => void;
  askLogin: (reason: LoginReason) => void;
  closeLogin: () => void;
  setNeedGroup: (n: NeedGroup) => void;
  toast: (text: string, tone?: Toast["tone"], action?: Toast["action"]) => void;
  dismiss: (id: number) => void;
}

let next = 1;

export const useUi = create<UiState>((set, get) => ({
  friendsOpen: false,
  login: null,
  needGroup: null,
  toasts: [],
  go: (path) => location.assign(path),
  setFriends: (friendsOpen) => set({ friendsOpen }),
  askLogin: (login) => set({ login, friendsOpen: false }),
  closeLogin: () => set({ login: null }),
  setNeedGroup: (needGroup) => set({ needGroup }),
  toast: (text, tone = "info", action) => {
    const id = next++;
    set({ toasts: [...get().toasts, { id, text, tone, action }].slice(-4) });
    setTimeout(() => get().dismiss(id), action ? 9000 : 4500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}));
