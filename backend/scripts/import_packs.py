"""从爱发电导出的数据 + 本地 pixel-skill 发布目录，生成预览素材并写入数据库。

用法（在 backend 目录下，先跑过 `uv run alembic upgrade head`）：
    uv run python -m scripts.import_packs

可重复执行：
- 新包：按爱发电的数据写入全部内容。
- 已有的包：只刷新封面、预览图和精灵图；名称、价格、简介、上下架、技能文案
  这些可能在后台 / API 里改过的内容保持不动。加 --overwrite 才会按爱发电重新覆盖。
- 不会动订单、用户。
网盘链接放在 backend/netdisk.json（格式见 netdisk.example.json），有就写入。
"""

import argparse
import html
import json
import re
import shutil
import sys
import zipfile
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session, selectinload

from app.catalog import HERO_TILES, PACKS
from app.config import BACKEND_DIR, settings
from app.db import engine
from app.models import Pack, Skill

SEED = BACKEND_DIR / "seed" / "afdian_raw.json"
NETDISK = BACKEND_DIR / "netdisk.json"
FONT = BACKEND_DIR.parent / "frontend" / "public" / "fonts" / "FusionPixel12.woff2"
FRAME = 64
SHEET_BG = (29, 28, 56, 255)
SHEET_GRID = (43, 42, 77, 255)


def require_schema() -> None:
    if not inspect(engine).has_table("packs"):
        sys.exit("数据库里还没有表，请先运行：uv run alembic upgrade head")


def load_netdisk() -> dict[str, dict[str, str]]:
    if not NETDISK.exists():
        return {}
    return json.loads(NETDISK.read_text(encoding="utf-8"))


def clean(fragment: str) -> str:
    s = re.sub(r"<[^>]+>", "", fragment)
    return html.unescape(s).replace("**", "").strip()


def parse_product(p: dict) -> dict:
    theme = re.search(r"· (.+?)（", p["name"]).group(1)
    desc = p["desc"]
    summary_match = re.search(r"</strong></p>\s*<p>(.*?)</p>", desc, re.S)
    items = re.findall(
        r"<li><strong>(.*?)</strong>[:：](.*?)(?:<br\s*/?>\s*<span[^>]*>动画阶段[:：]\s*(.*?)</span>)?</li>",
        desc, re.S,
    )
    return {
        "theme": theme,
        "plan_id": p["plan_id"],
        "rank": int(p["rank"]),
        "price_cents": round(float(p["price"]) * 100),
        "summary": clean(summary_match.group(1)) if summary_match else "",
        "skills": [{"name": clean(n), "description": clean(d), "phases": clean(ph)} for n, d, ph in items],
    }


def latest_zip(pack_dir: Path) -> Path:
    zips = sorted(pack_dir.glob("*.zip"))
    if not zips:
        raise FileNotFoundError(f"{pack_dir} 下没有 zip")
    return zips[-1]


def skill_codes(zf: zipfile.ZipFile) -> dict[str, dict[str, str]]:
    """压缩包里每个技能文件夹 → 它的 png / gif 成员路径，按文件夹名排序。"""
    found: dict[str, dict[str, str]] = {}
    for name in zf.namelist():
        parts = name.split("/")
        if len(parts) < 2 or not parts[-1]:
            continue
        code, ext = parts[-2], parts[-1].rsplit(".", 1)[-1]
        if parts[-1] == f"{code}.{ext}" and ext in ("png", "gif"):
            found.setdefault(code, {})[ext] = name
    return dict(sorted(found.items()))


def watermark_sheet(png_bytes: bytes, out: Path, font: ImageFont.FreeTypeFont) -> tuple[int, int]:
    """精灵图放大 2 倍、铺网格、加斜向水印，返回 (列数, 行数)。"""
    sheet = Image.open(BytesIO(png_bytes)).convert("RGBA")
    w, h = sheet.size
    big = sheet.resize((w * 2, h * 2), Image.NEAREST)
    canvas = Image.new("RGBA", big.size, SHEET_BG)
    draw = ImageDraw.Draw(canvas)
    step = FRAME * 2
    for x in range(0, big.width, step):
        draw.line([(x, 0), (x, big.height)], fill=SHEET_GRID)
    for y in range(0, big.height, step):
        draw.line([(0, y), (big.width, y)], fill=SHEET_GRID)
    canvas.alpha_composite(big)

    mark = Image.new("RGBA", (big.width * 2, big.height * 2), (0, 0, 0, 0))
    md = ImageDraw.Draw(mark)
    for row, y in enumerate(range(0, mark.height, 110)):
        for x in range(-200 if row % 2 else 0, mark.width, 330):
            md.text((x, y), "EVIL RACCOON", font=font, fill=(255, 255, 255, 46))
    mark = mark.rotate(18, resample=Image.NEAREST)
    left, top = big.width // 2, big.height // 2
    canvas.alpha_composite(mark.crop((left, top, left + big.width, top + big.height)))

    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(out, optimize=True)
    return w // FRAME, h // FRAME


def save_cover(src: Path, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.open(src).convert("RGB").resize((720, 960), Image.LANCZOS).save(out, quality=88, optimize=True)


def export_hero(release: Path, media: Path) -> None:
    wanted = {code for _, code in HERO_TILES}
    for pack_dir in sorted(release.glob("itch_*")):
        if not wanted:
            break
        try:
            zf = zipfile.ZipFile(latest_zip(pack_dir))
        except FileNotFoundError:
            continue
        for code, files in skill_codes(zf).items():
            if code in wanted and "gif" in files:
                out = media / "hero" / f"{code}.gif"
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(zf.read(files["gif"]))
                wanted.discard(code)
    if wanted:
        print(f"警告：首屏缺少这些技能的 GIF：{sorted(wanted)}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description="导入特效包")
    parser.add_argument("--overwrite", action="store_true", help="已有的包也按爱发电数据覆盖文字内容")
    overwrite = parser.parse_args().overwrite
    release, media = settings.release_dir, settings.media_dir
    font = ImageFont.truetype(str(FONT), 24)
    raw = json.loads(SEED.read_text(encoding="utf-8"))

    require_schema()
    netdisk = load_netdisk()

    products = sorted((parse_product(p) for p in raw["products"]), key=lambda x: x["rank"])
    with Session(engine) as session:
        existing = {p.slug: p for p in session.scalars(select(Pack).options(selectinload(Pack.skills)))}
        for order, prod in enumerate(products):
            if prod["theme"] not in PACKS:
                print(f"跳过：目录里没有配置「{prod['theme']}」", file=sys.stderr)
                continue
            slug, element, dirname = PACKS[prod["theme"]]
            pack_dir = release / dirname
            zf = zipfile.ZipFile(latest_zip(pack_dir))
            codes = list(skill_codes(zf).items())
            if len(codes) < len(prod["skills"]):
                raise RuntimeError(f"{slug}: 爱发电列了 {len(prod['skills'])} 个技能，压缩包只有 {len(codes)} 个")
            if len(codes) != len(prod["skills"]):
                print(f"注意：{slug} 压缩包有 {len(codes)} 个技能，爱发电列了 {len(prod['skills'])} 个，按爱发电取前 {len(prod['skills'])} 个")

            save_cover(pack_dir / "xhs" / "cover.png", media / "covers" / f"{slug}.jpg")
            is_new_pack = slug not in existing
            pack = existing.get(slug) or Pack(slug=slug)
            sync_text = is_new_pack or overwrite
            if sync_text:
                pack.name, pack.element, pack.price_cents = prod["theme"], element, prod["price_cents"]
                pack.summary, pack.sort_order, pack.is_new = prod["summary"], order, order == 0
            pack.cover_url, pack.afdian_plan_id, pack.source_dir = f"/media/covers/{slug}.jpg", prod["plan_id"], dirname
            if slug in netdisk:
                pack.netdisk_url = netdisk[slug].get("url") or None
                pack.netdisk_code = netdisk[slug].get("code") or None

            old_skills = {sk.code: sk for sk in pack.skills}
            pack.skills.clear()
            session.flush()
            for i, (info, (code, files)) in enumerate(zip(prod["skills"], codes)):
                shot = pack_dir / f"shot_{code}.gif"
                gif_out = media / "skills" / slug / f"{code}.gif"
                gif_out.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(shot, gif_out)
                cols, rows = watermark_sheet(zf.read(files["png"]), media / "skills" / slug / f"{code}_sheet.png", font)
                prev = None if sync_text else old_skills.get(code)
                pack.skills.append(Skill(
                    sort_order=i, code=code,
                    name=prev.name if prev else info["name"],
                    description=prev.description if prev else info["description"],
                    phases=prev.phases if prev else info["phases"],
                    preview_gif_url=f"/media/skills/{slug}/{code}.gif",
                    sheet_url=f"/media/skills/{slug}/{code}_sheet.png", sheet_cols=cols, sheet_rows=rows,
                ))
            session.add(pack)
            link = "网盘✓" if pack.netdisk_url else "网盘未填"
            state = "新增" if is_new_pack else ("覆盖" if overwrite else "只刷新图片")
            print(f"{order + 1:>2}. {slug:<10} {pack.name:<6} ¥{pack.price_cents / 100:.2f}  {len(pack.skills)} 个技能  {link}  {state}")
        session.commit()

    export_hero(release, media)
    print("导入完成")


if __name__ == "__main__":
    main()
