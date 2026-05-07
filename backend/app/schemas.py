from datetime import datetime
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

ContentKind = Literal["blog", "essay"]
UserRole = Literal["user", "admin"]
InteractionKind = Literal["likes", "stars", "favorites"]


class UserPublic(BaseModel):
    id: str
    username: str
    display_name: str
    role: UserRole
    created_at: datetime


class UserRegister(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(
        default="",
        max_length=128,
        validation_alias=AliasChoices("display_name", "displayName"),
    )

    @field_validator("username")
    @classmethod
    def username_lower(cls, v: str) -> str:
        return v.strip().lower()


class UserLogin(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_lower(cls, v: str) -> str:
        return v.strip().lower()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class PostBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(min_length=1, max_length=500)
    slug: str = Field(min_length=1, max_length=120)
    kind: ContentKind = "essay"
    description: str = Field(default="", max_length=2000)
    body_html: str = Field(default="", validation_alias=AliasChoices("body_html", "bodyHtml"))
    cover: str = Field(default="", max_length=4000)
    date: str = Field(..., description="ISO date YYYY-MM-DD")
    author: str = Field(default="", max_length=200, validation_alias=AliasChoices("author", "author_display"))
    tags: list[str] = Field(default_factory=list)
    reading_time: int = Field(
        default=0,
        ge=0,
        le=1000,
        validation_alias=AliasChoices("reading_time", "readingTime"),
    )
    published: bool = True
    content_type: str = Field(default="html", max_length=32)

    @field_validator("slug")
    @classmethod
    def slug_format(cls, v: str) -> str:
        s = v.strip().lower()
        if not s or any(c in s for c in " \t\n/\\"):
            raise ValueError("Invalid slug")
        return s

    @field_validator("tags", mode="before")
    @classmethod
    def split_tags(cls, v):
        if isinstance(v, str):
            return [t.strip() for t in v.split(",") if t.strip()]
        return v


class PostCreate(PostBase):
    pass


class PostUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    body_html: str | None = None
    cover: str | None = None
    date: str | None = None
    author: str | None = None
    tags: list[str] | None = None
    reading_time: int | None = Field(default=None, ge=0, le=1000)
    published: bool | None = None
    kind: ContentKind | None = None

    @field_validator("tags", mode="before")
    @classmethod
    def tags_optional(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            return [t.strip() for t in v.split(",") if t.strip()]
        return v


class PostOut(BaseModel):
    id: str
    slug: str
    title: str
    kind: ContentKind
    description: str
    body_html: str
    cover: str
    date: str
    author: str
    author_id: str
    tags: list[str]
    reading_time: int
    published: bool
    content_type: str
    created_at: datetime
    updated_at: datetime
    local: bool = False


class CommentOut(BaseModel):
    id: str
    user_id: str
    username: str
    text: str
    created_at: datetime


class PostListItem(BaseModel):
    id: str
    slug: str
    title: str
    kind: ContentKind
    description: str
    cover: str
    date: str
    author: str
    tags: list[str]
    reading_time: int
    published: bool
    content_type: str
    local: bool = False


class InteractionStats(BaseModel):
    slug: str
    likes: int
    stars: int
    favorites: int
    ratings_count: int
    rating_avg: float
    comments: list[CommentOut]


class CommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


class ToggleInteractionBody(BaseModel):
    kind: InteractionKind


class RatingBody(BaseModel):
    value: int = Field(ge=1, le=5)


class UserCommentRef(BaseModel):
    id: str
    slug: str
    text: str
    created_at: datetime


class UserStateOut(BaseModel):
    liked: list[str]
    starred: list[str]
    favorited: list[str]
    ratings: dict[str, int]
    comments: list[UserCommentRef]


class InteractionMine(BaseModel):
    liked: bool
    starred: bool
    favorited: bool
    rating: int
