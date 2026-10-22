#!/usr/bin/env python3
"""Telecharge les modeles 3D chibi depuis modelviewer.lol et branche la 3D du site.

Les 3 etapes (cf. ChibiView.tsx / chibis.ts) :
  1. .glb -> apps/front/public/models/<cle>.glb  (servi en /models/<cle>.glb)
  2. lecteur 3D -> apps/front/public/vendor/model-viewer.min.js
     (fichier dist/ du paquet npm @google/model-viewer, charge lazy par ChibiView)
  3. declaration -> MODELS_3D dans packages/content/src/chibis.ts

Usage (depuis la racine du repo) :
  python3 download_chibi.py
  python3 download_chibi.py --keys zeri,jinx
  python3 download_chibi.py --force --workers 4
  python3 download_chibi.py --no-vendor --no-update-ts

Un modele par chibi (pas par skin) : on prend le skin de base
(le plus petit id numerique de la page du tacticien).
"""
import argparse
import concurrent.futures as cf
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO = Path(__file__).resolve().parent
MODELS_DIR_DEFAULT = REPO / "apps/front/public/models"
VENDOR_DIR_DEFAULT = REPO / "apps/front/public/vendor"
CHIBIS_TS_DEFAULT = REPO / "packages/content/src/chibis.ts"
CHIBIS_DATA_DEFAULT = REPO / "packages/content/src/chibis.data.ts"
VENDOR_URL = "https://cdn.jsdelivr.net/npm/@google/model-viewer/dist/model-viewer.min.js"

BASE_SITE = "https://modelviewer.lol"
BASE_CDN = "https://cdn.modelviewer.lol"
UA = {"User-Agent": "Mozilla/5.0 (chibi-downloader)"}
RE_ID = re.compile(r"/model-viewer\?group=tft(?:&amp;|&)id=(\d+)")
RE_KEY = re.compile(r'"key":\s*"([^"]+)"')
RE_MODELS_3D = re.compile(
    r"export const MODELS_3D: Record<string, string> = \{[^}]*\};", re.DOTALL
)


def fetch(url: str, timeout=30) -> str:
    with urlopen(Request(url, headers=UA), timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def download(url: str, dest: Path, retries=3) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    for i in range(retries):
        try:
            with urlopen(Request(url, headers=UA), timeout=60) as r, open(dest, "wb") as f:
                f.write(r.read())
            return True
        except (HTTPError, URLError, TimeoutError, ConnectionError) as e:
            print(f"  retry {i + 1}/{retries} {url} -> {e}", file=sys.stderr)
            time.sleep(1 + i)
    return False


def local_chibi_keys() -> "list[str]":
    """Cles de reference = celles de chibis.data.ts (source de MODELS_3D)."""
    src = CHIBIS_DATA_DEFAULT.read_text(encoding="utf-8")
    seen: "list[str]" = []
    for k in RE_KEY.findall(src):
        if k not in seen:
            seen.append(k)
    # RE_KEY matche aussi les id de skins ("base", "sg"...), on ne garde que les cles
    # de chibi : elles apparaissent comme {"key": "<chibi>", "skins": ...}
    chibi_keys = re.findall(r'\{"key":\s*"([^"]+)",\s*"skins"', src)
    return chibi_keys or seen


def base_skin_id(alias: str) -> str:
    html = fetch(f"{BASE_SITE}/tacticians/{alias}?lang=fr-FR")
    ids = sorted({int(i) for i in RE_ID.findall(html)})
    if not ids:
        raise RuntimeError(f"aucun skin trouve pour {alias}")
    return str(ids[0])


def update_models_ts(path: Path, keys: "list[str]") -> None:
    src = path.read_text(encoding="utf-8")
    body = "\n".join(f'  {k}: "/models/{k}.glb",' for k in sorted(keys))
    replacement = "export const MODELS_3D: Record<string, string> = {\n" + body + "\n};"
    if not RE_MODELS_3D.search(src):
        raise RuntimeError(f"MODELS_3D introuvable dans {path}")
    path.write_text(RE_MODELS_3D.sub(replacement, src), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keys", default="", help="ex. zeri,jinx (defaut: tous les chibis locaux)")
    ap.add_argument("--models-dir", default=str(MODELS_DIR_DEFAULT))
    ap.add_argument("--vendor-dir", default=str(VENDOR_DIR_DEFAULT))
    ap.add_argument("--chibis-ts", default=str(CHIBIS_TS_DEFAULT))
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--force", action="store_true", help="re-telecharge meme si le fichier existe")
    ap.add_argument("--no-vendor", action="store_true", help="ne touche pas a vendor/model-viewer.min.js")
    ap.add_argument("--no-update-ts", action="store_true", help="ne reecrit pas MODELS_3D")
    ap.add_argument("--strip", action="store_true", help="nettoie les parties non-defaut des .glb (visages alternatifs, socle)")
    args = ap.parse_args()

    models_dir = Path(args.models_dir)
    vendor_dir = Path(args.vendor_dir)
    chibis_ts = Path(args.chibis_ts)
    models_dir.mkdir(parents=True, exist_ok=True)

    keys = local_chibi_keys()
    if args.keys:
        wanted = [k.strip() for k in args.keys.split(",") if k.strip()]
        unknown = [k for k in wanted if k not in keys]
        if unknown:
            print(f"cles inconnues (ignorees) : {unknown}", file=sys.stderr)
        keys = [k for k in wanted if k in keys]
    print(f"1/3 modeles : {len(keys)} chibis -> {models_dir}")

    def job(key: str) -> tuple[str, bool]:
        alias = "petchibi" + key
        dest = models_dir / f"{key}.glb"
        if dest.exists() and dest.stat().st_size > 0 and not args.force:
            print(f"  skip {key} (deja present)")
            return key, True
        try:
            sid = base_skin_id(alias)
        except Exception as e:
            print(f"  FAIL {key}: {e}", file=sys.stderr)
            return key, False
        url = f"{BASE_CDN}/tft/models/{alias}/{sid}/model.glb"
        if args.force and dest.exists():
            dest.unlink()
        ok = download(url, dest)
        print(("  OK " if ok else "  FAIL ") + f"{key} ({alias}/{sid})")
        time.sleep(0.2)
        return key, ok

    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        results = dict(ex.map(job, keys))
    ok_keys = sorted(k for k, ok in results.items() if ok)
    # Inclut les modeles deja presents (skip) : tout .glb present compte comme declare.
    present = sorted(p.stem for p in models_dir.glob("*.glb") if p.stat().st_size > 0)
    print(f"  reussis : {len(ok_keys)}/{len(keys)} ; presents dans {models_dir.name}/ : {len(present)}")

    if not args.no_vendor:
        print(f"2/3 lecteur 3D -> {vendor_dir}/model-viewer.min.js")
        vendor_dir.mkdir(parents=True, exist_ok=True)
        dest = vendor_dir / "model-viewer.min.js"
        if args.force and dest.exists():
            dest.unlink()
        if download(VENDOR_URL, dest):
            print(f"  OK vendor ({dest.stat().st_size // 1024} Ko)")
        else:
            print("  FAIL vendor", file=sys.stderr)
    else:
        print("2/3 lecteur 3D : ignore (--no-vendor)")

    if not args.no_update_ts:
        print(f"3/3 MODELS_3D -> {chibis_ts}")
        update_models_ts(chibis_ts, present)
        print(f"  OK {len(present)} entrees")
    else:
        print("3/3 MODELS_3D : ignore (--no-update-ts)")

    if args.strip:
        print("4/4 nettoyage des parties non-defaut")
        cmd = [sys.executable, str(REPO / "scripts/strip_chibi_parts.py"),
               "--models-dir", str(models_dir)]
        if args.keys:
            cmd += ["--keys", args.keys]
        subprocess.run(cmd, check=False)

    print("Pensez a reconstruire le front : docker compose up -d --build front")


if __name__ == "__main__":
    main()
