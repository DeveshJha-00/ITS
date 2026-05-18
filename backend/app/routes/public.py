"""
Public API routes for drivers.
"""
from flask import Blueprint, request, jsonify
from app.services.slot_service import SlotService
from app.services.booking_service import BookingService, generate_qr_payload, decode_qr_payload
from app.services.prediction_service import PredictionService
from app.config import SlotStatus, ENTRY_POINTS, EXIT_POINTS, GRID_COLS

public_bp = Blueprint("public", __name__, url_prefix="/api")


def calculate_directions(slot, entry_key):
    """Step-by-step text directions from an entry gate (grid corner) to a parking slot.

    Gates are now inside the grid:
      Entry A → top-left  corner (col 0, row 0)
      Entry B → top-right corner (col GRID_COLS-1, row 0)

    Path: descend the corner aisle to the slot's row, then traverse the row to the slot.

    Returns a dict with: entry, slot_id, pos_x, pos_y, steps (list), description (str).
    """
    entry = ENTRY_POINTS.get(entry_key, ENTRY_POINTS["A"])

    if slot.pos_x is None or slot.pos_y is None:
        fallback = ["Proceed to the parking area and look for your slot number."]
        return {
            "entry": entry["name"], "slot_id": slot.slot_id,
            "pos_x": None, "pos_y": None,
            "steps": fallback, "description": fallback[0],
        }

    steps = []
    rows_down = slot.pos_y  # gate is at row 0; rows to walk down before turning

    if entry["side"] == "left":
        # Entry A: col 0, row 0 — walk down the left edge then right into the row
        if rows_down == 0:
            if slot.pos_x == 0:
                steps.append(f"Your slot {slot.slot_id} is right at {entry['name']} — no walking needed!")
            else:
                steps.append(f"From {entry['name']}, turn right and walk {slot.pos_x} spot(s) along the first row.")
                steps.append(f"Your slot {slot.slot_id} is spot #{slot.pos_x + 1} from the left.")
        else:
            steps.append(f"From {entry['name']}, walk down {rows_down} row(s) along the left aisle.")
            steps.append(f"Turn right into row {slot.pos_y + 1}.")
            steps.append(f"Your slot {slot.slot_id} is spot #{slot.pos_x + 1} from the left.")
    else:
        # Entry B: col GRID_COLS-1, row 0 — walk down the right edge then left into the row
        spot_from_right = (GRID_COLS - 1) - slot.pos_x  # spaces to walk left from right edge
        if rows_down == 0:
            if slot.pos_x == GRID_COLS - 1:
                steps.append(f"Your slot {slot.slot_id} is right at {entry['name']} — no walking needed!")
            else:
                steps.append(f"From {entry['name']}, turn left and walk {spot_from_right} spot(s) along the first row.")
                steps.append(f"Your slot {slot.slot_id} is spot #{spot_from_right + 1} from the right.")
        else:
            steps.append(f"From {entry['name']}, walk down {rows_down} row(s) along the right aisle.")
            steps.append(f"Turn left into row {slot.pos_y + 1}.")
            steps.append(f"Your slot {slot.slot_id} is spot #{spot_from_right + 1} from the right.")

    return {
        "entry": entry["name"], "slot_id": slot.slot_id,
        "pos_x": slot.pos_x, "pos_y": slot.pos_y,
        "steps": steps, "description": " → ".join(steps),
    }


def calculate_exit_directions(slot, exit_key):
    """Step-by-step text directions from a parking slot to an exit gate (grid corner).

    Gates are now inside the grid:
      Exit A → bottom-left  corner (col 0, row GRID_ROWS-1)
      Exit B → bottom-right corner (col GRID_COLS-1, row GRID_ROWS-1)

    Path: traverse the row to the aisle column, then descend to the exit corner.

    Returns a dict with: exit, slot_id, pos_x, pos_y, steps (list), description (str).
    """
    from app.config import GRID_ROWS as _GRID_ROWS
    exit_pt = EXIT_POINTS.get(exit_key, EXIT_POINTS["A"])

    if slot.pos_x is None or slot.pos_y is None:
        fallback = ["Proceed to the nearest exit gate."]
        return {
            "exit": exit_pt["name"], "slot_id": slot.slot_id,
            "pos_x": None, "pos_y": None,
            "steps": fallback, "description": fallback[0],
        }

    steps = []
    rows_to_exit = (_GRID_ROWS - 1) - slot.pos_y  # rows to walk down to reach the exit row

    if exit_pt["side"] == "left":
        # Exit A: col 0, bottom-left — walk left to col 0, then down to exit row
        if slot.pos_x == 0:
            steps.append(f"From slot {slot.slot_id}, you are already at the left aisle.")
        else:
            steps.append(f"From slot {slot.slot_id}, turn left and walk {slot.pos_x} space(s) to the left aisle.")
        if rows_to_exit == 0:
            steps.append(f"You have reached {exit_pt['name']}.")
        else:
            steps.append(f"Walk down {rows_to_exit} row(s) to reach {exit_pt['name']} at the bottom-left.")
    else:
        # Exit B: col GRID_COLS-1, bottom-right — walk right to last col, then down to exit row
        spaces_right = (GRID_COLS - 1) - slot.pos_x
        if spaces_right == 0:
            steps.append(f"From slot {slot.slot_id}, you are already at the right aisle.")
        else:
            steps.append(f"From slot {slot.slot_id}, turn right and walk {spaces_right} space(s) to the right aisle.")
        if rows_to_exit == 0:
            steps.append(f"You have reached {exit_pt['name']}.")
        else:
            steps.append(f"Walk down {rows_to_exit} row(s) to reach {exit_pt['name']} at the bottom-right.")

    return {
        "exit": exit_pt["name"], "slot_id": slot.slot_id,
        "pos_x": slot.pos_x, "pos_y": slot.pos_y,
        "steps": steps, "description": " → ".join(steps),
    }


@public_bp.route("/slots", methods=["GET"])
def get_slots():
    """Get all slots with optional filters."""
    category = request.args.get("type")
    status = request.args.get("status")
    
    slots = SlotService.get_slots_filtered(category=category, status=status)
    return jsonify([slot.to_dict() for slot in slots])

@public_bp.route("/bookings", methods=["POST"])
def create_booking():
    """Create a new booking."""
    try:
        data = request.json
        
        slot_id = data.get("slot_id")
        driver_name = data.get("driver_name")
        vehicle_number = data.get("vehicle_number")
        vehicle_type = data.get("vehicle_type")
        arrival_time = data.get("arrival_time")
        
        if not all([slot_id, driver_name, vehicle_number, vehicle_type, arrival_time]):
            return jsonify({"error": "Missing required fields"}), 400
        
        booking_id = BookingService.create_booking(
            slot_id, driver_name, vehicle_number, vehicle_type, arrival_time
        )

        qr_payload = generate_qr_payload(booking_id, vehicle_number)

        booking = BookingService.get_booking(booking_id)

        return jsonify({
            "booking": booking.to_dict() if booking else None,
            "qr_payload": qr_payload,
            "slot_id": slot_id,
        }), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@public_bp.route("/bookings/<booking_id>", methods=["DELETE"])
def cancel_booking(booking_id):
    """Cancel a booking."""
    try:
        BookingService.cancel_booking(booking_id)
        return jsonify({"status": "cancelled"}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@public_bp.route("/checkin", methods=["POST"])
def check_in():
    """Check in a booking via QR scan.

    Optional body field ``entry_point`` ("A" or "B", default "A") selects which
    entry gate the driver is using.  The response includes a ``directions`` object
    with step-by-step navigation from the gate to the slot.
    """
    try:
        data = request.json
        qr_payload = data.get("qr_payload")

        if not qr_payload:
            return jsonify({"error": "Missing qr_payload"}), 400

        entry_key = (data.get("entry_point") or "A").upper()
        if entry_key not in ENTRY_POINTS:
            entry_key = "A"

        decoded = decode_qr_payload(qr_payload)
        booking_id = decoded.get("booking_id")

        result = BookingService.check_in(booking_id)

        slot = SlotService.get_slot(result["slot_id"])
        result["directions"] = calculate_directions(slot, entry_key)
        result["entry_point"] = entry_key

        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@public_bp.route("/checkout", methods=["POST"])
def check_out():
    """Preview the checkout bill via QR scan without freeing the slot."""
    try:
        data = request.json
        qr_payload = data.get("qr_payload")
        
        if not qr_payload:
            return jsonify({"error": "Missing qr_payload"}), 400
        
        decoded = decode_qr_payload(qr_payload)
        booking_id = decoded.get("booking_id")
        
        bill = BookingService.preview_checkout(booking_id)
        return jsonify({"bill": bill, "payment_required": True}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@public_bp.route("/checkout/complete", methods=["POST"])
def complete_checkout():
    """Finalize checkout after simulated payment and free the slot.

    Optional body field ``exit_point`` ("A" or "B", default "A") selects which
    exit gate the driver will use.  The response includes an ``exit_directions``
    object with step-by-step navigation from the slot to the chosen exit gate.
    """
    try:
        data = request.json
        qr_payload = data.get("qr_payload")
        checkout_time = data.get("checkout_time")

        if not qr_payload:
            return jsonify({"error": "Missing qr_payload"}), 400

        exit_key = (data.get("exit_point") or "A").upper()
        if exit_key not in EXIT_POINTS:
            exit_key = "A"

        decoded = decode_qr_payload(qr_payload)
        booking_id = decoded.get("booking_id")

        # Fetch slot before completing checkout so we can compute exit directions
        booking = BookingService.get_booking(booking_id)
        if not booking:
            return jsonify({"error": f"Booking {booking_id} not found"}), 404
        slot = SlotService.get_slot(booking.slot_id)

        bill = BookingService.complete_checkout(booking_id, checkout_time=checkout_time)
        exit_directions = calculate_exit_directions(slot, exit_key) if slot else None

        return jsonify({
            "bill": bill,
            "payment_status": "paid",
            "slot_freed": True,
            "exit_point": exit_key,
            "exit_directions": exit_directions,
        }), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@public_bp.route("/bookings/walkin", methods=["POST"])
def walkin_booking():
    """Create a walk-in booking."""
    try:
        data = request.json
        
        slot_id = data.get("slot_id")
        driver_name = data.get("driver_name")
        vehicle_number = data.get("vehicle_number")
        vehicle_type = data.get("vehicle_type")
        
        if not all([slot_id, driver_name, vehicle_number, vehicle_type]):
            return jsonify({"error": "Missing required fields"}), 400
        
        booking_id = BookingService.create_walkin_booking(
            slot_id, driver_name, vehicle_number, vehicle_type
        )

        qr_payload = generate_qr_payload(booking_id, vehicle_number)

        booking = BookingService.get_booking(booking_id)

        return jsonify({
            "booking": booking.to_dict() if booking else None,
            "qr_payload": qr_payload,
            "slot_id": slot_id,
        }), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@public_bp.route("/predict/today", methods=["GET"])
def predict_today():
    """Get predicted occupancy for today."""
    predictions = PredictionService.predict_today()
    peak_hours = PredictionService.predict_peak_hours()
    
    return jsonify({
        "predictions": predictions,
        "peak_hours": peak_hours,
    })
