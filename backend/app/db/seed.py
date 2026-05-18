"""
Database seeding: populate initial slots and historical occupancy data.
"""
import sqlite3
import os
import sys
from datetime import datetime, timedelta
import math
import random

if __package__ is None or __package__ == "":
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.config import (
    SlotCategory, SlotStatus, DEFAULT_RATES, SLOTS_LAYOUT, TOTAL_SLOTS, GRID_COLS
)

# Row start index per slot-ID prefix (determines where each category sits in the grid)
_CATEGORY_ROW_START = {
    "2W": 0,   # rows 0-2  (30 slots)
    "4W": 3,   # rows 3-7  (50 slots)
    "EV": 8,   # rows 8-9  (15 slots)
    "D":  10,  # row  10   (5 slots — prefix "D" for Disabled)
}
from app.db.path import DB_PATH

DEFAULT_BILLING_RULES = {
    SlotCategory.TWO_WHEELER: {"min_charge": 25.0, "hourly_rate": 20.0},
    SlotCategory.FOUR_WHEELER: {"min_charge": 25.0, "hourly_rate": 20.0},
    SlotCategory.EV: {"min_charge": 25.0, "hourly_rate": 20.0},
}

def seed_rate_settings():
    """Populate default billing rules for supported vehicle types."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("DELETE FROM rate_settings")

    for vehicle_type, rule in DEFAULT_BILLING_RULES.items():
        cursor.execute("""
            INSERT INTO rate_settings (vehicle_type, min_charge, hourly_rate)
            VALUES (?, ?, ?)
        """, (vehicle_type, rule["min_charge"], rule["hourly_rate"]))

    conn.commit()
    conn.close()
    print("Seeded default billing rules")

def seed_slots():
    """Populate parking slots."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Clear existing slots
    cursor.execute("DELETE FROM slots")
    
    slot_index = 1
    occupied_slots = [
        "2W-005", "2W-010", "4W-008", "4W-015", "4W-023", 
        "EV-003", "EV-007", "D-002"
    ]
    
    # Create slots for each category
    for category, count in SLOTS_LAYOUT.items():
        for i in range(count):
            category_prefix = {
                SlotCategory.TWO_WHEELER: "2W",
                SlotCategory.FOUR_WHEELER: "4W",
                SlotCategory.EV: "EV",
                SlotCategory.DISABLED: "D",
            }[category]
            
            slot_id = f"{category_prefix}-{i+1:03d}"
            rate = DEFAULT_RATES[category]
            
            # Pre-populate some slots as occupied for demo
            status = SlotStatus.OCCUPIED if slot_id in occupied_slots else SlotStatus.AVAILABLE
            
            # Calculate grid coordinates: 0-indexed slot number within its category
            idx = i  # i is 0-based loop counter
            row_start = _CATEGORY_ROW_START.get(category_prefix, 0)
            pos_x = idx % GRID_COLS
            pos_y = row_start + (idx // GRID_COLS)

            cursor.execute("""
                INSERT INTO slots (slot_id, category, status, rate_per_hour, pos_x, pos_y)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (slot_id, category, status, rate, pos_x, pos_y))
    
    conn.commit()
    conn.close()
    print(f"Seeded {TOTAL_SLOTS} slots (with {len(occupied_slots)} pre-occupied for demo)")

def assign_default_coordinates():
    """Backfill grid coordinates for existing slots that have NULL pos_x / pos_y.

    Safe to call repeatedly — only updates rows where both values are NULL.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute(
        "SELECT slot_id FROM slots WHERE pos_x IS NULL OR pos_y IS NULL ORDER BY slot_id"
    )
    rows = cursor.fetchall()

    updated = 0
    for (slot_id,) in rows:
        parts = slot_id.split("-")
        if len(parts) != 2:
            continue
        prefix = parts[0]
        try:
            idx = int(parts[1]) - 1  # convert 1-based slot number to 0-based index
        except ValueError:
            continue

        row_start = _CATEGORY_ROW_START.get(prefix, 0)
        pos_x = idx % GRID_COLS
        pos_y = row_start + (idx // GRID_COLS)

        cursor.execute(
            "UPDATE slots SET pos_x = ?, pos_y = ? WHERE slot_id = ?",
            (pos_x, pos_y, slot_id),
        )
        updated += 1

    conn.commit()
    conn.close()
    if updated:
        print(f"Assigned default coordinates to {updated} slot(s)")


def seed_occupancy_history(days=30, random_seed=None):
    """Generate simulated occupancy history for a configurable number of days.

    Adds realistic hourly patterns with weekly, monthly and yearly seasonality
    and small random noise so trends (weekly/monthly/yearly) can be observed.
    """
    if random_seed is not None:
        random.seed(random_seed)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Clear existing history
    cursor.execute("DELETE FROM occupancy_history")

    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)

    # Base occupancy by hour of day (daily pattern)
    occupancy_by_hour = {
        0: 5, 1: 3, 2: 2, 3: 2, 4: 3, 5: 8,
        6: 15, 7: 35, 8: 65, 9: 80, 10: 85, 11: 88,
        12: 90, 13: 85, 14: 75, 15: 70, 16: 72, 17: 78,
        18: 92, 19: 88, 20: 75, 21: 60, 22: 40, 23: 20,
    }

    total_hours = int((end_date - start_date).total_seconds() // 3600)
    current = start_date
    hour_index = 0
    while current < end_date:
        hour = current.hour
        day_of_week = current.weekday()  # 0=Mon .. 6=Sun

        # Daily pattern
        base = occupancy_by_hour.get(hour, 50)

        # Weekly pattern: slightly higher on weekdays, lower on weekends
        weekly = -10 if day_of_week >= 5 else 0

        # Monthly seasonality (approx): a slow sinus wave over ~30 days
        days_since_start = (current - start_date).days
        monthly = 6 * math.sin(2 * math.pi * days_since_start / 30)

        # Yearly seasonality (approx): slow sinus over 365 days
        yearly = 8 * math.sin(2 * math.pi * days_since_start / 365)

        # Trend component: small upward or downward trend across the seeded range
        trend = 0.02 * (days_since_start) / max(1, days)

        # Random noise
        noise = random.gauss(0, 3)

        occupancy_pct = base + weekly + monthly + yearly + (base * trend) + noise
        occupancy_pct = max(0, min(100, round(occupancy_pct, 1)))

        snapshot_time = current.isoformat()

        cursor.execute(
            """
            INSERT INTO occupancy_history (snapshot_time, day_of_week, hour, occupancy_pct)
            VALUES (?, ?, ?, ?)
            """,
            (snapshot_time, day_of_week, hour, occupancy_pct),
        )

        current += timedelta(hours=1)
        hour_index += 1

    conn.commit()
    conn.close()
    print(f"Seeded occupancy history for {days} days ({total_hours} hourly snapshots)")

def seed_db():
    """Run all seeding routines."""
    seed_rate_settings()
    seed_slots()
    # Default to 30 days but allow override via env or CLI in __main__
    seed_occupancy_history()

if __name__ == "__main__":
    # Allow running the seeder with a custom number of days, e.g.
    # python seed.py 365
    import sys

    days = 30
    if len(sys.argv) > 1:
        try:
            days = int(sys.argv[1])
        except ValueError:
            print("Invalid days argument, using default 30")

    # Optional second arg: random seed for reproducibility
    rand_seed = None
    if len(sys.argv) > 2:
        try:
            rand_seed = int(sys.argv[2])
        except ValueError:
            rand_seed = None

    seed_rate_settings()
    seed_slots()
    seed_occupancy_history(days=days, random_seed=rand_seed)
