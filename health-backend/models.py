from pydantic import BaseModel, Field


# ── Weight ────────────────────────────────────────────────────────────────────

class WeightRecord(BaseModel):
    id: int
    ts: float
    weight_kg: float
    bmi: float | None = None
    body_fat_pct: float | None = None
    muscle_kg: float | None = None
    bone_kg: float | None = None
    visceral_fat: int | None = None
    water_pct: float | None = None
    bmr_kcal: int | None = None
    source: str


class WeightCreate(BaseModel):
    ts: float | None = None
    weight_kg: float = Field(gt=0, lt=300)
    bmi: float | None = None
    body_fat_pct: float | None = None
    muscle_kg: float | None = None
    bone_kg: float | None = None
    visceral_fat: int | None = None
    water_pct: float | None = None
    bmr_kcal: int | None = None
    source: str = "manual"


# ── Heart Rate ────────────────────────────────────────────────────────────────

class HeartrateRecord(BaseModel):
    id: int
    ts: float
    bpm: int
    source: str


class HeartrateCreate(BaseModel):
    ts: float | None = None
    bpm: int = Field(gt=0, lt=300)
    source: str = "galaxy_watch"


class HeartrateBatch(BaseModel):
    records: list[HeartrateCreate]


class HeartratePoint(BaseModel):
    ts: float
    bpm: float  # avg within bucket


# ── Exercise ──────────────────────────────────────────────────────────────────

class ExerciseRecord(BaseModel):
    id: int
    started_at: float
    ended_at: float
    type: str | None = None
    duration_min: int | None = None
    calories: int | None = None
    distance_m: int | None = None
    source: str


class ExerciseCreate(BaseModel):
    started_at: float
    ended_at: float
    type: str | None = None
    duration_min: int | None = None
    calories: int | None = None
    distance_m: int | None = None
    source: str = "galaxy_watch"
