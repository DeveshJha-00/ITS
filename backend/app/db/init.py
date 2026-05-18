"""
Database initialization: schema creation.
"""
import sqlite3
from app.db.path import DB_PATH

def init_db():
    """Create database schema if it doesn't exist."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create slots table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS slots (
            slot_id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            status TEXT NOT NULL,
            rate_per_hour REAL NOT NULL
        )
    """)
    
    # Create bookings table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bookings (
            booking_id TEXT PRIMARY KEY,
            slot_id TEXT NOT NULL,
            driver_name TEXT NOT NULL,
            vehicle_number TEXT NOT NULL UNIQUE,
            vehicle_type TEXT NOT NULL,
            arrival_time TEXT NOT NULL,
            status TEXT NOT NULL,
            checkin_time TEXT,
            checkout_time TEXT,
            amount_charged REAL,
            FOREIGN KEY (slot_id) REFERENCES slots(slot_id)
        )
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_vehicle_number
        ON bookings(vehicle_number)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_status_checkout
        ON bookings(status, checkout_time DESC)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_recent_activity
        ON bookings(COALESCE(checkout_time, checkin_time, arrival_time) DESC, arrival_time DESC)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_slot_status
        ON bookings(slot_id, status)
    """)
    
    # Create occupancy_history table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS occupancy_history (
            snapshot_time TEXT PRIMARY KEY,
            day_of_week INTEGER NOT NULL,
            hour INTEGER NOT NULL,
            occupancy_pct REAL NOT NULL
        )
    """)

    # Create rate settings table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rate_settings (
            vehicle_type TEXT PRIMARY KEY,
            min_charge REAL NOT NULL,
            hourly_rate REAL NOT NULL
        )
    """)
    
    # Add spatial coordinate columns to slots if they don't exist yet
    # (safe migration: ALTER TABLE is a no-op if the column is already present)
    existing_cols = {row[1] for row in cursor.execute("PRAGMA table_info(slots)").fetchall()}
    if "pos_x" not in existing_cols:
        cursor.execute("ALTER TABLE slots ADD COLUMN pos_x INTEGER")
    if "pos_y" not in existing_cols:
        cursor.execute("ALTER TABLE slots ADD COLUMN pos_y INTEGER")

    conn.commit()
    conn.close()
    print(f"Database initialized at {DB_PATH}")

if __name__ == "__main__":
    init_db()
