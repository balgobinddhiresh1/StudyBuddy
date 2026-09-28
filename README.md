# Octo Buddy



## Run the project

1. Open a terminal in this folder.
2. Install the Python packages:

```bash
pip install -r requirements.txt
```

3. Start the backend:

```bash
python app.py
```

4. Open `project.html` in a browser.

## Main flow

Register -> OTP verification -> Login -> role-based dashboard.

- Student: `Student/student.html`
- Octo Buddy: `Dashboard/Dashboard.html`
- Admin: `Admin/admin.html`

Student booking requests are sent to Flask. The backend looks for an approved Octo Buddy who teaches the selected module and is available on the selected weekday. A Jitsi room is created for a confirmed session.

Buddy applications are saved in the database. Admin approval changes the user's role from `student` to `buddy`.

## Database

Set `DATABASE_URL` to your Supabase/PostgreSQL connection string when using the existing cloud database.

If `DATABASE_URL` is not set, the project uses a local SQLite database named `octobuddy_local.db`, which is useful for testing.



## Important

Jitsi video calling requires internet access because the application uses the Jitsi external API.
