"""把某个邮箱设为管理员（或取消）。

用法（在 backend 目录下）：
    uv run python -m scripts.set_admin you@example.com
    uv run python -m scripts.set_admin you@example.com --revoke

邮箱还没注册过也没关系，会先建好账号，之后用这个邮箱登录就是管理员。
"""

import argparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import engine
from app.models import User


def main() -> None:
    parser = argparse.ArgumentParser(description="设置管理员")
    parser.add_argument("email")
    parser.add_argument("--revoke", action="store_true", help="取消管理员")
    args = parser.parse_args()
    email = args.email.strip().lower()

    with Session(engine) as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email)
            db.add(user)
        user.is_admin = not args.revoke
        db.commit()
    print(f"{email} {'已取消管理员' if args.revoke else '现在是管理员'}")


if __name__ == "__main__":
    main()
