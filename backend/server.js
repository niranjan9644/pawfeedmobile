import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_key_here') {
  console.warn("WARNING: GEMINI_API_KEY environment variable is not defined or is set to placeholder.");
}

// Helper to call Gemini API
async function callGemini(systemPrompt, userMessage, temperature = 0.3) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error("Missing or invalid GEMINI_API_KEY environment variable.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: userMessage }]
      }],
      systemInstruction: systemPrompt ? {
        parts: [{ text: systemPrompt }]
      } : undefined,
      generationConfig: {
        temperature: temperature,
        maxOutputTokens: 1500
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (Status ${response.status}): ${errText}`);
  }

  const data = await response.json();
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
    throw new Error("Malformed response from Gemini API");
  }

  return data.candidates[0].content.parts[0].text;
}

// Middleware to log all incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

// ── 1. GENERATE RECIPE ENDPOINT ──────────────────────────────────────────────
app.post('/api/generate-recipe', async (req, res) => {
  try {
    const { pet, constraints } = req.body;
    console.log(`Generating recipe for: ${pet?.name || 'Unknown pet'} (${pet?.type || 'Dog'})`);

    const petInfo = pet 
      ? `Pet Species: ${pet.type || 'Dog'}\nBreed: ${pet.breed || 'Unknown'}\nAge: ${pet.age || '1'} years old`
      : "Pet details: Dog, 1 year old";

    const systemPrompt = `You are PawFeed Culinary AI, a veterinary nutritionist specializing in creating healthy, balanced homemade pet meals.
Your task is to generate a single pet recipe in strict JSON format based on the pet's profile and dietary constraints.

The JSON output must match this exact shape:
{
  "name": "Recipe Title",
  "ageGroup": "Puppy/Kitten/Adult/Senior",
  "mealType": "Breakfast/Lunch/Dinner/Snack",
  "cookTime": "X mins",
  "difficulty": "Easy/Medium/Hard",
  "ingredients": ["ingredient 1 with quantity", "ingredient 2 with quantity", ...],
  "steps": ["step 1 description", "step 2 description", ...],
  "notes": "Safety warnings or feeding notes (e.g. consult vet before transition, safe portion sizes)."
}

Guidelines:
- Ensure all ingredients are 100% safe for the specified pet species (e.g., NO chocolate, onions, grapes, raisins, xylitol, or garlic).
- Provide balanced proportions of protein, fats, and safe carbohydrates.
- The output MUST be valid, parsable JSON only. Do not wrap it in markdown code blocks like \`\`\`json ... \`\`\` or include any conversational text before or after the JSON.`;

    const userPrompt = `Here is the pet's details:\n${petInfo}\n\nDietary constraints / restrictions:\n"${constraints || 'None'}"`;

    const replyText = await callGemini(systemPrompt, userPrompt, 0.3);
    
    // Parse the JSON on server to ensure it is valid before returning
    try {
      const recipeJson = JSON.parse(replyText.trim());
      res.json(recipeJson);
    } catch (e) {
      console.warn("Gemini response was not clean JSON, trying regex cleaning:", replyText);
      const cleanJsonStr = replyText.replace(/```json|```/g, '').trim();
      const recipeJson = JSON.parse(cleanJsonStr);
      res.json(recipeJson);
    }
  } catch (error) {
    console.error("Error in /api/generate-recipe:", error);
    res.status(500).json({ error: error.message || "Failed to generate recipe JSON" });
  }
});

// ── 2. FEEDING ADVICE ENDPOINT ───────────────────────────────────────────────
app.post('/api/feeding-advice', async (req, res) => {
  try {
    const { pet } = req.body;
    if (!pet) {
      return res.status(400).json({ error: "Pet details are required." });
    }
    console.log(`Providing feeding advice for: ${pet?.name || 'Unknown pet'} (${pet?.type || 'Dog'})`);

    const petInfo = `Pet Species: ${pet.type || 'Unknown'}\nBreed: ${pet.breed || 'Unknown'}\nAge: ${pet.age || 'Unknown'} years old\nWeight: ${pet.weight || 'Unknown'} kg\nActivity Level: ${pet.activityLevel || 'Active'}`;

    const systemPrompt = `You are PawFeed Nutritionist, an expert in pet dietetics.
Provide customized daily portion sizes, recommended feeding frequencies, and nutritional recommendations for the pet.

Your response must include:
1. DAILY CALORIE / PORTION SUGGESTION: Safe daily food intake range in grams or cups based on weight and activity level.
2. FEEDING FREQUENCY: Recommended meals per day (e.g. 2 times daily for an adult dog, 3-4 for a puppy).
3. KEY NUTRITIONAL FOCUS: Crucial nutrients or ingredients (e.g. high protein, taurine for cats, joint support for senior dogs).
4. VET DISCLAIMER: Include this exact text: "DISCLAIMER: Feeding portions are estimates based on standard formula. Consult your veterinarian to tailor these recommendations to your pet's specific brand of food and health needs."

Guidelines:
- Be concise and actionable.
- Keep response length under 180 words.
- Format using basic HTML tags (e.g., <b>, <ul>, <li>, <p>) for direct, clean rendering in the mobile app. Do not wrap response in markdown code blocks.`;

    const userPrompt = `Here is the pet's details:\n${petInfo}`;

    const reply = await callGemini(systemPrompt, userPrompt, 0.2);
    res.json({ result: reply });
  } catch (error) {
    console.error("Error in /api/feeding-advice:", error);
    res.status(500).json({ error: error.message || "Failed to fetch feeding advice" });
  }
});

// ── 3. PAWFEED AI CHAT ENDPOINT ──────────────────────────────────────────────
app.post('/api/pawfeed-ai', async (req, res) => {
  try {
    const { systemPrompt, userMessage } = req.body;
    console.log(`AI Chat Message received: "${userMessage?.substring(0, 40)}..."`);
    if (!userMessage) {
      return res.status(400).json({ error: "userMessage is required." });
    }

    const reply = await callGemini(systemPrompt, userMessage, 0.3);
    res.json({ reply });
  } catch (error) {
    console.error("Error in /api/pawfeed-ai:", error);
    res.status(500).json({ error: error.message || "Failed to contact Gemini API" });
  }
});

// ── 4. PAWFEED WEEKLY SUMMARY ENDPOINT ───────────────────────────────────────
app.post('/api/pawfeed-weekly-summary', async (req, res) => {
  try {
    const { promptText } = req.body;
    console.log(`Generating weekly summary...`);
    if (!promptText) {
      return res.status(400).json({ error: "promptText is required." });
    }

    const reply = await callGemini(
      'You are PawFeed AI generating a friendly weekly health summary.',
      promptText,
      0.3
    );
    res.json({ reply });
  } catch (error) {
    console.error("Error in /api/pawfeed-weekly-summary:", error);
    res.status(500).json({ error: error.message || "Failed to contact Gemini API" });
  }
});

// ── 5. SMART VISION SCAN ENDPOINT ───────────────────────────────────────────
app.post('/api/vision-scan', async (req, res) => {
  try {
    const { image, mode, description, petType } = req.body;
    console.log(`[${new Date().toLocaleTimeString()}] Smart Vision Scan requested: mode=${mode}, petType=${petType || 'Dog'}`);

    if (!image) {
      console.warn("Error: Image data is empty.");
      return res.status(400).json({ error: "Image data (Base64) is required." });
    }

    console.log(`Image data length: ${image.length} characters`);
    console.log(`Image starts with: ${image.substring(0, 80)}...`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_key_here') {
      throw new Error("Missing or invalid GEMINI_API_KEY environment variable.");
    }

    // Parse MIME type and base64 payload
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      console.warn("Error: Invalid base64 image format structure.");
      return res.status(400).json({ error: "Invalid base64 image format." });
    }
    const mimeType = matches[1];
    const base64Data = matches[2];
    console.log(`Parsed mimeType: ${mimeType}, base64Data length: ${base64Data.length} chars`);

    let prompt = "";
    if (mode === 'food') {
      prompt = `Analyze this image of food and description: "${description || 'None'}". Determine if this food is 100% safe for a pet ${petType || 'Dog'}. Identify any toxic ingredients or foreign objects.
Return a JSON object with:
{
  "risk": "SAFE" | "WARN" | "DANGER",
  "result": "Detailed analysis of what the food contains and whether it is safe.",
  "advice": "Practical feeding advice or veterinary steps to take if unsafe.",
  "title": "Food Safety Scan"
}`;
    } else if (mode === 'breed') {
      prompt = `Analyze this image of a pet. Identify its species (Dog, Cat, Rabbit, Bird, or Fish) and estimate its breed.
Return a JSON object with:
{
  "risk": "SAFE" | "WARN",
  "result": "Estimated species and breed details.",
  "advice": "Breed-specific care or nutrition notes.",
  "title": "Breed Detection"
}`;
    } else if (mode === 'weight') {
      prompt = `Analyze this image of a pet. Estimate its body condition score (BCS) and estimate its body weight in kg (give a reasonable range).
Return a JSON object with:
{
  "risk": "SAFE" | "WARN",
  "result": "Estimated BCS score (1-9 scale) and weight range.",
  "advice": "Weight management recommendations.",
  "title": "Body Weight Estimation"
}`;
    } else if (mode === 'fur') {
      prompt = `Analyze this image of a pet's skin or fur. Look for redness, rashes, wounds, bald patches, ticks, or irritation.
Return a JSON object with:
{
  "risk": "SAFE" | "WARN" | "DANGER",
  "result": "Observation of the skin/fur condition.",
  "advice": "Actionable care advice or veterinary consulting recommendation.",
  "title": "Skin / Fur Check"
}`;
    } else {
      prompt = `Analyze this pet image. Return a JSON object with:
{
  "risk": "SAFE",
  "result": "General observation.",
  "advice": "General care tips.",
  "title": "Smart Scan"
}`;
    }

    prompt += "\n\nThe output MUST be valid, parsable JSON only. Do not wrap it in markdown code blocks like \`\`\`json ... \`\`\` or include any conversational text before or after the JSON.";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    console.log("Sending multimodal request to Google Gemini API...");
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1000
        }
      })
    });

    console.log(`Gemini API response received in ${Date.now() - startTime}ms. Status: ${response.status}`);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (Status ${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      throw new Error("Malformed response from Gemini API");
    }

    const replyText = data.candidates[0].content.parts[0].text;
    try {
      const cleanJsonStr = replyText.replace(/\`\`\`json|\`\`\`/g, '').trim();
      const resultJson = JSON.parse(cleanJsonStr);
      res.json(resultJson);
    } catch (e) {
      console.warn("Gemini response was not clean JSON, returning text:", replyText);
      res.json({
        risk: "WARN",
        result: replyText,
        advice: "Consult a professional for accurate details.",
        title: "Smart Scan Result"
      });
    }
  } catch (error) {
    console.error("Error in /api/vision-scan:", error);
    res.status(500).json({ error: error.message || "Failed to analyze image with Gemini" });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`PawFeed Gemini Backend running on port ${PORT}`);
});
