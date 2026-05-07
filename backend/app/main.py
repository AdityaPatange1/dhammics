import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
from app.db import connect_db, disconnect_db, ensure_indexes
from app.rate_limit import limiter
from app.routers import auth, interactions, posts
from app.security import hash_password

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if len(settings.jwt_secret_key) < 32:
        raise RuntimeError(
            "Set JWT_SECRET_KEY to a random string of at least 32 characters (see .env.example)."
        )

    db = await connect_db()
    await db.command("ping")
    app.state.mongodb = db
    await ensure_indexes(db)

    user_count = await db.users.count_documents({})
    if user_count == 0 and settings.bootstrap_admin_username and settings.bootstrap_admin_password:
        if len(settings.bootstrap_admin_password) < 12:
            logger.warning("Bootstrap admin skipped: password shorter than 12 characters.")
        else:
            from datetime import UTC, datetime

            uname = settings.bootstrap_admin_username.strip().lower()
            now = datetime.now(UTC)
            await db.users.insert_one(
                {
                    "username": uname,
                    "password_hash": hash_password(settings.bootstrap_admin_password),
                    "display_name": settings.bootstrap_admin_display_name.strip() or uname,
                    "role": "admin",
                    "created_at": now,
                    "disabled": False,
                }
            )
            logger.info("Created bootstrap admin user %s", uname)

    yield

    await disconnect_db()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Dhammics API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    origins = settings.cors_origin_list()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(posts.router, prefix="/api/v1")
    app.include_router(interactions.router, prefix="/api/v1")

    return app


app = create_app()
