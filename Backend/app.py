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
import secrets
import hashlib
import hmac
import csv
import io
import json
from datetime import datetime, date, timedelta
from email.message import EmailMessage

from flask import Flask, request, jsonify, g, make_response
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import or_
from dotenv import load_dotenv
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

# Load local .env settings before reading DATABASE_URL.
load_dotenv()



app = Flask(__name__)

_allowed_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "").split(",")
    if origin.strip()
]

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": _allowed_origins or [
                "https://studybuddy-frontend-mocha.vercel.app",
                "http://localhost:3000",
                "http://127.0.0.1:5500"
            ]
        }
    },
    supports_credentials=False
)

_secret_key = os.environ.get("SECRET_KEY", "").strip()
if not _secret_key and (os.environ.get("RENDER") or os.environ.get("VERCEL")):
    raise RuntimeError("SECRET_KEY must be configured in the production environment.")
if not _secret_key:
    # Development convenience only. Set a stable SECRET_KEY for local multi-process testing.
    _secret_key = secrets.token_urlsafe(48)
    print("WARNING: SECRET_KEY is unset; development tokens will not survive restarts.")
app.config["SECRET_KEY"] = _secret_key or "local-development-only-change-me"
TOKEN_SALT = "octobuddy-auth-v1"
TOKEN_MAX_AGE_SECONDS = int(os.environ.get("TOKEN_MAX_AGE_SECONDS", "43200"))
token_serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"], salt=TOKEN_SALT)

# Never hard-code database passwords in source code.
# Use DATABASE_URL for Supabase/PostgreSQL.
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL",
    "sqlite:///octobuddy_local.db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}

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
    is_suspended = db.Column("Is_Suspended", db.Boolean, nullable=False, default=False)

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
            "is_suspended": bool(self.is_suspended),
        }

class PendingRegistration(db.Model):
    """Registration details are held temporarily until the OTP is verified."""
    __tablename__ = "pending_registrations"
    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    otp_hash = db.Column(db.String(64), nullable=False)
    attempts = db.Column(db.Integer, default=0, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class PasswordResetCode(db.Model):
    """Temporary, one-time password reset codes."""

    __tablename__ = "password_reset_codes"

    id = db.Column(db.Integer, primary_key=True)

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("Users.User_id"),
        nullable=False,
        index=True
    )

    code_hash = db.Column(db.String(64), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    attempts = db.Column(db.Integer, default=0, nullable=False)
    used = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


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



class AdminAuditLog(db.Model):
    """Append-only record of sensitive administrator actions."""
    __tablename__ = "admin_audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    admin_user_id = db.Column(db.Integer, db.ForeignKey("Users.User_id"), nullable=False, index=True)
    action = db.Column(db.String(80), nullable=False, index=True)
    target_type = db.Column(db.String(50), nullable=False)
    target_id = db.Column(db.String(80), nullable=True)
    details = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, index=True)
    admin = db.relationship("User", foreign_keys=[admin_user_id])


class ManagedQualification(db.Model):
    """Qualification list managed by administrators."""
    __tablename__ = "managed_qualifications"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False, unique=True)
    active = db.Column(db.Boolean, nullable=False, default=True)


class ManagedModule(db.Model):
    """Modules linked to a qualification and academic year."""
    __tablename__ = "managed_modules"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    qualification_id = db.Column(db.Integer, db.ForeignKey("managed_qualifications.id"), nullable=False, index=True)
    academic_year = db.Column(db.Integer, nullable=False)
    active = db.Column(db.Boolean, nullable=False, default=True)
    qualification = db.relationship("ManagedQualification", backref="modules")
    __table_args__ = (db.UniqueConstraint("name", "qualification_id", "academic_year", name="uq_module_qualification_year"),)


def write_audit(action, target_type, target_id=None, details=None):
    """Record a sensitive admin action in the same database transaction."""
    actor = getattr(g, "current_user", None)
    if not actor or (actor.role or "").lower() != "admin":
        return
    db.session.add(AdminAuditLog(
        admin_user_id=actor.id,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        details=json.dumps(details or {}, ensure_ascii=False)
    ))


# Create any new tables without changing the existing Users table.
with app.app_context():
    db.create_all()
    # Lightweight forward-compatible migration for existing installations.
    # create_all() creates missing tables but does not add columns to old tables.
    from sqlalchemy import inspect
    inspector = inspect(db.engine)
    if "pending_registrations" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("pending_registrations")}
        if "attempts" not in columns:
            with db.engine.begin() as connection:
                connection.exec_driver_sql(
                    "ALTER TABLE pending_registrations ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0"
                )
    if "Users" in inspector.get_table_names():
        user_columns = {column["name"] for column in inspector.get_columns("Users")}
        if "Is_Suspended" not in user_columns:
            with db.engine.begin() as connection:
                connection.exec_driver_sql(
                    'ALTER TABLE "Users" ADD COLUMN "Is_Suspended" BOOLEAN NOT NULL DEFAULT FALSE'
                )


    # Seed the catalogue once so the existing admin qualification/module screens
    # have persistent records from the first run. Administrators can maintain it.
    if ManagedQualification.query.count() == 0:
        defaults = [
            "Diploma in Information Technology",
            "Bachelor of Business Administration",
            "Bachelor of Science in IT",
            "Higher Certificate in IT",
        ]
        for name in defaults:
            db.session.add(ManagedQualification(name=name))
        db.session.flush()
        starter_modules = [
            ("Programming", 1), ("Database Systems", 1), ("Networks", 1),
            ("Machine Learning", 3), ("Data Manipulation & Visualisation", 2),
        ]
        for qualification in ManagedQualification.query.all():
            for module_name, year in starter_modules:
                db.session.add(ManagedModule(
                    name=module_name, qualification_id=qualification.id,
                    academic_year=year, active=True
                ))
        db.session.commit()


# ============================================================
# EMAIL / OTP DELIVERY
# ============================================================

def send_otp_email(recipient_email, otp):
    """Send a five-digit OTP through the Google Apps Script HTTPS email relay."""
    import json
    from urllib.request import Request, urlopen
    from urllib.error import URLError, HTTPError

    script_url = os.environ.get("EMAIL_SCRIPT_URL", "").strip()
    shared_secret = os.environ.get("OCTO_BUDDY_SECRET", "")

    if not script_url or not shared_secret:
        raise RuntimeError(
            "Email relay is not configured. Set EMAIL_SCRIPT_URL and "
            "OCTO_BUDDY_SECRET in the hosting environment."
        )

    payload = json.dumps({
        "secret": shared_secret,
        "email": recipient_email,
        "otp": str(otp)
    }).encode("utf-8")

    req = Request(
        script_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        # Apps Script ContentService may redirect its response; urllib follows
        # standard HTTPS redirects automatically.
        with urlopen(req, timeout=25) as response:
            response_text = response.read().decode("utf-8", errors="replace")
        result = json.loads(response_text)
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError("The email relay request failed.") from exc

    if not isinstance(result, dict) or result.get("success") is not True:
        # Do not log the OTP, shared secret, or recipient address.
        raise RuntimeError("The email relay did not confirm delivery.")


# ============================================================
# VALIDATION / HELPERS
# ============================================================

def valid_email(email):
    """Validate a conventional email address without whitespace."""
    return bool(re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+", email or ""))


def valid_name(value):
    """Allow letters, spaces, apostrophes and hyphens in names."""
    return bool(re.fullmatch(r"[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '\u2019-][A-Za-zÀ-ÖØ-öø-ÿ]+)*", value or ""))


def valid_password(password):
    """Require 8-10 characters, at least one letter and at least one digit."""
    password = password or ""
    return 8 <= len(password) <= 10 and bool(re.search(r"[A-Za-z]", password)) and bool(re.search(r"\d", password))


def resolve_managed_qualification(course):
    """Match common legacy qualification labels to the persistent catalogue."""
    course = (course or "General").strip().lower()
    qualifications = ManagedQualification.query.filter_by(active=True).all()
    exact = next((item for item in qualifications if item.name.strip().lower() == course), None)
    if exact:
        return exact
    normalized = re.sub(r"[^a-z0-9]+", "", course.replace("information technology", "it"))
    aliases = []
    if "diploma" in normalized and ("it" in normalized or "informationtechnology" in course):
        aliases = ["diploma in information technology"]
    elif ("bsc" in normalized or "bachelorofscience" in normalized) and "it" in normalized:
        aliases = ["bachelor of science in it"]
    elif "businessadministration" in normalized or "bba" in normalized:
        aliases = ["bachelor of business administration"]
    elif "highercertificate" in normalized and "it" in normalized:
        aliases = ["higher certificate in it"]
    for alias in aliases:
        found = next((item for item in qualifications if item.name.strip().lower() == alias), None)
        if found:
            return found
    return None


def modules_for_qualification(course, academic_year=None):
    """Return modules from the persistent admin-managed catalogue when available."""
    qualification = resolve_managed_qualification(course)
    if qualification:
        query = ManagedModule.query.filter_by(qualification_id=qualification.id, active=True)
        if academic_year is not None:
            try:
                # Students can book modules from prior or current academic years.
                query = query.filter(ManagedModule.academic_year <= int(academic_year))
            except (TypeError, ValueError):
                return set()
        return {item.name for item in query.all()}
    course = (course or "General").strip().lower()
    if "computer science" in course:
        return {"Programming", "Database Systems", "Networking"}
    if "information technology" in course or course == "general":
        return {"Programming", "Database Systems", "Networking", "Web Development"}
    if "business administration" in course:
        return set()
    # Preserve legacy profiles until their qualification is set in the profile.
    return {"Programming", "Database Systems", "Networking", "Web Development"}


@app.route("/api/modules", methods=["GET"])
def student_module_catalog():
    """Return modules for the authenticated user's saved qualification and year."""
    user = getattr(g, "current_user", None)
    if not user:
        return jsonify(status="error", message="Please log in to continue."), 401
    modules = sorted(modules_for_qualification(user.course, user.academic_year))
    return jsonify(status="success", modules=modules, qualification=user.course,
                   academic_year=user.academic_year), 200


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
# AUTHENTICATION GUARD
# ============================================================

PUBLIC_API_ENDPOINTS = {
    "register", "verify_otp", "login", "forgot_password", "reset_password",
    "home", "health"
}

@app.before_request
def authenticate_api_requests():
    """Require a signed, time-limited bearer token for protected API routes."""
    if not request.path.startswith("/api/"):
        return None
    if request.endpoint in PUBLIC_API_ENDPOINTS:
        return None

    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return jsonify(status="error", message="Please log in to continue."), 401
    token = header[7:].strip()
    try:
        payload = token_serializer.loads(token, max_age=TOKEN_MAX_AGE_SECONDS)
    except SignatureExpired:
        return jsonify(status="error", message="Your session has expired. Please log in again."), 401
    except BadSignature:
        return jsonify(status="error", message="Invalid session. Please log in again."), 401

    user_id = payload.get("uid") if isinstance(payload, dict) else None
    user = db.session.get(User, user_id) if isinstance(user_id, int) else None
    if not user or not user.is_verified:
        return jsonify(status="error", message="Your account session is no longer valid."), 401
    if user.is_suspended and (user.role or "").lower() != "admin":
        return jsonify(status="error", message="This account has been suspended."), 403
    g.current_user = user

    # Admin data and review actions are restricted on the server, not just in UI.
    admin_only = request.path.startswith("/api/admin/") or (
        request.path == "/api/buddy-applications" and request.method == "GET"
    ) or (request.path.startswith("/api/buddy-applications/") and request.method == "PUT")
    if admin_only and (user.role or "").lower() != "admin":
        return jsonify(status="error", message="Administrator access is required."), 403
    return None


def require_self_or_admin(user_id):
    """Return an error response if a user attempts to access another profile."""
    actor = getattr(g, "current_user", None)
    if not actor or (actor.id != user_id and (actor.role or "").lower() != "admin"):
        return jsonify(status="error", message="You are not allowed to access this account."), 403
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
    """Stage registration data; create the real user only after OTP verification."""
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify(status="error", message="Send valid JSON data."), 400
        first_name = str(data.get("first_name", "")).strip()
        last_name = str(data.get("last_name", "")).strip()
        email = str(data.get("email", "")).strip().lower()
        password = data.get("password", "")

        if not all([first_name, last_name, email, password]):
            return jsonify(status="error", message="All fields are required."), 400
        if not valid_name(first_name) or not valid_name(last_name):
            return jsonify(status="error", message="Names may contain letters, spaces, apostrophes and hyphens only."), 400
        if not valid_email(email):
            return jsonify(status="error", message="Enter a valid email address, for example name@example.com."), 400
        if not valid_password(password):
            return jsonify(status="error", message="Password must be 8-10 characters and include at least one letter and one number."), 400
        if User.query.filter_by(email=email).first():
            return jsonify(status="error", message="Email already exists."), 409

        pending = PendingRegistration.query.filter_by(email=email).first()
        if pending:
            db.session.delete(pending)
            db.session.flush()
        otp = str(secrets.randbelow(90000) + 10000)
        pending = PendingRegistration(
            first_name=first_name, last_name=last_name, email=email,
            password_hash=generate_password_hash(password),
            otp_hash=hashlib.sha256(otp.encode()).hexdigest(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        db.session.add(pending)
        db.session.commit()
        try:
            send_otp_email(email, otp)
        except Exception:
            db.session.delete(pending)
            db.session.commit()
            app.logger.exception("Failed to send verification email.")
            return jsonify(status="error", message="We could not send the verification email. Please try again later."), 503
        return jsonify(status="success", message="A verification code has been sent. Your account will be created after verification.", email=email), 200
    except Exception:
        db.session.rollback()
        app.logger.exception("Registration failed.")
        return jsonify(status="error", message="Registration failed. Please try again."), 500

@app.route("/api/verify-otp", methods=["POST"])
def verify_otp():
    """Verify OTP and only then persist a new user account."""
    try:
        data = request.get_json() or {}
        email = str(data.get("email", "")).strip().lower()
        entered_otp = str(data.get("otp", "")).strip()
        if not valid_email(email) or not re.fullmatch(r"\d{5}", entered_otp):
            return jsonify(status="error", message="Enter a valid email and five-digit verification code."), 400
        pending = PendingRegistration.query.filter_by(email=email).first()
        if not pending:
            return jsonify(status="error", message="Registration details were not found or have expired. Please register again."), 404
        if pending.expires_at < datetime.utcnow():
            db.session.delete(pending); db.session.commit()
            return jsonify(status="error", message="Your code has expired. Please register again."), 400
        if pending.attempts >= 5:
            db.session.delete(pending)
            db.session.commit()
            return jsonify(status="error", message="Too many incorrect codes. Please register again."), 429
        if not hmac.compare_digest(pending.otp_hash, hashlib.sha256(entered_otp.encode()).hexdigest()):
            pending.attempts += 1
            if pending.attempts >= 5:
                db.session.delete(pending)
            db.session.commit()
            return jsonify(status="error", message="Invalid verification code. Please try again or register again if attempts are exhausted."), 400
        if User.query.filter_by(email=email).first():
            db.session.delete(pending); db.session.commit()
            return jsonify(status="error", message="An account with this email already exists. Please log in."), 409
        user = User(first_name=pending.first_name, last_name=pending.last_name,
                    email=pending.email, password_hash=pending.password_hash,
                    role="student", is_verified=1, verification_token=None,
                    course="General", academic_year=1, points=0)
        db.session.add(user)
        db.session.delete(pending)
        db.session.commit()
        return jsonify(status="success", message="Account verified and created successfully."), 200
    except Exception:
        db.session.rollback()
        app.logger.exception("OTP verification failed.")
        return jsonify(status="error", message="Verification failed. Please try again."), 500

@app.route("/api/login", methods=["POST"])
def login():
    """Authenticate a verified user."""
    try:
        data = request.get_json() or {}

        email = str(data.get("email", "")).strip().lower()
        password = data.get("password", "")
        if not isinstance(password, str):
            password = ""

        if not valid_email(email) or not password:
            return jsonify({"status": "error", "message": "Enter a valid email address and password."}), 400

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

        if user.is_suspended:
            return jsonify({
                "status": "error",
                "message": "This account has been suspended. Please contact the administrator."
            }), 403

        return jsonify({
            "status": "success",
            "message": "Login successful.",
            "user": user.to_dict(),
            "token": token_serializer.dumps({"uid": user.id, "role": (user.role or "student").lower()})
        }), 200

    except Exception as exc:
        app.logger.exception("API operation failed.")
        return jsonify({"status": "error", "message": "The request could not be completed. Please try again."}), 500

    
# ============================================================
# PASSWORD RESET
# ============================================================

@app.route("/api/forgot-password", methods=["POST"])
def forgot_password():
    """Send a password reset code to a registered email."""

    data = request.get_json() or {}
    email = str(data.get("email", "")).strip().lower()

    # Always return the same public message to avoid revealing
    # whether an email address has an account.
    generic_message = (
        "If an eligible account exists for that email, "
        "a reset code will be sent."
    )

    if not valid_email(email):
        return jsonify({
            "status": "success",
            "message": generic_message
        }), 200

    user = User.query.filter_by(email=email).first()

    # Only send reset codes to verified accounts.
    if not user or not user.is_verified:
        return jsonify({
            "status": "success",
            "message": generic_message
        }), 200

    try:
        # Invalidate previous unused reset codes for this user.
        PasswordResetCode.query.filter_by(
            user_id=user.id,
            used=False
        ).delete(synchronize_session=False)

        # Keep the five-digit format used by your existing email relay.
        code = str(secrets.randbelow(90000) + 10000)

        reset_record = PasswordResetCode(
            user_id=user.id,
            code_hash=hashlib.sha256(
                code.encode("utf-8")
            ).hexdigest(),
            expires_at=datetime.utcnow() + timedelta(minutes=10),
            attempts=0,
            used=False
        )

        db.session.add(reset_record)
        db.session.commit()

        # Reuse the email system already used by registration.
        try:
            send_otp_email(user.email, code)
        except Exception:
            app.logger.exception("Password reset email delivery failed.")

            # Remove the code if delivery fails.
            PasswordResetCode.query.filter_by(
                id=reset_record.id
            ).delete()
            db.session.commit()

        return jsonify({
            "status": "success",
            "message": generic_message
        }), 200

    except Exception:
        db.session.rollback()
        app.logger.exception("Password reset request failed.")

        return jsonify({
            "status": "success",
            "message": generic_message
        }), 200


@app.route("/api/reset-password", methods=["POST"])
def reset_password():
    """Validate a reset code and save a new password."""

    data = request.get_json() or {}

    email = str(data.get("email", "")).strip().lower()
    code = str(data.get("code", "")).strip()
    new_password = data.get("new_password", "")
    confirm_password = data.get("confirm_password", "")

    if not valid_email(email):
        return jsonify({
            "status": "error",
            "message": "Enter a valid email address."
        }), 400

    if not code or not code.isdigit() or len(code) != 5:
        return jsonify({
            "status": "error",
            "message": "Enter the five-digit reset code."
        }), 400

    if not isinstance(new_password, str) or not valid_password(new_password):
        return jsonify({
            "status": "error",
            "message": (
                "Password must be 8–10 characters and contain at least one letter and one number."
            )
        }), 400

    if new_password != confirm_password:
        return jsonify({
            "status": "error",
            "message": "The passwords do not match."
        }), 400

    try:
        user = User.query.filter_by(email=email).first()

        if not user or not user.is_verified:
            return jsonify({
                "status": "error",
                "message": "Invalid or expired reset code."
            }), 400

        reset_record = PasswordResetCode.query.filter_by(
            user_id=user.id,
            used=False
        ).order_by(
            PasswordResetCode.created_at.desc()
        ).first()

        if not reset_record:
            return jsonify({
                "status": "error",
                "message": "Invalid or expired reset code."
            }), 400

        if datetime.utcnow() > reset_record.expires_at:
            reset_record.used = True
            db.session.commit()

            return jsonify({
                "status": "error",
                "message": "This reset code has expired. Request a new one."
            }), 400

        if reset_record.attempts >= 5:
            reset_record.used = True
            db.session.commit()

            return jsonify({
                "status": "error",
                "message": "Too many attempts. Request a new reset code."
            }), 400

        entered_hash = hashlib.sha256(
            code.encode("utf-8")
        ).hexdigest()

        if not hmac.compare_digest(
            reset_record.code_hash,
            entered_hash
        ):
            reset_record.attempts += 1

            if reset_record.attempts >= 5:
                reset_record.used = True

            db.session.commit()

            return jsonify({
                "status": "error",
                "message": "Invalid or expired reset code."
            }), 400

        # Update the password using your existing secure hash method.
        user.set_password(new_password)

        # A reset code can only be used once.
        reset_record.used = True

        # Invalidate any other unused reset codes for this user.
        PasswordResetCode.query.filter(
            PasswordResetCode.user_id == user.id,
            PasswordResetCode.id != reset_record.id,
            PasswordResetCode.used.is_(False)
        ).update(
            {"used": True},
            synchronize_session=False
        )

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": (
                "Password reset successfully. "
                "Please log in with your new password."
            )
        }), 200

    except Exception:
        db.session.rollback()
        app.logger.exception("Password reset failed.")

        return jsonify({
            "status": "error",
            "message": "Could not reset your password. Please try again."
        }), 500



# ============================================================
# USER PROFILE
# ============================================================

@app.route("/api/user/<int:user_id>", methods=["GET"])
def get_user(user_id):
    """Return the logged-in user's profile."""
    denied = require_self_or_admin(user_id)
    if denied:
        return denied
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({
            "status": "error",
            "message": "User not found."
        }), 404

    return jsonify(user.to_dict()), 200


@app.route("/api/user/<int:user_id>", methods=["PUT"])
def update_user(user_id):
    """Update the editable profile fields."""
    denied = require_self_or_admin(user_id)
    if denied:
        return denied
    try:
        user = db.session.get(User, user_id)

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
            if not valid_name(first_name) or len(first_name) > 50:
                return jsonify({"status": "error", "message": "Enter a valid first name of no more than 50 characters."}), 400
            user.first_name = first_name

        if last_name is not None:
            last_name = str(last_name).strip()
            if not valid_name(last_name) or len(last_name) > 50:
                return jsonify({"status": "error", "message": "Enter a valid last name of no more than 50 characters."}), 400
            user.last_name = last_name

        if course is not None:
            course = str(course).strip()
            if not course or len(course) > 100 or not re.fullmatch(r"[A-Za-z0-9 &()/-]{2,100}", course):
                return jsonify({"status": "error", "message": "Enter a valid qualification."}), 400
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
        app.logger.exception("API operation failed.")
        return jsonify({"status": "error", "message": "The request could not be completed. Please try again."}), 500


# ============================================================
# OCTO BUDDY APPLICATIONS
# ============================================================

@app.route("/api/buddy-applications", methods=["POST"])
def create_buddy_application():
    """Submit a Buddy application for the logged-in student."""
    try:
        data = request.get_json() or {}

        user = getattr(g, "current_user", None)
        if not user:
            return jsonify(status="error", message="Please log in before applying."), 401
        if (user.role or "student").lower() not in ("student", "buddy"):
            return jsonify(status="error", message="This account cannot submit a Buddy application."), 403

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

        allowed_days = {"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}
        if not isinstance(modules, list) or not modules or any(not isinstance(m, str) for m in modules):
            return jsonify(status="error", message="Select at least one valid module."), 400
        if not isinstance(availability, list) or not availability or any(day not in allowed_days for day in availability):
            return jsonify(status="error", message="Select valid availability days."), 400
        permitted_modules = modules_for_qualification(user.course, user.academic_year)
        if any(module not in permitted_modules for module in modules):
            return jsonify(status="error", message="One or more modules are not available for your saved qualification."), 400

        full_name = str(data.get("full_name", f"{user.first_name} {user.last_name}")).strip()
        student_number = str(data.get("student_number", "")).strip()
        motivation = str(data.get("motivation", "")).strip()
        if not valid_name(full_name):
            return jsonify(status="error", message="Full name must contain letters only (spaces, apostrophes and hyphens are allowed)."), 400
        if not re.fullmatch(r"[0-9]{9}", student_number):
            return jsonify(status="error", message="Student number must contain exactly 9 digits and numbers only."), 400
        motivation_words = motivation.split()
        if not motivation or len(motivation_words) > 30:
            return jsonify(status="error", message="Motivation is required and must be no more than 30 words."), 400
        try:
            daily_limit = int(data.get("daily_limit", 3))
        except (TypeError, ValueError):
            return jsonify(status="error", message="Daily limit must be a number."), 400
        if daily_limit not in (1, 2, 3, 4, 5):
            return jsonify(status="error", message="Daily limit must be between 1 and 5."), 400
        application = BuddyApplication(
            user_id=user.id,
            full_name=full_name,
            student_number=student_number,
            qualification=(user.course or "General"),
            academic_year=str(user.academic_year or ""),
            modules=as_json_text(modules),
            availability=as_json_text(availability),
            daily_limit=daily_limit,
            motivation=motivation,
            status="Pending"
        )

        if not application.student_number:
            return jsonify({
                "status": "error",
                "message": "Student number is required."
            }), 400

        if not application.motivation or len(application.motivation.split()) > 30:
            return jsonify(status="error", message="Motivation is required and must be no more than 30 words."), 400

        db.session.add(application)
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Application submitted successfully.",
            "application": application_to_dict(application)
        }), 201

    except Exception as exc:
        db.session.rollback()
        app.logger.exception("API operation failed.")
        return jsonify({"status": "error", "message": "The request could not be completed. Please try again."}), 500


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

        write_audit("buddy_application_" + action, "buddy_application", application.id,
                    {"status": application.status, "applicant_user_id": application.user_id})
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": f"Application {application.status.lower()}.",
            "application": application_to_dict(application)
        }), 200

    except Exception as exc:
        db.session.rollback()
        app.logger.exception("API operation failed.")
        return jsonify({"status": "error", "message": "The request could not be completed. Please try again."}), 500


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

        student = getattr(g, "current_user", None)
        if not student or (student.role or "").lower() != "student":
            return jsonify(status="error", message="A student account is required to book a session."), 403

        module = str(data.get("module", "")).strip()
        date_text = str(data.get("date", "")).strip()
        time_text = str(data.get("time", "")).strip()

        if not module or not date_text or not time_text:
            return jsonify({
                "status": "error",
                "message": "Module, date and time are required."
            }), 400
        if module not in modules_for_qualification(student.course, student.academic_year):
            return jsonify(status="error", message="Choose a module available for your qualification."), 400
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", time_text):
            return jsonify(status="error", message="Time must use 24-hour HH:MM format."), 400

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

        buddy_conflict = TutoringSession.query.filter_by(
            buddy_id=buddy.id, session_date=requested_date, session_time=time_text
        ).filter(TutoringSession.status.in_(["Pending", "Confirmed"])).first()
        if buddy_conflict:
            return jsonify(status="error", message="That Buddy already has a booking at this time."), 409

        room_code = unique_room_code(module, buddy, requested_date, time_text)

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
        app.logger.exception("API operation failed.")
        return jsonify({"status": "error", "message": "The request could not be completed. Please try again."}), 500


@app.route("/api/sessions/student/<int:user_id>", methods=["GET"])
def student_sessions(user_id):
    """Return sessions belonging to a student."""
    denied = require_self_or_admin(user_id)
    if denied:
        return denied
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
    denied = require_self_or_admin(user_id)
    if denied:
        return denied
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
        actor = getattr(g, "current_user", None)
        if not actor or (actor.id not in (session.student_id, session.buddy_id) and (actor.role or "").lower() != "admin"):
            return jsonify(status="error", message="You are not allowed to update this session."), 403
        new_status = str(data.get("status", "")).strip().title()
        actor_role = (actor.role or "student").lower()
        if actor_role == "student" and (actor.id != session.student_id or new_status != "Cancelled"):
            return jsonify(status="error", message="Students may only cancel their own sessions."), 403
        if actor_role == "buddy" and (actor.id != session.buddy_id or new_status not in {"Completed", "Cancelled"}):
            return jsonify(status="error", message="Buddies may only complete or cancel their own sessions."), 403

        allowed = {"Confirmed", "Completed", "Cancelled"}

        if new_status not in allowed:
            return jsonify({
                "status": "error",
                "message": "Invalid session status."
            }), 400

        previous_status = session.status
        session.status = new_status

        # Reward points only on the first transition into Completed.
        if new_status == "Completed" and previous_status != "Completed" and session.buddy:
            session.buddy.points = (session.buddy.points or 0) + 25

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Session updated.",
            "session": session_to_dict(session)
        }), 200

    except Exception as exc:
        db.session.rollback()
        app.logger.exception("API operation failed.")
        return jsonify({"status": "error", "message": "The request could not be completed. Please try again."}), 500


@app.route("/api/admin/sessions", methods=["POST"])
def admin_create_session():
    """
    Allow the admin to manually schedule a session from the admin modal.
    """
    try:
        data = request.get_json() or {}
        if (getattr(g, "current_user", None).role or "").lower() != "admin":
            return jsonify(status="error", message="Administrator access is required."), 403

        student = current_user(data.get("student_id"))
        buddy = current_user(data.get("buddy_id"))

        if not student or not buddy:
            return jsonify({
                "status": "error",
                "message": "A valid student and Buddy are required."
            }), 400

        module = str(data.get("module", "")).strip()
        date_text = str(data.get("date", "")).strip()
        time_text = str(data.get("time", "")).strip()

        if not module or not date_text or not time_text:
            return jsonify({"status": "error", "message": "Module, date and time are required."}), 400
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", time_text):
            return jsonify(status="error", message="Time must use 24-hour HH:MM format."), 400
        if (student.role or "").lower() != "student" or (buddy.role or "").lower() != "buddy":
            return jsonify(status="error", message="Select a valid student and approved Buddy."), 400
        requested_date = date.fromisoformat(date_text)
        if requested_date < date.today():
            return jsonify(status="error", message="Past dates cannot be booked."), 400
        buddy_application = BuddyApplication.query.filter_by(user_id=buddy.id, status="Approved").first()
        if not buddy_application or module not in json_list(buddy_application.modules):
            return jsonify(status="error", message="The selected Buddy is not approved to tutor this module."), 400
        conflict = TutoringSession.query.filter(
            TutoringSession.session_date == requested_date,
            TutoringSession.session_time == time_text,
            TutoringSession.status.in_(["Pending", "Confirmed"]),
            or_(TutoringSession.buddy_id == buddy.id, TutoringSession.student_id == student.id)
        ).first()
        if conflict:
            return jsonify(status="error", message="The student or Buddy already has a session at this time."), 409

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
        db.session.flush()
        write_audit("booking_created_by_admin", "booking", session.id,
                    {"student_id": student.id, "buddy_id": buddy.id, "module": module,
                     "date": requested_date.isoformat(), "time": time_text})
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
        app.logger.exception("API operation failed.")
        return jsonify({"status": "error", "message": "The request could not be completed. Please try again."}), 500


# ============================================================
# ADMIN DATA
# ============================================================

@app.route("/api/admin/users", methods=["GET"])
def admin_users():
    """Return filterable registered users for the admin dashboard."""
    query = User.query.order_by(User.id.desc())
    role = request.args.get("role", "").strip().lower()
    qualification = request.args.get("qualification", "").strip()
    year = request.args.get("year", "").strip()
    status = request.args.get("status", "").strip().lower()
    search = request.args.get("search", "").strip()
    if role in {"student", "buddy", "admin"}:
        query = query.filter(db.func.lower(User.role) == role)
    if qualification:
        query = query.filter(User.course == qualification)
    if year.isdigit():
        query = query.filter(User.academic_year == int(year))
    if status == "suspended":
        query = query.filter(User.is_suspended.is_(True))
    elif status == "active":
        query = query.filter(User.is_suspended.is_(False))
    if search:
        pattern = f"%{search}%"
        query = query.filter(or_(User.first_name.ilike(pattern), User.last_name.ilike(pattern), User.email.ilike(pattern), User.course.ilike(pattern)))
    users = query.limit(1000).all()
    result = []
    for user in users:
        item = user.to_dict()
        item["session_count"] = TutoringSession.query.filter(
            or_(TutoringSession.student_id == user.id, TutoringSession.buddy_id == user.id)
        ).count()
        result.append(item)
    return jsonify({"status": "success", "users": result}), 200


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
        status_filter = request.args.get("status", "").strip()
        qualification_filter = request.args.get("qualification", "").strip()
        year_filter = request.args.get("year", "").strip()
        if status_filter:
            query = query.filter(TutoringSession.status == status_filter)
        if qualification_filter or year_filter.isdigit():
            query = query.join(User, TutoringSession.student_id == User.id)
            if qualification_filter:
                query = query.filter(User.course == qualification_filter)
            if year_filter.isdigit():
                query = query.filter(User.academic_year == int(year_filter))

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
            item["qualification"] = session.student.course if session.student else ""
            item["academic_year"] = session.student.academic_year if session.student else ""
            item["session_date"] = session.session_date.isoformat()
            result.append(item)

        return jsonify({"status": "success", "sessions": result}), 200
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid date filter."}), 400
    except Exception as exc:
        app.logger.exception("API operation failed.")
        return jsonify({"status": "error", "message": "The request could not be completed. Please try again."}), 500


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




# ============================================================
# ADMIN MANAGEMENT, FILTERS, EXPORTS AND AUDIT LOGS
# ============================================================

def _admin_required():
    actor = getattr(g, "current_user", None)
    if not actor or (actor.role or "").lower() != "admin":
        return jsonify(status="error", message="Administrator access is required."), 403
    return None


@app.route("/api/admin/users/<int:user_id>/status", methods=["PUT"])
def admin_set_user_status(user_id):
    denied = _admin_required()
    if denied:
        return denied
    user = db.session.get(User, user_id)
    if not user:
        return jsonify(status="error", message="User not found."), 404
    if user.id == g.current_user.id:
        return jsonify(status="error", message="You cannot suspend your own administrator account."), 400
    data = request.get_json(silent=True) or {}
    suspended = data.get("suspended")
    if not isinstance(suspended, bool):
        return jsonify(status="error", message="Suspended must be true or false."), 400
    previous = bool(user.is_suspended)
    user.is_suspended = suspended
    write_audit("user_suspended" if suspended else "user_reactivated", "user", user.id,
                {"email": user.email, "previous_suspended": previous, "suspended": suspended})
    db.session.commit()
    return jsonify(status="success", message="Account suspended." if suspended else "Account reactivated.",
                   user=user.to_dict()), 200


@app.route("/api/admin/buddies/<int:user_id>/deactivate", methods=["PUT"])
def admin_deactivate_buddy(user_id):
    denied = _admin_required()
    if denied:
        return denied
    buddy = db.session.get(User, user_id)
    if not buddy or (buddy.role or "").lower() != "buddy":
        return jsonify(status="error", message="Active Buddy not found."), 404
    buddy.role = "student"
    write_audit("buddy_deactivated", "user", buddy.id, {"email": buddy.email})
    db.session.commit()
    return jsonify(status="success", message="Buddy access deactivated."), 200


@app.route("/api/admin/sessions/<int:session_id>/status", methods=["PUT"])
def admin_update_session_status(session_id):
    denied = _admin_required()
    if denied:
        return denied
    session = db.session.get(TutoringSession, session_id)
    if not session:
        return jsonify(status="error", message="Booking not found."), 404
    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    allowed = {"Pending", "Confirmed", "Completed", "Cancelled", "Rejected"}
    if new_status not in allowed:
        return jsonify(status="error", message="Select a valid booking status."), 400
    previous = session.status
    session.status = new_status
    if new_status == "Completed" and previous != "Completed" and session.buddy:
        session.buddy.points = (session.buddy.points or 0) + 25
    write_audit("booking_status_changed", "booking", session.id,
                {"previous_status": previous, "new_status": new_status})
    db.session.commit()
    return jsonify(status="success", message="Booking status updated.", session=session_to_dict(session)), 200


@app.route("/api/admin/audit-logs", methods=["GET"])
def admin_audit_logs():
    denied = _admin_required()
    if denied:
        return denied
    query = AdminAuditLog.query.order_by(AdminAuditLog.created_at.desc())
    action = request.args.get("action", "").strip()
    start_text = request.args.get("start", "").strip()
    end_text = request.args.get("end", "").strip()
    if action:
        query = query.filter(AdminAuditLog.action == action)
    try:
        if start_text:
            query = query.filter(AdminAuditLog.created_at >= datetime.fromisoformat(start_text))
        if end_text:
            end_date = datetime.fromisoformat(end_text)
            if len(end_text) == 10:
                end_date += timedelta(days=1)
            query = query.filter(AdminAuditLog.created_at < end_date)
    except ValueError:
        return jsonify(status="error", message="Invalid audit log date filter."), 400
    logs = query.limit(500).all()
    return jsonify(status="success", logs=[{
        "id": log.id,
        "admin": f"{log.admin.first_name} {log.admin.last_name}".strip() if log.admin else "Administrator",
        "action": log.action,
        "target_type": log.target_type,
        "target_id": log.target_id,
        "details": log.details,
        "created_at": log.created_at.isoformat(timespec="seconds") + "Z"
    } for log in logs]), 200


@app.route("/api/admin/qualifications", methods=["GET", "POST"])
def admin_qualifications():
    denied = _admin_required()
    if denied:
        return denied
    if request.method == "GET":
        items = ManagedQualification.query.order_by(ManagedQualification.id.asc()).all()
        return jsonify(status="success", qualifications=[{"id": q.id, "name": q.name, "active": q.active} for q in items]), 200
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    if not 2 <= len(name) <= 150 or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 &().,'/-]*", name):
        return jsonify(status="error", message="Enter a valid qualification name."), 400
    existing = ManagedQualification.query.filter(db.func.lower(ManagedQualification.name) == name.lower()).first()
    if existing:
        return jsonify(status="error", message="That qualification already exists."), 409
    item = ManagedQualification(name=name)
    db.session.add(item)
    write_audit("qualification_created", "qualification", None, {"name": name})
    db.session.commit()
    return jsonify(status="success", qualification={"id": item.id, "name": item.name, "active": item.active}), 201


@app.route("/api/admin/qualifications/<int:qualification_id>", methods=["PUT"])
def admin_update_qualification(qualification_id):
    denied = _admin_required()
    if denied:
        return denied
    item = db.session.get(ManagedQualification, qualification_id)
    if not item:
        return jsonify(status="error", message="Qualification not found."), 404
    data = request.get_json(silent=True) or {}
    if "active" in data:
        if not isinstance(data["active"], bool):
            return jsonify(status="error", message="Active must be true or false."), 400
        item.active = data["active"]
    if "name" in data:
        name = str(data.get("name", "")).strip()
        if not 2 <= len(name) <= 150:
            return jsonify(status="error", message="Enter a valid qualification name."), 400
        duplicate = ManagedQualification.query.filter(
            db.func.lower(ManagedQualification.name) == name.lower(),
            ManagedQualification.id != item.id
        ).first()
        if duplicate:
            return jsonify(status="error", message="That qualification already exists."), 409
        item.name = name
    write_audit("qualification_updated", "qualification", item.id, {"name": item.name, "active": item.active})
    db.session.commit()
    return jsonify(status="success", qualification={"id": item.id, "name": item.name, "active": item.active}), 200


@app.route("/api/admin/modules", methods=["GET", "POST"])
def admin_modules():
    denied = _admin_required()
    if denied:
        return denied
    if request.method == "GET":
        query = ManagedModule.query.join(ManagedQualification).order_by(ManagedQualification.name, ManagedModule.academic_year, ManagedModule.name)
        qualification_id = request.args.get("qualification_id", "").strip()
        year = request.args.get("year", "").strip()
        if qualification_id.isdigit():
            query = query.filter(ManagedModule.qualification_id == int(qualification_id))
        if year.isdigit():
            query = query.filter(ManagedModule.academic_year == int(year))
        return jsonify(status="success", modules=[{
            "id": m.id, "name": m.name, "qualification_id": m.qualification_id,
            "qualification": m.qualification.name, "academic_year": m.academic_year, "active": m.active
        } for m in query.limit(1000).all()]), 200
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    qid = data.get("qualification_id")
    year = data.get("academic_year")
    if not isinstance(qid, int) or not db.session.get(ManagedQualification, qid):
        return jsonify(status="error", message="Select a valid qualification."), 400
    if not isinstance(year, int) or year not in (1, 2, 3, 4, 5, 6):
        return jsonify(status="error", message="Academic year must be a number from 1 to 6."), 400
    if not 2 <= len(name) <= 150:
        return jsonify(status="error", message="Enter a valid module name."), 400
    item = ManagedModule(name=name, qualification_id=qid, academic_year=year)
    db.session.add(item)
    try:
        write_audit("module_created", "module", None, {"name": name, "qualification_id": qid, "academic_year": year})
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify(status="error", message="That module may already exist for this qualification and year."), 409
    return jsonify(status="success", module={"id": item.id, "name": item.name}), 201


@app.route("/api/admin/modules/<int:module_id>", methods=["PUT"])
def admin_update_module(module_id):
    denied = _admin_required()
    if denied:
        return denied
    item = db.session.get(ManagedModule, module_id)
    if not item:
        return jsonify(status="error", message="Module not found."), 404
    data = request.get_json(silent=True) or {}
    if "active" in data:
        if not isinstance(data["active"], bool):
            return jsonify(status="error", message="Active must be true or false."), 400
        item.active = data["active"]
    if "name" in data:
        name = str(data.get("name", "")).strip()
        if not 2 <= len(name) <= 150:
            return jsonify(status="error", message="Enter a valid module name."), 400
        duplicate = ManagedModule.query.filter(
            db.func.lower(ManagedModule.name) == name.lower(),
            ManagedModule.qualification_id == item.qualification_id,
            ManagedModule.academic_year == item.academic_year,
            ManagedModule.id != item.id
        ).first()
        if duplicate:
            return jsonify(status="error", message="That module already exists for this qualification and year."), 409
        item.name = name
    write_audit("module_updated", "module", item.id, {"name": item.name, "active": item.active})
    db.session.commit()
    return jsonify(status="success", module={"id": item.id, "name": item.name, "active": item.active}), 200


@app.route("/api/admin/reports.csv", methods=["GET"])
def admin_reports_csv():
    denied = _admin_required()
    if denied:
        return denied
    report_type = request.args.get("type", "users").strip().lower()
    output = io.StringIO()
    writer = csv.writer(output)
    if report_type == "applications":
        writer.writerow(["Application ID", "Name", "Student Number", "Qualification", "Academic Year", "Modules", "Status", "Submitted At"])
        query = BuddyApplication.query
        status = request.args.get("status", "").strip()
        qualification = request.args.get("qualification", "").strip()
        if status:
            query = query.filter(BuddyApplication.status == status)
        if qualification:
            query = query.filter(BuddyApplication.qualification == qualification)
        year = request.args.get("year", "").strip()
        if year.isdigit():
            query = query.filter(BuddyApplication.academic_year.like(f"%{year}%"))
        start_text = request.args.get("start", "").strip()
        end_text = request.args.get("end", "").strip()
        try:
            if start_text:
                query = query.filter(BuddyApplication.submitted_at >= datetime.fromisoformat(start_text))
            if end_text:
                end_date = datetime.fromisoformat(end_text)
                if len(end_text) == 10:
                    end_date += timedelta(days=1)
                query = query.filter(BuddyApplication.submitted_at < end_date)
        except ValueError:
            return jsonify(status="error", message="Invalid report date filter."), 400
        for a in query.order_by(BuddyApplication.submitted_at.desc()).limit(5000).all():
            writer.writerow([a.id, a.full_name, a.student_number, a.qualification, a.academic_year, a.modules, a.status, a.submitted_at.isoformat()])
    elif report_type == "bookings":
        writer.writerow(["Booking ID", "Student", "Buddy", "Module", "Date", "Time", "Status"])
        query = TutoringSession.query
        status = request.args.get("status", "").strip()
        start_text = request.args.get("start", "").strip()
        end_text = request.args.get("end", "").strip()
        if status:
            query = query.filter(TutoringSession.status == status)
        qualification = request.args.get("qualification", "").strip()
        year = request.args.get("year", "").strip()
        if qualification or year.isdigit():
            query = query.join(User, TutoringSession.student_id == User.id)
            if qualification:
                query = query.filter(User.course == qualification)
            if year.isdigit():
                query = query.filter(User.academic_year == int(year))
        try:
            if start_text:
                query = query.filter(TutoringSession.session_date >= date.fromisoformat(start_text))
            if end_text:
                query = query.filter(TutoringSession.session_date <= date.fromisoformat(end_text))
        except ValueError:
            return jsonify(status="error", message="Invalid report date filter."), 400
        for b in query.order_by(TutoringSession.session_date.desc()).limit(5000).all():
            writer.writerow([b.id, b.student.email if b.student else "", b.buddy.email if b.buddy else "", b.module, b.session_date.isoformat(), b.session_time, b.status])
    else:
        writer.writerow(["User ID", "First Name", "Last Name", "Email", "Role", "Qualification", "Academic Year", "Suspended", "Points"])
        query = User.query
        status = request.args.get("status", "").strip().lower()
        qualification = request.args.get("qualification", "").strip()
        year = request.args.get("year", "").strip()
        if status == "suspended":
            query = query.filter(User.is_suspended.is_(True))
        elif status == "active":
            query = query.filter(User.is_suspended.is_(False))
        if qualification:
            query = query.filter(User.course == qualification)
        if year.isdigit():
            query = query.filter(User.academic_year == int(year))
        for u in query.order_by(User.id.asc()).limit(5000).all():
            writer.writerow([u.id, u.first_name, u.last_name, u.email, u.role, u.course, u.academic_year, bool(u.is_suspended), u.points])
    response = make_response(output.getvalue())
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers["Content-Disposition"] = f'attachment; filename="octobuddy-{report_type}-report.csv"'
    return response



if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
    
