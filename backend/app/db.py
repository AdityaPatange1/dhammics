from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import get_settings

_client: AsyncIOMotorClient | None = None


async def connect_db() -> AsyncIOMotorDatabase:
    global _client
    settings = get_settings()
    _client = AsyncIOMotorClient(
        settings.mongodb_uri,
        serverSelectionTimeoutMS=5000,
    )
    return _client[settings.mongodb_db_name]


async def disconnect_db() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.users.create_index("username", unique=True)
    await db.posts.create_index("slug", unique=True)
    await db.posts.create_index([("author_id", 1), ("created_at", -1)])
    await db.posts.create_index([("kind", 1), ("published", 1), ("date", -1)])
    await db.user_interactions.create_index([("user_id", 1), ("post_slug", 1)], unique=True)
    await db.comments.create_index([("post_slug", 1), ("created_at", 1)])
    await db.comments.create_index("post_slug")
