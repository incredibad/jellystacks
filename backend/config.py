from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str = "dev-secret-key-please-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days
    database_url: str = "sqlite:////data/jellystacks.db"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
