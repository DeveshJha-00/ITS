"""
Shared configuration and enums for ParkSmart system.
"""
from enum import Enum

# Slot Categories
class SlotCategory(str, Enum):
    TWO_WHEELER = "2W"
    FOUR_WHEELER = "4W"
    EV = "EV"
    DISABLED = "Disabled"

# Slot Status
class SlotStatus(str, Enum):
    AVAILABLE = "available"
    OCCUPIED = "occupied"
    RESERVED = "reserved"
    UNAVAILABLE = "unavailable"

# Booking Status
class BookingStatus(str, Enum):
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"
    COMPLETED = "completed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"

# Default pricing (in INR per hour)
DEFAULT_RATES = {
    SlotCategory.TWO_WHEELER: 10.0,
    SlotCategory.FOUR_WHEELER: 20.0,
    SlotCategory.EV: 15.0,
    SlotCategory.DISABLED: 5.0,
}

# Hold window duration (minutes)
DEFAULT_HOLD_WINDOW = 15

# Parking lot configuration
TOTAL_SLOTS = 100
SLOTS_LAYOUT = {
    SlotCategory.TWO_WHEELER: 30,
    SlotCategory.FOUR_WHEELER: 50,
    SlotCategory.EV: 15,
    SlotCategory.DISABLED: 5,
}

# Spatial grid dimensions (columns × rows)
# Row layout: 2W rows 0-2, 4W rows 3-7, EV rows 8-9, Disabled row 10
GRID_COLS = 10
GRID_ROWS = 11  # rows 0-10

# Static entry points — top-left and top-right corners of the grid (row 0)
ENTRY_POINTS = {
    "A": {"name": "Entry A", "x": 0,             "y": 0,             "side": "left"},
    "B": {"name": "Entry B", "x": GRID_COLS - 1, "y": 0,             "side": "right"},
}

# Static exit points — bottom-left and bottom-right corners of the grid (row GRID_ROWS-1)
EXIT_POINTS = {
    "A": {"name": "Exit A", "x": 0,              "y": GRID_ROWS - 1, "side": "left"},
    "B": {"name": "Exit B", "x": GRID_COLS - 1,  "y": GRID_ROWS - 1, "side": "right"},
}
