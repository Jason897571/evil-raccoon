"""single admin: earliest registered user

Revision ID: f4369cf12be9
Revises: 6d6b0de1d54e
Create Date: 2026-11-16 06:22:47.827629

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4369cf12be9'
down_revision: Union[str, Sequence[str], None] = '6d6b0de1d54e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """只保留最早注册的用户为管理员，其余一律改成普通客户。"""
    op.execute("UPDATE users SET is_admin = 0")
    op.execute(
        "UPDATE users u JOIN (SELECT id FROM users ORDER BY created_at, id LIMIT 1) first_user "
        "ON u.id = first_user.id SET u.is_admin = 1"
    )


def downgrade() -> None:
    """数据规范化，无法还原之前有哪些管理员，降级时什么都不做。"""
