from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status

from app.deps import CurrentUser, DbDep, OptionalUser
from app.schemas import PostCreate, PostUpdate

router = APIRouter(prefix="/posts", tags=["posts"])


def _post_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "slug": doc["slug"],
        "title": doc["title"],
        "kind": doc.get("kind", "essay"),
        "description": doc.get("description", ""),
        "body_html": doc.get("body_html", ""),
        "cover": doc.get("cover", ""),
        "date": doc["date"],
        "author": doc.get("author_display", ""),
        "author_id": str(doc["author_id"]),
        "tags": doc.get("tags") or [],
        "reading_time": int(doc.get("reading_time") or 0),
        "published": bool(doc.get("published", True)),
        "content_type": doc.get("content_type") or "html",
        "created_at": doc["created_at"],
        "updated_at": doc["updated_at"],
        "local": False,
    }


def _list_item(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "slug": doc["slug"],
        "title": doc["title"],
        "kind": doc.get("kind", "essay"),
        "description": doc.get("description", ""),
        "cover": doc.get("cover", ""),
        "date": doc["date"],
        "author": doc.get("author_display", ""),
        "tags": doc.get("tags") or [],
        "reading_time": int(doc.get("reading_time") or 0),
        "published": bool(doc.get("published", True)),
        "content_type": doc.get("content_type") or "html",
        "local": False,
    }


def _can_edit(user: dict, post: dict) -> bool:
    if user.get("role") == "admin":
        return True
    return str(post["author_id"]) == str(user["_id"])


@router.get("/mine")
async def list_my_posts(
    db: DbDep,
    user: CurrentUser,
    kind: str | None = Query(default=None),
) -> list[dict]:
    query: dict = {"author_id": user["_id"]}
    if kind in ("blog", "essay"):
        query["kind"] = kind
    cursor = db.posts.find(query).sort("date", -1).limit(500)
    out: list[dict] = []
    async for doc in cursor:
        out.append(_list_item(doc))
    return out


@router.get("")
async def list_posts(
    db: DbDep,
    kind: str | None = Query(default=None, description="blog or essay"),
) -> list[dict]:
    query: dict = {"published": True}
    if kind in ("blog", "essay"):
        query["kind"] = kind
    cursor = db.posts.find(query).sort("date", -1).limit(500)
    out: list[dict] = []
    async for doc in cursor:
        out.append(_list_item(doc))
    return out


@router.get("/{slug}")
async def get_post(db: DbDep, slug: str, user: OptionalUser) -> dict:
    doc = await db.posts.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    if not doc.get("published", True):
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
        if not _can_edit(user, doc):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    return _post_out(doc)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_post(db: DbDep, user: CurrentUser, body: PostCreate) -> dict:
    existing = await db.posts.find_one({"slug": body.slug})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug already in use")

    now = datetime.now(UTC)
    author_label = body.author.strip() or user.get("display_name") or user["username"]
    doc = {
        "slug": body.slug,
        "title": body.title,
        "kind": body.kind,
        "description": body.description,
        "body_html": body.body_html,
        "cover": body.cover,
        "date": body.date,
        "author_display": author_label,
        "tags": body.tags,
        "reading_time": body.reading_time,
        "published": body.published,
        "content_type": body.content_type,
        "author_id": user["_id"],
        "created_at": now,
        "updated_at": now,
    }
    result = await db.posts.insert_one(doc)
    saved = await db.posts.find_one({"_id": result.inserted_id})
    assert saved
    return _post_out(saved)


@router.patch("/{slug}")
async def update_post(db: DbDep, user: CurrentUser, slug: str, body: PostUpdate) -> dict:
    doc = await db.posts.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if not _can_edit(user, doc):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    updates: dict = {"updated_at": datetime.now(UTC)}
    raw = body.model_dump(exclude_unset=True)
    if "author" in raw and raw["author"] is not None:
        updates["author_display"] = raw.pop("author")
    for k, v in raw.items():
        if v is not None:
            updates[k] = v

    await db.posts.update_one({"_id": doc["_id"]}, {"$set": updates})
    updated = await db.posts.find_one({"_id": doc["_id"]})
    assert updated
    return _post_out(updated)


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(db: DbDep, user: CurrentUser, slug: str) -> None:
    doc = await db.posts.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if not _can_edit(user, doc):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    await db.posts.delete_one({"_id": doc["_id"]})
    await db.user_interactions.delete_many({"post_slug": slug})
    await db.comments.delete_many({"post_slug": slug})
