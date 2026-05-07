from datetime import UTC, datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status

from app.deps import CurrentUser, DbDep, OptionalUser, _user_doc_to_public
from app.schemas import (
    CommentCreate,
    CommentOut,
    InteractionMine,
    InteractionStats,
    RatingBody,
    ToggleInteractionBody,
    UserStateOut,
    UserCommentRef,
)

router = APIRouter(tags=["interactions"])

_KIND_TO_FIELD = {"likes": "liked", "stars": "starred", "favorites": "favorited"}


async def _require_post(db, slug: str) -> None:
    post = await db.posts.find_one({"slug": slug, "published": True})
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")


async def _ensure_interaction_doc(db, user_id: ObjectId, slug: str) -> dict:
    await db.user_interactions.update_one(
        {"user_id": user_id, "post_slug": slug},
        {
            "$setOnInsert": {
                "user_id": user_id,
                "post_slug": slug,
                "liked": False,
                "starred": False,
                "favorited": False,
                "rating": 0,
            }
        },
        upsert=True,
    )
    doc = await db.user_interactions.find_one({"user_id": user_id, "post_slug": slug})
    assert doc
    return doc


@router.get("/posts/{slug}/interactions", response_model=InteractionStats)
async def post_interaction_stats(db: DbDep, slug: str) -> InteractionStats:
    await _require_post(db, slug)

    likes = await db.user_interactions.count_documents({"post_slug": slug, "liked": True})
    stars = await db.user_interactions.count_documents({"post_slug": slug, "starred": True})
    favs = await db.user_interactions.count_documents({"post_slug": slug, "favorited": True})

    pipeline = [
        {"$match": {"post_slug": slug, "rating": {"$gte": 1, "$lte": 5}}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "c": {"$sum": 1}}},
    ]
    agg = await db.user_interactions.aggregate(pipeline).to_list(1)
    ratings_count = int(agg[0]["c"]) if agg else 0
    rating_avg = float(agg[0]["avg"]) if agg and agg[0].get("avg") is not None else 0.0

    c_cursor = db.comments.find({"post_slug": slug}).sort("created_at", 1)
    comments: list[CommentOut] = []
    async for c in c_cursor:
        comments.append(
            CommentOut(
                id=str(c["_id"]),
                user_id=str(c["user_id"]),
                username=c.get("username_snapshot", "User"),
                text=c["text"],
                created_at=c["created_at"],
            )
        )

    return InteractionStats(
        slug=slug,
        likes=likes,
        stars=stars,
        favorites=favs,
        ratings_count=ratings_count,
        rating_avg=round(rating_avg, 2),
        comments=comments,
    )


@router.get("/posts/{slug}/interactions/me", response_model=InteractionMine)
async def my_interactions_for_post(db: DbDep, slug: str, user: OptionalUser) -> InteractionMine:
    await _require_post(db, slug)
    if user is None:
        return InteractionMine(liked=False, starred=False, favorited=False, rating=0)
    doc = await db.user_interactions.find_one({"user_id": user["_id"], "post_slug": slug})
    if not doc:
        return InteractionMine(liked=False, starred=False, favorited=False, rating=0)
    r = int(doc.get("rating") or 0)
    return InteractionMine(
        liked=bool(doc.get("liked")),
        starred=bool(doc.get("starred")),
        favorited=bool(doc.get("favorited")),
        rating=r if 1 <= r <= 5 else 0,
    )


@router.post("/posts/{slug}/interactions/toggle")
async def toggle_interaction(
    db: DbDep,
    user: CurrentUser,
    slug: str,
    body: ToggleInteractionBody,
) -> dict:
    await _require_post(db, slug)
    field = _KIND_TO_FIELD.get(body.kind)
    if not field:
        raise HTTPException(status_code=400, detail="Invalid kind")

    doc = await _ensure_interaction_doc(db, user["_id"], slug)
    new_val = not bool(doc.get(field))
    await db.user_interactions.update_one(
        {"user_id": user["_id"], "post_slug": slug},
        {"$set": {field: new_val}},
    )
    return {"ok": True, "active": new_val}


@router.put("/posts/{slug}/interactions/rating")
async def set_rating(db: DbDep, user: CurrentUser, slug: str, body: RatingBody) -> dict:
    await _require_post(db, slug)
    await _ensure_interaction_doc(db, user["_id"], slug)
    await db.user_interactions.update_one(
        {"user_id": user["_id"], "post_slug": slug},
        {"$set": {"rating": body.value}},
    )
    return {"ok": True, "value": body.value}


@router.post("/posts/{slug}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(db: DbDep, user: CurrentUser, slug: str, body: CommentCreate) -> dict:
    await _require_post(db, slug)
    now = datetime.now(UTC)
    public = _user_doc_to_public(user)
    doc = {
        "post_slug": slug,
        "user_id": user["_id"],
        "username_snapshot": public.display_name or public.username,
        "text": body.text.strip(),
        "created_at": now,
    }
    result = await db.comments.insert_one(doc)
    return {"ok": True, "id": str(result.inserted_id)}


@router.get("/me/state", response_model=UserStateOut)
async def user_reading_state(db: DbDep, user: CurrentUser) -> UserStateOut:
    liked: list[str] = []
    starred: list[str] = []
    favorited: list[str] = []
    ratings: dict[str, int] = {}

    cursor = db.user_interactions.find({"user_id": user["_id"]})
    async for row in cursor:
        slug = row["post_slug"]
        if row.get("liked"):
            liked.append(slug)
        if row.get("starred"):
            starred.append(slug)
        if row.get("favorited"):
            favorited.append(slug)
        rv = int(row.get("rating") or 0)
        if 1 <= rv <= 5:
            ratings[slug] = rv

    cref = db.comments.find({"user_id": user["_id"]}).sort("created_at", -1).limit(200)
    comments_out: list[UserCommentRef] = []
    async for c in cref:
        comments_out.append(
            UserCommentRef(
                id=str(c["_id"]),
                slug=c["post_slug"],
                text=c["text"],
                created_at=c["created_at"],
            )
        )

    return UserStateOut(
        liked=liked,
        starred=starred,
        favorited=favorited,
        ratings=ratings,
        comments=comments_out,
    )
