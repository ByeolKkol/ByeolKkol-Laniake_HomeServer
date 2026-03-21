_BUCKET_RULES: list[tuple[int, int]] = [
    (5 * 60,        10),       # ≤5m  → 10s
    (30 * 60,       60),       # ≤30m → 1min
    (60 * 60,       120),      # ≤1h  → 2min
    (6 * 60 * 60,   600),      # ≤6h  → 10min
    (24 * 60 * 60,  1800),     # ≤24h → 30min
    (7 * 86400,     7200),     # ≤7d  → 2h
    (30 * 86400,    21600),    # ≤30d → 6h
    (365 * 86400,   86400),    # ≤1y  → 1d
]


def bucket_size(span: float) -> int:
    for limit, bucket in _BUCKET_RULES:
        if span <= limit:
            return bucket
    return 86400
