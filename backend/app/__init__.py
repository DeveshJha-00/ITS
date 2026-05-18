"""
Flask application factory and main entry point.
"""
import os
import sys

if __package__ is None or __package__ == "":
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler
from app.db.init import init_db
from app.db.seed import seed_db, seed_rate_settings, assign_default_coordinates
from app.routes.public import public_bp
from app.routes.admin import admin_bp
from app.routes.debug import debug_bp
from app.jobs.auto_release import auto_release_job

def create_app():
    """Create and configure Flask application."""
    app = Flask(__name__)
    
    # Enable CORS
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    
    # Initialize database
    init_db()
    seed_rate_settings()
    
    # Check if slots need seeding
    from app.services.slot_service import SlotService
    if SlotService.get_total_slots() == 0:
        print("Seeding initial data...")
        seed_db()
    else:
        # Backfill spatial coordinates for any existing slots that lack them
        assign_default_coordinates()
    
    # Register blueprints
    app.register_blueprint(public_bp)
    app.register_blueprint(admin_bp)
    # Debug routes (local dev only)
    app.register_blueprint(debug_bp)
    
    # Set up background scheduler
    scheduler = BackgroundScheduler()
    scheduler.add_job(auto_release_job, 'interval', seconds=60)
    scheduler.start()
    
    # Root route
    @app.route("/")
    def index():
        return {"status": "ParkSmart API running"}
    
    return app

if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, host="0.0.0.0", port=5000)
