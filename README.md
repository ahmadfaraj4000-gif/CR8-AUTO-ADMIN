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

## Invoice history and payments

Install `supabase-invoices.sql` in the **CR8 project's** SQL Editor to enable shared invoice storage. It adds `invoices` and immutable `invoice_versions`, with access restricted to active admin/front-desk profiles. It does not modify customer, booking, or lead records. Before installation, verify that any existing `invoices` table is compatible with this migration; do not replace an unrelated table.

Invoices now autosave individually in the browser and sync to Supabase. The status line distinguishes shared saves from browser-only saves. Network errors and concurrent edits are shown instead of claiming a successful cloud save. Concurrent edits retain the local copy; the user can open the shared version while preserving their edits as a separate LOCAL-COPY. That copy is for comparison and must not be treated as an additional customer debt.

Selecting an existing customer and vehicle recalls the most recently edited partially paid invoice first, otherwise the most recently edited document. Invoice History lists all saved documents and supports a partially-paid filter, customer/vehicle filter and search. “New invoice for this customer and vehicle” starts a separate repair without carrying payments forward. Original invoice and due dates are retained. New invoice numbers include a short unique suffix so separate browsers do not share the same counter-only number.

Each payment records its amount, date, type, optional reference and note. Paid amounts and balances are calculated from non-voided payments. Voiding requires a reason and retains the original entry. The print preview includes payment history. Export/Import Backup provides a portable JSON copy; importing a conflicting version preserves it separately rather than replacing existing work.

### Recovering older invoices

The former app only saved a single `cr8InvoiceDraft` in localStorage and never saved invoice charges or payments to Supabase. “Save Customer” saved contact/vehicle information only. Starting a new document replaced the previous draft. Payment types and payment dates were never recorded.

The upgrade preserves the raw surviving draft in `cr8InvoiceDraft:original-backup`, imports it once into per-invoice history, and converts any positive Amount Paid into one legacy payment marked **Unknown (legacy)** with no invented payment date. The old raw draft remains available. Malformed storage is left untouched and reported. The upgrade cannot reconstruct drafts already overwritten by the old app. Check the exact browser/profile/device and origin used to create them, plus previously printed/downloaded invoices or backups. Do not infer charges or payments from customer records.

Run `npm test` and `npm run build` for app validation. The GitHub deployment also runs `tests/invoiceDatabase.sql` against a disposable PostgreSQL instance to check staff permissions, immutable history, atomic payment snapshots, optimistic concurrency and repeatable installation. Never run that test file in the production database; only `supabase-invoices.sql` is a production migration.
