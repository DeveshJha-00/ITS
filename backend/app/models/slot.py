"""
Slot model representing a parking slot.
"""

class Slot:
    """Parking slot data model."""

    def __init__(self, slot_id, category, status, rate_per_hour, pos_x=None, pos_y=None):
        self.slot_id = slot_id
        self.category = category
        self.status = status
        self.rate_per_hour = rate_per_hour
        self.pos_x = pos_x
        self.pos_y = pos_y

    def to_dict(self):
        """Convert slot to dictionary."""
        return {
            "slot_id": self.slot_id,
            "category": self.category,
            "status": self.status,
            "rate_per_hour": self.rate_per_hour,
            "pos_x": self.pos_x,
            "pos_y": self.pos_y,
        }

    @staticmethod
    def from_row(row):
        """Create Slot from database row (expects 6-column rows with pos_x/pos_y)."""
        return Slot(
            slot_id=row[0],
            category=row[1],
            status=row[2],
            rate_per_hour=row[3],
            pos_x=row[4] if len(row) > 4 else None,
            pos_y=row[5] if len(row) > 5 else None,
        )
