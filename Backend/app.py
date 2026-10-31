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
from zoneinfo import ZoneInfo
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
    origin.strip().rstrip("/")
    for origin in os.environ.get("CORS_ORIGINS", "").split(",")
    if origin.strip()
]

if not _allowed_origins:
    _allowed_origins = [
        "https://studybuddy-frontend-mocha.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:5500",
    ]

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": _allowed_origins,
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
        }
    },
    supports_credentials=False,
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


class LoginOTP(db.Model):
    """Short-lived email verification code for a login attempt."""
    __tablename__ = "login_otps"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("Users.User_id"), nullable=False, index=True)
    otp_hash = db.Column(db.String(64), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    used = db.Column(db.Boolean, nullable=False, default=False)
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
    transcript_filename = db.Column(db.String(255), nullable=True)
    transcript_data = db.Column(db.Text, nullable=True)
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



class SessionLifecycle(db.Model):
    """Tracks the Buddy-led start/end of a video session."""
    __tablename__ = "session_lifecycle"
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("tutoring_sessions.id"), nullable=False, unique=True, index=True)
    started_at = db.Column(db.DateTime, nullable=True)
    ended_at = db.Column(db.DateTime, nullable=True)
    session = db.relationship("TutoringSession")


class UserNotification(db.Model):
    """In-app notifications for booking, cancellation and reminders."""
    __tablename__ = "user_notifications"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("Users.User_id"), nullable=False, index=True)
    session_id = db.Column(db.Integer, db.ForeignKey("tutoring_sessions.id"), nullable=True, index=True)
    kind = db.Column(db.String(40), nullable=False)
    title = db.Column(db.String(160), nullable=False)
    message = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, index=True)
    read_at = db.Column(db.DateTime, nullable=True)


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
    if "buddy_applications" in inspector.get_table_names():
        app_columns = {column["name"] for column in inspector.get_columns("buddy_applications")}
        with db.engine.begin() as connection:
            if "transcript_filename" not in app_columns:
                connection.exec_driver_sql("ALTER TABLE buddy_applications ADD COLUMN transcript_filename VARCHAR(255)")
            if "transcript_data" not in app_columns:
                connection.exec_driver_sql("ALTER TABLE buddy_applications ADD COLUMN transcript_data TEXT")
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

    # Keep the module catalogue aligned with the qualification prospectuses.
    # Existing administrator-added modules are preserved; missing rows are added only once.
    qualification_catalog = {
      "Diploma in Information Technology": {
        1: ["Software Development 500", "Information Systems 511", "Programming 511", "Web Technology 511", "Networks 511", "Business Communication 500", "Information Systems 512", "Programming 512", "Web Technology 512", "Networks 512"],
        2: ["M-Commerce 621", "Information Systems 621", "Programming 621", "Database Systems 621", "Internet Programming 621", "Networks 621", "Business Management 621", "M-Commerce 622", "Information Systems 622", "Programming 622", "Database Systems 622", "Internet Programming 622", "Networks 622", "Business Management 622"],
        3: ["Quantitative Techniques 600", "IT Project Management 600", "Software Engineering 600", "Human Computer Interaction 600", "Programming 631", "Networks 631", "Business Analysis 631", "Operating Systems 600", "Management Information Systems 600", "Work Integrated Learning 600", "Programming 632", "Networks 632", "Business Analysis 632"]
      },
      "Bachelor of Science in IT": {
        1: ["Information Systems 511", "Programming 511", "Web Technology 511", "Networks 511", "Mathematics 511", "Information Systems 512", "Programming 512", "Web Technology 512", "Networks 512", "Mathematics 512", "Data Science 500"],
        2: ["Information Systems 621", "Programming 621", "Database Systems 600", "Cloud Computing 600", "Internet Programming 621", "Data Manipulation & Visualisation 600", "Business Analysis 621", "Computer Architecture 600", "Information Systems 622", "Programming 622", "Big Data & IOT 600", "Machine Learning 600", "Internet Programming 622", "Statistics for Data Science 600", "Business Analysis 622", "Server Technology 600"],
        3: ["Software Engineering 700", "Programming 731", "Cyber Security 700", "Artificial Intelligence 700", "Human Computer Interaction 700", "Programming 741", "Machine Learning 700", "IT Strategic Management 731", "Networks 731", "IT Project 700", "Programming 732", "Mobile App Development 700", "Work Integrated Learning 700", "Operating Systems 700", "Programming 742", "Autonomous Systems & Robotics 700", "IT Strategic Management 732", "Networks 732"]
      },
      "Bachelor of Business Administration": {
        1: ["Business Ethics 500", "Economics 511", "Accounting 511", "Statistics 511", "Information Systems 511", "Human Resource Management 511", "Marketing Management 511", "Entrepreneurship 500", "Economics 512", "Accounting 512", "Statistics 512", "Information Systems 512", "Human Resource Management 512", "Marketing Management 512"],
        2: ["Economics 621", "Stakeholder Relations 621", "Commercial Law 621", "Accounting 621", "Marketing Management 621", "Human Resource Management 621", "Economics 622", "Stakeholder Relations 622", "Commercial Law 622", "Accounting 622", "Marketing Management 622", "Human Resource Management 622"],
        3: ["Strategic Management 731", "Market Research 700", "Entrepreneurship & Small Business Management 700", "Contemporary Issues in Industrial Relations 700", "Accounting 731", "Marketing Management 731", "Human Resource Management 731", "Strategic Management 732", "Training & Development 700", "Total Quality Management 700", "Work Integrated Learning 700", "Accounting 732", "Marketing Management 732", "Human Resource Management 732"]
      }
    }
    for qualification_name, year_map in qualification_catalog.items():
        qualification = ManagedQualification.query.filter(db.func.lower(ManagedQualification.name) == qualification_name.lower()).first()
        if not qualification:
            qualification = ManagedQualification(name=qualification_name, active=True)
            db.session.add(qualification)
            db.session.flush()
        for year, names in year_map.items():
            for module_name in names:
                exists = ManagedModule.query.filter_by(qualification_id=qualification.id, academic_year=year, name=module_name).first()
                if not exists:
                    db.session.add(ManagedModule(name=module_name, qualification_id=qualification.id, academic_year=year, active=True))
    # Remove generic placeholder module rows from the initial starter catalogue.
    # Real prospectus modules (with their module codes) remain intact.
    ManagedModule.query.filter(ManagedModule.name.in_(["Programming", "Database Systems", "Networks", "Machine Learning", "Data Manipulation & Visualisation"])).delete(synchronize_session=False)
    db.session.commit()


def add_notification(user_id, title, message, kind, session_id=None):
    if not user_id:
        return
    db.session.add(UserNotification(user_id=user_id, title=title, message=message,
                                    kind=kind, session_id=session_id))


def notify_admins_by_email(subject, message, event_type):
    """Email every active administrator about important platform events."""
    admins = User.query.filter(db.func.lower(User.role) == "admin").all()
    sent = 0
    for admin_user in admins:
        if admin_user.email:
            try:
                send_event_email(admin_user.email, subject, message, event_type)
                sent += 1
            except Exception:
                app.logger.exception("Admin event email failed for user %s", admin_user.id)
    return sent


def send_event_email(recipient_email, subject, message, event_type):
    """Send a non-OTP message through the configured Apps Script relay.

    The relay must accept `subject`, `message`, and `type` fields in addition
    to `secret` and `email`; see NOTIFICATIONS_SETUP.md.
    """
    import json
    from urllib.request import Request, urlopen
    from urllib.error import URLError, HTTPError
    script_url = os.environ.get("EMAIL_SCRIPT_URL", "").strip()
    shared_secret = os.environ.get("OCTO_BUDDY_SECRET", "")
    if not script_url or not shared_secret:
        raise RuntimeError("Email relay is not configured.")
    payload = json.dumps({"secret": shared_secret, "email": recipient_email,
                          "subject": subject, "message": message, "type": event_type}).encode("utf-8")
    req = Request(script_url, data=payload, headers={"Content-Type":"application/json"}, method="POST")
    try:
        with urlopen(req, timeout=25) as response:
            result = json.loads(response.read().decode("utf-8", errors="replace"))
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError("The email relay request failed.") from exc
    if not isinstance(result, dict) or result.get("success") is not True:
        raise RuntimeError("The email relay did not confirm delivery.")


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
    """Allow realistic human-name characters and reject common placeholders."""
    value = (value or "").strip()
    if not re.fullmatch(r"[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '\u2019-][A-Za-zÀ-ÖØ-öø-ÿ]+)*", value):
        return False
    parts = [part for part in re.split(r"[ '\u2019-]+", value.lower()) if part]
    placeholders = {"one", "two", "three", "test", "testing", "user", "admin", "example", "abc", "asdf", "unknown", "none", "firstname", "lastname"}
    return len(value) >= 2 and not (len(parts) == 1 and parts[0] in placeholders)


def valid_password(password):
    """Require 8-10 characters with upper/lowercase, digit and special character."""
    if not isinstance(password, str) or not 8 <= len(password) <= 10:
        return False
    return all((re.search(r"[a-z]", password), re.search(r"[A-Z]", password),
                re.search(r"\d", password), re.search(r"[^A-Za-z0-9]", password)))


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


def modules_for_qualification(course, academic_year=None, include_previous=False):
    """Return prospectus modules for one year, or current plus earlier years for tutors."""
    qualification = resolve_managed_qualification(course)
    if qualification:
        query = ManagedModule.query.filter_by(qualification_id=qualification.id, active=True)
        if academic_year is not None:
            try:
                year = int(academic_year)
                if include_previous:
                    query = query.filter(ManagedModule.academic_year <= year)
                else:
                    query = query.filter(ManagedModule.academic_year == year)
            except (TypeError, ValueError):
                return set()
        return {item.name for item in query.all()}
    course = (course or "General").strip().lower()
    # Unknown or unset qualifications must not receive generic modules.
    return set()


@app.route("/api/modules", methods=["GET"])
def student_module_catalog():
    """Return modules for the authenticated user's saved qualification and year."""
    user = getattr(g, "current_user", None)
    if not user:
        return jsonify(status="error", message="Please log in to continue."), 401
    include_previous = request.args.get("include_previous", "").lower() in {"1", "true", "yes"}
    modules = sorted(modules_for_qualification(user.course, user.academic_year,
                                               include_previous=include_previous))
    return jsonify(status="success", modules=modules, qualification=user.course,
                   academic_year=user.academic_year,
                   includes_previous_years=include_previous), 200


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
        "email": application.user.email if application.user else "",
        "full_name": application.full_name,
        "student_number": application.student_number,
        "qualification": application.qualification,
        "academic_year": application.academic_year,
        "modules": json_list(application.modules),
        "availability": json_list(application.availability),
        "daily_limit": application.daily_limit,
        "motivation": application.motivation,
        "transcript_filename": application.transcript_filename,
        "transcript_data": application.transcript_data,
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
            TutoringSession.status.in_(["Pending", "Confirmed", "Completed"])
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
    "register", "verify_otp", "login", "verify_login_otp", "forgot_password", "reset_password",
    "home", "health", "send_session_reminders"
}


@app.before_request
def authenticate_api_requests():
    """Require a signed, time-limited bearer token for protected API routes."""

    # Allow browser CORS preflight requests without authentication.
    if request.method == "OPTIONS":
        return "", 204

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
            return jsonify(status="error", message="Password must be 8–10 characters and include uppercase, lowercase, a number and a special character."), 400
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

        # A password alone does not complete login. Send a short-lived email OTP.
        LoginOTP.query.filter_by(user_id=user.id, used=False).delete(synchronize_session=False)
        otp = str(secrets.randbelow(90000) + 10000)
        pending = LoginOTP(
            user_id=user.id,
            otp_hash=hashlib.sha256(otp.encode("utf-8")).hexdigest(),
            expires_at=datetime.utcnow() + timedelta(minutes=10),
            attempts=0,
            used=False,
        )
        db.session.add(pending)
        db.session.commit()
        try:
            send_otp_email(user.email, otp)
        except Exception:
            db.session.delete(pending)
            db.session.commit()
            app.logger.exception("Login verification email delivery failed.")
            return jsonify(status="error", message="We could not send your login verification code. Please try again later."), 503

        return jsonify({
            "status": "pending_otp",
            "message": "A verification code has been sent to your email. Verify it to finish logging in.",
            "email": user.email
        }), 200

    except Exception as exc:
        app.logger.exception("API operation failed.")
        return jsonify({"status": "error", "message": "The request could not be completed. Please try again."}), 500

    
@app.route("/api/verify-login-otp", methods=["POST"])
def verify_login_otp():
    """Complete login only after a valid emailed OTP is confirmed."""
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    otp = str(data.get("otp", "")).strip()
    if not valid_email(email) or not re.fullmatch(r"\d{5}", otp):
        return jsonify(status="error", message="Enter the email address and five-digit code."), 400
    user = User.query.filter_by(email=email).first()
    if not user or not user.is_verified or user.is_suspended:
        return jsonify(status="error", message="Invalid or expired verification code."), 400
    pending = LoginOTP.query.filter_by(user_id=user.id, used=False).order_by(LoginOTP.created_at.desc()).first()
    if not pending or pending.expires_at < datetime.utcnow() or pending.attempts >= 5:
        if pending:
            pending.used = True
            db.session.commit()
        return jsonify(status="error", message="Your code expired or attempts were exhausted. Please log in again."), 400
    expected = hashlib.sha256(otp.encode("utf-8")).hexdigest()
    if not hmac.compare_digest(pending.otp_hash, expected):
        pending.attempts += 1
        if pending.attempts >= 5:
            pending.used = True
        db.session.commit()
        return jsonify(status="error", message="Incorrect verification code."), 400
    pending.used = True
    db.session.commit()
    return jsonify(status="success", message="Login verified successfully.", user=user.to_dict(),
                   token=token_serializer.dumps({"uid": user.id, "role": (user.role or "student").lower()})), 200


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
                "Password must be 8–10 characters and include uppercase, lowercase, a number and a special character."
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

        actor = getattr(g, "current_user", None)
        if (user.role or "").lower() == "buddy" and actor and (actor.role or "").lower() != "admin":
            return jsonify(status="error", message="Octo Buddy profiles cannot be edited."), 403

        data = request.get_json() or {}

        # Only fields supplied by the frontend are changed. This means a
        # student can edit their profile without accidentally clearing
        # information that was not part of the form.
        first_name = data.get("first_name")
        last_name = data.get("last_name")
        course = data.get("course")
        academic_year = data.get("academic_year")

        if first_name is not None:
            if (getattr(g, "current_user", None).role or "").lower() != "admin":
                return jsonify({"status": "error", "message": "Your registered name cannot be edited from the profile page."}), 403
            first_name = str(first_name).strip()
            if not valid_name(first_name) or len(first_name) > 50:
                return jsonify({"status": "error", "message": "Enter a valid first name of no more than 50 characters."}), 400
            user.first_name = first_name

        if last_name is not None:
            if (getattr(g, "current_user", None).role or "").lower() != "admin":
                return jsonify({"status": "error", "message": "Your registered surname cannot be edited from the profile page."}), 403
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
        permitted_modules = modules_for_qualification(user.course, user.academic_year, include_previous=True)
        if any(module not in permitted_modules for module in modules):
            return jsonify(status="error", message="Select only modules from your qualification and your current or previous academic years."), 400

        full_name = str(data.get("full_name", f"{user.first_name} {user.last_name}")).strip()
        student_number = str(data.get("student_number", "")).strip()
        motivation = str(data.get("motivation", "")).strip()
        transcript_data = str(data.get("transcript_data", "")).strip()
        transcript_filename = str(data.get("transcript_filename", "")).strip()
        if transcript_data:
            if not transcript_data.startswith("data:image/") or len(transcript_data) > 7_000_000:
                return jsonify(status="error", message="Upload a valid image transcript smaller than 5 MB."), 400
        if not valid_name(full_name):
            return jsonify(status="error", message="Full name must contain letters only (spaces, apostrophes and hyphens are allowed)."), 400
        if not re.fullmatch(r"402[0-9]{6}", student_number):
            return jsonify(status="error", message="Student number must be exactly 9 digits and start with 402."), 400
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
            transcript_filename=transcript_filename or None,
            transcript_data=transcript_data or None,
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
        notify_admins_by_email(
            "New Octo Buddy application received",
            f"A new Octo Buddy application has been submitted.\n\nApplicant: {application.full_name}\nStudent number: {application.student_number}\nQualification: {application.qualification}\nAcademic year: {application.academic_year}\nStatus: Pending",
            "buddy_application_submitted"
        )

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
    """Return applications for administrators only."""
    denied = _admin_required()
    if denied:
        return denied
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

        # A rejected application is final: never allow it to be approved later.
        if (application.status or "").strip().lower() == "rejected" and action == "approve":
            return jsonify({
                "status": "error",
                "message": "This application was rejected and cannot be approved."
            }), 409

        # Only pending applications may be reviewed. Approved/rejected decisions are final.
        if (application.status or "").strip().lower() != "pending":
            return jsonify({
                "status": "error",
                "message": "Only pending applications can be reviewed."
            }), 409

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


@app.route("/api/sessions/room/<path:room_code>/join", methods=["POST"])
def session_room_join(room_code):
    """Buddy starts the room; student may enter only after the Buddy starts it."""
    actor = getattr(g, "current_user", None)
    if not actor:
        return jsonify(status="error", message="Please log in."), 401
    session = TutoringSession.query.filter_by(room_code=room_code).first()
    if not session:
        return jsonify(status="error", message="No booked session matches this room code."), 404
    if actor.id not in (session.student_id, session.buddy_id) and (actor.role or "").lower() != "admin":
        return jsonify(status="error", message="You are not assigned to this session."), 403
    if session.status != "Confirmed":
        return jsonify(status="error", message=f"This session is {session.status.lower()} and cannot be joined."), 409
    local_now = datetime.now(ZoneInfo("Africa/Johannesburg"))
    if session.session_date != local_now.date():
        return jsonify(status="error", message="This video session can only be entered on its scheduled date."), 403
    try:
        scheduled_start = datetime.combine(session.session_date, datetime.strptime(session.session_time, "%H:%M").time(), tzinfo=ZoneInfo("Africa/Johannesburg"))
    except ValueError:
        return jsonify(status="error", message="The scheduled session time is invalid."), 400
    if local_now < scheduled_start:
        return jsonify(status="error", message="This session cannot be entered before its scheduled start time."), 403
    lifecycle = SessionLifecycle.query.filter_by(session_id=session.id).first()
    if not lifecycle:
        lifecycle = SessionLifecycle(session_id=session.id)
        db.session.add(lifecycle)
        db.session.flush()
    role = (actor.role or "student").lower()
    if role == "buddy":
        if actor.id != session.buddy_id:
            return jsonify(status="error", message="Only the assigned Octo Buddy can start this session."), 403
        if not lifecycle.started_at:
            lifecycle.started_at = datetime.utcnow()
            add_notification(session.student_id, "Your Octo Buddy has started the session", f"Your {session.module} session is ready to join.", "session_started", session.id)
            db.session.commit()
    elif role == "student":
        if actor.id != session.student_id:
            return jsonify(status="error", message="Only the booked student can join this session."), 403
        if not lifecycle.started_at or lifecycle.ended_at:
            return jsonify(status="error", message="Your Octo Buddy has not started this session yet."), 409
    return jsonify(status="success", message="Session may be joined.", session_id=session.id,
                   started=bool(lifecycle.started_at), ended=bool(lifecycle.ended_at)), 200


@app.route("/api/sessions/room/<path:room_code>/end", methods=["POST"])
def session_room_end(room_code):
    """Only the assigned Buddy can end and complete a session."""
    actor = getattr(g, "current_user", None)
    session = TutoringSession.query.filter_by(room_code=room_code).first()
    if not actor or not session:
        return jsonify(status="error", message="Session or account not found."), 404
    if actor.id != session.buddy_id or (actor.role or "").lower() != "buddy":
        return jsonify(status="error", message="Only the assigned Octo Buddy can end this session."), 403
    lifecycle = SessionLifecycle.query.filter_by(session_id=session.id).first()
    if not lifecycle or not lifecycle.started_at:
        return jsonify(status="error", message="The session has not been started by the Buddy."), 409
    if not lifecycle.ended_at:
        lifecycle.ended_at = datetime.utcnow()
        if session.status == "Confirmed":
            session.status = "Completed"
            actor.points = (actor.points or 0) + 25
            add_notification(session.student_id, "Tutoring session completed", f"Your {session.module} session has ended.", "session_completed", session.id)
            add_notification(actor.id, "Tutoring session completed", f"You completed the {session.module} session.", "session_completed", session.id)
        db.session.commit()
        if session.status == "Completed":
            student_name = f"{session.student.first_name} {session.student.last_name}" if session.student else "Student"
            buddy_name = f"{session.buddy.first_name} {session.buddy.last_name}" if session.buddy else "Octo Buddy"
            notify_admins_by_email(
                "Octo Buddy session completed",
                f"A tutoring session has been completed.\n\nStudent: {student_name}\nOcto Buddy: {buddy_name}\nModule: {session.module}\nDate: {session.session_date.isoformat()}\nTime: {session.session_time}\nSession ID: {session.id}",
                "session_completed"
            )
    return jsonify(status="success", message="Session ended and recorded.", session=session_to_dict(session)), 200


@app.route("/api/notifications", methods=["GET"])
def list_user_notifications():
    actor = getattr(g, "current_user", None)
    if not actor:
        return jsonify(status="error", message="Please log in."), 401
    items = UserNotification.query.filter_by(user_id=actor.id).order_by(UserNotification.created_at.desc()).limit(50).all()
    return jsonify(status="success", notifications=[{
        "id": n.id, "title": n.title, "message": n.message, "kind": n.kind,
        "session_id": n.session_id, "created_at": n.created_at.isoformat() + "Z",
        "read": bool(n.read_at)
    } for n in items]), 200


@app.route("/api/notifications/<int:notification_id>/read", methods=["PUT"])
def mark_notification_read(notification_id):
    actor = getattr(g, "current_user", None)
    item = UserNotification.query.filter_by(id=notification_id, user_id=actor.id if actor else -1).first()
    if not item:
        return jsonify(status="error", message="Notification not found."), 404
    item.read_at = datetime.utcnow()
    db.session.commit()
    return jsonify(status="success"), 200


@app.route("/api/cron/session-reminders", methods=["POST"])
def send_session_reminders():
    """Cron endpoint: invoke every 5 minutes using X-Cron-Secret."""
    expected = os.environ.get("CRON_SECRET", "").strip()
    if not expected or not hmac.compare_digest(request.headers.get("X-Cron-Secret", ""), expected):
        return jsonify(status="error", message="Not authorized."), 401
    now = datetime.now(ZoneInfo("Africa/Johannesburg"))
    window_start = now + timedelta(minutes=55)
    window_end = now + timedelta(minutes=65)
    sessions = TutoringSession.query.filter(TutoringSession.status == "Confirmed").all()
    sent = 0
    for session in sessions:
        try:
            t = datetime.strptime(session.session_time, "%H:%M").time()
            start = datetime.combine(session.session_date, t, tzinfo=ZoneInfo("Africa/Johannesburg"))
        except ValueError:
            continue
        if not (window_start <= start <= window_end):
            continue
        already = UserNotification.query.filter_by(session_id=session.id, kind="reminder_1h").first()
        if already:
            continue
        detail = f"{session.module} on {session.session_date.isoformat()} at {session.session_time}."
        recipients = [u for u in (session.student, session.buddy) if u and u.email]
        try:
            for user in recipients:
                add_notification(user.id, "Tutoring session in one hour", f"Your {detail}", "reminder_1h", session.id)
                send_event_email(user.email, "Octo Buddy session reminder", f"Reminder: your tutoring session for {detail}", "session_reminder")
            db.session.commit()
            sent += 1
        except Exception:
            db.session.rollback()
            app.logger.exception("Session reminder delivery failed for session %s", session.id)
    return jsonify(status="success", reminders_processed=sent), 200


# ============================================================
# TUTORING BOOKINGS / SESSIONS
# ============================================================

@app.route("/api/available-tutors", methods=["GET"])
def available_tutors():
    """Return an always-on roster matched to the student's saved qualification/year.

    The roster does not depend on booking-form fields. Upcoming dates are
    calculated from each approved Buddy's published weekdays and daily limit;
    dates at capacity are omitted. Optional module/date query values are only
    used by the separate booking controls and never gate the roster.
    """
    student = getattr(g, "current_user", None)
    if not student or (student.role or "").lower() != "student":
        return jsonify(status="error", message="A student account is required."), 403

    student_modules = modules_for_qualification(student.course, student.academic_year)
    requested_module = request.args.get("module", "").strip()
    requested_date_text = request.args.get("date", "").strip()
    if requested_module and requested_module not in student_modules:
        return jsonify(status="error", message="That module is not part of your qualification/year."), 400

    local_tz = ZoneInfo("Africa/Johannesburg")
    today = datetime.now(local_tz).date()
    horizon_days = 30

    def normalized(value):
        return " ".join(str(value or "").casefold().replace("&", "and").split())

    requested_date = None
    if requested_date_text:
        try:
            requested_date = date.fromisoformat(requested_date_text)
        except ValueError:
            return jsonify(status="error", message="Invalid date."), 400

    results = []
    applications = BuddyApplication.query.filter_by(status="Approved").order_by(BuddyApplication.id.desc()).all()
    for application in applications:
        tutor = application.user
        if not tutor or (tutor.role or "").lower() != "buddy":
            continue

        # Match both the qualification and year selected on the Buddy application.
        if normalized(application.qualification) != normalized(student.course):
            continue
        try:
            if int(str(application.academic_year).strip().lower().replace("year", "").strip()) != int(student.academic_year):
                continue
        except (TypeError, ValueError):
            continue

        matching_modules = [name for name in json_list(application.modules) if name in student_modules]
        if requested_module:
            matching_modules = [name for name in matching_modules if name == requested_module]
        if not matching_modules:
            continue

        available_days = [day for day in json_list(application.availability)
                          if day in {"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}]
        try:
            daily_limit = max(1, int(application.daily_limit or 3))
        except (TypeError, ValueError):
            daily_limit = 3

        upcoming = []
        for offset in range(horizon_days):
            candidate = today + timedelta(days=offset)
            if candidate.strftime("%A") not in available_days:
                continue
            if requested_date and candidate != requested_date:
                continue
            booked_count = TutoringSession.query.filter(
                TutoringSession.buddy_id == tutor.id,
                TutoringSession.session_date == candidate,
                TutoringSession.status.in_(["Pending", "Confirmed"]),
            ).count()
            if booked_count < daily_limit:
                upcoming.append(candidate.isoformat())

        results.append({
            "id": tutor.id,
            "first_name": tutor.first_name,
            "last_name": tutor.last_name,
            "qualification": application.qualification,
            "academic_year": application.academic_year,
            "modules": matching_modules,
            "available_days": available_days,
            "available_dates": upcoming,
            "daily_limit": daily_limit,
        })

    return jsonify(
        status="success",
        qualification=student.course,
        academic_year=student.academic_year,
        modules=sorted(student_modules),
        tutors=results,
        date_range_days=horizon_days,
    ), 200

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

        local_now = datetime.now(ZoneInfo("Africa/Johannesburg"))
        if requested_date < local_now.date():
            return jsonify({"status": "error", "message": "Past dates cannot be booked."}), 400
        requested_start = datetime.combine(requested_date, datetime.strptime(time_text, "%H:%M").time(), tzinfo=ZoneInfo("Africa/Johannesburg"))
        if requested_start <= local_now:
            return jsonify({"status": "error", "message": "That time has already passed. Please choose a future time."}), 400

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

        requested_buddy_id = data.get("buddy_id")
        if requested_buddy_id not in (None, ""):
            try:
                buddy = db.session.get(User, int(requested_buddy_id))
            except (TypeError, ValueError):
                buddy = None
            application = BuddyApplication.query.filter_by(user_id=buddy.id, status="Approved").first() if buddy else None
            allowed_days = json_list(application.availability) if application else []
            allowed_modules = json_list(application.modules) if application else []
            if not buddy or (buddy.role or "").lower() != "buddy" or not application or module not in allowed_modules or requested_date.strftime("%A") not in allowed_days:
                return jsonify(status="error", message="Choose an approved tutor who teaches this module and is available on that day."), 400
        else:
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
            status="Pending"
        )

        db.session.add(session)
        db.session.flush()
        detail = f"{module} on {requested_date.isoformat()} at {time_text}."
        add_notification(student.id, "Session request submitted", f"Your request is pending Octo Buddy approval: {detail}", "booking_pending", session.id)
        if buddy:
            add_notification(buddy.id, "New session request", f"A student requested a session: {detail}", "booking_pending", session.id)
        db.session.commit()
        # The assigned Octo Buddy receives an email for every new booking request.
        try:
            if buddy and buddy.email:
                send_event_email(
                    buddy.email,
                    "New Octo Buddy session request",
                    f"A student has requested a tutoring session.\n\nStudent: {student.first_name} {student.last_name}\nModule: {module}\nDate: {requested_date.isoformat()}\nTime: {time_text}\n\nPlease sign in to approve or reject this request.",
                    "session_booked"
                )
        except Exception:
            app.logger.exception("Buddy booking email delivery failed.")

        return jsonify({
            "status": "success",
            "message": "Tutoring session booked successfully.",
            "session": session_to_dict(session)
        }), 201

    except Exception as exc:
        db.session.rollback()
        app.logger.exception("API operation failed.")
        return jsonify({"status": "error", "message": "The request could not be completed. Please try again."}), 500


def purge_past_sessions():
    """Permanently remove tutoring sessions scheduled before today (South Africa time)."""
    cutoff = datetime.now(ZoneInfo("Africa/Johannesburg")).date()
    old_sessions = TutoringSession.query.filter(TutoringSession.session_date < cutoff).all()
    if not old_sessions:
        return
    old_ids = [item.id for item in old_sessions]
    SessionLifecycle.query.filter(SessionLifecycle.session_id.in_(old_ids)).delete(synchronize_session=False)
    UserNotification.query.filter(UserNotification.session_id.in_(old_ids)).delete(synchronize_session=False)
    for item in old_sessions:
        db.session.delete(item)
    db.session.commit()


@app.route("/api/sessions/student/<int:user_id>", methods=["GET"])
def student_sessions(user_id):
    """Return sessions belonging to a student."""
    denied = require_self_or_admin(user_id)
    if denied:
        return denied
    purge_past_sessions()
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
    purge_past_sessions()
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


@app.route("/api/buddy/students/<int:buddy_id>", methods=["GET"])
def buddy_students(buddy_id):
    """Return only students with sessions assigned to the authenticated Buddy."""
    actor = getattr(g, "current_user", None)
    if not actor or (actor.id != buddy_id and (actor.role or "").lower() != "admin"):
        return jsonify(status="error", message="You are not allowed to view these students."), 403
    purge_past_sessions()
    buddy = db.session.get(User, buddy_id)
    if not buddy or (buddy.role or "").lower() != "buddy":
        return jsonify(status="error", message="Octo Buddy not found."), 404

    sessions = TutoringSession.query.filter_by(buddy_id=buddy_id).order_by(
        TutoringSession.session_date.asc(), TutoringSession.session_time.asc()
    ).all()
    students = {}
    for session in sessions:
        student = session.student
        if not student:
            continue
        entry = students.setdefault(student.id, {
            "id": student.id,
            "first_name": student.first_name,
            "last_name": student.last_name,
            "qualification": student.course or "Not set",
            "modules": [],
            "session_count": 0,
        })
        if session.module and session.module not in entry["modules"]:
            entry["modules"].append(session.module)
        entry["session_count"] += 1

    return jsonify(status="success", students=list(students.values())), 200


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
        if actor_role == "student" and session.status not in {"Pending", "Confirmed"}:
            return jsonify(status="error", message="Only pending or confirmed sessions can be cancelled."), 409
        if actor_role == "buddy":
            if actor.id != session.buddy_id or new_status not in {"Confirmed", "Rejected", "Completed", "Cancelled"}:
                return jsonify(status="error", message="You may only approve, reject, complete or cancel your assigned sessions."), 403
            if new_status in {"Confirmed", "Rejected"} and session.status != "Pending":
                return jsonify(status="error", message="Only pending session requests can be approved or rejected."), 409
            if new_status == "Cancelled" and session.status not in {"Pending", "Confirmed"}:
                return jsonify(status="error", message="Only pending or confirmed sessions can be cancelled."), 409
        allowed = {"Confirmed", "Rejected", "Completed", "Cancelled"}

        if new_status == "Completed":
            if actor_role != "buddy" or actor.id != session.buddy_id:
                return jsonify(status="error", message="Only the assigned Octo Buddy can complete this session."), 403
            lifecycle = SessionLifecycle.query.filter_by(session_id=session.id).first()
            if not lifecycle or not lifecycle.ended_at:
                return jsonify(status="error", message="End the video session before marking it completed."), 409
            try:
                start_time = datetime.strptime(session.session_time, "%H:%M").time()
            except ValueError:
                return jsonify(status="error", message="The stored session time is invalid."), 400
            scheduled_start = datetime.combine(session.session_date, start_time, tzinfo=ZoneInfo("Africa/Johannesburg"))
            if datetime.now(ZoneInfo("Africa/Johannesburg")) < scheduled_start:
                return jsonify(status="error", message="The session cannot be completed before its scheduled start time."), 400

        if new_status not in allowed:
            return jsonify({
                "status": "error",
                "message": "Invalid session status."
            }), 400

        previous_status = session.status
        session.status = new_status
        detail = f"{session.module} on {session.session_date.isoformat()} at {session.session_time}."
        if new_status == "Confirmed" and previous_status == "Pending":
            add_notification(session.student_id, "Session confirmed", f"Your Octo Buddy approved your session: {detail}", "session_confirmed", session.id)
            if session.student and session.student.email:
                try:
                    send_event_email(session.student.email, "Your Octo Buddy session is confirmed", f"Your session has been approved.\n\n{detail}", "session_confirmed")
                except Exception:
                    app.logger.exception("Session approval email failed.")
        if new_status == "Rejected" and previous_status == "Pending":
            add_notification(session.student_id, "Session request rejected", f"Your Octo Buddy could not accept this request: {detail}", "session_rejected", session.id)
        if new_status == "Cancelled" and previous_status != "Cancelled":
            for recipient in (session.student, session.buddy):
                if recipient:
                    add_notification(recipient.id, "Session cancelled", f"The session was cancelled: {detail}", "cancelled", session.id)

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
    """Session Schedule is read/manage-only; booking happens from Student booking flow."""
    denied = _admin_required()
    if denied:
        return denied
    return jsonify(status="error", message="Creating bookings from Session Schedule is disabled. Use the student booking workflow."), 405
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
        try:
            requested_date = date.fromisoformat(date_text)
            local_now = datetime.now(ZoneInfo("Africa/Johannesburg"))
            requested_start = datetime.combine(requested_date, datetime.strptime(time_text, "%H:%M").time(), tzinfo=ZoneInfo("Africa/Johannesburg"))
        except ValueError:
            return jsonify(status="error", message="Enter a valid date and time."), 400
        if requested_date < local_now.date():
            return jsonify(status="error", message="Past dates cannot be booked."), 400
        if requested_start <= local_now:
            return jsonify(status="error", message="That time has already passed. Please choose a future time."), 400
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
            status="Pending"
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


@app.route("/api/admin/sessions/<int:session_id>", methods=["DELETE"])
def admin_delete_session(session_id):
    """Delete a scheduled session. Restricted to administrators."""
    denied = _admin_required()
    if denied:
        return denied
    session = db.session.get(TutoringSession, session_id)
    if not session:
        return jsonify(status="error", message="Session not found."), 404
    write_audit("session_deleted", "session", session.id, {
        "student_id": session.student_id,
        "buddy_id": session.buddy_id,
        "module": session.module,
        "date": session.session_date.isoformat(),
        "time": session.session_time,
    })
    db.session.delete(session)
    db.session.commit()
    return jsonify(status="success", message="Session deleted."), 200


@app.route("/api/admin/sessions", methods=["GET"])
def admin_sessions():
    """Return tutoring sessions for the admin calendar."""
    try:
        purge_past_sessions()
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
    purge_past_sessions()
    today = datetime.now(ZoneInfo("Africa/Johannesburg")).date()
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
    if not 2 <= len(name) <= 150 or not re.fullmatch(r"[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ &().,'/-]*", name) or not re.search(r"[A-Za-zÀ-ÖØ-öø-ÿ]", name):
        return jsonify(status="error", message="Enter a realistic qualification name using letters and normal punctuation only; numbers are not allowed."), 400
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
        if not 2 <= len(name) <= 150 or not re.fullmatch(r"[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ &().,'/-]*", name):
            return jsonify(status="error", message="Enter a realistic qualification name using letters and normal punctuation only; numbers are not allowed."), 400
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


@app.route("/api/admin/qualifications/<int:qualification_id>", methods=["DELETE"])
def admin_delete_qualification(qualification_id):
    denied = _admin_required()
    if denied:
        return denied
    item = db.session.get(ManagedQualification, qualification_id)
    if not item:
        return jsonify(status="error", message="Qualification not found."), 404
    # Do not delete catalogue rows still referenced by modules; this avoids orphaned data.
    if ManagedModule.query.filter_by(qualification_id=item.id).first():
        return jsonify(status="error", message="Delete or reassign this qualification's modules before deleting the qualification."), 409
    write_audit("qualification_deleted", "qualification", item.id, {"name": item.name})
    db.session.delete(item)
    db.session.commit()
    return jsonify(status="success", message="Qualification deleted."), 200


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
    if not 2 <= len(name) <= 150 or not re.fullmatch(r"[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ &().,'/-]*(?: [0-9]{3})?", name):
        return jsonify(status="error", message="Module names must start with a letter and may only end with a three-digit module code, e.g. Programming 621."), 400
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
        if not 2 <= len(name) <= 150 or not re.fullmatch(r"[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ &().,'/-]*(?: [0-9]{3})?", name):
            return jsonify(status="error", message="Module names must start with a letter and may only end with a three-digit module code, e.g. Programming 621."), 400
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
    
