from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = 'postgresql+asyncpg://antro:antro123@db:5432/antro_faceid'
    API_HOST: str = '0.0.0.0'
    API_PORT: int = 8000
    CORS_ORIGINS: str = 'http://localhost:5173,http://localhost:3000'

    MAX_FACE_DISTANCE: float = 0.48
    UPLOAD_DIR: str = './uploads'
    ADMIN_PASSWORD: str = ''
    MASTER_PASSWORD: str = ''
    JWT_SECRET: str = ''
    JWT_EXPIRATION_HOURS: int = 72

    class Config:
        env_file = '.env'


settings = Settings()
