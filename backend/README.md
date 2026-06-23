# PawFeed AI Backend

A minimal Express.js proxy server connecting the PawFeed Capacitor app securely to the Google Gemini API (gemini-2.5-flash) for AI chat assistant, weekly health summary generation, custom recipe generation, and smart feeding recommendations.

## Setup Instructions

### 1. Installation
Navigate to this folder in your terminal and install the dependencies:
```bash
cd backend
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the `backend/` directory (a template has already been created for you):
```env
PORT=5000
GEMINI_API_KEY=your_real_gemini_api_key
```
> [!IMPORTANT]
> Keep your API key private. Never commit the `.env` file to source control.

### 3. Run Locally
Start the server in development mode:
```bash
npm start
```
The backend will run on `http://localhost:5000`.

---

## API Endpoints

### 1. `POST /api/generate-recipe`
* **Body:** `{ pet: { type, breed, age }, constraints: "allergies or preferences" }`
* **Response:** Valid JSON recipe (Name, ingredients, cook time, steps, notes).

### 2. `POST /api/feeding-advice`
* **Body:** `{ pet: { type, breed, age, weight, activityLevel } }`
* **Response:** `{ result: "HTML/text portion recommendations and daily frequency advice" }`

### 3. `POST /api/pawfeed-ai`
* **Body:** `{ systemPrompt: "role instructions", userMessage: "user question" }`
* **Response:** `{ reply: "friendly advice from Gemini" }`

### 4. `POST /api/pawfeed-weekly-summary`
* **Body:** `{ promptText: "weekly summaries data" }`
* **Response:** `{ reply: "summary response with emojis" }`

---

## Deployment Options

For production or testing on real devices, the backend needs to be deployed publicly (since `localhost` only works locally):

### Render (Recommended & Easiest)
1. Push this project to GitHub.
2. Sign up on [Render.com](https://render.com).
3. Click **New** -> **Web Service** and connect your GitHub repository.
4. Set the following settings:
   * **Root Directory:** `backend`
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
5. Under **Environment Variables**, add:
   * `GEMINI_API_KEY`: `your_actual_gemini_api_key`
6. Click **Deploy Web Service**. You will get a public HTTPS URL (e.g. `https://pawfeed-backend.onrender.com`).
7. Update `API_BASE_URL` in `www/app.js` with your deployed Render URL.
