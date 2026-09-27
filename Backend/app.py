"""
Octo Buddy Flask API

This file is the backend for the Octo Buddy web application.
It handles:
- registration and OTP verification
- login and role-based access
- student profiles
- Octo Buddy applications
- tutoring bookings
- tutoring sessions
- admin approval/scheduling
- simple dashboard statistics

"""



import os
import re
import random
import hashlib
import hmac
from datetime import datetime, date

from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import or_
from dotenv import load_dotenv

# Load local .env settings before reading DATABASE_URL.
load_dotenv()


app = Flask(__name__)
CORS(app)

app.config["SECRET_KEY"] = os.environ.get(
    "SECRET_KEY",
    "octo-buddy-development-secret-change-me"
)

# Never hard-code database passwords in source code.
# Use DATABASE_URL for Supabase/PostgreSQL.
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL",
    "sqlite:///octobuddy_local.db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)


# ============================================================
# DATABASE MODELS
# ============================================================

class User(db.Model):
    """Registered platform user."""

    __tablename__ = "Users"

    id = db.Column("User_id", db.Integer, primary_key=True)
    first_name = db.Column("First_Name", db.String(50), nullable=False)
    last_name = db.Column("Last_Name", db.String(50), nullable=False)
    password_hash = db.Column("Password", db.String(255), nullable=False)
    email = db.Column("Email", db.String(120), unique=True, nullable=False)
    course = db.Column("course", db.String(100), default="General")
    academic_year = db.Column("Acedemic_year", db.Integer, default=1)
    is_verified = db.Column("Verified", db.SmallInteger, default=0)
    verification_token = db.Column("VerificationToken", db.String(255), nullable=True)
    role = db.Column("Role", db.String(50), default="student")
    points = db.Column("Points", db.Integer, default=0)

    def set_password(self, password):
        """Hash and store a password."""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """
        Check the password against the stored value.

        New accounts use Werkzeug password hashes. Some older project
        databases may contain a legacy plain-text password, so we support
        that once and immediately upgrade it to a secure hash after a
        successful login. This keeps existing accounts working without
        leaving their password stored in plain text.
        """
        stored = self.password_hash or ""

        # 1) Current accounts use Werkzeug's secure password hashes.
        try:
            if check_password_hash(stored, password):
                return True
        except (ValueError, TypeError):
            # The database may contain a password from an older version.
            pass

        # 2) Older versions of the project may have stored the password as
        #    plain text. If it matches, immediately upgrade it to a secure hash.
        if hmac.compare_digest(stored, password):
            self.set_password(password)
            db.session.commit()
            return True

        # 3) Support common legacy hashes that may have been used by the
        #    original project. A successful legacy login is immediately
        #    converted to a Werkzeug hash so this compatibility is temporary.
        legacy_hashes = {
            hashlib.md5(password.encode()).hexdigest(),
            hashlib.sha1(password.encode()).hexdigest(),
            hashlib.sha256(password.encode()).hexdigest(),
            hashlib.sha512(password.encode()).hexdigest(),
        }
        if stored.lower() in legacy_hashes:
            self.set_password(password)
            db.session.commit()
            return True

        return False

    def to_dict(self):
        """Return safe user data for the frontend."""
        return {
            "id": self.id,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "email": self.email,
            "role": (self.role or "student").lower(),
            "course": self.course or "General",
            "academic_year": self.academic_year,
            "is_verified": bool(self.is_verified),
            "points": self.points or 0,
        }


class BuddyApplication(db.Model):
    """Application submitted by a student who wants to become an Octo Buddy."""

    __tablename__ = "buddy_applications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("Users.User_id"), nullable=True)
    full_name = db.Column(db.String(120), nullable=False)
    student_number = db.Column(db.String(50), nullable=False)
    qualification = db.Column(db.String(150), nullable=False)
    academic_year = db.Column(db.String(50), nullable=False)
    modules = db.Column(db.Text, nullable=False)       # Stored as JSON text
    availability = db.Column(db.Text, nullable=False)  # Stored as JSON text
    daily_limit = db.Column(db.Integer, default=3)
    motivation = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default="Pending")
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", backref="buddy_applications")


class TutoringSession(db.Model):
    """A tutoring booking/session between a student and an Octo Buddy."""

    __tablename__ = "tutoring_sessions"

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("Users.User_id"), nullable=False)
    buddy_id = db.Column(db.Integer, db.ForeignKey("Users.User_id"), nullable=True)
    module = db.Column(db.String(100), nullable=False)
    session_date = db.Column(db.Date, nullable=False)
    session_time = db.Column(db.String(10), nullable=False)
    room_code = db.Column(db.String(150), nullable=False)
    status = db.Column(db.String(30), default="Confirmed")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    student = db.relationship(
        "User",
        foreign_keys=[student_id],
        backref="student_sessions"
    )
    buddy = db.relationship(
        "User",
        foreign_keys=[buddy_id],
        backref="buddy_sessions"
    )


# Create any new tables without changing the existing Users table.
with app.app_context():
    db.create_all()


# ============================================================
# VALIDATION / HELPERS
# ============================================================

def valid_email(email):
    """Basic email validation."""
    return bool(re.match(r"^[\w\.-]+@[\w\.-]+\.\w+$", email or ""))


def valid_password(password):
    """
    Password must be 8-10 characters and contain at least one number.
    This matches the validation already shown by the registration page.
    """
    return (
        8 <= len(password or "") <= 10
        and any(char.isdigit() for char in password)
    )


def json_list(value):
    """Convert a JSON/text list into a Python list safely."""
    import json

    if isinstance(value, list):
        return value

    try:
        result = json.loads(value or "[]")
        return result if isinstance(result, list) else []
    except (TypeError, ValueError):
        return []


def as_json_text(value):
    """Store a Python list as JSON text."""
    import json
    return json.dumps(value or [])


def session_to_dict(session):
    """Return a frontend-friendly session object."""
    return {
        "id": session.id,
        "module": session.module,
        "date": session.session_date.isoformat(),
        "time": session.session_time,
        "room_code": session.room_code,
        "status": session.status,
        "student": (
            f"{session.student.first_name} {session.student.last_name}".strip()
            if session.student else None
        ),
        "student_id": session.student_id,
        "buddy": (
            f"{session.buddy.first_name} {session.buddy.last_name}".strip()
            if session.buddy else None
        ),
        "buddy_id": session.buddy_id,
    }


def application_to_dict(application):
    """Return an application in the shape expected by the admin page."""
    return {
        "id": application.id,
        "user_id": application.user_id,
        "full_name": application.full_name,
        "student_number": application.student_number,
        "qualification": application.qualification,
        "academic_year": application.academic_year,
        "modules": json_list(application.modules),
        "availability": json_list(application.availability),
        "daily_limit": application.daily_limit,
        "motivation": application.motivation,
        "status": application.status,
        "submitted_at": application.submitted_at.isoformat()
        if application.submitted_at else None,
    }


def find_available_buddy(module_name, requested_date):
    """
    Find an approved Buddy who:
    1. tutors the requested module
    2. is available on the requested weekday
    3. has not reached their daily session limit
    """
    weekday = requested_date.strftime("%A")

    applications = BuddyApplication.query.filter_by(status="Approved").all()

    for application in applications:
        if module_name not in json_list(application.modules):
            continue

        if weekday not in json_list(application.availability):
            continue

        buddy = application.user

        if not buddy or (buddy.role or "").lower() != "buddy":
            continue

        sessions_today = TutoringSession.query.filter_by(
            buddy_id=buddy.id,
            session_date=requested_date
        ).filter(
            TutoringSession.status.in_(["Confirmed", "Completed"])
        ).count()

        if sessions_today < (application.daily_limit or 3):
            return buddy

    return None


def unique_room_code(module_name, buddy, session_date, session_time):
    """Create a predictable but unique Jitsi room name."""
    safe_module = re.sub(r"[^A-Za-z0-9]+", "_", module_name).strip("_")
    safe_buddy = re.sub(
        r"[^A-Za-z0-9]+",
        "_",
        f"{buddy.first_name}_{buddy.last_name}"
    ).strip("_")

    base = f"OctoBuddy_{safe_buddy}_{safe_module}_{session_date}_{session_time.replace(':', '')}"

    # Jitsi room names should not contain spaces.
    return base


def current_user(user_id):
    """Load a user from a route/body user id."""
    if not user_id:
        return None

    try:
        return User.query.get(int(user_id))
    except (TypeError, ValueError):
        return None


# ============================================================
# HEALTH / ROOT
# ============================================================

@app.route("/")
def home():
    return jsonify({
        "message": "Octo Buddy API Connected",
        "status": "online"
    }), 200


@app.route("/api/health")
def health():
    return jsonify({"status": "ok"}), 200


# ============================================================
# AUTHENTICATION
# ============================================================

@app.route("/api/register", methods=["POST"])
def register():
    """Create a student account and generate an OTP."""
    try:
        data = request.get_json() or {}

        first_name = data.get("first_name", "").strip()
        last_name = data.get("last_name", "").strip()
        email = data.get("email", "").strip().lower()
        password = data.get("password", "")

        if not first_name or not last_name or not email or not password:
            return jsonify({
                "status": "error",
                "message": "All fields are required."
            }), 400

        if not valid_email(email):
            return jsonify({
                "status": "error",
                "message": "Invalid email format."
            }), 400

        if not valid_password(password):
            return jsonify({
                "status": "error",
                "message": "Password must be 8-10 characters and include a number."
            }), 400

        if User.query.filter_by(email=email).first():
            return jsonify({
                "status": "error",
                "message": "Email already exists."
            }), 409

        otp = str(random.randint(10000, 99999))

        user = User(
            first_name=first_name,
            last_name=last_name,
            email=email,
            role="student",
            is_verified=0,
            verification_token=otp,
            course="General",
            academic_year=1,
            points=0
        )
        user.set_password(password)

        db.session.add(user)
        db.session.commit()

        # Development/testing OTP. Replace with an email provider later.
        print(f"\n[DEV OTP] {email}: {otp}\n")

        return jsonify({
            "status": "success",
            "message": "Registration successful. Please verify your OTP.",
            "dev_otp": otp,
            "email": email
        }), 201

    except Exception as exc:
        db.session.rollback()
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 500


@app.route("/api/verify-otp", methods=["POST"])
def verify_otp():
    """Verify the OTP generated during registration."""
    try:
        data = request.get_json() or {}

        email = data.get("email", "").strip().lower()
        entered_otp = data.get("otp", "").strip()

        user = User.query.filter_by(email=email).first()

        if not user:
            return jsonify({
                "status": "error",
                "message": "User not found."
            }), 404

        if user.verification_token != entered_otp:
            return jsonify({
                "status": "error",
                "message": "Invalid OTP code."
            }), 400

        user.is_verified = 1
        user.verification_token = None
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Account verified successfully."
        }), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 500


@app.route("/api/login", methods=["POST"])
def login():
    """Authenticate a verified user."""
    try:
        data = request.get_json() or {}

        email = data.get("email", "").strip().lower()
        password = data.get("password", "")

        user = User.query.filter_by(email=email).first()

        if not user or not user.check_password(password):
            return jsonify({
                "status": "error",
                "message": "Invalid email or password."
            }), 401

        if not user.is_verified:
            return jsonify({
                "status": "error",
                "message": "Please verify your email first."
            }), 403

        return jsonify({
            "status": "success",
            "message": "Login successful.",
            "user": user.to_dict()
        }), 200

    except Exception as exc:
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 500


# ============================================================
# USER PROFILE
# ============================================================

@app.route("/api/user/<int:user_id>", methods=["GET"])
def get_user(user_id):
    """Return the logged-in user's profile."""
    user = User.query.get(user_id)

    if not user:
        return jsonify({
            "status": "error",
            "message": "User not found."
        }), 404

    return jsonify(user.to_dict()), 200


@app.route("/api/user/<int:user_id>", methods=["PUT"])
def update_user(user_id):
    """Update the editable profile fields."""
    try:
        user = User.query.get(user_id)

        if not user:
            return jsonify({
                "status": "error",
                "message": "User not found."
            }), 404

        data = request.get_json() or {}

        # Only fields supplied by the frontend are changed. This means a
        # student can edit their profile without accidentally clearing
        # information that was not part of the form.
        first_name = data.get("first_name")
        last_name = data.get("last_name")
        course = data.get("course")
        academic_year = data.get("academic_year")

        if first_name is not None:
            first_name = str(first_name).strip()
            if not first_name:
                return jsonify({
                    "status": "error",
                    "message": "First name is required."
                }), 400
            user.first_name = first_name

        if last_name is not None:
            user.last_name = str(last_name).strip()

        if course is not None:
            course = str(course).strip()
            if not course:
                return jsonify({
                    "status": "error",
                    "message": "Qualification is required."
                }), 400
            user.course = course

        if academic_year is not None:
            try:
                academic_year = int(academic_year)
            except (TypeError, ValueError):
                return jsonify({
                    "status": "error",
                    "message": "Academic year must be a number."
                }), 400

            if academic_year not in (1, 2, 3, 4):
                return jsonify({
                    "status": "error",
                    "message": "Academic year must be between 1 and 4."
                }), 400

            user.academic_year = academic_year

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Profile updated successfully.",
            "user": user.to_dict()
        }), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 500


# ============================================================
# OCTO BUDDY APPLICATIONS
# ============================================================

@app.route("/api/buddy-applications", methods=["POST"])
def create_buddy_application():
    """Submit a Buddy application for the logged-in student."""
    try:
        data = request.get_json() or {}

        user = current_user(data.get("user_id"))

        if not user:
            return jsonify({
                "status": "error",
                "message": "Please log in before applying."
            }), 401

        existing = BuddyApplication.query.filter(
            BuddyApplication.user_id == user.id,
            BuddyApplication.status.in_(["Pending", "Approved"])
        ).first()

        if existing:
            return jsonify({
                "status": "error",
                "message": "You already have an active Buddy application."
            }), 409

        modules = data.get("modules") or []
        availability = data.get("availability") or []

        if not modules:
            return jsonify({
                "status": "error",
                "message": "Select at least one module."
            }), 400

        if not availability:
            return jsonify({
                "status": "error",
                "message": "Select at least one availability day."
            }), 400

        application = BuddyApplication(
            user_id=user.id,
            full_name=data.get(
                "full_name",
                f"{user.first_name} {user.last_name}"
            ).strip(),
            student_number=data.get("student_number", "").strip(),
            qualification=data.get(
                "qualification",
                user.course or "General"
            ).strip(),
            academic_year=data.get(
                "academic_year",
                str(user.academic_year or "")
            ).strip(),
            modules=as_json_text(modules),
            availability=as_json_text(availability),
            daily_limit=int(data.get("daily_limit", 3)),
            motivation=data.get("motivation", "").strip(),
            status="Pending"
        )

        if not application.student_number:
            return jsonify({
                "status": "error",
                "message": "Student number is required."
            }), 400

        if not application.motivation:
            return jsonify({
                "status": "error",
                "message": "Motivation is required."
            }), 400

        db.session.add(application)
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Application submitted successfully.",
            "application": application_to_dict(application)
        }), 201

    except Exception as exc:
        db.session.rollback()
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 500


@app.route("/api/buddy-applications", methods=["GET"])
def list_buddy_applications():
    """Return applications for the admin dashboard."""
    applications = BuddyApplication.query.order_by(
        BuddyApplication.submitted_at.desc()
    ).all()

    return jsonify({
        "status": "success",
        "applications": [
            application_to_dict(application)
            for application in applications
        ]
    }), 200


@app.route("/api/buddy-applications/<int:application_id>/<action>", methods=["PUT"])
def review_buddy_application(application_id, action):
    """Approve or reject a Buddy application."""
    try:
        application = BuddyApplication.query.get(application_id)

        if not application:
            return jsonify({
                "status": "error",
                "message": "Application not found."
            }), 404

        action = action.lower()

        if action not in ("approve", "reject"):
            return jsonify({
                "status": "error",
                "message": "Invalid application action."
            }), 400

        if action == "approve":
            application.status = "Approved"

            # Approval changes the user's platform role to Buddy.
            if application.user:
                application.user.role = "buddy"
                application.user.course = application.qualification

                # Convert "Third Year" / "3rd Year" etc. where possible.
                match = re.search(r"([1-4])", application.academic_year)
                if match:
                    application.user.academic_year = int(match.group(1))

        else:
            application.status = "Rejected"

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": f"Application {application.status.lower()}.",
            "application": application_to_dict(application)
        }), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 500


# ============================================================
# TUTORING BOOKINGS / SESSIONS
# ============================================================

@app.route("/api/bookings", methods=["POST"])
def create_booking():
    """
    Create a tutoring request.

    The system automatically finds an approved Buddy who teaches the
    requested module and is available on the requested day.
    """
    try:
        data = request.get_json() or {}

        student = current_user(data.get("user_id"))

        if not student:
            return jsonify({
                "status": "error",
                "message": "Please log in before booking a session."
            }), 401

        module = data.get("module", "").strip()
        date_text = data.get("date", "").strip()
        time_text = data.get("time", "").strip()

        if not module or not date_text or not time_text:
            return jsonify({
                "status": "error",
                "message": "Module, date and time are required."
            }), 400

        try:
            requested_date = date.fromisoformat(date_text)
        except ValueError:
            return jsonify({
                "status": "error",
                "message": "Invalid session date."
            }), 400

        if requested_date < date.today():
            return jsonify({
                "status": "error",
                "message": "Please choose a future date."
            }), 400

        # Prevent a student from accidentally booking the same slot twice.
        existing_student_booking = TutoringSession.query.filter_by(
            student_id=student.id,
            session_date=requested_date,
            session_time=time_text
        ).filter(
            TutoringSession.status.in_(["Pending", "Confirmed"])
        ).first()

        if existing_student_booking:
            return jsonify({
                "status": "error",
                "message": "You already have a session at that time."
            }), 409

        buddy = find_available_buddy(module, requested_date)

        if not buddy:
            return jsonify({
                "status": "error",
                "message": (
                    "No approved Octo Buddy is currently available for "
                    f"{module} on {requested_date.strftime('%A')}."
                )
            }), 409

        room_code = unique_room_code(
            module,
            buddy,
            requested_date,
            time_text
        )

        session = TutoringSession(
            student_id=student.id,
            buddy_id=buddy.id,
            module=module,
            session_date=requested_date,
            session_time=time_text,
            room_code=room_code,
            status="Confirmed"
        )

        db.session.add(session)
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Tutoring session booked successfully.",
            "session": session_to_dict(session)
        }), 201

    except Exception as exc:
        db.session.rollback()
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 500


@app.route("/api/sessions/student/<int:user_id>", methods=["GET"])
def student_sessions(user_id):
    """Return sessions belonging to a student."""
    sessions = TutoringSession.query.filter_by(
        student_id=user_id
    ).order_by(
        TutoringSession.session_date.asc(),
        TutoringSession.session_time.asc()
    ).all()

    return jsonify({
        "status": "success",
        "sessions": [session_to_dict(s) for s in sessions]
    }), 200


@app.route("/api/sessions/buddy/<int:user_id>", methods=["GET"])
def buddy_sessions(user_id):
    """Return sessions assigned to an Octo Buddy."""
    sessions = TutoringSession.query.filter_by(
        buddy_id=user_id
    ).order_by(
        TutoringSession.session_date.asc(),
        TutoringSession.session_time.asc()
    ).all()

    return jsonify({
        "status": "success",
        "sessions": [session_to_dict(s) for s in sessions]
    }), 200


@app.route("/api/sessions/<int:session_id>/status", methods=["PUT"])
def update_session_status(session_id):
    """Update a session status, e.g. Completed or Cancelled."""
    try:
        session = TutoringSession.query.get(session_id)

        if not session:
            return jsonify({
                "status": "error",
                "message": "Session not found."
            }), 404

        data = request.get_json() or {}
        new_status = data.get("status", "").strip().title()

        allowed = {"Confirmed", "Completed", "Cancelled"}

        if new_status not in allowed:
            return jsonify({
                "status": "error",
                "message": "Invalid session status."
            }), 400

        session.status = new_status

        # Reward the Buddy once per completed session.
        if new_status == "Completed" and session.buddy:
            session.buddy.points = (session.buddy.points or 0) + 25

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Session updated.",
            "session": session_to_dict(session)
        }), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 500


@app.route("/api/admin/sessions", methods=["POST"])
def admin_create_session():
    """
    Allow the admin to manually schedule a session from the admin modal.
    """
    try:
        data = request.get_json() or {}

        student = current_user(data.get("student_id"))
        buddy = current_user(data.get("buddy_id"))

        if not student or not buddy:
            return jsonify({
                "status": "error",
                "message": "A valid student and Buddy are required."
            }), 400

        module = data.get("module", "").strip()
        date_text = data.get("date", "").strip()
        time_text = data.get("time", "").strip()

        if not module or not date_text or not time_text:
            return jsonify({
                "status": "error",
                "message": "Module, date and time are required."
            }), 400

        requested_date = date.fromisoformat(date_text)

        room_code = unique_room_code(
            module,
            buddy,
            requested_date,
            time_text
        )

        session = TutoringSession(
            student_id=student.id,
            buddy_id=buddy.id,
            module=module,
            session_date=requested_date,
            session_time=time_text,
            room_code=room_code,
            status="Confirmed"
        )

        db.session.add(session)
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Session scheduled successfully.",
            "session": session_to_dict(session)
        }), 201

    except ValueError:
        return jsonify({
            "status": "error",
            "message": "Invalid date."
        }), 400
    except Exception as exc:
        db.session.rollback()
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 500


# ============================================================
# ADMIN DATA
# ============================================================

@app.route("/api/admin/users", methods=["GET"])
def admin_users():
    """Return all registered users for the admin dashboard."""
    users = User.query.order_by(User.id.desc()).all()

    return jsonify({
        "status": "success",
        "users": [user.to_dict() for user in users]
    }), 200


@app.route("/api/admin/buddies", methods=["GET"])
def admin_buddies():
    """Return approved Buddy users."""
    buddies = User.query.filter(
        User.role.ilike("buddy")
    ).order_by(User.first_name.asc()).all()

    return jsonify({
        "status": "success",
        "buddies": [user.to_dict() for user in buddies]
    }), 200


@app.route("/api/admin/sessions", methods=["GET"])
def admin_sessions():
    """Return tutoring sessions for the admin calendar."""
    try:
        start_text = request.args.get("start")
        end_text = request.args.get("end")

        query = TutoringSession.query.order_by(
            TutoringSession.session_date.asc(),
            TutoringSession.session_time.asc()
        )

        if start_text:
            query = query.filter(TutoringSession.session_date >= date.fromisoformat(start_text))
        if end_text:
            query = query.filter(TutoringSession.session_date <= date.fromisoformat(end_text))

        sessions = query.all()
        result = []
        for session in sessions:
            item = session_to_dict(session)
            item["student_name"] = (
                f"{session.student.first_name} {session.student.last_name}".strip()
                if session.student else "Student"
            )
            item["buddy_name"] = (
                f"{session.buddy.first_name} {session.buddy.last_name}".strip()
                if session.buddy else "Buddy"
            )
            item["student_id"] = session.student_id
            item["buddy_id"] = session.buddy_id
            item["session_date"] = session.session_date.isoformat()
            result.append(item)

        return jsonify({"status": "success", "sessions": result}), 200
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid date filter."}), 400
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.route("/api/admin/leaderboard", methods=["GET"])
def admin_leaderboard():
    """Return real Buddy performance data for reports and leaderboard."""
    buddies = User.query.filter(User.role.ilike("buddy")).all()
    result = []

    for buddy in buddies:
        sessions = TutoringSession.query.filter_by(buddy_id=buddy.id).all()
        completed = sum(1 for session in sessions if session.status == "Completed")
        confirmed = sum(1 for session in sessions if session.status == "Confirmed")
        total = completed + confirmed
        attendance = "100%" if total == 0 else f"{round((completed / total) * 100)}%"

        result.append({
            "id": buddy.id,
            "name": f"{buddy.first_name} {buddy.last_name}".strip(),
            "completed_sessions": completed,
            "attendance": attendance,
            "points": buddy.points or 0
        })

    result.sort(key=lambda item: (item["points"], item["completed_sessions"]), reverse=True)
    return jsonify({"status": "success", "buddies": result}), 200


@app.route("/api/admin/dashboard", methods=["GET"])
def admin_dashboard():
    """Return live statistics and recent activity for the admin dashboard."""
    today = date.today()
    sessions = TutoringSession.query.all()
    recent_applications = BuddyApplication.query.order_by(
        BuddyApplication.submitted_at.desc()
    ).limit(5).all()

    return jsonify({
        "status": "success",
        "stats": {
            "students": User.query.filter(User.role.ilike("student")).count(),
            "buddies": User.query.filter(User.role.ilike("buddy")).count(),
            "pending_applications": BuddyApplication.query.filter_by(status="Pending").count(),
            "sessions": len(sessions),
            "today_sessions": sum(1 for session in sessions if session.session_date == today),
            "completed_sessions": sum(1 for session in sessions if session.status == "Completed")
        },
        "recent_applications": [application_to_dict(application) for application in recent_applications]
    }), 200


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
