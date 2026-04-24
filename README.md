# CR8 Admin Portal Starter

This starter gives you:
- Supabase Auth login
- appointments list view
- month calendar view with FullCalendar
- click appointment -> edit status + notes
- starter database schema for profiles, bookings, leads, activity_log

## Where to put this project

Keep this as a **separate folder inside your CR8 Autos workspace**, not mixed into your public marketing website files.

Recommended structure:

```text
CR8 Autos/
  index.html
  booking.html
  admin.html               # old version, keep for reference only
  cr8-admin-starter/       # new real portal app
```

That lets you keep the website stable while building the real backend separately.

## 1) Create the Supabase database objects

In Supabase Dashboard:

1. Open your project
2. Click **SQL Editor**
3. Click **New query**
4. Paste the entire contents of `supabase_schema.sql`
5. Click **Run**

What this creates:
- `profiles`
- `bookings`
- `leads`
- `activity_log`
- auth trigger for new users
- updated_at triggers
- row level security policies

## 2) Create your first admin account

In Supabase Dashboard:

1. Go to **Authentication**
2. Go to **Users**
3. Click **Add user**
4. Enter your email and password

The SQL trigger will automatically create a matching row in `profiles`.

Then go to **Table Editor -> profiles** and change your role to:

```text
admin
```

You can create salesman accounts the same way. Set their role to:
- `salesman`
- `front_desk`
- `technician`
- `viewer`

## 3) Add your Supabase keys locally

Create a file named `.env.local` in this folder.

Use your project settings:
- **Project URL**
- **Publishable key**

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

## 4) Install and run locally

```bash
npm install
npm run dev
```

Then open the local URL Vite gives you.

## 5) Connect your booking form to the new schema

Your current booking form should insert into `public.bookings` with these fields:
- customer_name
- phone
- email
- vehicle
- service
- message
- appointment_date
- appointment_time

If your current website is already writing to `bookings`, map its column names to match this schema.

## 6) How the calendar works

- The **Appointments** tab is your list view
- The **Calendar** tab is month view
- Clicking an appointment opens a modal
- In the modal you can:
  - update status
  - add notes
  - save changes back to Supabase

## 7) Deployment suggestion

Deploy the admin app separately from the main website.

Good structure later:
- `cr8autos.com` -> public website
- `portal.cr8autos.com` -> admin app

You can deploy the admin app to Vercel, Netlify, or another static host.

## 8) Recommended next build steps

1. Replace old `admin.html` with this React portal
2. Add a real Leads tab UI
3. Add archived/completed filters
4. Add team management screen
5. Add inventory module for sourced cars
6. Add photo uploads with Supabase Storage

## 9) Very important

Do **not** put your Supabase service role key in the frontend.
Only use the publishable / anon key in this app.
