import logging
import smtplib
from email.message import EmailMessage

from app.config import settings

log = logging.getLogger("uvicorn.error")


def send_login_code(email: str, code: str) -> None:
    """发验证码邮件。没配 SMTP 时只写日志，方便本地开发。"""
    if not settings.smtp_host:
        log.warning("【开发模式】%s 的登录验证码：%s", email, code)
        return

    msg = EmailMessage()
    msg["Subject"] = f"Evil Raccoon 登录验证码：{code}"
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = email
    msg.set_content(f"你的登录验证码是 {code}，10 分钟内有效。\n\n如果不是你本人操作，忽略这封邮件即可。\n\n— Evil Raccoon")

    with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_user and settings.smtp_password:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)
