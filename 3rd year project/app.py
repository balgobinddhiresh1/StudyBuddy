from flask import Flask, request, jsonify, redirect
from flask_cors import CORS
import pymysql
import re
import os
import random
import time
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

# Secret key for generating secure tokens
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-fallback-secret-key')

# --- OTP IN-MEMORY STORAGE ---
# In a production app, you would use a Redis database or a DB table for this.
# Stores structure: { "email@example.com": { "otp": "123456", "expires_at": timestamp, "last_sent": timestamp } }
otp_store = {}

# DATABASE CONNECTION
def get_connection():
    return pymysql.connect(
        host="mysql-3d71e7bc-studybuddy-alphatech.l.aivencloud.com",
        port=22178,
        user="avnadmin",
        password="YOUR_SECURE_PASSWORD", # Use environment variables here
        database="defaultdb",
        cursorclass=pymysql.cursors.DictCursor
    )

# MOCK EMAIL FUNCTION FOR OTP
def send_otp_email(target_email, otp):
    print("\n----------------- SIMULATED OTP EMAIL -----------------")
    print(f"To: {target_email}")
    print(f"Subject: Your Study Buddy OTP Verification Code")
    print(f"Your 6-digit verification code is: {otp}")
    print("This code will expire in 5 minutes.")
    print("-------------------------------------------------------\n")

# VALIDATION HELPER FUNCTIONS
def valid_email(email):
    pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'
    return re.match(pattern, email)

def valid_password(password):
    if len(password) < 8 or len(password) > 10:
        return False
    if not any(char.isdigit() for char in password):
        return False
    return True

# HELPER: Generate and handle OTP cooldown logic
def generate_and_send_otp(email):
    current_time = time.time()
    
    # Check 1-minute (60 seconds) cooldown rule
    if email in otp_store:
        time_passed = current_time - otp_store[email]['last_sent']
        if time_passed < 60:
            remaining = int(60 - time_passed)
            return False, f"Please wait {remaining} seconds before requesting a new OTP code."

    # Generate a secure 6-digit token code
    otp = f"{random.randint(100000, 999999)}"
    
    # Store verification code with 5 minutes expiration, tracking last sent timestamp
    otp_store[email] = {
        "otp": otp,
        "expires_at": current_time + 300, # 5 minutes expiry window
        "last_sent": current_time
    }
    
    send_otp_email(email, otp)
    return True, "OTP successfully sent."

@app.route('/')
def home():
    return jsonify({"message": "Study Buddy API Running"})

# --- REGISTER ENDPOINT ---
@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        first_name = data.get('first_name', '').strip()
        last_name = data.get('last_name', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')

        # Validations
        if len(first_name) > 30 or len(last_name) > 30:
            return jsonify({"message": "Names cannot exceed 30 characters"}), 400
        if not first_name or not last_name or not email:
            return jsonify({"message": "All fields are required"}), 400
        if not valid_email(email):
            return jsonify({"message": "Invalid email address"}), 400
        if not valid_password(password):
            return jsonify({"message": "Password must be 8-10 characters long and contain a number"}), 400

        connection = get_connection()
        with connection.cursor() as cursor:
            # Check if email exists
            cursor.execute("SELECT * FROM Users WHERE Email = %s", (email,))
            if cursor.fetchone():
                connection.close()
                return jsonify({"message": "Email already exists"}), 400

            # Insert unverified user (Is_Verified = 0)
            cursor.execute(
                """
                INSERT INTO Users 
                (First_Name, Last_Name, Password, Email, course, Acedemic_year, Is_Verified)
                VALUES (%s, %s, %s, %s, %s, %s, 0)
                """,
                (first_name, last_name, password, email, "General", 1)
            )
            connection.commit()
        connection.close()

        # Generate and route OTP
        success, msg = generate_and_send_otp(email)
        if not success:
            return jsonify({"message": msg}), 429

        return jsonify({
            "status": "success",
            "message": "Registration successful! Please submit the OTP code sent to your email."
        }), 201

    except Exception as e:
        print("REGISTER ERROR:", e)
        return jsonify({"status": "error", "message": "Database error"}), 500

# --- LOGIN ENDPOINT ---
@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        password = data.get('password', '')

        if not email or not password:
            return jsonify({"message": "Email and password required"}), 400

        connection = get_connection()
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM Users WHERE Email = %s AND Password = %s", 
                (email, password)
            )
            user = cursor.fetchone()
        connection.close()

        if user:
            # Trigger OTP verification for user confirmation upon log in attempt
            success, msg = generate_and_send_otp(email)
            if not success:
                return jsonify({"message": msg}), 429

            return jsonify({
                "status": "success",
                "message": "Credentials valid. Please submit the OTP code sent to your email."
            }), 200

        return jsonify({"status": "error", "message": "Invalid email or password"}), 401

    except Exception as e:
        print("LOGIN ERROR:", e)
        return jsonify({"status": "error", "message": "Database error"}), 500

# --- NEW: VERIFY OTP ENDPOINT ---
# Your frontend can send verification payload here: {"email": "...", "otp": "..."}
@app.route('/api/verify-otp', methods=['POST'])
def verify_otp():
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        submitted_otp = data.get('otp', '').strip()

        if not email or not submitted_otp:
            return jsonify({"message": "Email and OTP code are required"}), 400

        if email not in otp_store:
            return jsonify({"message": "No active OTP request found for this email."}), 400

        record = otp_store[email]
        current_time = time.time()

        # Check expiration
        if current_time > record['expires_at']:
            del otp_store[email]
            return jsonify({"message": "OTP code has expired. Please request a new one."}), 400

        # Check matching criteria
        if record['otp'] != submitted_otp:
            return jsonify({"message": "Invalid OTP code. Please try again."}), 400

        # Success! Activate user status inside DB
        connection = get_connection()
        with connection.cursor() as cursor:
            cursor.execute("UPDATE Users SET Is_Verified = 1 WHERE Email = %s", (email,))
            connection.commit()
            
            # Fetch user info for complete session confirmation object
            cursor.execute("SELECT * FROM Users WHERE Email = %s", (email,))
            user = cursor.fetchone()
        connection.close()

        # Clear active token verification loop data from memory
        del otp_store[email]

        return jsonify({
            "status": "success",
            "message": "Verification successful!",
            "user_id": user["User_id"] if user else None,
            "first_name": user["First_Name"] if user else ""
        }), 200

    except Exception as e:
        print("OTP VERIFY ERROR:", e)
        return jsonify({"status": "error", "message": "Server error processing verification."}), 500

# --- NEW: RESEND OTP ENDPOINT ---
# Enforces the 1-minute timer rule before sending a fresh numerical token
@app.route('/api/resend-otp', methods=['POST'])
def resend_otp():
    try:
        data = request.get_json()
        email = data.get('email', '').strip()

        if not email:
            return jsonify({"message": "Email address is required."}), 400

        success, msg = generate_and_send_otp(email)
        if not success:
            return jsonify({"message": msg}), 429 # 429 Too Many Requests

        return jsonify({
            "status": "success",
            "message": "A fresh OTP code has been dispatched to your email address."
        }), 200

    except Exception as e:
        print("RESEND OTP ERROR:", e)
        return jsonify({"status": "error", "message": "Server processing error"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)