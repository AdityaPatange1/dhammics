from typing import Annotated

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.schemas import UserPublic

security = HTTPBearer(auto_error=False)


async def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.mongodb


DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]


def _user_doc_to_public(doc: dict) -> UserPublic:
    return UserPublic(
        id=str(doc["_id"]),
        username=doc["username"],
        display_name=doc.get("display_name") or doc["username"],
        role=doc.get("role", "user"),
        created_at=doc["created_at"],
    )


async def get_current_user_optional(
    db: DbDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict | None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    from app.security import decode_token

    payload = decode_token(credentials.credentials)
    if not payload or "sub" not in payload:
        return None
    try:
        oid = ObjectId(payload["sub"])
    except InvalidId:
        return None
    user = await db.users.find_one({"_id": oid, "disabled": {"$ne": True}})
    return user


async def get_current_user(
    user: Annotated[dict | None, Depends(get_current_user_optional)],
) -> dict:
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


CurrentUser = Annotated[dict, Depends(get_current_user)]
OptionalUser = Annotated[dict | None, Depends(get_current_user_optional)]


async def require_admin(user: CurrentUser) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


AdminUser = Annotated[dict, Depends(require_admin)]
