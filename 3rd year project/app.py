import os
import re
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app)

app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-fallback-secret-key')

# =========================================================
# SUPABASE POOLED POSTGRESQL CONNECTION
# Replace [YOUR-PASSWORD] with your actual Supabase database password
# =========================================================
SUPABASE_URI = "postgresql+psycopg2://postgres.gjnpwpcnzhoxdqyfxzez:AlphaTechocti@aws-1-eu-west-1.pooler.supabase.com:6543/postgres"

app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get("DATABASE_URL", SUPABASE_URI)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# =========================
# DATABASE MODELS
# =========================
class User(db.Model):
    __tablename__ = 'Users'

    id = db.Column('User_id', db.Integer, primary_key=True)
    first_name = db.Column('First_Name', db.String(50), nullable=False)
    last_name = db.Column('Last_Name', db.String(50), nullable=False)
    password_hash = db.Column('Password', db.String(255), nullable=False)
    email = db.Column('Email', db.String(50), unique=True, nullable=False)
    course = db.Column('course', db.String(20), default='General')
    academic_year = db.Column('Acedemic_year', db.Integer, default=1)
    is_verified = db.Column('Verified', db.SmallInteger, default=0)
    verification_token = db.Column('VerificationToken', db.String(255), nullable=True)
    role = db.Column('Role', db.String(50), default='Student')
    points = db.Column('Points', db.Integer, default=0)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "email": self.email,
            "role": str(self.role),
            "course": self.course,
            "academic_year": self.academic_year,
            "is_verified": bool(self.is_verified),
            "points": self.points
        }

with app.app_context():
    db.create_all()

# =========================
# VALIDATION HELPERS
# =========================
def valid_email(email):
    pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'
    return re.match(pattern, email)

def valid_password(password):
    if len(password) < 8 or len(password) > 10:
        return False
    if not any(char.isdigit() for char in password):
        return False
    return True

# =========================
# API ROUTES
# =========================

@app.route('/')
def home():
    return jsonify({"message": "Study Loop API Connected to Supabase Pooler"}), 200


# 1. User Registration
@app.route('/api/register', methods=['POST'])
@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        data = request.get_json() or {}
        
        first_name = data.get('first_name', '').strip()
        last_name = data.get('last_name', '').strip()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')

        # Safe integer conversion to avoid ValueError on empty inputs
        raw_year = str(data.get('academic_year', '')).strip()
        academic_year = int(raw_year) if raw_year.isdigit() else 1

        if len(first_name) > 30 or len(last_name) > 30:
            return jsonify({"status": "error", "message": "Names cannot exceed 30 characters"}), 400
        if not first_name or not email or not password:
            return jsonify({"status": "error", "message": "First name, email, and password are required"}), 400
        if not valid_email(email):
            return jsonify({"status": "error", "message": "Invalid email address format"}), 400
        if not valid_password(password):
            return jsonify({"status": "error", "message": "Password must be 8-10 characters long and contain a number"}), 400

        if User.query.filter_by(email=email).first():
            return jsonify({"status": "error", "message": "Account with this email already exists"}), 409

        new_user = User(
            first_name=first_name,
            last_name=last_name,
            email=email,
            role='student',
            course=data.get('course', 'General'),
            academic_year=academic_year,
            is_verified=True
        )
        new_user.set_password(password)

        db.session.add(new_user)
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "User registered successfully",
            "user": new_user.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        print("REGISTER ERROR:", str(e))
        return jsonify({"status": "error", "message": f"Database error: {str(e)}"}), 500


# 2. User Login
@app.route('/api/login', methods=['POST'])
@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json() or {}
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')

        if not email or not password:
            return jsonify({"status": "error", "message": "Email and password are required"}), 400

        user = User.query.filter_by(email=email).first()

        if not user or not user.check_password(password):
            return jsonify({"status": "error", "message": "Invalid email or password"}), 401

        return jsonify({
            "status": "success",
            "message": "Login successful",
            "user": user.to_dict()
        }), 200

    except Exception as e:
        print("LOGIN ERROR:", str(e))
        return jsonify({"status": "error", "message": f"Server error: {str(e)}"}), 500


# 3. Get User Profile
@app.route('/api/user/<int:user_id>', methods=['GET'])
def get_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({"status": "error", "message": "User not found"}), 404

    return jsonify(user.to_dict()), 200


# 4. Update Profile
@app.route('/api/user/<int:user_id>', methods=['PUT'])
def update_user_profile(user_id):
    try:
        data = request.get_json() or {}
        user = User.query.get(user_id)

        if not user:
            return jsonify({"status": "error", "message": "User not found"}), 404

        if 'first_name' in data and data['first_name'].strip():
            user.first_name = data['first_name'].strip()
        
        if 'last_name' in data:
            user.last_name = data['last_name'].strip()

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Profile updated successfully",
            "user": user.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": "Failed to update profile"}), 500


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)