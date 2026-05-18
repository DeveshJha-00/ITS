"""
Admin API routes.
"""
import os
from flask import Blueprint, request, jsonify
from app.services.slot_service import SlotService
from app.services.booking_service import BookingService
from app.services.analytics_service import AnalyticsService
from app.services.rate_service import RateService
from app.config import SlotStatus, ENTRY_POINTS, EXIT_POINTS, GRID_COLS, GRID_ROWS

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

def check_admin_auth(f):
    """Decorator to check admin authorization."""
    from functools import wraps
    
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        expected_token = f"Bearer {os.getenv('ADMIN_PASSWORD', 'admin123')}"
        
        if auth_header != expected_token:
            return jsonify({"error": "Unauthorized"}), 401
        
        return f(*args, **kwargs)
    
    return decorated_function

@admin_bp.route("/analytics", methods=["GET"])
@check_admin_auth
def get_analytics():
    """Get analytics dashboard data."""
    period = request.args.get("period", "weekly")
    return jsonify({
        "occupancy_rate": AnalyticsService.get_occupancy_rate(),
        "today_revenue": AnalyticsService.get_today_revenue(),
        "today_sessions": AnalyticsService.get_today_session_count(),
        "hourly_revenue": AnalyticsService.get_hourly_revenue(),
        "hourly_vehicle_flow": AnalyticsService.get_hourly_vehicle_flow(),
        "occupancy_series": AnalyticsService.get_occupancy_series(period),
        "vehicle_type_breakdown": AnalyticsService.get_vehicle_type_breakdown(),
        "sales_summary": AnalyticsService.get_sales_summary(period),
        "sales_series": AnalyticsService.get_sales_series(period),
    })

@admin_bp.route("/bookings", methods=["GET"])
@check_admin_auth
def get_bookings():
    """Get all bookings for admin management."""
    status = request.args.get("status")
    slot_id = request.args.get("slot_id")
    limit = request.args.get("limit", 200, type=int)
    offset = request.args.get("offset", 0, type=int)

    if limit is None:
        limit = 200
    limit = max(1, min(limit, 500))
    offset = max(0, offset or 0)

    if slot_id:
        bookings = BookingService.get_bookings_by_slot(slot_id)
    else:
        bookings = BookingService.get_bookings(limit=limit, offset=offset, status=status)

    return jsonify([booking.to_dict() for booking in bookings])

@admin_bp.route("/bookings/prune", methods=["POST"])
@check_admin_auth
def prune_bookings():
    """Delete older completed booking logs while keeping the most recent entries."""
    try:
        data = request.json or {}
        keep_latest = data.get("keep_latest", 5000)
        keep_latest = max(0, min(int(keep_latest), 50000))

        deleted = BookingService.prune_completed_bookings(keep_latest=keep_latest)
        return jsonify({"status": "ok", "deleted": deleted, "kept": keep_latest}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@admin_bp.route("/bookings/force-assign", methods=["POST"])
@check_admin_auth
def force_assign_booking():
    """Create or replace a booking on any slot."""
    try:
        data = request.json or {}
        required_fields = ["slot_id", "driver_name", "vehicle_number", "vehicle_type", "arrival_time"]
        if not all(data.get(field) for field in required_fields):
            return jsonify({"error": "Missing required fields"}), 400

        booking_id = BookingService.force_assign_booking(
            slot_id=data["slot_id"],
            driver_name=data["driver_name"],
            vehicle_number=data["vehicle_number"],
            vehicle_type=data["vehicle_type"],
            arrival_time=data["arrival_time"],
            status=data.get("status"),
            checkin_time=data.get("checkin_time"),
            checkout_time=data.get("checkout_time"),
            amount_charged=data.get("amount_charged"),
        )

        booking = BookingService.get_booking(booking_id)
        return jsonify({"booking": booking.to_dict(), "booking_id": booking_id}), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@admin_bp.route("/bookings/<booking_id>", methods=["DELETE"])
@check_admin_auth
def delete_booking(booking_id):
    """Delete any booking or log entry."""
    try:
        deleted = BookingService.delete_booking(booking_id)
        return jsonify({"status": "deleted", "booking": deleted}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@admin_bp.route("/slots/layout", methods=["GET"])
@check_admin_auth
def get_slots_layout():
    """Return all slots with spatial coordinates plus gate-point metadata."""
    try:
        slots = SlotService.get_all_slots()
        return jsonify({
            "slots": [s.to_dict() for s in slots],
            "entry_points": ENTRY_POINTS,
            "exit_points": EXIT_POINTS,
            "grid": {"cols": GRID_COLS, "rows": GRID_ROWS},
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/slots/layout", methods=["PATCH"])
@check_admin_auth
def update_slots_layout():
    """Bulk-update spatial coordinates for multiple slots.

    Expected body: {"slots": [{"slot_id": "4W-001", "pos_x": 0, "pos_y": 3}, ...]}
    """
    try:
        data = request.json or {}
        slot_updates = data.get("slots", [])

        if not isinstance(slot_updates, list) or not slot_updates:
            return jsonify({"error": "slots must be a non-empty list"}), 400

        for item in slot_updates:
            if not all(k in item for k in ("slot_id", "pos_x", "pos_y")):
                return jsonify({"error": "Each entry needs slot_id, pos_x, pos_y"}), 400
            if not isinstance(item["pos_x"], int) or not isinstance(item["pos_y"], int):
                return jsonify({"error": "pos_x and pos_y must be integers"}), 400

        updated = SlotService.bulk_update_layout(slot_updates)
        return jsonify({"updated": updated, "entry_points": ENTRY_POINTS, "exit_points": EXIT_POINTS}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/slots/<slot_id>", methods=["PATCH"])
@check_admin_auth
def update_slot(slot_id):
    """Update slot configuration."""
    try:
        data = request.json
        
        if "status" in data:
            SlotService.update_slot_status(slot_id, data["status"])
        
        if "category" in data:
            SlotService.update_slot_category(slot_id, data["category"])
        
        if "rate_per_hour" in data:
            SlotService.update_slot_rate(slot_id, data["rate_per_hour"])
        
        slot = SlotService.get_slot(slot_id)
        return jsonify(slot.to_dict()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@admin_bp.route("/slots/<slot_id>/force-release", methods=["POST"])
@check_admin_auth
def force_release_slot(slot_id):
    """Manually release a slot."""
    try:
        SlotService.update_slot_status(slot_id, SlotStatus.AVAILABLE)
        return jsonify({"status": "released"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@admin_bp.route("/sessions", methods=["GET"])
@check_admin_auth
def get_sessions():
    """Get paginated session log."""
    limit = request.args.get("limit", 50, type=int)
    offset = request.args.get("offset", 0, type=int)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    vehicle_type = request.args.get("vehicle_type")
    
    sessions = AnalyticsService.get_session_log(
        limit=limit,
        offset=offset,
        date_from=date_from,
        date_to=date_to,
        vehicle_type=vehicle_type,
    )
    
    return jsonify(sessions)

@admin_bp.route("/utilization-heatmap", methods=["GET"])
@check_admin_auth
def get_utilization_heatmap():
    """Get slot utilization heatmap."""
    days = request.args.get("days", 7, type=int)
    heatmap = AnalyticsService.get_slot_utilization_heatmap(days=days)
    return jsonify(heatmap)

@admin_bp.route("/rates", methods=["GET"])
@check_admin_auth
def get_rates():
    """Get billing rules for supported vehicle types."""
    return jsonify(RateService.get_rate_settings())

@admin_bp.route("/rates/<vehicle_type>", methods=["PATCH"])
@check_admin_auth
def update_rate(vehicle_type):
    """Update billing rules for a vehicle type and sync to all slots."""
    try:
        data = request.json or {}
        min_charge = data.get("min_charge")
        hourly_rate = data.get("hourly_rate")

        if min_charge is None or hourly_rate is None:
            return jsonify({"error": "Missing min_charge or hourly_rate"}), 400

        # Update the rate settings in the database
        updated = RateService.upsert_rate_setting(vehicle_type, float(min_charge), float(hourly_rate))
        
        # Sync the new rate to all slots with this category
        SlotService.update_all_slots_rate_by_category(vehicle_type, float(hourly_rate))
        
        return jsonify(updated), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@admin_bp.route("/login", methods=["POST"])
def admin_login():
    """Simple admin login endpoint."""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Missing request body"}), 400
        
        password = data.get("password")
        if not password:
            return jsonify({"error": "Missing password field"}), 400
        
        expected = os.getenv("ADMIN_PASSWORD", "admin123")
        
        if password == expected:
            return jsonify({"token": f"Bearer {password}", "success": True}), 200
        else:
            return jsonify({"error": "Invalid password"}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500
