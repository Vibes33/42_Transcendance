#!/usr/bin/env python3
"""Nettoie les .glb des chibis : ne garde que les parties du visage par defaut.

Contexte : les model.glb du CDN contiennent TOUTES les parties (variantes
d'expressions + tous les props). Le site modelviewer.lol ne montre par defaut
qu'un seul set de visage. Ce script supprime les primitives superflues
(chirurgie JSON uniquement : filtrage de meshes[].primitives, aucune
renumerotation necessaire car rien d'autre ne pointe vers les primitives).

Regles :
  - supprime le socle "Ground" (rendu sur fond transparent, inutile)
  - supprime les doublons d'un autre skin ("Muscle*" prefixe)
  - par groupe (namespace, slot de visage) : ne garde que le membre neutre
    (nom exact du slot, ou contenant base/basic/default, sinon le plus court,
    sinon le premier du fichier) ; les emotions du groupe sont ecartees
  - backstop : supprime les mats d'emotion hors-slot (Wacky, Anger...)
  - securites : on ne vide jamais le mesh ; 1 prim => on ne touche a rien ;
    s'il ne reste aucun visage alors que le fichier en avait, on restaure le 1er

Ajustements manuels par chibi (constates visuellement), voir EXTRA_* ci-dessous.

Usage :
  python3 scripts/strip_chibi_parts.py --dry-run
  python3 scripts/strip_chibi_parts.py [--models-dir ...] [--keys yone,lux]
"""
import argparse
import glob
import json
import re
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MODELS_DIR = REPO / "apps/front/public/models"

# Ajustements manuels par chibi (verifies sur les rendus de reference).
EXTRA_DROP: dict[str, list[str]] = {
    # Yone : fruit et halos jaunes flottants constates a l'ecran.
    "yone": ["Fruit", "Glow1", "Glow2"],
    # Yunara : bouches "mangeage" en trop, on garde la fermee (Lip_Closed).
    "yunara": ["Mouth_Eatting02", "Eatting01", "Eatting02", "Eatting03", "Lip_Eatting01"],
    # Ashe : overlays d'emotion (Eye/Mouth_Base gardes par ailleurs).
    "ashe": ["Wronged", "Confidence", "Confuse", "Speechless"],
    # Orianna : overlay "chargement" et sombres.
    "orianna": ["Face_Load", "Face_Gloomy"],
    # Vi : overlays (yeux/bouche Base gardes par ailleurs).
    "vi": ["Face_Powerless", "Face_Death"],
    # Yuumi : tete et plaque popcat (meme).
    "yuumi": ["Face_Head_Popcat", "Face_Metal_Popcat"],
    # Neeko : overlays (Face_Eyes/Mouth de base gardes).
    "neeko": ["Face_Squint", "Face_Mischief"],
    # Tristana : overlay "sérieux" (Base garde par ailleurs).
    "tristana": ["Serious"],
}
EXTRA_KEEP: dict[str, list[str]] = {
    # Yunara : la bouche fermee par defaut.
    "yunara": ["Lip_Closed"],
    # Lillia : pupilles (decalque sur l'oeil de base).
    "lillia": ["Eye_pupil"],
}

# Emotion -> variante a supprimer (matieres hors-slot ou membres de groupe).
EMOTIONS = [
    "cry", "happy", "evil", "close", "surprise", "force", "angry", "proud",
    "sad", "grin", "excited", "chew", "ridicule", "sneeze", "wacky",
    "rainbow", "anger", "laugh", "blink", "hurt", "sleep", "dizzy",
    "shock", "worried", "smirk", "silly", "overlooking", "fierce",
    "weep", "pleep", "bigsmile", "noodle", "funny", "insidious", "shadow",
    "stretch", "load", "gloomy", "lazy", "tear",
]
NEUTRAL_HINTS = ("base", "basic", "default", "neutral")
# Ordre de priorite : le sourcil gagne sur l'oeil ("eyebrows" -> brow).
SLOTS = ("brow", "blush", "cheek", "nose", "ear", "mouth", "lip", "eye", "face")
SYNONYMS = {
    "smile": "mouth", "laugh": "mouth", "weep": "mouth",
    "pleep": "mouth", "frown": "mouth", "sneeze": "mouth", "teeth": "mouth",
    "tongue": "mouth", "pout": "mouth", "eatting": "mouth",
    "wink": "eye", "blink": "eye", "stare": "eye",
}
TOKEN_SYN = {"eyes": "eye", "eyebrows": "brow", "eyebrow": "brow", "lips": "lip", "ears": "ear"}


def singular(low: str) -> str:
    return low[:-1] if low.endswith("s") and not low.endswith("ss") else low


def tokens(name: str) -> list[str]:
    parts: list[str] = []
    for chunk in name.split("_"):
        parts += re.findall(r"[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+", chunk)
    return [t.lower() for t in parts]


def slot_of(name: str) -> str | None:
    toks = [singular(TOKEN_SYN.get(t, re.sub(r"\d+$", "", t))) for t in tokens(name)]
    for slot in SLOTS:
        if slot in toks:
            return slot
    low = name.lower()
    for word, slot in SYNONYMS.items():
        if word in low:
            return slot
    return None


def namespace_of(name: str) -> str:
    return re.sub(r"\d+$", "", name.split("_")[0])


def is_neutral(name: str, slot: str) -> bool:
    low = singular(name.lower())
    if low in (slot, "face_" + slot):
        return True
    return any(h in low for h in NEUTRAL_HINTS)


def is_emotion(name: str) -> bool:
    return any(e in name.lower() for e in EMOTIONS)


def read_glb(path: Path):
    with open(path, "rb") as f:
        magic, _, _ = struct.unpack("<III", f.read(12))
        assert magic == 0x46546C67, f"{path}: pas un GLB"
        clen, ctype = struct.unpack("<II", f.read(8))
        assert ctype == 0x4E4F534A, f"{path}: premier chunk non-JSON"
        js = json.loads(f.read(clen).decode("utf-8"))
        rest = f.read()
    return js, rest


def write_glb(path: Path, js, rest: bytes):
    raw = json.dumps(js, separators=(",", ":")).encode("utf-8")
    pad = (-len(raw)) % 4
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(raw) + pad + len(rest)))
        f.write(struct.pack("<II", len(raw) + pad, 0x4E4F534A))
        f.write(raw + b" " * pad)
        f.write(rest)


def decide(key: str, mats: list[str]) -> tuple[list[int], list[int]]:
    if len(mats) <= 1:
        return list(range(len(mats))), []
    extra_drop = set(EXTRA_DROP.get(key, []))
    extra_keep = set(EXTRA_KEEP.get(key, []))
    drop: set[int] = set()
    slots = [slot_of(m) for m in mats]
    for i, m in enumerate(mats):
        if m in extra_drop or m.lower() == "ground" or m.startswith("Muscle"):
            drop.add(i)
            continue
        if slots[i] is None and m not in extra_keep and is_emotion(m):
            drop.add(i)  # backstop : emotion hors-slot (ex. Wacky, Anger)
    # Groupes (namespace, slot) : un seul membre.
    groups: dict[tuple[str, str], list[int]] = {}
    for i, m in enumerate(mats):
        if i in drop or slots[i] is None or m in extra_keep:
            continue
        groups.setdefault((namespace_of(m), slots[i]), []).append(i)
    for (ns, slot), members in groups.items():
        cand = [i for i in members if not is_emotion(mats[i]) or is_neutral(mats[i], slot)]
        if not cand:
            drop.update(members)  # que des emotions : on retire tout le groupe
            continue
        if len(cand) == 1 and is_emotion(mats[cand[0]]) and not is_neutral(mats[cand[0]], slot):
            drop.add(cand[0])  # emotion seule : on la retire (ex. Face_angry)
            continue
        scored = sorted(
            cand,
            key=lambda i: (
                0 if is_neutral(mats[i], slot) else 1,
                len(mats[i]),
                members.index(i),
            ),
        )
        for i in members:
            if i != scored[0]:
                drop.add(i)
    keep = [i for i in range(len(mats)) if i not in drop]
    keep += [i for i, m in enumerate(mats) if m in extra_keep and i not in keep]
    keep.sort()
    if not keep:  # Securite : on ne vide jamais le mesh.
        keep = list(range(len(mats)))
    else:
        # Securite visage : s'il n'en reste aucun alors que le fichier en avait.
        had_face = any(s is not None for s in slots)
        kept_face = any(slots[i] is not None for i in keep)
        if had_face and not kept_face:
            first = next(i for i, s in enumerate(slots) if s is not None)
            keep = sorted(keep + [first])
    drop = [i for i in range(len(mats)) if i not in keep]
    return keep, sorted(drop)


def process(path: Path, dry_run: bool) -> int:
    key = path.stem
    js, rest = read_glb(path)
    mesh = js["meshes"][0]
    mats = [js["materials"][pr["material"]].get("name", "?") for pr in mesh["primitives"]]
    keep, drop = decide(key, mats)
    if drop:
        print(f"{key}: DROP {[mats[i] for i in drop]}")
        print(f"{key}: KEEP {[mats[i] for i in keep]}")
        if not dry_run:
            mesh["primitives"] = [mesh["primitives"][i] for i in keep]
            write_glb(path, js, rest)
            js2, _ = read_glb(path)
            assert len(js2["meshes"][0]["primitives"]) == len(keep)
        return len(drop)
    print(f"{key}: rien a supprimer ({len(mats)} prims)")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--models-dir", default=str(MODELS_DIR))
    ap.add_argument("--keys", default="")
    args = ap.parse_args()
    files = sorted(glob.glob(str(Path(args.models_dir) / "*.glb")))
    if args.keys:
        wanted = {k.strip() for k in args.keys.split(",") if k.strip()}
        files = [f for f in files if Path(f).stem in wanted]
    if not files:
        print("aucun .glb", file=sys.stderr)
        sys.exit(1)
    total = sum(process(Path(f), args.dry_run) for f in files)
    print(f"--- {total} primitives supprimees (dry_run={args.dry_run})")


if __name__ == "__main__":
    main()
