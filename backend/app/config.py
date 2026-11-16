from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # dev：验证码会打印到日志并在接口里返回，订单页有模拟支付；正式环境改成 prod
    app_env: str = "dev"
    secret_key: str = "dev-secret-change-me"

    # 账号密码写在 backend/.env（不进 git），这里的默认值不带密码
    database_url: str = "mysql+pymysql://root@127.0.0.1:3306/evil_raccoon?charset=utf8mb4"
    media_dir: Path = BACKEND_DIR / "media"
    # pixel-skill 的发布目录：导入脚本从这里读封面、GIF 和压缩包
    release_dir: Path = Path.home() / "Desktop/pp/pixel-skill/release"
    cors_origins: list[str] = ["http://localhost:5180", "http://127.0.0.1:5180"]

    session_days: int = 30
    cookie_secure: bool = False

    # 发验证码邮件；不配 smtp_host 时只打印到日志
    smtp_host: str | None = None
    smtp_port: int = 465
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None

    # 网站对外地址（支付宝付完跳回来用）
    site_url: str = "http://localhost:5180"

    # 支付宝电脑网站支付；不配就只能用开发环境的模拟支付
    alipay_app_id: str | None = None
    alipay_private_key: str | None = None  # 应用私钥，PEM 或裸 base64
    alipay_public_key: str | None = None  # 支付宝公钥（不是应用公钥）
    alipay_notify_url: str | None = None  # 公网可达，例如 https://www.railraccoon.top/api/payments/alipay/notify
    alipay_sandbox: bool = False

    @property
    def is_dev(self) -> bool:
        return self.app_env == "dev"


settings = Settings()
