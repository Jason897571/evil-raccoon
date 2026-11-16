"""特效包目录的导出 / 导入，用于把本地导好的商品数据搬到线上。

本地导出： uv run python -m scripts.catalog_io export > ../dist/catalog.json
线上导入：在 er-api 容器里 python /tmp/catalog_io.py import /tmp/catalog.json
          （scripts/sync-catalog.sh 会自动做这两步）

导入只在线上还没有任何特效包时执行，避免覆盖线上在后台 / API 里改过的内容；
确实要覆盖时加 --force（会删掉线上全部特效包和技能，有订单引用时会失败）。
"""

import json
import sys
from pathlib import Path

# 本地 python -m 运行时在 backend 目录；容器里脚本放在 /tmp、工作目录是 /app。两种情况都能 import app
sys.path[:0] = [str(Path.cwd()), str(Path(__file__).resolve().parent.parent)]

from sqlalchemy import delete, func, select  # noqa: E402
from sqlalchemy.orm import Session, selectinload  # noqa: E402

from app.db import engine  # noqa: E402
from app.models import Pack, Skill  # noqa: E402

PACK_FIELDS = ["slug", "name", "element", "price_cents", "summary", "cover_url", "sort_order", "is_new",
               "afdian_plan_id", "source_dir", "is_published"]
SKILL_FIELDS = ["sort_order", "code", "name", "description", "phases", "preview_gif_url", "sheet_url",
                "sheet_cols", "sheet_rows"]


def export() -> None:
    with Session(engine) as db:
        packs = db.scalars(select(Pack).options(selectinload(Pack.skills)).order_by(Pack.sort_order))
        data = [
            {**{f: getattr(p, f) for f in PACK_FIELDS}, "skills": [{f: getattr(s, f) for f in SKILL_FIELDS} for s in p.skills]}
            for p in packs
        ]
    json.dump(data, sys.stdout, ensure_ascii=False, indent=1)


def load(path: str, force: bool) -> None:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    with Session(engine) as db:
        existing = db.scalar(select(func.count(Pack.id))) or 0
        if existing and not force:
            sys.exit(f"线上已经有 {existing} 个特效包，没有导入（要覆盖请加 --force）")
        if force:
            db.execute(delete(Skill))
            db.execute(delete(Pack))
        for item in data:
            pack = Pack(**{f: item[f] for f in PACK_FIELDS})
            pack.skills = [Skill(**{f: s[f] for f in SKILL_FIELDS}) for s in item["skills"]]
            db.add(pack)
        db.commit()
    print(f"导入 {len(data)} 个特效包、{sum(len(i['skills']) for i in data)} 个技能")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "export":
        export()
    elif len(sys.argv) >= 3 and sys.argv[1] == "import":
        load(sys.argv[2], force="--force" in sys.argv)
    else:
        sys.exit(__doc__)
