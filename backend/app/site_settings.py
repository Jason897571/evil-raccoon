from sqlalchemy.orm import Session

from app.models import SiteSetting

ALIPAY_QR_URL = "alipay_qr_url"
ALIPAY_NOTE = "alipay_note"


def get_setting(db: Session, key: str, default: str | None = None) -> str | None:
    row = db.get(SiteSetting, key)
    return row.value if row else default


def set_setting(db: Session, key: str, value: str | None) -> None:
    """value 为 None 时删除这一项。调用方负责 commit。"""
    row = db.get(SiteSetting, key)
    if value is None:
        if row:
            db.delete(row)
    elif row:
        row.value = value
    else:
        db.add(SiteSetting(key=key, value=value))
