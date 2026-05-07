from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, status

from app.deps import CurrentUser, DbDep, _user_doc_to_public
from app.rate_limit import limiter
from app.schemas import TokenResponse, UserLogin, UserPublic, UserRegister
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
@limiter.limit("10/minute")
async def register(request: Request, db: DbDep, body: UserRegister) -> TokenResponse:
    existing = await db.users.find_one({"username": body.username})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    now = datetime.now(UTC)
    doc = {
        "username": body.username,
        "password_hash": hash_password(body.password),
        "display_name": (body.display_name.strip() or body.username),
        "role": "user",
        "created_at": now,
        "disabled": False,
    }
    result = await db.users.insert_one(doc)
    user_doc = await db.users.find_one({"_id": result.inserted_id})
    assert user_doc
    public = _user_doc_to_public(user_doc)
    token = create_access_token(str(user_doc["_id"]), {"role": user_doc.get("role", "user")})
    return TokenResponse(access_token=token, user=public)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("30/minute")
async def login(request: Request, db: DbDep, body: UserLogin) -> TokenResponse:
    user_doc = await db.users.find_one({"username": body.username, "disabled": {"$ne": True}})
    if not user_doc or not verify_password(body.password, user_doc["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    public = _user_doc_to_public(user_doc)
    token = create_access_token(str(user_doc["_id"]), {"role": user_doc.get("role", "user")})
    return TokenResponse(access_token=token, user=public)


@router.get("/me", response_model=UserPublic)
async def me(user: CurrentUser) -> UserPublic:
    return _user_doc_to_public(user)
