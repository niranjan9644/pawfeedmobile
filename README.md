# PawFeed Application Workspace

Welcome to the PawFeed workspace! This repository contains a Capacitor-wrapped mobile application (`www/` folder) and a secure local Express backend (`backend/`) as well as a local Supabase Edge Functions setup.

---

## 🛠️ Environment & Supabase Configuration

### 1. Configure the API Key Secrets in Supabase Edge Functions
To set the Anthropic Claude API Key for your Supabase Edge Functions, run:
```bash
supabase secrets set ANTHROPIC_API_KEY=your_actual_anthropic_api_key
```

### 2. Configure Supabase Functions URL in Frontend
In `www/app.js` (around line 24), configure the `SUPABASE_FUNCTIONS_URL` variable:
* **Local Development**: `'http://localhost:54321/functions/v1'` (or the address printed by `supabase functions serve`)
* **Production**: `'https://<your-project-id>.supabase.co/functions/v1'`

---

## 🚀 Local Development & Deploying Supabase Edge Functions

### 1. Test Edge Functions Locally
Run the Supabase local emulator to serve functions:
```bash
supabase start
supabase functions serve --no-verify-jwt
```
This serves your Edge Functions locally. Make sure to keep `SUPABASE_FUNCTIONS_URL` set to the local port (usually `54321`).

### 2. Deploy Edge Functions to Supabase Cloud
To deploy your functions to your live Supabase project:
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy pawfeed-ai --no-verify-jwt
supabase functions deploy pawfeed-weekly-summary --no-verify-jwt
```

---

## 📱 Running the Mobile App
Ensure a device or emulator is connected (verify via `adb devices`). Run:
```bash
npx cap sync
npx cap run android
```

---

## 🧬 Future Migration Path: Replacing localStorage with Supabase DB & Auth (Flag Only)

To support multi-device sync, you can migrate from client-side `localStorage` to a hosted Supabase database and authentication. Here is the recommended migration path:

1. **Supabase Auth Integration**:
   - Install `@supabase/supabase-js`.
   - Implement simple login/registration UI in `www/index.html`.
   - Use `supabase.auth.signUp()` and `supabase.auth.signInWithPassword()` to register and authenticate users.
2. **Database Schema Design**:
   - Create tables in the Supabase Postgres database matching the existing `localStorage` schemas:
     - `profiles`: `id` (references `auth.users.id`), `name`, `type`, `breed`, `age`, `weight`, `water_goal`, `food_pref`, `health`, `color`, `avatar`
     - `feeding_logs`: `id`, `user_id`, `pet_id`, `type`, `amount`, `timestamp`, `note`
     - `expenses`: `id`, `user_id`, `title`, `amount`, `category`, `date`
     - `stock`: `id`, `user_id`, `item_name`, `quantity`, `low_stock_threshold`
   - Enable **Row Level Security (RLS)** with policies permitting authenticated users to `select`, `insert`, `update`, and `delete` only their own rows (`auth.uid() = user_id`).
3. **Data Synchronization Handler**:
   - In `www/app.js`, write helper functions to perform initial sync: read all local rows, write them to Supabase tables on first login, and clear/merge localStorage.
   - Replace standard localStorage reading/writing calls (e.g. `savePets()`, `getPets()`, `getLog()`) with async calls to the Supabase client (`supabase.from('profiles').select('*')`).
