// app.js — All JavaScript from pawfeed00.html. Capacitor bridge appended below.
    // ==================== DATA ====================
    const BREEDS = {
      Dog: ['Labrador', 'Pug', 'Beagle', 'German Shepherd', 'Golden Retriever', 'Shih Tzu', 'Doberman', 'Rottweiler', 'Husky', 'Dachshund'],
      Cat: ['Persian', 'Siamese', 'Bengal', 'Maine Coon', 'Ragdoll', 'British Shorthair', 'Sphynx', 'Abyssinian'],
      Rabbit: ['Holland Lop', 'Lionhead', 'Dutch Rabbit', 'Mini Rex', 'Flemish Giant', 'Angora'],
      Bird: ['Parrot', 'Budgie', 'Cockatiel', 'Lovebird', 'Canary', 'Macaw'],
      Fish: ['Goldfish', 'Betta', 'Guppy', 'Angelfish', 'Molly', 'Koi', 'Oscar', 'Tetra']
    };
    const UNSAFE = {
      Dog: ['Chocolate', 'Grapes / Raisins', 'Onion & Garlic', 'Alcohol', 'Caffeine', 'Macadamia Nuts', 'Xylitol (sweetener)', 'Avocado'],
      Cat: ['Chocolate', 'Onion & Garlic', 'Milk in excess', 'Raw fish', 'Caffeine', 'Alcohol', 'Dog food (long-term)', 'Raw eggs'],
      Rabbit: ['Chocolate', 'Avocado', 'Bread / Pasta', 'Meat', 'Iceberg lettuce', 'Sugary treats', 'Potatoes'],
      Bird: ['Chocolate', 'Avocado', 'Caffeine', 'Alcohol', 'Salty food', 'Onion & Garlic', 'Apple seeds'],
      Fish: ['Bread', 'Human snacks', 'Oily food', 'Overfeeding pellets', 'Citrus fruits']
    };
    const PET_ICONS = { Dog: '🐶', Cat: '🐱', Rabbit: '🐰', Bird: '🦜', Fish: '🐟' };

    let reminderTimers = [];
    let selectedPlannerDateStr = new Date().toISOString().slice(0, 10);

    let TOXIC_FOODS = [];
    let NUTRITION_GUIDELINES = {};
    let SYMPTOM_TRIAGE = [];
    let VACCINE_SCHEDULE = {};
    let breedCache = {
      Dog: JSON.parse(localStorage.getItem('cachedDogBreeds')) || [],
      Cat: JSON.parse(localStorage.getItem('cachedCatBreeds')) || []
    };

    async function loadReferenceDatasets() {
      try {
        const [r1, r2, r3, r4] = await Promise.all([
          fetch('data/toxic-foods.json').then(r => r.json()),
          fetch('data/nutrition-guidelines.json').then(r => r.json()),
          fetch('data/symptom-triage.json').then(r => r.json()),
          fetch('data/vaccine-schedule.json').then(r => r.json())
        ]);
        TOXIC_FOODS = r1;
        NUTRITION_GUIDELINES = r2;
        SYMPTOM_TRIAGE = r3;
        VACCINE_SCHEDULE = r4;
        console.log('Reference datasets loaded successfully');
        fetchBreedData('Dog');
        fetchBreedData('Cat');
      } catch (err) {
        console.error('Failed to load reference datasets:', err);
      }
    }

    async function fetchBreedData(species) {
      if (species !== 'Dog' && species !== 'Cat') return [];
      if (breedCache[species] && breedCache[species].length > 0) {
        return breedCache[species];
      }
      try {
        const url = species === 'Dog' 
          ? 'https://api.thedogapi.com/v1/breeds' 
          : 'https://api.thecatapi.com/v1/breeds';
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        const data = await res.json();
        const simplified = data.map(b => ({
          id: b.id,
          name: b.name,
          weight: b.weight ? b.weight.metric : '',
          life_span: b.life_span || ''
        }));
        breedCache[species] = simplified;
        localStorage.setItem(`cached${species}Breeds`, JSON.stringify(simplified));
        return simplified;
      } catch (err) {
        console.error(`Failed to fetch breeds for ${species}:`, err);
        return [];
      }
    }

    function calculateFeedingAmount(pet) {
      if (!pet || !pet.weight) return null;
      const weight = parseFloat(pet.weight);
      const species = (pet.type || '').toLowerCase();
      const activity = (pet.activityLevel || 'moderate').toLowerCase();

      let actKey = 'moderate';
      if (activity.includes('sedentary')) actKey = 'sedentary';
      else if (activity.includes('active') || activity.includes('high')) actKey = 'active';

      const rer = 70 * Math.pow(weight, 0.75);

      let factor = 1.0;
      if (species === 'dog') {
        factor = NUTRITION_GUIDELINES.formulas?.factors?.dog?.[actKey] || 1.6;
      } else if (species === 'cat') {
        factor = NUTRITION_GUIDELINES.formulas?.factors?.cat?.[actKey] || 1.2;
      } else {
        factor = 1.2;
      }

      const dailyCalories = Math.round(rer * factor);
      const dryGrams = Math.round(dailyCalories / 3.5);
      const wetGrams = Math.round(dailyCalories / 1.0);

      let waterNeeds = Math.round(weight * 60);
      if (species === 'cat') waterNeeds = Math.round(weight * 50);

      return {
        rer: Math.round(rer),
        calories: dailyCalories,
        dryGrams,
        wetGrams,
        waterNeeds,
        disclaimer: "Disclaimer: This is a veterinary-formula baseline recommendation and does not substitute for customized professional veterinary care."
      };
    }

    function getGroundingContext(message, species) {
      if (!message) return '';
      const text = message.toLowerCase();
      const spec = (species || '').toLowerCase();
      let context = '';

      if (TOXIC_FOODS && TOXIC_FOODS.length > 0) {
        const matches = TOXIC_FOODS.filter(item => {
          const nameMatch = text.includes(item.name.toLowerCase());
          const speciesMatch = !item.species_affected || 
                               item.species_affected.toLowerCase().includes(spec) ||
                               spec === '';
          return nameMatch && speciesMatch;
        });

        if (matches.length > 0) {
          context += `\n[Reference Data - Toxic Foods/Plants/Substances]:\n`;
          matches.forEach(item => {
            context += `- ${item.name} is toxic to ${item.species_affected}. Severity: ${item.severity}. Symptoms: ${item.symptoms}. Notes: ${item.notes}\n`;
          });
        }
      }

      if (SYMPTOM_TRIAGE && SYMPTOM_TRIAGE.length > 0) {
        const matches = SYMPTOM_TRIAGE.filter(item => {
          return text.includes(item.symptom.toLowerCase());
        });

        if (matches.length > 0) {
          context += `\n[Reference Data - Symptom Triage Guidelines]:\n`;
          matches.forEach(item => {
            context += `- Symptom: ${item.symptom}. Urgency: ${item.urgency}. Trigger Criteria: ${item.trigger_criteria}. Home Care Tip: ${item.home_care_tip}\n`;
          });
        }
      }

      return context;
    }

    const API_BASE_URL = 'https://pawfeedmobile.onrender.com';
    let currentUser = null;
    let pawCache = {
      pets: [],
      logs: [],
      stock: [],
      expenses: [],
      communityPosts: [],
      cart: [],
      scanHistory: [],
      orders: [],
      recipes: { favorites: [], saved: [], recent: [], reviews: [], weekly: [], shopping: [], reactions: [] },
      moodLog: [],
      meds: [],
      vetLog: [],
      sleepLog: [],
      gallery: {},
      weightHistory: {},
      deletedRecipes: [],
      customRecipes: [],
      editedRecipes: {},
      recipeFavorites: [],
      weeklyPlan: {
        Mon: { breakfast: null, lunch: null, dinner: null },
        Tue: { breakfast: null, lunch: null, dinner: null },
        Wed: { breakfast: null, lunch: null, dinner: null },
        Thu: { breakfast: null, lunch: null, dinner: null },
        Fri: { breakfast: null, lunch: null, dinner: null },
        Sat: { breakfast: null, lunch: null, dinner: null },
        Sun: { breakfast: null, lunch: null, dinner: null }
      },
      dailyChecklist: {},
      tasks: []
    };

    async function fetchAllDataFromSupabase() {
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      
      showToast("Syncing with cloud... ☁️");
      
      try {
        const [
          petsRes, logsRes, stockRes, expensesRes, postsRes, cartRes, scansRes, tasksRes, ordersRes,
          moodsRes, medsRes, vetsRes, sleepsRes, galleryRes, weightsRes, recipesRes, profileRes,
          reactionsRes, commentsRes, followsRes
        ] = await Promise.all([
          window.supabaseClient.from('pets').select('*').eq('user_id', userId),
          window.supabaseClient.from('feeding_logs').select('*').eq('user_id', userId),
          window.supabaseClient.from('stock_items').select('*').eq('user_id', userId),
          window.supabaseClient.from('expenses').select('*').eq('user_id', userId),
          window.supabaseClient.from('community_posts').select('*'),
          window.supabaseClient.from('cart_items').select('*').eq('user_id', userId),
          window.supabaseClient.from('scan_history').select('*').eq('user_id', userId),
          window.supabaseClient.from('care_tasks').select('*').eq('user_id', userId),
          window.supabaseClient.from('orders').select('*').eq('user_id', userId),
          window.supabaseClient.from('mood_logs').select('*').eq('user_id', userId),
          window.supabaseClient.from('meds').select('*').eq('user_id', userId),
          window.supabaseClient.from('vet_logs').select('*').eq('user_id', userId),
          window.supabaseClient.from('sleep_logs').select('*').eq('user_id', userId),
          window.supabaseClient.from('pet_gallery').select('*').eq('user_id', userId),
          window.supabaseClient.from('weight_history').select('*').eq('user_id', userId),
          window.supabaseClient.from('custom_recipes').select('*').eq('user_id', userId),
          window.supabaseClient.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
          window.supabaseClient.from('reactions').select('*').then(res => res, err => ({data:[]})),
          window.supabaseClient.from('comments').select('*').then(res => res, err => ({data:[]})),
          window.supabaseClient.from('follows').select('*').then(res => res, err => ({data:[]}))
        ]);

        if (reactionsRes && reactionsRes.data) pawCache.reactions = reactionsRes.data;
        if (commentsRes && commentsRes.data) pawCache.comments = commentsRes.data;
        if (followsRes && followsRes.data) pawCache.follows = followsRes.data;

        if (petsRes.data) {
          pawCache.pets = petsRes.data.map(p => {
            const petObj = {
              id: p.id,
              name: p.name,
              type: p.species,
              breed: p.breed,
              age: parseFloat(p.age),
              weight: parseFloat(p.weight),
              foodPref: p.food_pref,
              health: p.health,
              waterGoal: parseFloat(p.water_goal),
              activityLevel: p.activity_level,
              breedTraits: p.breed_traits || null,
              isPublic: p.is_public || false
            };
            if (!petObj.breedTraits && (p.species === 'Dog' || p.species === 'Cat') && breedCache[p.species]) {
              const found = breedCache[p.species].find(b => b.name.toLowerCase() === p.breed.toLowerCase());
              if (found) {
                petObj.breedTraits = {
                  weight: found.weight,
                  life_span: found.life_span
                };
              }
            }
            return petObj;
          });
        }

        if (logsRes.data) {
          pawCache.logs = logsRes.data.map(l => {
            const petIdx = pawCache.pets.findIndex(p => p.id === l.pet_id);
            return {
              id: l.id,
              petIdx: petIdx >= 0 ? petIdx : 0,
              type: l.type,
              timestamp: l.timestamp,
              amount: l.amount,
              note: l.note
            };
          });
        }

        if (stockRes.data) {
          pawCache.stockItems = stockRes.data.map(s => ({
            id: s.id,
            name: s.name,
            type: s.type,
            quantity: parseFloat(s.quantity),
            unit: s.unit,
            threshold: parseFloat(s.threshold),
            decrementAmount: parseFloat(s.decrement_amount)
          }));
        }

        if (expensesRes.data) {
          pawCache.expenses = expensesRes.data.map(e => ({
            id: e.id,
            date: e.date,
            category: e.category,
            amount: parseFloat(e.amount),
            desc: e.notes
          }));
        }

        if (postsRes.data) {
          pawCache.communityPosts = postsRes.data.map(p => ({
            id: p.id,
            user_id: p.user_id,
            author: p.user_id === userId ? (currentUser.user_metadata?.display_name || 'Me') : 'Pet Parent',
            petName: 'Pet',
            petIcon: '🐾',
            caption: p.content,
            image: p.image_url,
            date: p.created_at,
            type: p.content && p.content.toLowerCase().includes('recipe') ? 'recipe' : 'photo',
            synced: true
          }));
        }

        if (cartRes.data) {
          pawCache.cart = cartRes.data.map(c => ({
            id: c.id,
            product_id: c.product_id,
            quantity: c.quantity
          }));
        }

        if (scansRes.data) {
          pawCache.scanHistory = scansRes.data.map(s => s.result);
        }

        if (ordersRes.data) {
          pawCache.orders = ordersRes.data.map(o => ({
            id: o.id,
            date: o.date,
            items: o.items,
            total: parseFloat(o.total)
          }));
        }

        if (moodsRes.data) {
          pawCache.moodLog = moodsRes.data.map(m => {
            const petIdx = pawCache.pets.findIndex(p => p.id === m.pet_id);
            return {
              petIdx: petIdx >= 0 ? petIdx : 0,
              date: m.date,
              label: m.label
            };
          });
        }

        if (medsRes.data) {
          pawCache.meds = medsRes.data.map(m => ({
            id: m.id,
            name: m.name,
            dosage: m.dosage,
            frequency: m.frequency,
            nextDue: m.next_due
          }));
        }

        if (vetsRes.data) {
          pawCache.vetLog = vetsRes.data.map(v => {
            const petIdx = pawCache.pets.findIndex(p => p.id === v.pet_id);
            return {
              id: v.id,
              petIdx: petIdx >= 0 ? petIdx : 0,
              date: v.date,
              clinic: v.clinic,
              notes: v.notes
            };
          });
        }

        if (sleepsRes.data) {
          pawCache.sleepLog = sleepsRes.data.map(s => {
            const petIdx = pawCache.pets.findIndex(p => p.id === s.pet_id);
            return {
              petIdx: petIdx >= 0 ? petIdx : 0,
              date: s.date,
              hours: parseFloat(s.hours),
              quality: s.quality
            };
          });
        }

        pawCache.gallery = {};
        if (galleryRes.data) {
          galleryRes.data.forEach(g => {
            const petIdx = pawCache.pets.findIndex(p => p.id === g.pet_id);
            const idxKey = petIdx >= 0 ? petIdx : 0;
            if (!pawCache.gallery[idxKey]) pawCache.gallery[idxKey] = [];
            pawCache.gallery[idxKey].push({ image: g.image_url, time: g.created_at });
          });
        }

        pawCache.weightHistory = {};
        if (weightsRes.data) {
          weightsRes.data.forEach(w => {
            const petIdx = pawCache.pets.findIndex(p => p.id === w.pet_id);
            const idxKey = petIdx >= 0 ? petIdx : 0;
            if (!pawCache.weightHistory[idxKey]) pawCache.weightHistory[idxKey] = [];
            pawCache.weightHistory[idxKey].push({ date: w.date, weight: parseFloat(w.weight) });
          });
        }

        if (recipesRes.data) {
          pawCache.customRecipes = recipesRes.data.map(r => ({
            id: r.id,
            name: r.name,
            ingredients: r.ingredients,
            steps: r.steps,
            notes: r.notes
          }));
        }

        if (profileRes.data) {
          const p = profileRes.data;
          pawCache.recipes = p.recipe_store || pawCache.recipes || {};
          pawCache.weeklyPlan = p.weekly_plan || pawCache.weeklyPlan;
          pawCache.dailyChecklist = p.daily_checklist || pawCache.dailyChecklist;
          pawCache.settings = p.settings || {};
          if (typeof pawCache.settings.active_pet_idx === 'number') {
            pawCache.activePetIdx = pawCache.settings.active_pet_idx;
            localStorage.setItem('pawActivePet', String(pawCache.settings.active_pet_idx));
          }
          pawCache.recipeFavorites = pawCache.recipes.recipeFavoritesList || [];
          pawCache.deletedRecipes = pawCache.recipes.deletedRecipesList || [];
          pawCache.editedRecipes = pawCache.recipes.editedRecipesMap || {};
          if (p.avatar_url) {
            localStorage.setItem('pawUserAvatar', p.avatar_url);
          }
        }

        if (tasksRes.data) {
          pawCache.tasks = tasksRes.data.map(t => t.payload);
        }

      } catch (err) {
        console.error("Error fetching all data from Supabase:", err);
        showToast("Sync error. Using local cached data.");
      }
    }

    async function callAI(endpoint, payload) {
      showToast("AI is thinking... 🐾");
      
      const loadingScreen = document.getElementById('loadingScreen');
      if (loadingScreen) {
        loadingScreen.style.display = 'flex';
        loadingScreen.style.opacity = '1';
        const bar = document.getElementById('loadingBar');
        if (bar) bar.style.width = '60%';
      }

      // Set up fallbacks for development (localhost & local network IP) and production (Render)
      const urlsToTry = [
        `http://localhost:5000${endpoint}`,
        `http://192.168.1.10:5000${endpoint}`,
        `https://pawfeedmobile.onrender.com${endpoint}`
      ];

      let lastError = null;
      for (const url of urlsToTry) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 seconds timeout per attempt

        try {
          console.log(`Attempting AI connection: ${url}`);
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error ${response.status}`);
          }

          return await response.json();
        } catch (error) {
          clearTimeout(timeoutId);
          console.warn(`Connection failed to ${url}:`, error);
          lastError = error;
        }
      }

      if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
          loadingScreen.style.display = 'none';
        }, 300);
      }

      if (lastError && lastError.name === 'AbortError') {
        showToast("Request timed out. Please try again. ⏱️");
      } else {
        showToast("Failed to connect to AI. Please check your connection. ❌");
      }
      throw lastError || new Error("All connection attempts failed");
    }
    let calendarMonthDate = new Date();
    let confirmCallback = null;
    let selectedModalColor = '#FFD5A8';
    let selectedLogMood = '';
    let galleryTargetPet = -1;
    let selectedCommunityImage = '';
    let selectedVisionImage = '';
    const MARKET_PRODUCTS = [
      { id: 'dog1', pet: 'Dog', icon: '🐶', name: 'Premium Dog Kibble', desc: 'Protein-rich daily food for adult dogs.', price: 499 },
      { id: 'dog2', pet: 'Dog', icon: '🦴', name: 'Dental Chew Pack', desc: 'Helps with chewing and dental care.', price: 199 },
      { id: 'cat1', pet: 'Cat', icon: '🐱', name: 'Tuna Wet Cat Food', desc: 'Hydration-friendly wet food for cats.', price: 349 },
      { id: 'cat2', pet: 'Cat', icon: '🥣', name: 'Kitten Dry Food', desc: 'Balanced nutrition for growing kittens.', price: 429 },
      { id: 'rabbit1', pet: 'Rabbit', icon: '🥕', name: 'Fresh Hay Mix', desc: 'Fiber-focused hay blend for rabbits.', price: 299 },
      { id: 'bird1', pet: 'Bird', icon: '🦜', name: 'Seed & Pellet Mix', desc: 'Daily balanced feed for birds.', price: 249 },
      { id: 'fish1', pet: 'Fish', icon: '🐟', name: 'Floating Fish Pellets', desc: 'Clean-water formula fish pellets.', price: 179 },
      { id: 'all1', pet: 'All', icon: '💧', name: 'Travel Water Bottle', desc: 'Portable water bottle for pets.', price: 229 }
    ];

    // ==================== AI FEATURES HANDLERS ====================
    async function generateAIRecipe() {
      const pets = getPets();
      const activeIdx = getActivePetIdx();
      const pet = pets[activeIdx] || null;
      if (!pet) {
        showToast("Please add a pet profile first.");
        return;
      }

      const constraints = document.getElementById('aiRecipeConstraints').value.trim();
      
      const payload = {
        pet: {
          type: pet.type,
          breed: pet.breed,
          age: pet.age,
          weight: pet.weight
        },
        constraints: constraints
      };

      try {
        const data = await callAI('/api/generate-recipe', payload);
        
        const newId = `custom_ai_${Date.now()}`;
        const time = parseInt(data.cookTime) || 20;
        
        const isNonVeg = (data.ingredients || []).some(ing => {
          const ingLower = ing.toLowerCase();
          const nonVegKeywords = ['chicken', 'beef', 'turkey', 'fish', 'meat', 'egg', 'salmon', 'pork', 'shrimp', 'lamb', 'duck', 'tuna', 'sardine', 'liver', 'krill', 'cod', 'prawn', 'crab', 'bacon', 'venison', 'bison', 'anchovy', 'mackerel', 'herring', 'shellfish', 'squid', 'octopus'];
          return nonVegKeywords.some(keyword => ingLower.includes(keyword));
        });
        const type = isNonVeg ? 'Non-Veg' : 'Veg';
        
        let cat = 'Meal';
        const mType = (data.mealType || '').toLowerCase();
        if (mType.includes('snack') || mType.includes('treat')) {
          cat = 'Snack';
        } else if (mType.includes('quick') || mType.includes('emergency')) {
          cat = 'Quick';
        } else if (mType.includes('allergy')) {
          cat = 'Allergy';
        } else if (mType.includes('budget')) {
          cat = 'Budget';
        } else if (mType.includes('season')) {
          cat = 'Seasonal';
        }

        const protein = parseInt(data.nutrition?.protein) || 12;
        const fiber = parseInt(data.nutrition?.fiber) || 4;
        const vit = Math.round(protein * 2 + fiber * 5) || 60;

        const normalized = {
          id: newId,
          title: data.name || 'AI Generated Recipe',
          pet: [pet.type],
          type: type,
          cat: cat,
          time: time,
          cookTime: data.cookTime || (time + ' mins'),
          diff: data.difficulty || 'Easy',
          cal: parseInt(data.nutrition?.calories) || 300,
          protein: protein,
          fiber: fiber,
          vit: Math.min(95, Math.max(10, vit)),
          vet: true,
          budget: true,
          season: 'All season',
          ingredients: data.ingredients || [],
          steps: data.steps || [],
          benefits: data.benefits || ['Tailored nutrition', 'Fresh ingredients'],
          frequency: data.frequency || '1-2 times/week',
          vetTip: data.notes || '',
          nutritionObj: data.nutrition || {},
          suitableAgeGroup: data.ageGroup || 'All',
          healthConditionCompatibility: data.healthCondition || 'Healthy'
        };

        const custom = getCustomRecipes();
        custom.push(normalized);
        saveCustomRecipes(custom);

        normalizeAndMergeDB();
        renderHomemadeTab();
        
        showToast("Custom AI Recipe Generated! 🍲");
        openRecipeDetailModal(newId);
        
        document.getElementById('aiRecipeConstraints').value = '';
      } catch (error) {
        console.error(error);
        showToast("Failed to generate custom recipe.");
      }
    }

    async function getAIFeedingAdvice() {
      const pets = getPets();
      const activeIdx = getActivePetIdx();
      const pet = pets[activeIdx];
      if (!pet) {
        showToast("Please add or select a pet first.");
        return;
      }
      
      const payload = {
        pet: {
          type: pet.type,
          breed: pet.breed,
          age: pet.age,
          weight: pet.weight,
          activityLevel: pet.activityLevel || 'Moderate (Normal)'
        }
      };

      try {
        const data = await callAI('/api/feeding-advice', payload);
        const resultBox = document.getElementById('aiFeedingAdviceResult');
        if (resultBox) {
          resultBox.innerHTML = data.result;
          resultBox.classList.remove('hidden');
        }
      } catch (error) {
        console.error(error);
        showToast("Failed to fetch feeding advice.");
      }
    }


    // ==================== STORAGE ====================
    function getUser() {
      if (!currentUser) return null;
      return {
        name: currentUser.user_metadata?.display_name || currentUser.email?.split('@')[0] || 'Pet Parent',
        email: currentUser.email,
        id: currentUser.id
      };
    }
    function getPets() {
      return pawCache.pets || [];
    }

    async function savePets(pets) {
      pawCache.pets = pets;
      localStorage.setItem('pawPets', JSON.stringify(pets));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        const { data: dbPets, error: fetchErr } = await window.supabaseClient.from('pets').select('id').eq('user_id', userId);
        if (!fetchErr && dbPets) {
          const activeIds = pets.map(p => p.id).filter(id => id);
          const deletedIds = dbPets.filter(p => !activeIds.includes(p.id)).map(p => p.id);
          if (deletedIds.length > 0) {
            await window.supabaseClient.from('pets').delete().in('id', deletedIds);
          }
        }
        for (let i = 0; i < pets.length; i++) {
          const p = pets[i];
          const payload = {
            user_id: userId,
            name: p.name,
            species: p.type,
            breed: p.breed || '',
            age: parseFloat(p.age || 0),
            weight: parseFloat(p.weight || 0),
            food_pref: p.foodPref || '',
            health: p.health || '',
            water_goal: parseFloat(p.waterGoal || 500),
            activity_level: p.activityLevel || 'Moderate',
            breed_traits: p.breedTraits || null,
            is_public: p.isPublic || false
          };
          if (p.id) payload.id = p.id;
          const { data, error } = await window.supabaseClient.from('pets').upsert(payload).select('id').single();
          if (!error && data) p.id = data.id;
        }
      } catch (err) {
        console.error("Error syncing pets to Supabase:", err);
      }
    }

    function getActivePetIdx() {
      if (typeof pawCache.activePetIdx === 'number') return pawCache.activePetIdx;
      const stored = localStorage.getItem('pawActivePet');
      pawCache.activePetIdx = stored ? parseInt(stored) : 0;
      return pawCache.activePetIdx;
    }

    async function setActivePetIdx(i) {
      pawCache.activePetIdx = i;
      localStorage.setItem('pawActivePet', String(i));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        const settings = pawCache.settings || {};
        settings.active_pet_idx = i;
        await window.supabaseClient.from('user_profiles').upsert({
          id: userId,
          settings: settings
        });
      } catch (err) {
        console.error("Error syncing active pet index:", err);
      }
    }
    function setActivePet(i) {
      setActivePetIdx(i);
      refreshAllUI();
    }

    function isNoPet() {
      return (pawCache.pets || []).length === 0 || pawCache.settings?.noPet === true;
    }

    function getLog() {
      return pawCache.logs || [];
    }

    async function saveLog(log) {
      pawCache.logs = log;
      localStorage.setItem('pawLog', JSON.stringify(log));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        for (let i = 0; i < log.length; i++) {
          const entry = log[i];
          if (entry.id) continue;
          const petId = pawCache.pets[entry.petIdx]?.id || null;
          const { data, error } = await window.supabaseClient.from('feeding_logs').insert({
            user_id: userId,
            pet_id: petId,
            type: entry.type,
            amount: parseFloat(entry.amount || 0),
            note: entry.note || '',
            timestamp: entry.timestamp || new Date().toISOString()
          }).select('id').single();
          if (!error && data) entry.id = data.id;
        }
      } catch (err) {
        console.error("Error syncing log to Supabase:", err);
      }
    }

    function getSettings() {
      return pawCache.settings || {};
    }

    async function saveSettings(s) {
      pawCache.settings = s;
      localStorage.setItem('pawSettings', JSON.stringify(s));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        await window.supabaseClient.from('user_profiles').upsert({
          id: userId,
          settings: s
        });
      } catch (err) {
        console.error("Error syncing settings:", err);
      }
    }

    // ==================== LOADING SCREEN ====================
    window.addEventListener('DOMContentLoaded', function () {
      const bar = document.getElementById('loadingBar');
      let w = 0;
      const iv = setInterval(() => {
        w += Math.random() * 18 + 6;
        if (w >= 100) { w = 100; clearInterval(iv); }
        bar.style.width = w + '%';
      }, 100);
      setTimeout(() => {
        document.getElementById('loadingScreen').style.opacity = '0';
        document.getElementById('loadingScreen').style.transition = 'opacity 0.4s';
        setTimeout(() => {
          document.getElementById('loadingScreen').style.display = 'none';
          initApp();
        }, 400);
      }, 1800);
    });

    async function initApp() {
      await loadReferenceDatasets();
      // Apply dark mode
      const s = getSettings();
      if (s.darkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('darkModeToggle').classList.add('on');
        document.getElementById('darkToggleBtn').textContent = '☀️';
      }
      if (s.reminders) document.getElementById('reminderToggle').classList.add('on');

      if (window.supabaseClient) {
        try {
          const { data: { session }, error } = await window.supabaseClient.auth.getSession();
          if (session) {
            currentUser = session.user;
            loadApp();
            if (s.reminders) startAllReminders();
            return;
          }
        } catch (e) {
          console.error("Failed to restore Supabase session:", e);
        }
      }
      showScreen('loginScreen');
    }

    // ==================== DARK MODE ====================
    function toggleDarkMode() {
      const html = document.documentElement;
      const isDark = html.getAttribute('data-theme') === 'dark';
      const newDark = !isDark;
      html.setAttribute('data-theme', newDark ? 'dark' : 'light');

      const toggle = document.getElementById('darkModeToggle');
      if (toggle) {
        if (newDark) toggle.classList.add('on');
        else toggle.classList.remove('on');
      }

      const btn = document.getElementById('darkToggleBtn');
      if (btn) {
        btn.textContent = newDark ? '☀️' : '🌙';
      }

      const s = getSettings();
      s.darkMode = newDark;
      saveSettings(s);
    }

    function toggleReminderSetting() {
      const s = getSettings();
      s.reminders = !s.reminders;
      saveSettings(s);
      const toggle = document.getElementById('reminderToggle');
      if (s.reminders) { toggle.classList.add('on'); startAllReminders(); showToast('Reminders enabled 🔔'); }
      else { toggle.classList.remove('on'); reminderTimers.forEach(clearInterval); reminderTimers = []; showToast('Reminders disabled'); }
    }

    function toggleStreakSetting() {
      const s = getSettings();
      s.showStreaks = (s.showStreaks === false) ? true : false;
      saveSettings(s);
      const toggle = document.getElementById('streakToggle');
      toggle.classList.toggle('on', s.showStreaks !== false);
      refreshAllUI();
    }

    // ==================== CONFIRM ====================
    function showConfirm(title, msg, onOk) {
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMsg').textContent = msg;
      confirmCallback = onOk;
      document.getElementById('confirmDialog').classList.remove('hidden');
    }
    function closeConfirm(ok) {
      document.getElementById('confirmDialog').classList.add('hidden');
      if (ok && confirmCallback) confirmCallback();
      confirmCallback = null;
    }

    // ==================== TOAST ====================
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.innerText = msg;
      t.style.display = 'block';
      setTimeout(() => t.style.display = 'none', 2500);
    }

    // ==================== SCREENS ====================
    function showScreen(id) {
      document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
      document.getElementById('mainApp').classList.add('hidden');
      document.getElementById(id).classList.remove('hidden');
    }

    async function registerUser() {
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value.trim();
      if (!name || !email || !password) { showToast('Please fill all fields'); return; }
      
      showToast("Creating account... 🐾");
      if (!window.supabaseClient) {
        showToast("Supabase client is not initialized.");
        return;
      }
      
      try {
        const { data, error } = await window.supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name }
          }
        });
        if (error) {
          showToast(`Error: ${error.message}`);
          return;
        }
        
        if (data.user) {
          const { error: profileError } = await window.supabaseClient.from('user_profiles').upsert({
            id: data.user.id,
            settings: {},
            daily_checklist: {}
          });
          if (profileError) {
            console.error("Profile creation error:", profileError.message);
          }
        }
        
        showToast('Account created! Please check your email or log in.');
        showScreen('loginScreen');
      } catch (err) {
        showToast(`Sign up failed: ${err.message}`);
      }
    }

    async function loginUser() {
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value.trim();
      if (!email || !password) { showToast('Please fill all fields'); return; }
      
      showToast("Logging in... 🐾");
      if (!window.supabaseClient) {
        showToast("Supabase client is not initialized.");
        return;
      }
      
      try {
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
          email,
          password
        });
        if (error) {
          showToast(`Error: ${error.message}`);
          return;
        }
        
        currentUser = data.user;
        loadApp();
      } catch (err) {
        showToast(`Login failed: ${err.message}`);
      }
    }

    async function logoutUser() {
      showConfirm('Logout?', 'You will be returned to the login screen.', async () => {
        if (window.supabaseClient) {
          await window.supabaseClient.auth.signOut();
        }
        currentUser = null;
        location.reload();
      });
    }

    // ==================== FORGOT PASSWORD ====================
    function openForgotPassword() {
      resetForgotSteps();
      document.getElementById('forgotEmail').value = document.getElementById('loginEmail').value || '';
      document.getElementById('forgotModal').classList.remove('hidden');
    }
    function closeForgotPassword() {
      document.getElementById('forgotModal').classList.add('hidden');
      resetForgotSteps();
    }
    function resetForgotSteps() {
      document.getElementById('forgotStep1').style.display = '';
      document.getElementById('forgotStep2').style.display = 'none';
      document.getElementById('forgotStep3').style.display = 'none';
    }
    function submitForgotPassword() {
      const email = document.getElementById('forgotEmail').value.trim();
      if (!email) { showToast('Please enter your email'); return; }
      const user = getUser();
      if (user && user.email.toLowerCase() === email.toLowerCase()) {
        const hint = user.password.charAt(0) + '•'.repeat(Math.max(user.password.length - 2, 2)) + user.password.charAt(user.password.length - 1);
        document.getElementById('forgotPasswordHint').innerHTML = `Your password hint: <span style="color:var(--orange);letter-spacing:2px">${hint}</span><br><small style="color:var(--muted);font-weight:400;font-size:12px;letter-spacing:0">Check your registered email for the full password.</small>`;
        document.getElementById('forgotStep1').style.display = 'none';
        document.getElementById('forgotStep2').style.display = '';
      } else {
        document.getElementById('forgotStep1').style.display = 'none';
        document.getElementById('forgotStep3').style.display = '';
      }
    }

    // ==================== LOAD APP ====================
    function loadApp() {
      document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
      document.getElementById('mainApp').classList.remove('hidden');
      loadUser();
      refreshAllUI();
      openTab('home');
      initCalendar();
    }

    function loadUser() {
      const user = getUser() || {};
      document.getElementById('topUser').innerText = user.name ? 'Hi, ' + user.name : 'Welcome';
      document.getElementById('welcomeText').innerText = user.name ? 'Hello, ' + user.name + ' 👋' : 'Hello!';
      document.getElementById('profileName').value = user.name || '';
      document.getElementById('profileEmail').value = user.email || '';

      // Load user avatar
      const avatar = localStorage.getItem('pawUserAvatar');
      const preview = document.getElementById('userAvatarPreview');
      const topCircle = document.getElementById('topProfileCircle');
      if (avatar) {
        preview.innerHTML = `<img src="${avatar}" alt="avatar">`;
        topCircle.innerHTML = `<img src="${avatar}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      }
    }

    async function saveProfile() {
      const user = getUser() || {};
      const newName = document.getElementById('profileName').value.trim();
      user.name = newName;
      localStorage.setItem('pawUser', JSON.stringify(user));
      loadUser();
      showToast('Profile updated ✅');
      if (!window.supabaseClient || !currentUser) return;
      try {
        await window.supabaseClient.auth.updateUser({
          data: { display_name: newName }
        });
      } catch (err) {
        console.error("Error updating user auth metadata:", err);
      }
    }

    // ==================== USER AVATAR ====================
    function handleUserAvatar(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async function (e) {
        const data = e.target.result;
        localStorage.setItem('pawUserAvatar', data);
        document.getElementById('userAvatarPreview').innerHTML = `<img src="${data}" alt="avatar">`;
        document.getElementById('topProfileCircle').innerHTML = `<img src="${data}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        showToast('Profile photo updated! ✅');
        if (!window.supabaseClient || !currentUser) return;
        const userId = currentUser.id;
        try {
          await window.supabaseClient.from('user_profiles').upsert({
            id: userId,
            avatar_url: data
          });
        } catch (err) {
          console.error("Error updating user avatar in user_profiles:", err);
        }
      };
      reader.readAsDataURL(file);
    }

    // ==================== NO PET TOGGLE ====================
    async function toggleNoPet() {
      const checked = document.getElementById('noPetCheck').checked;
      if (!pawCache.settings) pawCache.settings = {};
      pawCache.settings.noPet = checked;
      localStorage.setItem('pawNoPet', checked ? 'true' : 'false');
      showToast(checked ? 'Browsing general tips mode' : 'Pet mode enabled');
      refreshAllUI();
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        await window.supabaseClient.from('user_profiles').upsert({
          id: userId,
          settings: pawCache.settings
        });
      } catch (err) {
        console.error("Error syncing noPet setting:", err);
      }
    }

    // ==================== PET MODAL ====================
    function openPetModal(idx) {
      const pets = getPets();
      document.getElementById('editPetIndex').value = idx;
      document.getElementById('modalTitle').textContent = idx >= 0 ? '✏️ Edit Pet' : '🐾 Add New Pet';
      selectedModalColor = '#FFD5A8';

      if (idx >= 0 && pets[idx]) {
        const p = pets[idx];
        document.getElementById('mpetName').value = p.name;
        document.getElementById('mpetType').value = p.type;
        loadModalBreeds().then(() => {
          document.getElementById('mpetBreed').value = p.breed || '';
        });
        document.getElementById('mpetAge').value = p.age;
        document.getElementById('mpetWeight').value = p.weight;
        document.getElementById('mpetWaterGoal').value = p.waterGoal || 500;
        document.getElementById('mfoodPref').value = p.foodPref;
        document.getElementById('mpetActivityLevel').value = p.activityLevel || 'Moderate (Normal)';
        document.getElementById('mhealthCondition').value = p.health;
        document.getElementById('mpetIsPublic').checked = p.isPublic || false;
        selectedModalColor = p.color || '#FFD5A8';
 
        // Load avatar
        const prev = document.getElementById('modalAvatarPreview');
        if (p.avatar) {
          prev.innerHTML = `<img src="${p.avatar}" alt="avatar">`;
        } else {
          prev.innerHTML = `<span id="modalAvatarEmoji">${PET_ICONS[p.type] || '🐾'}</span>`;
        }
      } else {
        document.getElementById('mpetName').value = '';
        document.getElementById('mpetType').value = '';
        document.getElementById('mpetBreed').innerHTML = '<option value="">Select breed</option>';
        document.getElementById('mpetAge').value = '';
        document.getElementById('mpetWeight').value = '';
        document.getElementById('mpetWaterGoal').value = 500;
        document.getElementById('mfoodPref').value = 'Dry Food';
        document.getElementById('mpetActivityLevel').value = 'Moderate (Normal)';
        document.getElementById('mhealthCondition').value = '';
        document.getElementById('mpetIsPublic').checked = false;
        document.getElementById('modalAvatarPreview').innerHTML = '<span id="modalAvatarEmoji">🐾</span>';
      }

      // Update color chips
      document.querySelectorAll('.color-chip').forEach(c => {
        c.classList.toggle('selected', c.style.background === selectedModalColor);
      });

      document.getElementById('petModal').classList.remove('hidden');
    }

    function closePetModal() { document.getElementById('petModal').classList.add('hidden'); }

    function updateModalEmoji() {
      const type = document.getElementById('mpetType').value;
      const el = document.getElementById('modalAvatarEmoji');
      if (el) el.textContent = PET_ICONS[type] || '🐾';
    }

    function handleModalAvatar(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        const prev = document.getElementById('modalAvatarPreview');
        prev.innerHTML = `<img src="${e.target.result}" alt="pet avatar">`;
        prev._avatarData = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function selectColor(color, el) {
      selectedModalColor = color;
      document.querySelectorAll('.color-chip').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
    }

    async function loadModalBreeds() {
      const type = document.getElementById('mpetType').value;
      const sel = document.getElementById('mpetBreed');
      if (sel) sel.innerHTML = '<option value="">Select breed</option>';

      if (type === 'Dog' || type === 'Cat') {
        const breeds = await fetchBreedData(type);
        if (sel && breeds.length > 0) {
          breeds.forEach(b => {
            const o = document.createElement('option');
            o.value = b.name;
            o.textContent = b.name;
            sel.appendChild(o);
          });
        }
      } else {
        if (sel && BREEDS[type]) {
          BREEDS[type].forEach(b => {
            const o = document.createElement('option');
            o.value = b;
            o.textContent = b;
            sel.appendChild(o);
          });
        }
      }
    }

    function savePetModal() {
      const idx = parseInt(document.getElementById('editPetIndex').value);
      const prev = document.getElementById('modalAvatarPreview');
      const avatarData = prev._avatarData || (prev.querySelector('img') ? prev.querySelector('img').src : null);
      const existingPets = getPets();
      const existingAvatar = idx >= 0 ? existingPets[idx]?.avatar : null;

      const pet = {
        name: document.getElementById('mpetName').value.trim(),
        type: document.getElementById('mpetType').value,
        breed: document.getElementById('mpetBreed').value,
        age: document.getElementById('mpetAge').value,
        weight: document.getElementById('mpetWeight').value,
        waterGoal: parseFloat(document.getElementById('mpetWaterGoal').value) || 500,
        foodPref: document.getElementById('mfoodPref').value,
        activityLevel: document.getElementById('mpetActivityLevel').value,
        health: document.getElementById('mhealthCondition').value.trim(),
        color: selectedModalColor,
        isPublic: document.getElementById('mpetIsPublic').checked,
        avatar: avatarData || existingAvatar || null,
        gallery: idx >= 0 ? (existingPets[idx]?.gallery || []) : [],
        weightHistory: idx >= 0 ? (existingPets[idx]?.weightHistory || []) : [],
        waterToday: idx >= 0 ? (existingPets[idx]?.waterToday || 0) : 0,
        waterDate: idx >= 0 ? (existingPets[idx]?.waterDate || '') : '',
        moodToday: idx >= 0 ? (existingPets[idx]?.moodToday || '') : '',
        moodDate: idx >= 0 ? (existingPets[idx]?.moodDate || '') : ''
      };

      if (!pet.name || !pet.type || !pet.breed || !pet.age || !pet.weight) {
        showToast('Please complete all required fields'); return;
      }

      // Resolve breed traits
      if ((pet.type === 'Dog' || pet.type === 'Cat') && breedCache[pet.type]) {
        const found = breedCache[pet.type].find(b => b.name.toLowerCase() === pet.breed.toLowerCase());
        if (found) {
          pet.breedTraits = {
            weight: found.weight,
            life_span: found.life_span
          };
        }
      }

      const pets = getPets();
      if (idx >= 0) {
        pets[idx] = pet;
        showToast(pet.name + '\'s profile updated ✅');
      } else {
        pets.push(pet);
        setActivePetIdx(pets.length - 1);
        showToast(pet.name + ' added 🐾');
      }
      savePets(pets);
      if (!pawCache.settings) pawCache.settings = {};
      if (pawCache.settings.noPet !== false) {
        pawCache.settings.noPet = false;
        localStorage.setItem('pawNoPet', 'false');
        if (window.supabaseClient && currentUser) {
          const userId = currentUser.id;
          window.supabaseClient.from('user_profiles').upsert({
            id: userId,
            settings: pawCache.settings
          }).catch(err => console.error("Error syncing settings on add pet:", err));
        }
      }
      closePetModal();
      refreshAllUI();
      openTab('home');
    }

    function deletePet(idx) {
      const pets = getPets();
      const name = pets[idx]?.name || 'this pet';
      showConfirm('Remove ' + name + '?', 'All data for ' + name + ' will be removed.', () => {
        pets.splice(idx, 1);
        savePets(pets);
        const activeIdx = getActivePetIdx();
        if (activeIdx >= pets.length) setActivePetIdx(Math.max(0, pets.length - 1));
        refreshAllUI();
        showToast(name + ' removed');
      });
    }

    function setMainPet(idx) {
      setActivePetIdx(idx);
      const resultBox = document.getElementById('aiFeedingAdviceResult');
      if (resultBox) {
        resultBox.innerHTML = '';
        resultBox.classList.add('hidden');
      }
      refreshAllUI();
      openTab('home');
      showToast(getPets()[idx]?.name + ' is now active 🐾');
    }

    // ==================== LOG MODAL ====================
    function openLogModal(type) {
      const now = new Date();
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      document.getElementById('logTime').value = local;
      document.getElementById('logNote').value = '';
      document.getElementById('logWeight').value = '';
      document.getElementById('logType').value = type || 'fed';
      selectedLogMood = '';
      document.querySelectorAll('#logMoodRow .mood-btn').forEach(b => b.classList.remove('selected'));
      updateLogTypeFields();
      document.getElementById('logModal').classList.remove('hidden');
    }
    function closeLogModal() { document.getElementById('logModal').classList.add('hidden'); }

    document.addEventListener('DOMContentLoaded', () => {
      const logTypeSelect = document.getElementById('logType');
      if (logTypeSelect) logTypeSelect.addEventListener('change', updateLogTypeFields);
    });

    function updateLogTypeFields() {
      const type = document.getElementById('logType').value;
      document.getElementById('weightLogField').classList.toggle('hidden', type !== 'weight');
      document.getElementById('moodLogField').classList.toggle('hidden', type !== 'mood');
    }

    function selectLogMood(mood, el) {
      selectedLogMood = mood;
      document.querySelectorAll('#logMoodRow .mood-btn').forEach(b => b.classList.remove('selected'));
      el.classList.add('selected');
    }

    function saveLogEntry() {
      const type = document.getElementById('logType').value;
      const note = document.getElementById('logNote').value.trim();
      const timeVal = document.getElementById('logTime').value;
      const pets = getPets();
      const activeIdx = getActivePetIdx();
      const pet = pets[activeIdx];

      if (!pet && !isNoPet()) { showToast('No active pet selected'); return; }

      const entry = {
        id: Date.now(),
        type,
        note: note || (type === 'fed' ? 'Meal fed' : type === 'water' ? 'Water refilled' : type === 'missed' ? 'Missed meal' : type === 'mood' ? (selectedLogMood || 'Mood noted') : 'Weight logged'),
        timestamp: timeVal || new Date().toISOString(),
        petName: pet ? pet.name : 'General',
        petIdx: pet ? activeIdx : -1
      };

      if (type === 'weight') {
        const w = parseFloat(document.getElementById('logWeight').value);
        if (!w) { showToast('Please enter a weight'); return; }
        entry.weight = w;
        // Update pet weight history
        if (pet) {
          pets[activeIdx].weightHistory = pets[activeIdx].weightHistory || [];
          pets[activeIdx].weightHistory.push({ date: entry.timestamp, weight: w });
          if (pets[activeIdx].weightHistory.length > 20) pets[activeIdx].weightHistory.shift();
          savePets(pets);
        }
      }

      if (type === 'mood') {
        entry.mood = selectedLogMood;
        if (pet) {
          pets[activeIdx].moodToday = selectedLogMood;
          pets[activeIdx].moodDate = todayStr();
          savePets(pets);
        }
      }

      const log = getLog();
      log.unshift(entry);
      if (log.length > 200) log.splice(200);
      saveLog(log);

      // Auto stock deduction for feeding logs
      if (type === 'fed') {
        if (typeof deductStockAutomatically === 'function') {
          deductStockAutomatically(entry.note || 'food', 'food');
        }
      }

      closeLogModal();
      showToast('Entry saved ✅');
      refreshAllUI();
    }

    // ==================== QUICK WEIGHT ====================
    function saveQuickWeight() {
      const w = parseFloat(document.getElementById('quickWeight').value);
      const note = document.getElementById('quickWeightNote').value.trim();
      if (!w) { showToast('Please enter a weight'); return; }
      const pets = getPets();
      const idx = getActivePetIdx();
      if (!pets[idx]) { showToast('No active pet'); return; }
      pets[idx].weightHistory = pets[idx].weightHistory || [];
      pets[idx].weightHistory.push({ date: new Date().toISOString(), weight: w, note });
      if (pets[idx].weightHistory.length > 20) pets[idx].weightHistory.shift();
      savePets(pets);

      const log = getLog();
      log.unshift({ id: Date.now(), type: 'weight', note: note || 'Weight logged', timestamp: new Date().toISOString(), petName: pets[idx].name, petIdx: idx, weight: w });
      saveLog(log);

      document.getElementById('weightModal').classList.add('hidden');
      showToast('Weight logged: ' + w + ' kg ⚖️');
      refreshAllUI();
    }

    // ==================== WATER TRACKING ====================
    function toggleWater(petIdx, dropIdx) {
      const pets = getPets();
      const pet = pets[petIdx];
      if (!pet) return;

      const today = todayStr();
      if (pet.waterDate !== today) { pet.waterDrops = []; pet.waterDate = today; }
      pet.waterDrops = pet.waterDrops || [];

      const isActive = pet.waterDrops.includes(dropIdx);
      if (isActive) {
        pet.waterDrops = pet.waterDrops.filter(d => d !== dropIdx);
      } else {
        pet.waterDrops.push(dropIdx);
        // Log water event
        const log = getLog();
        log.unshift({ id: Date.now(), type: 'water', note: 'Water portion logged', timestamp: new Date().toISOString(), petName: pet.name, petIdx });
        if (log.length > 200) log.splice(200);
        saveLog(log);
      }
      savePets(pets);
      refreshAllUI();
      openTab('tracker');
    }

    // ==================== GALLERY ====================
    function openGallery(petIdx) {
      galleryTargetPet = petIdx;
      const pets = getPets();
      const pet = pets[petIdx];
      if (!pet) return;
      document.getElementById('galleryModalTitle').textContent = '📷 ' + pet.name + '\'s Gallery';
      renderGalleryGrid(pet.gallery || []);
      document.getElementById('galleryModal').classList.remove('hidden');
    }

    function renderGalleryGrid(images) {
      const grid = document.getElementById('galleryGrid');
      grid.innerHTML = images.map((img, i) => `
    <div class="gallery-item" onclick="openLightbox('${img.url}')">
      <img src="${img.url}" alt="pet photo" />
      ${img.caption ? `<div class="gallery-caption">${img.caption}</div>` : ''}
    </div>`).join('');
      // Add button cell is shown via the Add Photo button below
    }

    function handleModalGalleryUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        const pets = getPets();
        const pet = pets[galleryTargetPet];
        if (!pet) return;
        pet.gallery = pet.gallery || [];
        const caption = prompt('Add a caption (optional):') || '';
        pet.gallery.push({ url: e.target.result, caption, date: new Date().toISOString() });
        savePets(pets);
        renderGalleryGrid(pet.gallery);
        showToast('Photo added to gallery 📷');
        refreshAllUI();
      };
      reader.readAsDataURL(file);
      event.target.value = '';
    }

    // ==================== LIGHTBOX ====================
    function openLightbox(src) {
      document.getElementById('lightboxImg').src = src;
      document.getElementById('lightbox').classList.remove('hidden');
    }
    function closeLightbox() { document.getElementById('lightbox').classList.add('hidden'); }

    // ==================== STREAK LOGIC ====================
    function todayStr() { return new Date().toISOString().slice(0, 10); }

    function calculateStreak() {
      const log = getLog();
      const pets = getPets();
      const activeIdx = getActivePetIdx();
      const pet = pets[activeIdx];
      if (!pet) return 0;

      const petLogs = log.filter(e => e.petIdx === activeIdx && e.type === 'fed');
      const days = [...new Set(petLogs.map(e => e.timestamp.slice(0, 10)))].sort().reverse();

      let streak = 0;
      const today = todayStr();
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      if (!days.length) return 0;
      if (days[0] !== today && days[0] !== yesterday) return 0;

      let current = days[0] === today ? new Date() : new Date(Date.now() - 86400000);
      for (const day of days) {
        const d = new Date(day);
        const diff = Math.round((current - d) / 86400000);
        if (diff <= 1) { streak++; current = d; }
        else break;
      }
      return streak;
    }

    function getMissedMeals() {
      const log = getLog();
      const pets = getPets();
      const activeIdx = getActivePetIdx();
      const pet = pets[activeIdx];
      if (!pet) return [];

      const today = todayStr();
      const todayLogs = log.filter(e => e.petIdx === activeIdx && e.timestamp.slice(0, 10) === today);
      const fedCount = todayLogs.filter(e => e.type === 'fed').length;
      const expectedMeals = pet.type === 'Fish' ? 2 : 3;
      const hour = new Date().getHours();

      const missed = [];
      if (hour >= 9 && !todayLogs.some(e => e.type === 'fed' && new Date(e.timestamp).getHours() < 9)) missed.push({ label: 'Morning Meal', time: '7:00 AM', icon: '🌅' });
      if (hour >= 15 && fedCount < 2) missed.push({ label: 'Afternoon Meal', time: '1:00 PM', icon: '☀️' });
      if (hour >= 21 && fedCount < 3 && expectedMeals >= 3) missed.push({ label: 'Dinner', time: '7:30 PM', icon: '🌙' });
      return missed;
    }

    function getTodayStats() {
      const log = getLog();
      const pets = getPets();
      const activeIdx = getActivePetIdx();
      const pet = pets[activeIdx];
      if (!pet) return { feedings: 0, waterPct: 0, mood: '—' };

      const today = todayStr();
      const todayLogs = log.filter(e => e.petIdx === activeIdx && e.timestamp.slice(0, 10) === today);
      const feedings = todayLogs.filter(e => e.type === 'fed').length;

      // Water
      const drops = (pet.waterDate === today ? (pet.waterDrops || []) : []).length;
      const totalDrops = Math.ceil((pet.waterGoal || 500) / 100);
      const waterPct = Math.round((drops / totalDrops) * 100);

      // Mood
      const moodEntry = pet.moodDate === today ? pet.moodToday : '—';
      const moodIcon = moodEntry && moodEntry !== '—' ? moodEntry.split(' ')[0] : '—';

      return { feedings, waterPct, mood: moodIcon };
    }

    // ==================== CARE PLANNER LOGIC ====================
    function getCareTasks() {
      let tasks = pawCache.tasks || [];
      if (tasks.length === 0) {
        const pets = getPets();
        pets.forEach((pet, petIdx) => {
          initDefaultTasksForPet(petIdx);
        });
        tasks = pawCache.tasks || [];
      }
      return tasks;
    }

    async function saveCareTasks(tasks) {
      pawCache.tasks = tasks;
      localStorage.setItem('pawCareTasks', JSON.stringify(tasks));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        const { data: dbTasks } = await window.supabaseClient.from('care_tasks').select('id').eq('user_id', userId);
        if (dbTasks) {
          const activeIds = tasks.map(t => t.id).filter(id => typeof id === 'number' || (typeof id === 'string' && !id.startsWith('task_')));
          const deletedIds = dbTasks.filter(t => !activeIds.includes(t.id)).map(t => t.id);
          if (deletedIds.length > 0) {
            await window.supabaseClient.from('care_tasks').delete().in('id', deletedIds);
          }
        }
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          const payload = {
            user_id: userId,
            text: task.title || '',
            completed: task.completed || false,
            date: task.dateTime ? task.dateTime.slice(0, 10) : new Date().toISOString().slice(0, 10),
            payload: task
          };
          if (task.id && typeof task.id === 'number') {
            payload.id = task.id;
          }
          const { data, error } = await window.supabaseClient.from('care_tasks').upsert(payload).select('id').single();
          if (!error && data) task.id = data.id;
        }
      } catch (err) {
        console.error("Error syncing care tasks to Supabase:", err);
      }
    }

    function initDefaultTasksForPet(petIdx) {
      let tasks = pawCache.tasks || [];

      const today = new Date().toISOString().slice(0, 10);
      const defaultTasks = [
        { title: 'Feed 🥣', time: '08:00', repeat: 'daily' },
        { title: 'Water 💧', time: '09:00', repeat: 'daily' },
        { title: 'Walk 🦮', time: '07:00', repeat: 'daily' },
        { title: 'Play 🧸', time: '17:00', repeat: 'daily' },
        { title: 'Medicine 💊', time: '09:00', repeat: 'daily' },
        { title: 'Grooming 🧼', time: '10:00', repeat: 'daily' }
      ];

      defaultTasks.forEach((t, i) => {
        const id = 'task_' + Date.now() + '_' + petIdx + '_' + i;
        tasks.push({
          id: id,
          petIdx: petIdx,
          title: t.title,
          dateTime: today + 'T' + t.time,
          repeat: t.repeat,
          reminder: true,
          completedDates: [],
          completed: false
        });
      });
      saveCareTasks(tasks);
    }

    function taskAppliesToDate(task, dateStr) {
      const taskDateStr = task.dateTime.slice(0, 10);
      if (task.repeat === 'none') {
        return taskDateStr === dateStr;
      }
      if (taskDateStr > dateStr) {
        return false;
      }

      const taskDate = new Date(taskDateStr + 'T00:00:00');
      const checkDate = new Date(dateStr + 'T00:00:00');

      if (task.repeat === 'daily') {
        return true;
      }
      if (task.repeat === 'weekly') {
        return taskDate.getDay() === checkDate.getDay();
      }
      if (task.repeat === 'monthly') {
        return taskDate.getDate() === checkDate.getDate();
      }
      return false;
    }

    function isDefaultTask(title) {
      const defaults = ['Feed 🥣', 'Water 💧', 'Walk 🦮', 'Play 🧸', 'Medicine 💊', 'Grooming 🧼'];
      return defaults.includes(title);
    }

    function formatTimeFromDateTime(dtStr) {
      const parts = dtStr.split('T');
      if (parts.length < 2) return '';
      const timeParts = parts[1].split(':');
      let h = parseInt(timeParts[0]);
      const m = timeParts[1];
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12;
      return `${h}:${m} ${ampm}`;
    }

    function onTaskPresetChange() {
      const preset = document.getElementById('addTaskPreset').value;
      const titleInput = document.getElementById('addTaskTitle');
      if (preset) {
        titleInput.value = preset;
      } else {
        titleInput.value = '';
      }
    }

    function selectPlannerDate(dateStr) {
      selectedPlannerDateStr = dateStr;
      renderCarePlannerTab();
    }

    function navigatePlannerMonth(dir) {
      calendarMonthDate.setMonth(calendarMonthDate.getMonth() + dir);
      renderCarePlannerTab();
    }

    function addPlannerTask() {
      const titleInput = document.getElementById('addTaskTitle');
      const dtInput = document.getElementById('addTaskDateTime');
      const repeatInput = document.getElementById('addTaskRepeat');
      const reminderToggle = document.getElementById('addTaskReminderToggle');

      const title = titleInput.value.trim();
      const dateTime = dtInput.value;
      const repeat = repeatInput.value;
      const reminder = reminderToggle.classList.contains('on');

      if (!title) {
        showToast('Please enter a task title');
        return;
      }
      if (!dateTime) {
        showToast('Please choose a date and time');
        return;
      }

      const activeIdx = getActivePetIdx();
      const tasks = getCareTasks();

      const newTask = {
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        petIdx: activeIdx,
        title: title,
        dateTime: dateTime,
        repeat: repeat,
        reminder: reminder,
        completedDates: [],
        completed: false
      };

      tasks.push(newTask);
      saveCareTasks(tasks);
      showToast(`Task "${title}" added successfully! 📋`);

      titleInput.value = '';
      dtInput.value = '';
      document.getElementById('addTaskPreset').value = '';

      refreshAllUI();
    }

    function deletePlannerTask(id) {
      showConfirm('Delete Task?', 'Are you sure you want to remove this task from the care plan?', () => {
        let tasks = getCareTasks();
        tasks = tasks.filter(t => t.id !== id);
        saveCareTasks(tasks);
        showToast('Task removed from plan');
        refreshAllUI();
      });
    }

    function completePlannerTask(taskId, dateStr) {
      const tasks = getCareTasks();
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      if (!task.completedDates) task.completedDates = [];
      if (!task.completedDates.includes(dateStr)) {
        task.completedDates.push(dateStr);

        // Log task in history
        const log = getLog();
        const activeIdx = getActivePetIdx();
        const pets = getPets();
        const pet = pets[activeIdx] || { name: 'your pet' };

        let type = 'care';
        if (task.title.toLowerCase().includes('feed')) {
          type = 'fed';
        } else if (task.title.toLowerCase().includes('water')) {
          type = 'water';
          if (!pet.waterDrops) pet.waterDrops = [];
          if (pet.waterDate !== dateStr) {
            pet.waterDate = dateStr;
            pet.waterDrops = [];
          }
          const totalDrops = Math.ceil((pet.waterGoal || 500) / 100);
          if (pet.waterDrops.length < totalDrops) {
            pet.waterDrops.push(pet.waterDrops.length);
            savePets(pets);
          }
        }

        log.unshift({
          id: 'log_' + Date.now(),
          petIdx: activeIdx,
          type: type,
          note: `Completed task: ${task.title}`,
          timestamp: new Date().toISOString()
        });
        saveLog(log);

        // Auto stock deduction for completed planner tasks
        if (typeof deductStockAutomatically === 'function') {
          const isMed = task.title.toLowerCase().includes('med') || task.title.toLowerCase().includes('pill') || task.title.toLowerCase().includes('syrup') || task.title.toLowerCase().includes('dose');
          deductStockAutomatically(task.title, isMed ? 'medicine' : 'food');
        }
      }

      if (task.repeat === 'none') {
        task.completed = true;
      }

      saveCareTasks(tasks);
      showToast(`Task "${task.title}" completed! ✅`);

      // Streak trigger
      const activeIdx = getActivePetIdx();
      const petTasks = tasks.filter(t => t.petIdx === activeIdx);
      const todaysTasks = petTasks.filter(t => taskAppliesToDate(t, dateStr));
      const completedTodaysTasks = todaysTasks.filter(t => t.completedDates && t.completedDates.includes(dateStr));

      if (todaysTasks.length > 0 && completedTodaysTasks.length === todaysTasks.length) {
        const log = getLog();
        const todayFed = log.some(e => e.petIdx === activeIdx && e.type === 'fed' && e.timestamp.slice(0, 10) === dateStr);

        if (!todayFed) {
          log.unshift({
            id: 'log_' + Date.now() + '_streak',
            petIdx: activeIdx,
            type: 'fed',
            note: 'All Care Planner tasks completed! 🏆',
            timestamp: new Date().toISOString()
          });
          saveLog(log);
        }

        setTimeout(() => {
          showConfirm('🏆 Streak Increased!', `Wonderful! You completed all scheduled tasks for today! Your daily care streak has increased to ${calculateStreak()} days! 🔥`, null);
        }, 300);
      }

      refreshAllUI();
    }

    function uncompletePlannerTask(taskId, dateStr) {
      const tasks = getCareTasks();
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      if (task.completedDates) {
        task.completedDates = task.completedDates.filter(d => d !== dateStr);
      }
      if (task.repeat === 'none') {
        task.completed = false;
      }

      saveCareTasks(tasks);

      let log = getLog();
      const idx = log.findIndex(e => e.petIdx === task.petIdx && e.timestamp.slice(0, 10) === dateStr && e.note === `Completed task: ${task.title}`);
      if (idx >= 0) {
        log.splice(idx, 1);
        saveLog(log);
      }

      showToast(`Task "${task.title}" marked incomplete`);
      refreshAllUI();
    }

    function renderCarePlannerTab() {
      const pets = getPets();
      const noPet = isNoPet();
      const activeIdx = Math.min(getActivePetIdx(), Math.max(0, pets.length - 1));

      // Render Pet Tabs
      const tabs = document.getElementById('plannerPetTabs');
      if (tabs) {
        if (noPet || pets.length === 0) {
          tabs.innerHTML = '';
        } else {
          tabs.innerHTML = pets.map((p, i) => `<div class="pet-tab ${i === activeIdx ? 'active' : ''}" onclick="setActivePet(${i});renderCarePlannerTab()">${PET_ICONS[p.type] || '🐾'} ${p.name}</div>`).join('');
        }
      }

      // Check for empty state
      if (noPet || pets.length === 0) {
        const grid = document.getElementById('plannerCalendarGrid');
        if (grid) grid.innerHTML = `<div style="grid-column: span 7; padding: 20px; text-align: center; color: var(--muted); font-weight:700;">No active pets. Add a pet first.</div>`;
        const label = document.getElementById('selectedDateLabel');
        if (label) label.textContent = 'No selected date';
        const prog = document.getElementById('plannerProgressLabel');
        if (prog) prog.textContent = '0/0 completed';
        const bar = document.getElementById('plannerProgressBar');
        if (bar) bar.style.width = '0%';
        const pend = document.getElementById('plannerPendingList');
        if (pend) pend.innerHTML = `<div class="card empty-state" style="padding:16px;text-align:center"><p style="color:var(--muted)">No pets registered. Add a pet profile to get started.</p></div>`;
        const comp = document.getElementById('plannerCompletedList');
        if (comp) comp.innerHTML = '';
        const upc = document.getElementById('plannerUpcomingList');
        if (upc) upc.innerHTML = '';
        const hist = document.getElementById('plannerHistoryBox');
        if (hist) hist.innerHTML = '';
        return;
      }

      // Render Calendar Grid
      const grid = document.getElementById('plannerCalendarGrid');
      const monthLabel = document.getElementById('plannerMonthLabel');
      if (grid && monthLabel) {
        const year = calendarMonthDate.getFullYear();
        const month = calendarMonthDate.getMonth();
        const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        monthLabel.textContent = `${MONTHS[month]} ${year}`;

        let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="cal-day-header">${d}</div>`).join('');
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
          html += `<div class="cal-empty-cell"></div>`;
        }

        const tasks = getCareTasks();
        const petTasks = tasks.filter(t => t.petIdx === activeIdx);
        const today = new Date().toISOString().slice(0, 10);

        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = (dateStr === selectedPlannerDateStr);
          const isToday = (dateStr === today);
          const hasTasks = petTasks.some(t => taskAppliesToDate(t, dateStr));
          const dot = hasTasks ? `<div class="task-dot"></div>` : '';

          html += `
            <div class="cal-day-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}" onclick="selectPlannerDate('${dateStr}')">
              ${day}
              ${dot}
            </div>
          `;
        }
        grid.innerHTML = html;
      }

      // Set date inputs default to currently selected planner date or current local date/time
      const dtInput = document.getElementById('addTaskDateTime');
      if (dtInput && !dtInput.value) {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(now - offset)).toISOString().slice(0, 16);
        dtInput.value = localISOTime;
      }

      // Render Summary and Progress Bar
      const dateLabel = document.getElementById('selectedDateLabel');
      const progressLabel = document.getElementById('plannerProgressLabel');
      const progressBar = document.getElementById('plannerProgressBar');
      const tasks = getCareTasks();
      const petTasks = tasks.filter(t => t.petIdx === activeIdx);
      const dayTasks = petTasks.filter(t => taskAppliesToDate(t, selectedPlannerDateStr));
      const completedTasks = dayTasks.filter(t => t.completedDates && t.completedDates.includes(selectedPlannerDateStr));

      if (dateLabel) {
        const dateObj = new Date(selectedPlannerDateStr + 'T00:00:00');
        dateLabel.textContent = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      }
      if (progressLabel) {
        progressLabel.textContent = `${completedTasks.length}/${dayTasks.length} completed`;
      }
      if (progressBar) {
        const pct = dayTasks.length > 0 ? Math.round((completedTasks.length / dayTasks.length) * 100) : 0;
        progressBar.style.width = `${pct}%`;
      }

      // Render checklists
      const pendingList = document.getElementById('plannerPendingList');
      const completedList = document.getElementById('plannerCompletedList');
      const upcomingList = document.getElementById('plannerUpcomingList');
      const historyBox = document.getElementById('plannerHistoryBox');

      const pending = dayTasks.filter(t => !(t.completedDates && t.completedDates.includes(selectedPlannerDateStr)));
      const completed = dayTasks.filter(t => t.completedDates && t.completedDates.includes(selectedPlannerDateStr));
      const upcoming = petTasks.filter(t => t.dateTime.slice(0, 10) > selectedPlannerDateStr && !(t.repeat === 'none' && t.completed));

      if (pendingList) {
        if (pending.length === 0) {
          pendingList.innerHTML = `<div class="card empty-state" style="padding:12px;margin:8px 0"><p style="font-size:13px;color:var(--muted)">No pending tasks for this day.</p></div>`;
        } else {
          pendingList.innerHTML = pending.map(t => {
            const timeStr = formatTimeFromDateTime(t.dateTime);
            const repeatLabel = t.repeat !== 'none' ? `<span style="background:var(--pill-bg);color:var(--pill-color);font-size:10px;padding:2px 6px;border-radius:8px;font-weight:800;text-transform:uppercase">${t.repeat}</span>` : '';
            const deleteBtn = !isDefaultTask(t.title) ? `<button onclick="deletePlannerTask('${t.id}')" style="background:none;border:none;color:var(--red);font-size:16px;cursor:pointer;padding:0 4px">✕</button>` : '';
            return `
              <div class="card" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;margin:8px 0">
                <div style="display:flex;align-items:center;gap:12px">
                  <input type="checkbox" onchange="completePlannerTask('${t.id}', '${selectedPlannerDateStr}')" style="width:20px;height:20px;cursor:pointer;accent-color:var(--orange)" />
                  <div>
                    <b style="font-size:15px;color:var(--dark)">${t.title}</b>
                    <div style="font-size:12px;color:var(--muted);margin-top:2px;display:flex;align-items:center;gap:8px">
                      <span>🕒 ${timeStr}</span>
                      ${repeatLabel}
                      <span>${t.reminder ? '🔔' : ''}</span>
                    </div>
                  </div>
                </div>
                ${deleteBtn}
              </div>
            `;
          }).join('');
        }
      }

      if (completedList) {
        if (completed.length === 0) {
          completedList.innerHTML = `<div class="card empty-state" style="padding:12px;margin:8px 0"><p style="font-size:13px;color:var(--muted)">No completed tasks for this day yet.</p></div>`;
        } else {
          completedList.innerHTML = completed.map(t => {
            const timeStr = formatTimeFromDateTime(t.dateTime);
            const deleteBtn = !isDefaultTask(t.title) ? `<button onclick="deletePlannerTask('${t.id}')" style="background:none;border:none;color:var(--red);font-size:16px;cursor:pointer;padding:0 4px">✕</button>` : '';
            return `
              <div class="card" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;margin:8px 0;opacity:0.75;background:var(--success-bg);border:1px solid #B5EAD7">
                <div style="display:flex;align-items:center;gap:12px">
                  <input type="checkbox" checked onchange="uncompletePlannerTask('${t.id}', '${selectedPlannerDateStr}')" style="width:20px;height:20px;cursor:pointer;accent-color:var(--orange)" />
                  <div>
                    <b style="font-size:15px;color:#1A6A4A;text-decoration:line-through">${t.title}</b>
                    <div style="font-size:12px;color:#1A6A4A;margin-top:2px">
                      Completed ✓ 🕒 ${timeStr}
                    </div>
                  </div>
                </div>
                ${deleteBtn}
              </div>
            `;
          }).join('');
        }
      }

      if (upcomingList) {
        if (upcoming.length === 0) {
          upcomingList.innerHTML = `<div class="card empty-state" style="padding:12px;margin:8px 0"><p style="font-size:13px;color:var(--muted)">No upcoming tasks scheduled.</p></div>`;
        } else {
          const sortedUpcoming = upcoming.slice().sort((a, b) => a.dateTime.localeCompare(b.dateTime));
          upcomingList.innerHTML = sortedUpcoming.slice(0, 10).map(t => {
            const dateObj = new Date(t.dateTime);
            const dateLabelStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const repeatLabel = t.repeat !== 'none' ? `<span style="background:var(--pill-bg);color:var(--pill-color);font-size:9px;padding:1px 4px;border-radius:6px;font-weight:800;text-transform:uppercase">${t.repeat}</span>` : '';
            const deleteBtn = !isDefaultTask(t.title) ? `<button onclick="deletePlannerTask('${t.id}')" style="background:none;border:none;color:var(--red);font-size:14px;cursor:pointer;padding:0 4px">✕</button>` : '';
            return `
              <div class="card" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;margin:6px 0;background:var(--pill-bg);border:none">
                <div>
                  <b style="font-size:14px;color:var(--dark)">${t.title}</b>
                  <div style="font-size:11px;color:var(--muted);margin-top:2px;display:flex;align-items:center;gap:6px">
                    <span>📅 ${dateLabelStr}</span>
                    ${repeatLabel}
                    <span>${t.reminder ? '🔔' : ''}</span>
                  </div>
                </div>
                ${deleteBtn}
              </div>
            `;
          }).join('');
        }
      }

      if (historyBox) {
        const log = getLog().filter(e => e.petIdx === activeIdx && (e.type === 'care' || e.type === 'fed' || e.type === 'water'));
        if (log.length === 0) {
          historyBox.innerHTML = `<p style="font-size:13px;color:var(--muted);padding:8px 0;text-align:center">No task completion history yet.</p>`;
        } else {
          historyBox.innerHTML = log.map(e => {
            const ts = new Date(e.timestamp);
            const dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeStr = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                <div>
                  <span style="font-weight:800;color:var(--dark);font-size:14px">${e.note || e.taskTitle || 'Care Task'}</span>
                  <span style="font-size:11px;color:var(--muted);margin-left:8px">${dateStr} @ ${timeStr}</span>
                </div>
                <span style="font-size:11px;background:var(--success-bg);color:#1A6A4A;padding:2px 8px;border-radius:10px;font-weight:800">Done ✓</span>
              </div>
            `;
          }).join('');
        }
      }
    }

    // ==================== REFRESH ALL ====================
    function refreshAllUI() {
      const pets = getPets();
      const noPet = isNoPet();
      const activeIdx = Math.min(getActivePetIdx(), Math.max(0, pets.length - 1));

      document.getElementById('noPetCheck').checked = noPet;

      renderPetList();
      renderHomePreview(pets, activeIdx, noPet);
      renderPlanTab(pets, activeIdx, noPet);
      renderTrackerTab(pets, activeIdx, noPet);
      renderRemindersTab(pets, activeIdx, noPet);
      renderCareTab(pets, activeIdx, noPet);
      renderHomemadeTab();
      renderCommunity();
      renderMarketplace();
      if (typeof renderGameTab === 'function') renderGameTab();
      if (typeof renderVisionHistory === 'function') renderVisionHistory();
      updateHomeStats(pets, activeIdx, noPet);
      if (typeof renderDailyChecklist === 'function') renderDailyChecklist();
      if (typeof renderExpenseTracker === 'function') renderExpenseTracker();
      if (typeof renderStockTracker === 'function') renderStockTracker();
    }

    // ==================== DAILY PET CARE TIPS ====================
    const PET_CARE_TIPS = [
      "Ensure fresh drinking water is always available in clean bowls to prevent UTIs. 💧",
      "Feed high-quality protein appropriate for your pet's life stage and weight. 🍗",
      "Keep toxic foods like chocolate, onions, garlic, grapes, and raisins out of reach. 🚫",
      "Regular walks and interactive play keep your pet mentally stimulated and fit. 🚶",
      "Brush your pet's teeth regularly to prevent dental disease and bad breath. 🪥",
      "Trim your pet's nails every 3-4 weeks to keep them walking comfortably. 💅",
      "Create a safe, quiet space where your pet can retreat during loud events like storms. ⛈️",
      "Schedule veterinary checkups annually (or bi-annually for seniors) to catch issues early. 🏥",
      "Keep vaccinations and parasite prevention up to date to protect against heartworm. 🐛",
      "A healthy pet weight prolongs life expectancy and reduces joint strain. ⚖️",
      "Regular grooming helps monitor skin conditions, hot spots, or ticks early. 🧼",
      "Never give human medications to pets unless specifically instructed by your vet. 💊",
      "Clean litter boxes daily; cats are fastidious and value clean bathrooms. 🧹",
      "Introduce new food gradually over 7 days to prevent digestive upset. 🍲",
      "Interactive puzzle toys are great for senior pets to keep their brains sharp. 🧩",
      "Spaying or neutering reduces the risk of urinary/reproductive cancers. ✂️",
      "Check pet paws regularly for cuts, thorns, or raw pads during hot/cold seasons. 🐾",
      "Keep household chemicals and cleaning products stored securely in locked cabinets. 🧴",
      "Provide vertical space (perches, cat trees) for cats to satisfy climbing instincts. 🧗",
      "Log your pet's daily meals and water intake to establish healthy baselines. 📝",
      "Microchip your pets and keep registration info updated in case they get lost. 🏷️",
      "Avoid giving cooked bones to dogs; they can splinter and damage intestines. 🍖",
      "Ensure indoor plants are pet-safe; lilies, sago palms, and ivy are highly toxic. 🌿",
      "Limit high-calorie treats to less than 10% of your pet's total daily calorie intake. 🍪",
      "Regular brushing helps minimize shedding, hairballs, and matting. 🐈",
      "Keep garbage bins secured; food scraps can cause pancreatitis or obstruction. 🗑️",
      "Watch for changes in behavior (lethargy, hiding) as pets hide pain very well. 🕵️",
      "Make sure collars fit comfortably; you should easily fit two fingers underneath. 🏷️",
      "Provide clean chew toys to naturally scrape plaque off your pet's teeth. 🦴",
      "Positive reinforcement (praise, treats) is the best way to train any behavior. 🌟"
    ];

    function calculateHealthScore(pet, stats, activeIdx) {
      if (!pet) return 80;
      
      // 1. Streak Score (40pts max)
      const streak = calculateStreak();
      const streakScore = Math.min(40, streak * 10);
      
      // 2. Water Score (30pts max)
      const waterPct = stats.waterPct || 0;
      const waterScore = Math.min(30, (waterPct / 100) * 30);
      
      // 3. Mood Score (20pts max)
      const mood = stats.mood || '—';
      let moodScore = 15;
      if (mood === '😄' || mood === '😐' || mood === '⚡') moodScore = 20;
      else if (mood === '😴') moodScore = 15;
      else if (mood === '😟') moodScore = 10;
      else if (mood === '😡' || mood === '🤒') moodScore = 5;
      
      // 4. Weight Score (10pts max)
      let weightScore = 10;
      if (pet.weightHistory && pet.weightHistory.length >= 2) {
        const history = pet.weightHistory;
        const currentW = parseFloat(history[history.length - 1].weight || pet.weight || 0);
        const prevW = parseFloat(history[history.length - 2].weight || pet.weight || 0);
        if (prevW > 0) {
          const diffPct = Math.abs(currentW - prevW) / prevW;
          if (diffPct <= 0.05) weightScore = 10;
          else if (diffPct <= 0.10) weightScore = 7;
          else weightScore = 5;
        }
      }
      
      const totalScore = Math.round(streakScore + waterScore + moodScore + weightScore);
      
      // Determine lowest component for advice
      let lowestComponent = 'water';
      let lowestVal = waterScore / 30;
      
      if ((streakScore / 40) < lowestVal) {
        lowestComponent = 'streak';
        lowestVal = streakScore / 40;
      }
      if ((moodScore / 20) < lowestVal) {
        lowestComponent = 'mood';
        lowestVal = moodScore / 20;
      }
      
      let insight = `${pet.name} is thriving! 🌟`;
      if (totalScore < 80) {
        if (lowestComponent === 'water') {
          insight = `${pet.name} needs more water 💧`;
        } else if (lowestComponent === 'streak') {
          insight = `Keep up the daily routine streak! 🔥`;
        } else if (lowestComponent === 'mood') {
          insight = `Give ${pet.name} some extra love today 😊`;
        }
      }
      
      return { totalScore, insight };
    }

    function quickActionLog(type) {
      const pets = getPets();
      const activeIdx = getActivePetIdx();
      const pet = pets[activeIdx];
      
      if (!pet && !isNoPet()) { showToast('No active pet selected'); return; }
      
      if (type === 'fed' || type === 'water') {
        const note = type === 'fed' ? 'Meal fed' : 'Water refilled';
        const entry = {
          id: Date.now(),
          type,
          note,
          timestamp: new Date().toISOString(),
          petName: pet ? pet.name : 'General',
          petIdx: pet ? activeIdx : -1
        };
        
        const log = getLog();
        log.unshift(entry);
        if (log.length > 200) log.splice(200);
        saveLog(log);
        
        if (type === 'fed') {
          if (typeof deductStockAutomatically === 'function') {
            deductStockAutomatically(note, 'food');
          }
        }
        
        showToast((type === 'fed' ? 'Feed' : 'Water') + ' logged successfully! ✅');
        refreshAllUI();
      } else if (type === 'mood') {
        openLogModal('mood');
      }
    }

    function openQuickWeightModal() {
      const modal = document.getElementById('weightModal');
      if (modal) {
        modal.classList.remove('hidden');
        const input = document.getElementById('quickWeight');
        if (input) {
          input.value = '';
          input.focus();
        }
      }
    }

    function renderTodayTimeline(pets, activeIdx, noPet) {
      const box = document.getElementById('timelineScrollBox');
      const section = document.getElementById('homeTimelineSection');
      if (!box || !section) return;
      
      if (noPet || pets.length === 0) {
        section.style.display = 'none';
        return;
      }
      
      section.style.display = 'block';
      const tasks = getCareTasks();
      const petTasks = tasks.filter(t => t.petIdx === activeIdx);
      const today = todayStr();
      const dayTasks = petTasks.filter(t => taskAppliesToDate(t, today));
      
      if (dayTasks.length === 0) {
        box.innerHTML = `<div style="padding:10px 0; font-size:13px; color:var(--muted); font-style:italic; text-align:center; width:100%;">No tasks today — add some in Planner 📅</div>`;
        return;
      }
      
      dayTasks.sort((a, b) => {
        const timeA = a.dateTime.slice(11);
        const timeB = b.dateTime.slice(11);
        return timeA.localeCompare(timeB);
      });
      
      box.innerHTML = dayTasks.map(t => {
        const isCompleted = t.completedDates && t.completedDates.includes(today);
        const timeStr = formatTimeFromDateTime(t.dateTime);
        const hour = parseInt(t.dateTime.slice(11, 13));
        
        let period = '🌅 Morning';
        if (hour >= 17) period = '🌙 Evening';
        else if (hour >= 12) period = '☀️ Afternoon';
        
        let icon = '🔔';
        const titleLower = t.title.toLowerCase();
        if (titleLower.includes('feed') || titleLower.includes('meal') || titleLower.includes('food') || titleLower.includes('dinner')) icon = '🍽️';
        else if (titleLower.includes('water')) icon = '💧';
        else if (titleLower.includes('walk') || titleLower.includes('play')) icon = '🚶';
        else if (titleLower.includes('med') || titleLower.includes('pill') || titleLower.includes('vet')) icon = '💊';
        else if (titleLower.includes('sleep') || titleLower.includes('bed')) icon = '😴';
        
        return `
          <div class="timeline-item ${isCompleted ? 'completed' : ''}" onclick="toggleTimelineTaskComplete('${t.id}')">
            <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase">${period}</span>
            <span style="font-size:24px;margin:2px 0;">${isCompleted ? '✅' : icon}</span>
            <b style="font-size:13px;color:var(--dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;">${t.title}</b>
            <span style="font-size:11px;color:var(--muted)">${timeStr}</span>
          </div>
        `;
      }).join('');
    }

    function toggleTimelineTaskComplete(id) {
      const today = todayStr();
      const tasks = getCareTasks();
      const t = tasks.find(x => x.id == id);
      if (!t) return;
      
      t.completedDates = t.completedDates || [];
      if (t.completedDates.includes(today)) {
        t.completedDates = t.completedDates.filter(d => d !== today);
        showToast('Task uncompleted');
      } else {
        t.completedDates.push(today);
        showToast('Task completed! 🎉');
        if (t.title.toLowerCase().includes('feed') || t.title.toLowerCase().includes('meal')) {
          if (typeof deductStockAutomatically === 'function') {
            deductStockAutomatically(t.title, 'food');
          }
        }
      }
      saveCareTasks(tasks);
      refreshAllUI();
    }

    function renderReminderBanner(pets, activeIdx, noPet) {
      const banner = document.getElementById('upcomingReminderBanner');
      const textEl = document.getElementById('reminderBannerText');
      const timeEl = document.getElementById('reminderBannerTime');
      if (!banner || !textEl || !timeEl) return;
      
      if (noPet || pets.length === 0) {
        banner.style.display = 'none';
        return;
      }
      
      const pet = pets[activeIdx];
      const tasks = getCareTasks();
      const petTasks = tasks.filter(t => t.petIdx === activeIdx);
      const now = new Date();
      
      let nextTask = null;
      let minDiff = Infinity;
      
      petTasks.forEach(t => {
        const datesToTry = [todayStr(), new Date(now.getTime() + 86400000).toISOString().slice(0, 10)];
        datesToTry.forEach(dateStr => {
          if (taskAppliesToDate(t, dateStr)) {
            const isCompleted = t.completedDates && t.completedDates.includes(dateStr);
            if (!isCompleted) {
              const timePart = t.dateTime.slice(11);
              const taskTime = new Date(`${dateStr}T${timePart}`);
              const diff = taskTime - now;
              if (diff > 0 && diff < minDiff) {
                minDiff = diff;
                nextTask = { task: t, time: taskTime };
              }
            }
          }
        });
      });
      
      if (!nextTask) {
        banner.style.display = 'none';
        return;
      }
      
      banner.style.display = 'block';
      const diffMin = Math.round(minDiff / 60000);
      let durationStr = '';
      if (diffMin >= 60) {
        const h = Math.floor(diffMin / 60);
        const m = diffMin % 60;
        durationStr = `${h}h ${m}m`;
      } else {
        durationStr = `${diffMin}m`;
      }
      
      textEl.textContent = `${pet.name}'s ${nextTask.task.title}`;
      timeEl.textContent = `Scheduled in ${durationStr}`;
    }

    function renderDailyPetTip() {
      const card = document.getElementById('dailyPetTipCard');
      const textEl = document.getElementById('dailyTipText');
      if (!card || !textEl) return;
      
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 0);
      const diff = now - start;
      const oneDay = 1000 * 60 * 60 * 24;
      const dayOfYear = Math.floor(diff / oneDay);
      const tipIdx = dayOfYear % PET_CARE_TIPS.length;
      
      textEl.textContent = PET_CARE_TIPS[tipIdx];
    }

    // ==================== HOME STATS ====================
    function updateHomeStats(pets, activeIdx, noPet) {
      const stats = getTodayStats();
      document.getElementById('statFeedings').textContent = stats.feedings;
      document.getElementById('statWater').textContent = stats.waterPct + '%';
      document.getElementById('statMood').textContent = stats.mood;

      // Quick Actions & Health Score elements
      const actions = document.getElementById('homeQuickActions');
      const healthSec = document.getElementById('healthScoreSection');
      
      if (!noPet && pets.length > 0) {
        if (actions) actions.style.display = 'flex';
        
        // Calculate health score & render circle
        const pet = pets[activeIdx];
        const { totalScore, insight } = calculateHealthScore(pet, stats, activeIdx);
        
        const circle = document.getElementById('healthScoreCircle');
        const valText = document.getElementById('healthScoreVal');
        const insightText = document.getElementById('healthInsightText');
        
        if (healthSec && circle && valText) {
          healthSec.style.display = 'block';
          valText.textContent = totalScore;
          const offset = 251.2 - (totalScore / 100) * 251.2;
          circle.style.strokeDashoffset = offset;
          
          if (totalScore >= 80) {
            circle.style.stroke = 'var(--teal)';
          } else if (totalScore >= 50) {
            circle.style.stroke = 'var(--orange)';
          } else {
            circle.style.stroke = '#EF5350';
          }
          if (insightText) insightText.textContent = insight;
        }
        
        // Render timeline
        renderTodayTimeline(pets, activeIdx, noPet);
        // Render upcoming banner
        renderReminderBanner(pets, activeIdx, noPet);
      } else {
        if (actions) actions.style.display = 'none';
        if (healthSec) healthSec.style.display = 'none';
        const timeline = document.getElementById('homeTimelineSection');
        if (timeline) timeline.style.display = 'none';
        const banner = document.getElementById('upcomingReminderBanner');
        if (banner) banner.style.display = 'none';
      }

      // Render daily tip always
      renderDailyPetTip();

      // Streak
      const s = getSettings();
      const streak = calculateStreak();
      const streakBanner = document.getElementById('streakBanner');
      if (streak >= 2 && s.showStreaks !== false && !noPet && pets.length > 0) {
        streakBanner.classList.remove('hidden');
        const sc = document.getElementById('streakCount');
        sc.textContent = streak;
        if (streak >= 7) {
          sc.classList.add('streak-shimmer');
        } else {
          sc.classList.remove('streak-shimmer');
        }
        document.getElementById('streakTitle').textContent = streak >= 7 ? '🏆 ' + streak + '-Day Streak!' : '🔥 Feeding Streak!';
        document.getElementById('streakSub').textContent = streak >= 7 ? 'Amazing consistency!' : 'Keep up the great work!';
      } else {
        streakBanner.classList.add('hidden');
      }
    }

    // ==================== HOME PREVIEW ====================
    function renderHomePreview(pets, activeIdx, noPet) {
      const preview = document.getElementById('petPreview');
      const heroCard = document.getElementById('homeHeroCard');
      
      if (noPet) {
        document.getElementById('todayPlan').innerText = 'Browsing general pet care tips.';
        document.getElementById('healthBadge').innerText = 'General mode';
        preview.innerHTML = `<div class="empty-state"><p>You're in no-pet mode.</p><button class="primary-btn" onclick="document.getElementById('noPetCheck').checked=false;toggleNoPet()">Enable Pet Mode</button></div>`;
        return;
      }
      if (pets.length === 0) {
        document.getElementById('todayPlan').innerText = 'Add your pet profile to get a personalized feeding plan.';
        document.getElementById('healthBadge').innerText = 'Smart care enabled';
        preview.innerHTML = `<div class="empty-state"><h3>No pets added yet 🐾</h3><p>Add your first pet to get a personalized feeding plan.</p><button class="primary-btn" onclick="openPetModal(-1)">+ Add My Pet</button></div>`;
        return;
      }
      const pet = pets[activeIdx];
      document.getElementById('todayPlan').innerText = pet.name + '\'s next care plan is ready.';
      document.getElementById('healthBadge').innerText = pet.health ? 'Health-aware plan' : 'Healthy routine plan';

      // Set pet color theme variable dynamically
      document.documentElement.style.setProperty('--pet-color', pet.color || '#F5A623');
      
      const avatarEl = document.getElementById('heroPetAvatar');
      if (avatarEl) {
        avatarEl.style.boxShadow = `0 0 30px ${(pet.color || '#F5A623')}66`;
        avatarEl.style.borderColor = pet.color || '#F5A623';
        if (pet.avatar) {
          avatarEl.innerHTML = `<img src="${pet.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        } else {
          avatarEl.innerHTML = PET_ICONS[pet.type] || '🐾';
        }
      }

      preview.innerHTML = `
      <div class="pet-profile-header" style="background:var(--card); border:1px solid var(--border); border-radius:20px; box-shadow:var(--shadow); position:relative; z-index:1; padding:20px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div class="pet-profile-name" style="font-family:'Nunito',sans-serif; font-size:20px; font-weight:900; color:var(--dark)">${pet.name} <span class="active-dot" style="background:var(--teal)"></span></div>
          <div class="pet-profile-sub" style="font-size:13px; color:var(--text); margin-top:4px;">${pet.type} · ${pet.breed}</div>
          <div class="pet-profile-sub" style="font-size:12px; color:var(--muted); margin-top:2px;">Age: ${pet.age} yrs · ${pet.weight} kg</div>
        </div>
        <button class="small-btn" onclick="openGallery(${activeIdx})" style="background:var(--pill-bg);color:var(--orange);border:1px solid var(--border);font-size:12px; font-weight:800; padding:8px 14px;">📷 Gallery</button>
      </div>
      ${pets.length > 1 ? `<p style="font-size:13px;color:var(--muted);text-align:center;margin-top:10px">+${pets.length - 1} more pet${pets.length > 2 ? 's' : ''} — manage in <b onclick="openTab('profile')" style="cursor:pointer;color:var(--orange)">Profile</b></p>` : ''}`;
    }

    function shadeColor(color, percent) {
      const num = parseInt(color.replace('#', ''), 16);
      const amt = Math.round(2.55 * percent);
      const R = Math.max(0, Math.min(255, (num >> 16) + amt));
      const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
      const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
      return '#' + ((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1);
    }

    // ==================== PET LIST ====================
    function renderPetList() {
      const pets = getPets();
      const activeIdx = getActivePetIdx();
      const box = document.getElementById('petListBox');
      
      const adviceContainer = document.getElementById('aiFeedingAdviceContainer');
      if (adviceContainer) {
        if (pets.length > 0) {
          adviceContainer.classList.remove('hidden');
        } else {
          adviceContainer.classList.add('hidden');
          const resultBox = document.getElementById('aiFeedingAdviceResult');
          if (resultBox) {
            resultBox.innerHTML = '';
            resultBox.classList.add('hidden');
          }
        }
      }

      if (pets.length === 0) {
        box.innerHTML = `<div class="empty-state" style="padding:14px 0"><p>No pets added yet.</p></div>`;
        return;
      }

      box.innerHTML = pets.map((p, i) => {
        const avatarHtml = p.avatar
          ? `<img src="${p.avatar}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;">`
          : `<span style="font-size:24px">${PET_ICONS[p.type] || '🐾'}</span>`;
        return `
      <div class="pet-card-item ${i === activeIdx ? 'active-pet' : ''}">
        <div style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer" onclick="setMainPet(${i})">
          <div class="pet-avatar">${avatarHtml}</div>
          <div>
            <div style="font-weight:800;font-size:15px;color:var(--dark)">${p.name} ${i === activeIdx ? '<span class="active-dot"></span>' : ''}</div>
            <div style="font-size:12px;color:var(--muted)">${p.type} · ${p.breed} · ${p.age} yrs · ${p.weight}kg</div>
            ${p.gallery && p.gallery.length ? `<div style="font-size:11px;color:var(--muted)">📷 ${p.gallery.length} photo${p.gallery.length > 1 ? 's' : ''}</div>` : ''}
          </div>
        </div>
        <div class="pet-card-actions">
          <button class="small-btn" onclick="openGallery(${i})">📷</button>
          <button class="small-btn" onclick="openPetModal(${i})">✏️</button>
          <button class="small-btn" style="background:#fff1f1;color:#d64040" onclick="deletePet(${i})">🗑️</button>
        </div>
      </div>`;
      }).join('');
    }

    // ==================== PLAN TAB ====================
    function renderPlanTab(pets, activeIdx, noPet) {
      const tabs = document.getElementById('planPetTabs');
      const box = document.getElementById('foodPlanBox');
      if (noPet || pets.length === 0) {
        tabs.innerHTML = '';
        box.innerHTML = `<div class="card empty-state"><h3>${noPet ? 'No-pet mode' : 'No pets yet'}</h3><button class="primary-btn" onclick="${noPet ? "document.getElementById('noPetCheck').checked=false;toggleNoPet()" : "openPetModal(-1)"}">+ ${noPet ? 'Enable Pet Mode' : 'Add Pet'}</button></div>`;
        return;
      }
      tabs.innerHTML = pets.map((p, i) => `<div class="pet-tab ${i === activePlanPet ? 'active' : ''}" onclick="activePlanPet=${i};renderPlanTab(getPets(),getActivePetIdx(),isNoPet())">${PET_ICONS[p.type] || '🐾'} ${p.name}</div>`).join('');
      const pet = pets[activePlanPet] || pets[0];
      box.innerHTML = buildFoodPlan(pet, activePlanPet);
    }

    function buildFoodPlan(pet, petIdx) {
      let meals = [];
      if (pet.type === 'Dog') meals = ['7:00 AM — Balanced breakfast with protein (kibble/wet food)', '1:00 PM — Light lunch or healthy dental snack', '7:30 PM — Dinner with controlled portion'];
      else if (pet.type === 'Cat') meals = ['8:00 AM — Wet/dry cat food breakfast', '2:00 PM — Small protein-rich meal', '8:00 PM — Dinner with hydration support'];
      else if (pet.type === 'Rabbit') meals = ['7:30 AM — Fresh hay and leafy greens', '1:00 PM — Small vegetable portion', '7:00 PM — Hay and clean water refill'];
      else if (pet.type === 'Bird') meals = ['8:00 AM — Seeds/pellets with fresh fruits', '1:00 PM — Fresh water and light snack', '6:30 PM — Small evening feed'];
      else if (pet.type === 'Fish') meals = ['8:00 AM — Small pinch of pellets', '6:00 PM — Small evening feed (avoid overfeeding)'];

      let healthNote = 'Maintain normal portions and observe appetite daily.';
      const h = (pet.health || '').toLowerCase();
      if (h.includes('obesity') || h.includes('weight')) healthNote = 'Use controlled portions, cut treats, and encourage light activity.';
      else if (h.includes('allergy')) healthNote = 'Avoid suspected allergen foods. Consult a vet for an elimination diet.';
      else if (h.includes('digestion')) healthNote = 'Prefer easily digestible food and give smaller, more frequent meals.';
      else if (h.includes('kidney') || h.includes('renal')) healthNote = 'Use low-phosphorus food and keep water intake high. Vet diet recommended.';
      else if (h.includes('diabetes')) healthNote = 'Consistent feeding times with low-sugar, high-fiber diet. Vet guidance essential.';

      const ageNote = parseFloat(pet.age) < 1 ? `<div class="list-item"><span>🍼</span><p><b>${pet.name} is a baby!</b> Feed 3–4 times/day with age-appropriate food.</p></div>` :
        parseFloat(pet.age) > 8 ? `<div class="list-item"><span>👴</span><p><b>Senior pet.</b> Consider senior-formula food with joint and digestive support.</p></div>` : '';

      const weightKg = parseFloat(pet.weight);
      let portionNote = '';
      if (!isNaN(weightKg) && pet.type === 'Dog') {
        const grams = Math.round(weightKg * 20);
        portionNote = `<div class="list-item"><span>⚖️</span><p>Approx. portion: <b>${grams}g/day</b> based on ${weightKg}kg. Adjust for activity.</p></div>`;
      }

      const log = getLog();
      const todayFed = log.filter(e => e.petIdx === petIdx && e.type === 'fed' && e.timestamp.slice(0, 10) === todayStr());

      return `
    <div class="card success">
      <h3 style="font-weight:900;margin-bottom:8px">${PET_ICONS[pet.type] || '🐾'} ${pet.name}'s Meal Schedule</h3>
      ${meals.map(m => `<div class="list-item"><span>✅</span><p>${m}</p></div>`).join('')}
    </div>
    <div class="card">
      <h3 style="font-weight:800;margin-bottom:6px">📋 Today's Feedings <span style="color:var(--orange)">(${todayFed.length})</span></h3>
      ${todayFed.length ? todayFed.map(f => `<div class="log-entry"><div><div class="log-time">${formatTime(f.timestamp)}</div><div class="log-text">${f.note}</div></div><span class="log-badge fed">Fed ✓</span></div>`).join('') : '<p style="color:var(--muted);font-size:13px;padding:8px 0">No feedings logged today yet.</p>'}
    </div>
    ${ageNote ? `<div class="card">${ageNote}</div>` : ''}
    ${portionNote ? `<div class="card">${portionNote}</div>` : ''}
    <div class="card">
      <h3 style="font-weight:800;margin-bottom:8px">Food Preference: ${pet.foodPref}</h3>
      <div class="list-item"><span>💡</span><p>${healthNote}</p></div>
    </div>`;
    }

    // ==================== TRACKER TAB ====================
    function renderTrackerTab(pets, activeIdx, noPet) {
      const tabs = document.getElementById('trackerPetTabs');
      const box = document.getElementById('trackerBox');

      if (noPet || pets.length === 0) {
        tabs.innerHTML = '';
        box.innerHTML = `<div class="card empty-state"><h3>No pets yet</h3><button class="primary-btn" onclick="openPetModal(-1)">+ Add Pet</button></div>`;
        return;
      }

      tabs.innerHTML = pets.map((p, i) => `<div class="pet-tab ${i === activeTrackerPet ? 'active' : ''}" onclick="activeTrackerPet=${i};renderTrackerTab(getPets(),getActivePetIdx(),isNoPet())">${PET_ICONS[p.type] || '🐾'} ${p.name}</div>`).join('');
      const pet = pets[activeTrackerPet] || pets[0];
      const petIdx = activeTrackerPet;
      const today = todayStr();
      const log = getLog();
      const totalDrops = Math.ceil((pet.waterGoal || 500) / 100);
      const currentDrops = (pet.waterDate === today ? (pet.waterDrops || []) : []);
      const waterMl = currentDrops.length * 100;
      const waterPct = Math.min(100, Math.round((currentDrops.length / totalDrops) * 100));

      // Mood
      const moodToday = pet.moodDate === today ? pet.moodToday : null;

      // Weight history
      const wh = pet.weightHistory || [];

      // Feeding history for this pet (last 14 days)
      const petLog = log.filter(e => e.petIdx === petIdx);
      const last7days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        last7days.push(d);
      }

      box.innerHTML = `
    <!-- WATER TRACKER -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="font-weight:900">💧 Water Today</h3>
        <span style="font-size:13px;color:var(--muted)">${waterMl}ml / ${pet.waterGoal || 500}ml</span>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:${waterPct}%;background:#A8D8EA"></div></div>
      <div class="water-tracker">
        ${Array.from({ length: totalDrops }, (_, i) => `
          <div class="water-drop ${currentDrops.includes(i) ? 'filled' : ''}" onclick="toggleWater(${petIdx},${i})">
            <span>💧</span>
          </div>`).join('')}
      </div>
      <p style="font-size:12px;color:var(--muted)">Tap each drop to log water. Goal: ${pet.waterGoal || 500}ml/day</p>
    </div>

    <!-- MOOD TRACKER -->
    <div class="card">
      <h3 style="font-weight:900;margin-bottom:8px">😊 Mood Today</h3>
      ${moodToday ? `<div style="text-align:center;padding:10px 0"><span style="font-size:36px">${moodToday.split(' ')[0]}</span><div style="font-size:14px;font-weight:800;margin-top:6px;color:var(--dark)">${moodToday}</div><div style="font-size:12px;color:var(--muted);margin-top:4px">Mood logged today</div></div>` : '<p style="font-size:13px;color:var(--muted);margin-bottom:10px">How is your pet feeling today?</p>'}
      <div class="mood-row">
        <div class="mood-btn ${moodToday === '😄 Happy' ? 'selected' : ''}" onclick="logQuickMood('😄 Happy',${petIdx})"><span class="mood-icon">😄</span>Happy</div>
        <div class="mood-btn ${moodToday === '😐 Calm' ? 'selected' : ''}" onclick="logQuickMood('😐 Calm',${petIdx})"><span class="mood-icon">😐</span>Calm</div>
        <div class="mood-btn ${moodToday === '😴 Tired' ? 'selected' : ''}" onclick="logQuickMood('😴 Tired',${petIdx})"><span class="mood-icon">😴</span>Tired</div>
        <div class="mood-btn ${moodToday === '😟 Sad' ? 'selected' : ''}" onclick="logQuickMood('😟 Sad',${petIdx})"><span class="mood-icon">😟</span>Sad</div>
        <div class="mood-btn ${moodToday === '😡 Grumpy' ? 'selected' : ''}" onclick="logQuickMood('😡 Grumpy',${petIdx})"><span class="mood-icon">😡</span>Grumpy</div>
      </div>
    </div>

    <!-- WEIGHT TRACKER -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="font-weight:900">⚖️ Weight History</h3>
        <button class="small-btn" onclick="document.getElementById('weightModal').classList.remove('hidden')">+ Log</button>
      </div>
      ${wh.length > 0 ? `
        <div class="weight-chart-wrap">
          <div class="weight-chart" id="weightChart${petIdx}"></div>
          <div style="display:flex;justify-content:space-between;margin-top:6px">
            <span style="font-size:11px;color:var(--muted)">Min: ${Math.min(...wh.map(w => w.weight))} kg</span>
            <span style="font-size:11px;color:var(--orange);font-weight:800">Latest: ${wh[wh.length - 1].weight} kg</span>
            <span style="font-size:11px;color:var(--muted)">Max: ${Math.max(...wh.map(w => w.weight))} kg</span>
          </div>
        </div>
        <div style="max-height:150px;overflow-y:auto;margin-top:8px">
          ${wh.slice().reverse().map(w => `<div class="history-item"><div class="history-icon">⚖️</div><div class="history-text"><b>${w.weight} kg</b><span>${formatDate(w.date)}${w.note ? ' — ' + w.note : ''}</span></div></div>`).join('')}
        </div>` : '<p style="font-size:13px;color:var(--muted)">No weight entries yet. Log your pet\'s weight to see the chart.</p>'}
    </div>

    <!-- HEALTH INSIGHTS -->
    \${typeof generateHealthInsights === 'function' ? generateHealthInsights(petIdx) : ''}

    <!-- FEEDING HISTORY (7 days) -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="font-weight:900">📜 Feeding History</h3>
        <button class="small-btn" onclick="openLogModal('fed')">+ Log</button>
      </div>
      ${last7days.map(day => {
        const dayLogs = petLog.filter(e => e.timestamp.slice(0, 10) === day);
        if (!dayLogs.length) return `<div class="history-day"><div class="history-day-label">${formatDate(day)}</div><div style="font-size:12px;color:var(--muted);padding:6px 0 6px 4px">No entries</div></div>`;
        return `<div class="history-day">
          <div class="history-day-label">${formatDate(day)}</div>
          ${dayLogs.map(e => `<div class="history-item"><div class="history-icon">${typeIcon(e.type)}</div><div class="history-text"><b>${e.note}</b><span>${formatTime(e.timestamp)}</span></div><span class="log-badge ${e.type}">${e.type === 'fed' ? 'Fed ✓' : e.type === 'water' ? 'Water' : e.type === 'weight' ? e.weight + 'kg' : e.type === 'mood' ? e.mood || 'Mood' : e.type === 'missed' ? 'Missed' : '—'}</span></div>`).join('')}
        </div>`;
      }).join('')}
    </div>`;

      // Render weight chart after DOM insert
      if (wh.length > 0) {
        setTimeout(() => renderWeightChart(wh, petIdx), 50);
      }
    }

    function logQuickMood(mood, petIdx) {
      const pets = getPets();
      if (!pets[petIdx]) return;
      pets[petIdx].moodToday = mood;
      pets[petIdx].moodDate = todayStr();
      savePets(pets);

      const log = getLog();
      log.unshift({ id: Date.now(), type: 'mood', note: mood, timestamp: new Date().toISOString(), petName: pets[petIdx].name, petIdx, mood });
      saveLog(log);

      showToast('Mood logged: ' + mood + ' ✅');
      refreshAllUI();
      openTab('tracker');
    }

    function renderWeightChart(wh, petIdx) {
      const chart = document.getElementById('weightChart' + petIdx);
      if (!chart) return;
      const values = wh.map(w => w.weight);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      const last8 = wh.slice(-8);

      chart.innerHTML = last8.map((w, i) => {
        const h = Math.max(8, Math.round(((w.weight - min) / range) * 60) + 10);
        return `<div class="weight-bar-wrap">
      <div class="weight-bar" style="height:${h}px" title="${w.weight}kg"></div>
      <div class="weight-label">${w.weight}</div>
    </div>`;
      }).join('');
    }

    // ==================== REMINDERS TAB ====================
    function renderRemindersTab(pets, activeIdx, noPet) {
      const tabs = document.getElementById('reminderPetTabs');
      const box = document.getElementById('reminderBox');
      if (noPet || pets.length === 0) {
        tabs.innerHTML = '';
        box.innerHTML = `<div class="empty-state"><p>${noPet ? 'Enable pet mode to use reminders.' : 'Add a pet to set reminders.'}</p></div>`;
        return;
      }
      tabs.innerHTML = pets.map((p, i) => `<div class="pet-tab ${i === activeReminderPet ? 'active' : ''}" onclick="activeReminderPet=${i};renderRemindersTab(getPets(),getActivePetIdx(),isNoPet())">${PET_ICONS[p.type] || '🐾'} ${p.name}</div>`).join('');
      const pet = pets[activeReminderPet] || pets[0];
      const reminders = pet.type === 'Fish'
        ? ['8:00 AM — Morning feed 🐟', '6:00 PM — Evening feed 🐟', 'Weekly — Check water quality & filter']
        : ['7:00 AM — Morning meal 🌅', '1:00 PM — Water & snack check ☀️', '7:30 PM — Dinner time 🌙', '9:00 PM — Final water refill 💧'];
      box.innerHTML = reminders.map(r => `<div class="list-item"><span>🔔</span><p>${r}</p></div>`).join('') +
        `<button class="secondary-btn" onclick="testNotification('${pet.name}')">🔔 Test Notification</button>`;
    }

    // ==================== CARE TAB ====================
    function renderCareTab(pets, activeIdx, noPet) {
      const tabs = document.getElementById('carePetTabs');
      const box = document.getElementById('careBox');
      if (noPet) {
        tabs.innerHTML = '';
        box.innerHTML = `<div class="card success"><h3>🌿 General Pet Care</h3><div class="list-item"><span>💧</span><p>Always provide clean, fresh water.</p></div><div class="list-item"><span>🏥</span><p>Schedule annual vet checkups.</p></div><div class="list-item"><span>🧹</span><p>Keep living spaces clean.</p></div></div>`;
        return;
      }
      if (pets.length === 0) {
        tabs.innerHTML = '';
        box.innerHTML = `<div class="card empty-state"><p>Add a pet to see care tips.</p><button class="primary-btn" onclick="openPetModal(-1)">+ Add Pet</button></div>`;
        return;
      }
      tabs.innerHTML = pets.map((p, i) => `<div class="pet-tab ${i === activeCarePet ? 'active' : ''}" onclick="activeCarePet=${i};renderCareTab(getPets(),getActivePetIdx(),isNoPet())">${PET_ICONS[p.type] || '🐾'} ${p.name}</div>`).join('');
      const pet = pets[activeCarePet] || pets[0];
      const unsafe = UNSAFE[pet.type] || [];
      box.innerHTML = `
    <div class="card success">
      <h3 style="font-weight:900;margin-bottom:8px">✅ Daily Care for ${pet.name}</h3>
      <div class="list-item"><span>💧</span><p>Keep clean drinking water available. Daily goal: ${pet.waterGoal || 500}ml.</p></div>
      <div class="list-item"><span>⚖️</span><p>Monitor weight and adjust portions. Current: ${pet.weight}kg.</p></div>
      <div class="list-item"><span>🧽</span><p>Clean food and water bowls daily.</p></div>
      <div class="list-item"><span>🏥</span><p>Schedule regular vet checkups. Follow vet guidance for health conditions.</p></div>
      ${pet.type === 'Dog' ? '<div class="list-item"><span>🚶</span><p>Regular daily walks are essential.</p></div>' : ''}
      ${pet.type === 'Cat' ? '<div class="list-item"><span>🪥</span><p>Brush coat regularly, keep litter box clean.</p></div>' : ''}
      ${pet.type === 'Fish' ? '<div class="list-item"><span>🌡️</span><p>Check water temperature and pH weekly.</p></div>' : ''}
    </div>
    <div class="card danger">
      <h3 style="font-weight:900;margin-bottom:8px">⚠️ Foods to Avoid for ${pet.name}</h3>
      ${unsafe.map(f => `<div class="list-item danger"><span>🚫</span><p><b>${f}</b></p></div>`).join('')}
    </div>`;
    }

    function searchFoodSafety() {
      const input = document.getElementById('foodSafetySearchInput');
      const resultBox = document.getElementById('foodSafetySearchResult');
      if (!input || !resultBox) return;

      const q = input.value.trim().toLowerCase();
      if (!q) {
        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
        return;
      }

      resultBox.style.display = 'block';

      // Find current pet to customize warning
      const pets = getPets();
      const activeIdx = getActivePetIdx();
      const pet = pets[activeIdx];
      const spec = pet ? pet.type.toLowerCase() : '';

      // Search matching entries in TOXIC_FOODS
      const matches = (TOXIC_FOODS || []).filter(item => 
        item.name.toLowerCase().includes(q)
      );

      if (matches.length === 0) {
        resultBox.innerHTML = `
          <div class="card success" style="margin:0; padding:12px; border:1px solid #10b981; background:#f0fdf4;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:20px;">✅</span>
              <div>
                <b style="color:#047857">No specific toxic warning found</b>
                <p style="margin:2px 0 0 0; font-size:12px; color:#065f46">We couldn't find a direct toxicity warning for "<b>${escapeHtml(input.value)}</b>" in our database. However, always proceed with caution, introduce new foods in tiny amounts, and monitor your pet. Consult your vet if you are unsure.</p>
              </div>
            </div>
          </div>
        `;
        return;
      }

      // Render matches
      resultBox.innerHTML = matches.map(item => {
        // Check if active pet species is affected
        const isAffected = !item.species_affected || 
                           item.species_affected.toLowerCase().includes(spec) ||
                           spec === '';
        
        const severityColor = item.severity.toLowerCase() === 'severe' ? '#ef4444' : '#f59e0b';
        const severityBg = item.severity.toLowerCase() === 'severe' ? '#fef2f2' : '#fffbeb';
        const severityBorder = item.severity.toLowerCase() === 'severe' ? '#fee2e2' : '#fef3c7';

        return `
          <div class="card" style="margin:0 0 8px 0; padding:12px; border:1px solid ${isAffected ? severityColor : '#d1d5db'}; background: ${isAffected ? severityBg : '#f9fafb'};">
            <div style="display:flex; justify-content:between; align-items:center; margin-bottom:6px;">
              <span style="font-weight:900; font-size:16px; color:var(--dark)">${escapeHtml(item.name)}</span>
              <span style="font-size:11px; font-weight:700; text-transform:uppercase; padding:2px 8px; border-radius:12px; background:${isAffected ? severityColor : '#6b7280'}; color:#fff; margin-left:auto;">
                ${escapeHtml(item.severity)}
              </span>
            </div>
            <p style="margin:4px 0; font-size:13px; line-height:1.4">
              <b>Species Affected:</b> ${escapeHtml(item.species_affected)}
              ${isAffected && pet ? ` <span style="color:#ef4444; font-weight:700;">(Affects ${pet.name}! ⚠️)</span>` : ''}
            </p>
            <p style="margin:4px 0; font-size:13px; line-height:1.4"><b>Symptoms:</b> ${escapeHtml(item.symptoms)}</p>
            <p style="margin:4px 0; font-size:13px; line-height:1.4; color:#4b5563"><i><b>Notes:</b> ${escapeHtml(item.notes)}</i></p>
          </div>
        `;
      }).join('');
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // ==================== HELPERS ====================
    function petIcon(type) { return PET_ICONS[type] || '🐾'; }
    function typeIcon(type) { return { fed: '🍽️', water: '💧', weight: '⚖️', mood: '😊', missed: '❌' }[type] || '📝'; }

    function formatTime(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      return d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, day: 'numeric', month: 'short' });
    }

    function formatDate(dateStr) {
      const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
      const today = todayStr();
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (dateStr.slice(0, 10) === today) return 'Today';
      if (dateStr.slice(0, 10) === yesterday) return 'Yesterday';
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }

    // ==================== NOTIFICATIONS ====================
    function enableNotifications() {
      if (!('Notification' in window)) { showToast('Notifications not supported'); return; }
      Notification.requestPermission().then(p => {
        if (p === 'granted') { showToast('Notifications enabled ✅'); startAllReminders(); }
        else { showToast('Permission denied'); }
      });
    }

    function showNotification(msg) {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🐾 PawFeed', { body: msg });
      }
    }

    function testNotification(name) {
      showNotification('Food time for ' + name + '! 🍽️');
      showToast('Test reminder triggered 🔔');
    }

    function startAllReminders() {
      reminderTimers.forEach(clearInterval);
      reminderTimers = [];
      const pets = getPets();
      if (!pets.length) return;
      const t = setInterval(() => {
        const now = new Date();
        const h = now.getHours(), m = now.getMinutes();
        pets.forEach(pet => {
          if (h === 7 && m === 0) showNotification('Morning meal for ' + pet.name + ' 🌅');
          if (h === 13 && m === 0) showNotification('Afternoon check for ' + pet.name + ' ☀️');
          if (h === 19 && m === 30) showNotification('Dinner time for ' + pet.name + ' 🌙');
        });
      }, 60000);
      reminderTimers.push(t);
    }

    // ==================== TAB NAVIGATION ====================
    function openTab(tab) {
      document.querySelectorAll('#mainApp > .tab-screen').forEach(t => t.classList.add('hidden'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      const el = document.getElementById(tab + 'Tab');
      if (el) el.classList.remove('hidden');
      const nav = document.getElementById('nav-' + tab);
      if (nav) nav.classList.add('active');

      if (tab === 'profile') {
        renderGalleryTab();
        renderBirthdayTab();
        if (typeof renderExpenseTracker === 'function') renderExpenseTracker();
      }
      if (tab === 'careplanner') {
        if (typeof renderCarePlannerTab === 'function') renderCarePlannerTab();
        if (typeof renderDailyChecklist === 'function') renderDailyChecklist();
      }
      if (tab === 'homemade') {
        if (typeof renderStockTracker === 'function') renderStockTracker();
      }
      if (tab === 'tracker') {
        if (typeof renderTrackerTab === 'function') renderTrackerTab(getPets(), getActivePetIdx(), isNoPet());
      }
    }

    function openCombo(combo, defaultSub) {
      document.querySelectorAll('#mainApp > .tab-screen').forEach(t => t.classList.add('hidden'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      const el = document.getElementById('comboTab-' + combo);
      if (el) el.classList.remove('hidden');
      const nav = document.getElementById('nav-combo-' + combo);
      if (nav) nav.classList.add('active');
      switchComboSub(combo, defaultSub);
    }

    function switchComboSub(combo, sub) {
      // Hide all inner panels for this combo
      const comboEl = document.getElementById('comboTab-' + combo);
      if (!comboEl) return;
      comboEl.querySelectorAll('[id^="comboInner-' + combo + '-"]').forEach(el => el.style.display = 'none');
      comboEl.querySelectorAll('.combo-sub-tab').forEach(t => t.classList.remove('active'));
      // Show the selected one
      const inner = document.getElementById('comboInner-' + combo + '-' + sub);
      if (inner) inner.style.display = '';
      const subTab = document.getElementById('csub-' + sub);
      if (subTab) subTab.classList.add('active');
      // Render data for the sub-tab
      renderComboSubContent(combo, sub);
    }

    function renderComboSubContent(combo, sub) {
      const pets = getPets(), activeIdx = getActivePetIdx(), noPet = isNoPet();
      if (combo === 'planwater') {
        if (sub === 'plan') {
          renderPlanTab(pets, activeIdx, noPet);
          const tabs2 = document.getElementById('planPetTabs2');
          const box2 = document.getElementById('foodPlanBox2');
          if (tabs2) tabs2.innerHTML = document.getElementById('planPetTabs').innerHTML.replace(/renderPlanTab\(/g, 'renderPlanTab(');
          if (box2) box2.innerHTML = document.getElementById('foodPlanBox').innerHTML;
        } else if (sub === 'care') {
          renderCareTab(pets, activeIdx, noPet);
          renderMedTab();
          renderVetTab();
          renderSleepTab();
          const tabs2 = document.getElementById('carePetTabs2');
          const box2 = document.getElementById('careBox2');
          if (tabs2) tabs2.innerHTML = document.getElementById('carePetTabs').innerHTML;
          if (box2) box2.innerHTML = document.getElementById('careBox').innerHTML;
        }
      } else if (combo === 'trackcare') {
        if (sub === 'tracker') {
          renderTrackerTab(pets, activeIdx, noPet);
          const tabs2 = document.getElementById('trackerPetTabs2');
          const box2 = document.getElementById('trackerBox2');
          if (tabs2) tabs2.innerHTML = document.getElementById('trackerPetTabs').innerHTML;
          if (box2) box2.innerHTML = document.getElementById('trackerBox').innerHTML;
        } else if (sub === 'reminders') {
          renderRemindersTab(pets, activeIdx, noPet);
          const tabs2 = document.getElementById('reminderPetTabs2');
          const box2 = document.getElementById('reminderBox2');
          if (tabs2) tabs2.innerHTML = document.getElementById('reminderPetTabs').innerHTML;
          if (box2) box2.innerHTML = document.getElementById('reminderBox').innerHTML;
        }
      } else if (combo === 'social') {
        if (sub === 'community') {
          const box = document.getElementById('comboInner-social-community');
          const tab = document.getElementById('communityTab');
          if (box && tab) {
            box.appendChild(tab);
            tab.classList.remove('hidden');
          }
          renderCommunity();
        } else if (sub === 'game') {
          const box = document.getElementById('comboInner-social-game');
          const tab = document.getElementById('gameTab');
          if (box && tab) {
            box.appendChild(tab);
            tab.classList.remove('hidden');
          }
          renderGameTab();
        } else if (sub === 'vision') {
          const box = document.getElementById('comboInner-social-vision');
          const tab = document.getElementById('visionTab');
          if (box && tab) {
            box.appendChild(tab);
            tab.classList.remove('hidden');
          }
          renderVisionHistory();
        }

      }
    }

    // ==================== AI CHAT ====================
    async function sendAIMessage() {
      const input = document.getElementById('aiInput');
      const text = input.value.trim();
      if (!text) return;
      addMessage(text, 'user-msg');
      input.value = '';

      const typingId = 'typing_' + Date.now();
      addMessageId('Thinking...', 'bot-msg typing-msg', typingId);

      const pets = getPets();
      const activeIdx = getActivePetIdx();
      const pet = pets[activeIdx];
      const log = getLog();
      const today = todayStr();
      const todayFed = pet ? log.filter(e => e.petIdx === activeIdx && e.type === 'fed' && e.timestamp.slice(0, 10) === today).length : 0;
      const streak = calculateStreak();

      let systemPrompt = `You are PawFeed AI, a friendly and knowledgeable pet care assistant. Give helpful, concise advice about pet feeding, nutrition, health, symptoms, and care. If the user describes any symptoms or food safety questions, prioritize the provided Grounding Reference Data to give accurate warnings and triage urgency (monitor, soon, or urgent ⚠️ with home care tips) and safety info. Keep responses under 130 words and conversational. Always be warm and encouraging.`;
      if (pet) {
        systemPrompt += ` The user's active pet is ${pet.name}, a ${pet.age}-year-old ${pet.breed} ${pet.type} weighing ${pet.weight}kg. Food preference: ${pet.foodPref}. Health notes: ${pet.health || 'healthy'}. Today's feedings logged: ${todayFed}. Current feeding streak: ${streak} days. Water goal: ${pet.waterGoal || 500}ml/day. Mood today: ${pet.moodToday || 'not logged'}. Reference this pet specifically when relevant.`;
        if (pet.breedTraits) {
          systemPrompt += ` Breed details: Typical weight range: ${pet.breedTraits.weight || 'unknown'}, Lifespan: ${pet.breedTraits.life_span || 'unknown'}.`;
        }
        const feedingCalc = calculateFeedingAmount(pet);
        if (feedingCalc) {
          systemPrompt += ` Calculated baseline nutrition needs: RER is ${feedingCalc.rer} kcal/day. Maintenance energy requirement is ${feedingCalc.calories} kcal/day (Recommended daily portions: ~${feedingCalc.dryGrams}g dry or ~${feedingCalc.wetGrams}g wet food). Recommended daily water intake is ${feedingCalc.waterNeeds}ml. Remember: always advise the user that these are baseline estimates and do not substitute for customized professional veterinary care.`;
        }
      }
      if (pets.length > 1) {
        systemPrompt += ` They also have ${pets.length - 1} other pet(s): ${pets.filter((_, i) => i !== activeIdx).map(p => p.name + ' the ' + p.type).join(', ')}.`;
      }
      const grounding = getGroundingContext(text, pet?.type);
      if (grounding) {
        systemPrompt += `\nGrounding Reference Data:\n${grounding}`;
      }

      async function attemptFetch() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          const response = await fetch(`${API_BASE_URL}/api/pawfeed-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt, userMessage: text }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            throw new Error(`HTTP status ${response.status}`);
          }
          return await response.json();
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      }

      let data;
      try {
        data = await attemptFetch();
      } catch (err) {
        console.warn('First fetch attempt failed, retrying once...', err);
        try {
          data = await attemptFetch();
        } catch (retryErr) {
          console.error('Retry attempt failed as well:', retryErr);
          document.getElementById(typingId)?.remove();
          
          let errorMsg = 'Sorry, I\'m having trouble connecting. Please check your connection and try again.';
          if (retryErr.name === 'AbortError') {
            errorMsg = 'Request timed out. Please try again.';
          }
          addMessage(errorMsg, 'bot-msg');
          return;
        }
      }

      const reply = data.reply || 'Sorry, I could not get a response. Please try again.';
      document.getElementById(typingId)?.remove();
      addMessage(reply, 'bot-msg');
    }
    function addMessage(text, cls) {
      const chat = document.getElementById('chatWindow');
      const msg = document.createElement('div');
      msg.className = 'msg ' + cls;
      msg.innerHTML = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
      chat.appendChild(msg);
      chat.scrollTop = chat.scrollHeight;
    }

    function addMessageId(text, cls, id) {
      const chat = document.getElementById('chatWindow');
      const msg = document.createElement('div');
      msg.className = 'msg ' + cls;
      msg.id = id;
      msg.innerText = text;
      chat.appendChild(msg);
      chat.scrollTop = chat.scrollHeight;
    }

    // Wire up log type change after DOM ready
    window.addEventListener('load', () => {
      const lt = document.getElementById('logType');
      if (lt) lt.addEventListener('change', updateLogTypeFields);
    });

    // ==================== ADVANCED MODULES STORAGE ====================
    function getCommunityPosts() {
      return pawCache.communityPosts || [];
    }

    async function saveCommunityPosts(posts) {
      pawCache.communityPosts = posts;
      localStorage.setItem('pawCommunityPosts', JSON.stringify(posts));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        for (let i = 0; i < posts.length; i++) {
          const post = posts[i];
          if (post.id && post.synced) continue;
          const { data, error } = await window.supabaseClient.from('community_posts').insert({
            user_id: userId,
            content: post.caption || post.content || '',
            image_url: post.image || post.image_url || null
          }).select('id').single();
          if (!error && data) {
            post.id = data.id;
            post.synced = true;
          }
        }
      } catch (err) {
        console.error("Error syncing community posts:", err);
      }
    }


    function getCart() {
      return pawCache.cart || [];
    }

    async function saveCart(cart) {
      pawCache.cart = cart;
      localStorage.setItem('pawCart', JSON.stringify(cart));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        await window.supabaseClient.from('cart_items').delete().eq('user_id', userId);
        if (cart.length > 0) {
          const rows = cart.map(item => ({
            user_id: userId,
            product_id: String(item.id || item.product_id),
            quantity: parseInt(item.quantity || 1)
          }));
          await window.supabaseClient.from('cart_items').insert(rows);
        }
      } catch (err) {
        console.error("Error syncing cart to Supabase:", err);
      }
    }

    function getScanHistory() {
      return pawCache.scanHistory || [];
    }

    async function saveScanHistory(items) {
      pawCache.scanHistory = items;
      localStorage.setItem('pawScanHistory', JSON.stringify(items));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        await window.supabaseClient.from('scan_history').delete().eq('user_id', userId);
        if (items.length > 0) {
          const rows = items.map(item => ({
            user_id: userId,
            result: item
          }));
          await window.supabaseClient.from('scan_history').insert(rows);
        }
      } catch (err) {
        console.error("Error syncing scan history:", err);
      }
    }

    // ==================== COMMUNITY / SOCIAL FEATURES ====================
    let activeFeedTab = 'all';
    let activeCommentsPostId = null;
    let replyParentId = null;

    function handleCommunityImage(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        selectedCommunityImage = e.target.result;
        document.getElementById('communityPhotoPreview').innerHTML = `<img class="feed-img" src="${selectedCommunityImage}" alt="community photo">`;
      };
      reader.readAsDataURL(file);
    }

    function addCommunityPost() {
      const type = document.getElementById('communityPostType').value;
      const caption = document.getElementById('communityCaption').value.trim();
      if (!caption && !selectedCommunityImage) { showToast('Add a caption or photo first'); return; }
      const user = getUser() || { name: 'Pet Parent' };
      const pets = getPets();
      const active = pets[getActivePetIdx()] || pets[0] || null;
      const posts = getCommunityPosts();
      const newPost = { id: Date.now(), type, caption, image: selectedCommunityImage, author: user.name || 'Pet Parent', petName: active ? active.name : 'Pet', petAvatar: active ? active.avatar : '', petIcon: active ? (PET_ICONS[active.type] || '🐾') : '🐾', likes: 0, date: new Date().toISOString() };
      posts.unshift(newPost);
      saveCommunityPosts(posts.slice(0, 60));
      selectedCommunityImage = '';
      document.getElementById('communityCaption').value = '';
      document.getElementById('communityPhotoPreview').innerHTML = '';
      document.getElementById('communityPhotoInput').value = '';
      showToast('Posted to community 👥');
      renderCommunity();
    }

    function deleteCommunityPost(id) {
      saveCommunityPosts(getCommunityPosts().filter(p => p.id !== id));
      renderCommunity(); showToast('Post removed');
    }

    function seedCommunityDemo() {
      const posts = getCommunityPosts();
      posts.unshift(
        { id: Date.now() + 1, type: 'recipe', caption: 'Homemade dog bowl: boiled rice + chicken + carrot. Avoid onion, garlic, salt and spices.', author: 'PawFeed Community', petName: 'Recipe Corner', petIcon: '🍲', likes: 8, date: new Date().toISOString() },
        { id: Date.now() + 2, type: 'tip', caption: 'Daily challenge: refill water bowl twice and log it in Tracker.', author: 'PawFeed Community', petName: 'Care Tip', petIcon: '💧', likes: 12, date: new Date().toISOString() }
      );
      saveCommunityPosts(posts.slice(0, 60)); renderCommunity(); showToast('Demo community posts added');
    }

    function switchFeedTab(tab) {
      activeFeedTab = tab;
      document.querySelectorAll('#communityTab .combo-sub-tab').forEach(el => el.classList.remove('active'));
      const activeEl = document.getElementById('feedTab-' + tab);
      if (activeEl) activeEl.classList.add('active');
      renderCommunity();
    }

    async function toggleReaction(postId, emoji) {
      if (!window.supabaseClient || !currentUser) {
        showToast('Please login to react to posts');
        return;
      }
      const userId = currentUser.id;
      
      // Optimistic update local cache
      if (!pawCache.reactions) pawCache.reactions = [];
      const existingIdx = pawCache.reactions.findIndex(r => r.post_id === postId && r.user_id === userId && r.emoji === emoji);
      
      if (existingIdx >= 0) {
        // Remove reaction
        const deletedReaction = pawCache.reactions.splice(existingIdx, 1)[0];
        renderCommunity();
        
        try {
          await window.supabaseClient.from('reactions')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', userId)
            .eq('emoji', emoji);
        } catch (err) {
          console.error("Error removing reaction:", err);
          pawCache.reactions.push(deletedReaction);
          renderCommunity();
        }
      } else {
        // Add reaction
        const newReaction = { post_id: postId, user_id: userId, emoji: emoji };
        pawCache.reactions.push(newReaction);
        renderCommunity();
        
        try {
          await window.supabaseClient.from('reactions').insert({
            post_id: postId,
            user_id: userId,
            emoji: emoji
          });
        } catch (err) {
          console.error("Error adding reaction:", err);
          const rollIdx = pawCache.reactions.findIndex(r => r.post_id === postId && r.user_id === userId && r.emoji === emoji);
          if (rollIdx >= 0) pawCache.reactions.splice(rollIdx, 1);
          renderCommunity();
        }
      }
    }

    function toggleComments(postId) {
      if (activeCommentsPostId === postId) {
        activeCommentsPostId = null;
      } else {
        activeCommentsPostId = postId;
        replyParentId = null;
      }
      renderCommunity();
    }

    async function postComment(postId) {
      const input = document.getElementById(`commentInput-${postId}`);
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      
      if (!window.supabaseClient || !currentUser) {
        showToast('Please login to comment');
        return;
      }
      const userId = currentUser.id;
      const userName = currentUser.user_metadata?.display_name || currentUser.email?.split('@')[0] || 'Pet Parent';
      
      try {
        const payload = {
          post_id: postId,
          user_id: userId,
          user_name: userName,
          text: text,
          parent_id: replyParentId
        };
        
        const { data, error } = await window.supabaseClient.from('comments').insert(payload).select('*').single();
        if (error) throw error;
        
        if (!pawCache.comments) pawCache.comments = [];
        pawCache.comments.push(data);
        
        input.value = '';
        replyParentId = null;
        renderCommunity();
        showToast('Comment posted! 💬');
      } catch (err) {
        console.error("Error posting comment:", err);
        showToast('Failed to post comment');
      }
    }

    function setCommentReply(parentId, userName, postId) {
      replyParentId = parentId;
      const input = document.getElementById(`commentInput-${postId}`);
      if (input) {
        input.placeholder = `Replying to @${userName}...`;
        input.focus();
      }
    }

    async function toggleFollow(followingId) {
      if (!window.supabaseClient || !currentUser) {
        showToast('Please login to follow users');
        return;
      }
      const userId = currentUser.id;
      if (userId === followingId) {
        showToast('You cannot follow yourself');
        return;
      }
      
      if (!pawCache.follows) pawCache.follows = [];
      const existingIdx = pawCache.follows.findIndex(f => f.follower_id === userId && f.following_id === followingId);
      
      if (existingIdx >= 0) {
        // Unfollow
        const deletedFollow = pawCache.follows.splice(existingIdx, 1)[0];
        renderCommunity();
        showToast('Unfollowed user');
        
        try {
          await window.supabaseClient.from('follows')
            .delete()
            .eq('follower_id', userId)
            .eq('following_id', followingId);
        } catch (err) {
          console.error("Error unfollowing:", err);
          pawCache.follows.push(deletedFollow);
          renderCommunity();
        }
      } else {
        // Follow
        const newFollow = { follower_id: userId, following_id: followingId };
        pawCache.follows.push(newFollow);
        renderCommunity();
        showToast('Following user! 👥');
        
        try {
          await window.supabaseClient.from('follows').insert({
            follower_id: userId,
            following_id: followingId
          });
        } catch (err) {
          console.error("Error following:", err);
          const rollIdx = pawCache.follows.findIndex(f => f.follower_id === userId && f.following_id === followingId);
          if (rollIdx >= 0) pawCache.follows.splice(rollIdx, 1);
          renderCommunity();
        }
      }
    }

    async function openPublicProfile(ownerId, petName) {
      if (!window.supabaseClient) return;
      
      const modal = document.getElementById('publicPetProfileScreen');
      const box = document.getElementById('publicProfileContent');
      if (!modal || !box) return;
      
      box.innerHTML = `<div class="empty-state" style="padding:40px 0;"><div class="loading-logo" style="margin:auto;font-size:32px;animation:spin 1s linear infinite">🐾</div><p style="margin-top:16px;">Loading profile...</p></div>`;
      modal.classList.remove('hidden');
      
      try {
        const { data: pets, error: petsErr } = await window.supabaseClient
          .from('pets')
          .select('*')
          .eq('user_id', ownerId)
          .eq('is_public', true);
          
        const { data: profile, error: profileErr } = await window.supabaseClient
          .from('user_profiles')
          .select('*')
          .eq('id', ownerId)
          .maybeSingle();
          
        const { data: posts, error: postsErr } = await window.supabaseClient
          .from('community_posts')
          .select('*')
          .eq('user_id', ownerId);

        if (petsErr || !pets || pets.length === 0) {
          box.innerHTML = `<div class="empty-state" style="padding:20px;"><p>This user has no public pet profiles available.</p></div>`;
          return;
        }
        
        const pet = pets[0];
        const follows = pawCache.follows || [];
        const isFollowing = follows.some(f => f.follower_id === currentUser?.id && f.following_id === ownerId);
        
        let postsHTML = '';
        if (posts && posts.length > 0) {
          postsHTML = posts.map(p => `
            <div style="background:var(--card-2);border-radius:12px;padding:12px;margin-top:8px;border:1px solid var(--border)">
              <p style="font-size:13px;line-height:1.4;margin:0">${escapeHtml(p.content || '')}</p>
              ${p.image_url ? `<img src="${p.image_url}" style="width:100%;border-radius:8px;margin-top:8px;max-height:150px;object-fit:cover;">` : ''}
              <div style="font-size:11px;color:var(--muted);margin-top:6px;">${new Date(p.created_at).toLocaleDateString()}</div>
            </div>
          `).join('');
        } else {
          postsHTML = `<p style="font-size:13px;color:var(--muted);font-style:italic">No recent posts</p>`;
        }
        
        const activePetIdx = getActivePetIdx();
        const activePet = getPets()[activePetIdx];
        const healthScore = activePet ? calculateHealthScore() : 80;

        box.innerHTML = `
          <div style="text-align:center;padding:12px 0;">
            <div class="feed-avatar" style="width:80px;height:80px;font-size:40px;margin:0 auto 12px;background:var(--pill-bg);color:var(--orange)">
              ${pet.avatar ? `<img src="${pet.avatar}" alt="pet" style="border-radius:50%">` : '🐾'}
            </div>
            <h2 style="font-weight:900;margin:0">${escapeHtml(pet.name)}</h2>
            <p style="font-size:14px;color:var(--muted);margin:4px 0 12px;">${escapeHtml(pet.breed || pet.species)} · ${pet.age} yrs · ${pet.weight} kg</p>
            
            <div style="display:flex;justify-content:center;gap:12px;margin-bottom:16px;">
              <div style="background:var(--pill-bg);padding:8px 14px;border-radius:12px;font-size:12px;font-weight:800;color:var(--pill-color)">
                🔥 7+ Days Streak
              </div>
              <div style="background:var(--success-bg);padding:8px 14px;border-radius:12px;font-size:12px;font-weight:800;color:var(--teal)">
                Health Score: ${healthScore}
              </div>
            </div>

            ${currentUser?.id !== ownerId ? `
              <button class="primary-btn" onclick="toggleFollow('${ownerId}'); closePublicProfile(); openPublicProfile('${ownerId}','${petName}');" style="margin-top:4px;width:100%;max-width:200px;">
                ${isFollowing ? '👤 Unfollow Owner' : '➕ Follow Owner'}
              </button>
            ` : '<p style="font-size:12px;color:var(--muted);font-style:italic">Your Public Profile</p>'}
          </div>
          
          <hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">
          <h4 style="font-weight:900;color:var(--dark);margin-bottom:8px">Post History</h4>
          <div style="max-height:220px;overflow-y:auto;padding-right:4px;">
            ${postsHTML}
          </div>
        `;
      } catch (err) {
        console.error("Error loading public profile:", err);
        box.innerHTML = `<div class="empty-state" style="padding:20px;"><p>Failed to load profile. Please try again.</p></div>`;
      }
    }

    function closePublicProfile() {
      const modal = document.getElementById('publicPetProfileScreen');
      if (modal) modal.classList.add('hidden');
    }

    function renderCommunity() {
      const box = document.getElementById('communityFeedBox'); if (!box) return;
      let posts = getCommunityPosts();
      const myUserId = currentUser?.id;
      
      // Filter following feed if selected
      if (activeFeedTab === 'following' && myUserId) {
        const follows = pawCache.follows || [];
        const followingUserIds = follows.filter(f => f.follower_id === myUserId).map(f => f.following_id);
        posts = posts.filter(p => followingUserIds.includes(p.user_id) || p.user_id === myUserId);
      }

      if (!posts.length) {
        box.innerHTML = `<div class="card empty-state"><h3>No community posts yet</h3><p>Share your first pet photo, recipe, or care tip.</p></div>`;
        return;
      }

      const follows = pawCache.follows || [];
      const followingUserIds = follows.filter(f => f.follower_id === myUserId).map(f => f.following_id);

      box.innerHTML = posts.map(p => {
        const isOwnPost = p.user_id === myUserId;
        const isFollowing = followingUserIds.includes(p.user_id);
        
        // Count reactions
        const postReactions = (pawCache.reactions || []).filter(r => r.post_id === p.id);
        const emojis = ['❤️', '🐾', '😂', '😮'];
        const reactionsHTML = emojis.map(emo => {
          const count = postReactions.filter(r => r.emoji === emo).length;
          const userReacted = postReactions.some(r => r.emoji === emo && r.user_id === myUserId);
          return `
            <button class="small-btn ${userReacted ? 'active-reaction' : ''}" 
              style="padding:6px 10px;font-size:12px;${userReacted ? 'border:1.5px solid var(--orange);background:var(--pill-bg);color:var(--orange)' : ''}" 
              onclick="toggleReaction(${p.id}, '${emo}')">
              ${emo} ${count}
            </button>
          `;
        }).join('');

        // Get comments count
        const postComments = (pawCache.comments || []).filter(c => c.post_id === p.id);
        const isCommentsExpanded = activeCommentsPostId === p.id;
        
        let commentsSectionHTML = '';
        if (isCommentsExpanded) {
          // Render comments list
          const topLevel = postComments.filter(c => !c.parent_id);
          const replies = postComments.filter(c => c.parent_id);
          
          let listHTML = '';
          if (topLevel.length === 0) {
            listHTML = `<p style="font-size:12px;color:var(--muted);font-style:italic;padding:8px 0;">No comments yet. Be the first!</p>`;
          } else {
            listHTML = topLevel.map(c => {
              const commentReplies = replies.filter(r => r.parent_id === c.id);
              const repliesHTML = commentReplies.map(r => `
                <div style="margin-left:24px;background:var(--card-2);padding:8px 12px;border-radius:12px;margin-top:6px;border:1px solid var(--border)">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <b style="font-size:12px;color:var(--dark)">@${escapeHtml(r.user_name)}</b>
                    <span style="font-size:10px;color:var(--muted)">${new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  <p style="font-size:12px;margin-top:2px;line-height:1.4">${escapeHtml(r.text)}</p>
                </div>
              `).join('');
              
              return `
                <div style="border-bottom:1px solid var(--border);padding:8px 0;">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <b style="font-size:13px;color:var(--dark)">@${escapeHtml(c.user_name)}</b>
                    <span style="font-size:11px;color:var(--muted)">${new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                  <p style="font-size:13px;margin-top:2px;line-height:1.4">${escapeHtml(c.text)}</p>
                  <div style="margin-top:4px;">
                    <span onclick="setCommentReply(${c.id}, '${escapeHtml(c.user_name)}', ${p.id})" style="font-size:11px;color:var(--orange);cursor:pointer;font-weight:700;">Reply</span>
                  </div>
                  ${repliesHTML}
                </div>
              `;
            }).join('');
          }
          
          commentsSectionHTML = `
            <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
              <h4 style="font-weight:900;margin:0 0 8px">Comments (${postComments.length})</h4>
              <div style="max-height:200px;overflow-y:auto;padding-right:4px;">
                ${listHTML}
              </div>
              <div style="display:flex;gap:8px;margin-top:10px">
                <input type="text" id="commentInput-${p.id}" placeholder="Write a comment..." 
                  style="flex:1;border-radius:12px;padding:8px 12px;border:1px solid var(--border);background:var(--card-2);color:var(--text);font-size:13px;" />
                <button class="small-btn" onclick="postComment(${p.id})" style="padding:8px 14px;">Post</button>
              </div>
            </div>
          `;
        }

        return `
        <div class="feed-card card">
          <div class="feed-head" style="display:flex;justify-content:space-between;align-items:center">
            <div style="display:flex;gap:10px;align-items:center" onclick="openPublicProfile('${p.user_id}', '${p.petName || 'Pet'}')">
              <div class="feed-avatar" style="width:40px;height:40px;font-size:20px;background:var(--pill-bg);color:var(--orange);display:flex;align-items:center;justify-content:center;cursor:pointer">
                ${p.petAvatar ? `<img src="${p.petAvatar}" alt="pet" style="border-radius:50%">` : (p.petIcon || '🐾')}
              </div>
              <div style="cursor:pointer">
                <b>${escapeHtml(p.author)}</b>
                <div style="font-size:11px;color:var(--muted)">${p.petName || 'Pet'} · ${new Date(p.date).toLocaleString()}</div>
              </div>
            </div>
            
            ${!isOwnPost && myUserId ? `
              <button class="small-btn" onclick="toggleFollow('${p.user_id}')" style="padding:6px 12px;font-size:11px;">
                ${isFollowing ? '👤 Following' : '➕ Follow'}
              </button>
            ` : ''}
          </div>
          
          <span class="recipe-chip" style="margin-top:8px">${p.type === 'recipe' ? '🍲 Community Recipe' : p.type === 'photo' ? '📷 Pet Photo' : '💡 Care Tip'}</span>
          <p style="font-size:14px;line-height:1.5;margin-top:8px">${escapeHtml(p.caption || '')}</p>
          ${p.image ? `<img class="feed-img" src="${p.image}" alt="community photo" style="width:100%;border-radius:16px;margin-top:8px;max-height:300px;object-fit:cover">` : ''}
          
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;flex-wrap:wrap;gap:8px">
            <div style="display:flex;gap:6px;">
              ${reactionsHTML}
            </div>
            <button class="small-btn" onclick="toggleComments(${p.id})" style="padding:6px 12px;font-size:12px;">
              💬 ${postComments.length} Comments
            </button>
          </div>
          
          ${commentsSectionHTML}
          
          ${isOwnPost ? `
            <div style="margin-top:8px;text-align:right">
              <span onclick="deleteCommunityPost(${p.id})" style="font-size:12px;color:#EF5350;cursor:pointer;font-weight:700">Delete Post</span>
            </div>
          ` : ''}
        </div>`;
      }).join('');
    }


    // ==================== MARKETPLACE FEATURES ====================
    function renderMarketplace() {
      const box = document.getElementById('marketProductsBox'); if (!box) return;
      const filter = document.getElementById('marketFilter') ? document.getElementById('marketFilter').value : 'All';
      const list = MARKET_PRODUCTS.filter(p => filter === 'All' || p.pet === filter || p.pet === 'All');
      box.innerHTML = list.map(p => `<div class="product-card"><div class="product-icon">${p.icon}</div><div class="product-info"><b>${p.name}</b><p style="font-size:12px;color:var(--muted);line-height:1.4">${p.desc}</p><div class="price">₹${p.price}</div></div><button class="small-btn" onclick="addToCart('${p.id}')">Add</button></div>`).join('');
      renderCart();
    }
    function addToCart(id) {
      const product = MARKET_PRODUCTS.find(p => p.id === id); if (!product) return;
      const cart = getCart();
      const item = cart.find(x => x.id === id);
      if (item) item.qty += 1; else cart.push({ ...product, qty: 1 });
      saveCart(cart); renderCart(); showToast(product.name + ' added 🛒');
    }
    function removeFromCart(id) { saveCart(getCart().filter(x => x.id !== id)); renderCart(); }
    function renderCart() {
      const box = document.getElementById('cartBox'); if (!box) return;
      const cart = getCart();
      if (!cart.length) { box.innerHTML = `<p style="font-size:13px;color:var(--muted);margin-top:8px">Cart is empty.</p>`; return; }
      const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
      box.innerHTML = cart.map(i => `<div class="history-item"><div class="history-icon">${i.icon}</div><div class="history-text"><b>${i.name}</b><span>Qty: ${i.qty} · ₹${i.price * i.qty}</span></div><button class="small-btn" onclick="removeFromCart('${i.id}')">✕</button></div>`).join('') + `<div class="divider"></div><b>Total: ₹${total}</b>`;
    }
    function getOrders() {
      return pawCache.orders || [];
    }

    async function saveOrders(orders) {
      pawCache.orders = orders;
      localStorage.setItem('pawOrders', JSON.stringify(orders));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        for (let i = 0; i < orders.length; i++) {
          const order = orders[i];
          const payload = {
            user_id: userId,
            date: order.date || new Date().toISOString(),
            items: order.items,
            total: parseFloat(order.total || 0)
          };
          const numericId = parseInt(order.id?.replace(/\D/g, ''));
          if (numericId && !isNaN(numericId)) {
            payload.id = numericId;
          }
          await window.supabaseClient.from('orders').upsert(payload);
        }
      } catch (err) {
        console.error("Error syncing orders to Supabase:", err);
      }
    }

    async function checkoutCart() {
      const cart = getCart(); if (!cart.length) { showToast('Cart is empty'); return; }
      const order = { id: 'PF' + Date.now(), items: cart, total: cart.reduce((s, i) => s + i.price * i.qty, 0), date: new Date().toISOString() };
      const orders = getOrders();
      orders.unshift(order);
      await saveOrders(orders);
      saveCart([]); renderMarketplace(); showToast('Demo order placed ✅');
    }

    // ==================== GAMIFICATION FEATURES ====================
    function getGameStats() {
      const log = getLog(); const pets = getPets(); const streak = calculateStreak();
      const feedings = log.filter(e => e.type === 'fed').length;
      const water = log.filter(e => e.type === 'water').length;
      const moods = log.filter(e => e.type === 'mood').length;
      const posts = getCommunityPosts().length;
      const scans = getScanHistory().length;
      const xp = feedings * 20 + water * 8 + moods * 10 + streak * 30 + posts * 15 + scans * 12;
      const level = Math.max(1, Math.floor(xp / 100) + 1);
      const score = Math.min(100, Math.round((feedings * 6 + water * 3 + moods * 4 + streak * 8 + scans * 2) / Math.max(1, pets.length || 1)));
      return { xp, level, score, streak, feedings, water, moods, posts, scans };
    }
    function completeChallenge(key, xp) {
      const doneKey = 'pawChallenge_' + todayStr() + '_' + key;
      const log = getLog();
      const alreadyDone = log.some(e => e.type === 'challenge' && e.timestamp.startsWith(todayStr()) && e.note.includes(key));
      if (alreadyDone || localStorage.getItem(doneKey)) { showToast('Already completed today'); return; }
      log.unshift({ id: Date.now(), type: 'challenge', note: 'Completed challenge: ' + key + ' (+' + xp + ' XP)', timestamp: new Date().toISOString(), petName: 'PawFeed', petIdx: -1 });
      saveLog(log); localStorage.setItem(doneKey, 'true'); renderGameTab(); showToast('Challenge completed +' + xp + ' XP 🏆');
    }
    function renderGameTab() {
      const box = document.getElementById('gameBox'); if (!box) return;
      const g = getGameStats(); const next = g.xp % 100;
      const badges = [
        ['🔥', 'Streak Starter', g.streak >= 2], ['🏆', '7-Day Hero', g.streak >= 7], ['🍽️', 'Food Logger', g.feedings >= 5], ['💧', 'Hydration Buddy', g.water >= 5], ['😊', 'Mood Friend', g.moods >= 3], ['👥', 'Community Star', g.posts >= 2], ['📷', 'Smart Scanner', g.scans >= 2], ['⭐', 'Care Pro', g.score >= 80], ['👑', 'Pet Champion', g.level >= 5]
      ];
      const leaderboard = getPets().map((p, i) => ({ name: p.name, icon: PET_ICONS[p.type] || '🐾', score: Math.min(100, g.score + (i * 3) % 9) })).sort((a, b) => b.score - a.score);
      box.innerHTML = `
    <div class="card"><h3 style="font-weight:900">Pet Care Level ${g.level}</h3><p style="font-size:13px;color:var(--muted)">Earn XP by feeding, logging water, posting, scanning, and completing challenges.</p><div class="progress-bar-wrap"><div class="progress-bar" style="width:${next}%"></div></div><small style="color:var(--muted)">${g.xp} XP total · ${100 - next} XP to next level</small></div>
    <div class="game-stat-grid"><div class="game-stat"><b>${g.streak}</b><span>Streak</span></div><div class="game-stat"><b>${g.xp}</b><span>XP</span></div><div class="game-stat"><b>${g.level}</b><span>Level</span></div><div class="game-stat"><b>${g.score}</b><span>Care Score</span></div></div>
    <h3 class="section-title">🎖️ Badges / Achievements</h3><div class="badge-grid">${badges.map(b => `<div class="achievement ${b[2] ? 'unlocked' : ''}"><span class="ach-icon">${b[0]}</span><b style="font-size:11px">${b[1]}</b></div>`).join('')}</div>
    <h3 class="section-title">🎯 Daily Challenges</h3>
    <div class="challenge-card"><div><b>Log one meal</b><p style="font-size:12px;color:var(--muted)">Reward: +25 XP</p></div><button class="small-btn" onclick="completeChallenge('meal',25)">Done</button></div>
    <div class="challenge-card"><div><b>Refill water</b><p style="font-size:12px;color:var(--muted)">Reward: +15 XP</p></div><button class="small-btn" onclick="completeChallenge('water',15)">Done</button></div>
    <div class="challenge-card"><div><b>Share a pet post</b><p style="font-size:12px;color:var(--muted)">Reward: +20 XP</p></div><button class="small-btn" onclick="openTab('community')">Post</button></div>
    <h3 class="section-title">📈 Care Score Leaderboard</h3>
    ${leaderboard.length ? leaderboard.map((p, i) => `<div class="leader-row"><div class="rank">${i + 1}</div><div style="font-size:22px">${p.icon}</div><div style="flex:1"><b>${p.name}</b><div class="progress-bar-wrap"><div class="progress-bar" style="width:${p.score}%"></div></div></div><b>${p.score}</b></div>`).join('') : `<div class="card empty-state"><h3>No pets yet</h3><p>Add pets to build a leaderboard.</p></div>`}
    <h3 class="section-title">🔥 Streaks & Milestones</h3>
    <div id="streaksDashboard"></div>
  `;
    }

    function compressImage(dataUrl, maxDim = 800) {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = dataUrl;
        img.onload = function () {
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = function () {
          resolve(dataUrl);
        };
      });
    }
    function handleVisionImage(event) {
      const file = event.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async function (e) {
        selectedVisionImage = await compressImage(e.target.result, 800);
        document.getElementById('visionPreview').innerHTML = `<img class="scan-preview" src="${selectedVisionImage}" alt="scan image">`;
      };
      reader.readAsDataURL(file);
    }
    async function runVisionScan() {
      const mode = document.getElementById('scanMode').value;
      const desc = (document.getElementById('scanDescription').value || '').trim();
      if (!selectedVisionImage && !desc) { showToast('Upload image or enter description'); return; }
      
      const pets = getPets();
      const active = pets[getActivePetIdx()] || pets[0] || {};
      
      let title = 'Smart Scan Result';
      let risk = 'safe';
      let result = 'Looks okay based on the scan.';
      let advice = 'For health issues, consult a veterinarian.';
      
      // If we have an image, query our backend multimodal Gemini API!
      if (selectedVisionImage) {
        try {
          const resData = await callAI('/api/vision-scan', {
            image: selectedVisionImage,
            mode: mode,
            description: desc,
            petType: active.type || 'Dog'
          });
          
          if (resData) {
            title = resData.title || title;
            risk = (resData.risk || risk).toLowerCase();
            result = resData.result || result;
            advice = resData.advice || advice;
          }
        } catch (err) {
          console.error("Error executing live vision scan, falling back to simulator:", err);
          showToast("AI Scan server busy. Running local simulation...");
          
          // Local fallback logic
          const unsafeWords = ['chocolate', 'grape', 'raisin', 'onion', 'garlic', 'alcohol', 'caffeine', 'xylitol', 'avocado', 'spicy', 'salt'];
          if (mode === 'food') {
            title = 'Food Safety Scan';
            const bad = unsafeWords.find(w => desc.toLowerCase().includes(w));
            if (bad) { risk = 'danger'; result = `Potential unsafe food detected: ${bad}.`; advice = 'Do not feed this item. Check the unsafe food guide and ask a vet if consumed.'; }
            else { risk = 'safe'; result = 'No obvious unsafe keyword detected in the description.'; advice = 'Still verify ingredients before feeding.'; }
          } else if (mode === 'breed') {
            title = 'Breed Detection'; risk = 'warn'; result = `Estimated pet type: ${active.type || 'Dog/Cat'}${active.breed ? ' · possible breed: ' + active.breed : ''}.`; advice = 'Breed estimate is based on your pet profile details.';
          } else if (mode === 'weight') {
            title = 'Body Weight Estimation'; risk = 'warn'; result = `Estimated weight range: ${active.weight ? (Math.max(0.5, Number(active.weight) - 1).toFixed(1) + '–' + (Number(active.weight) + 1).toFixed(1) + ' kg') : 'profile weight not available'}.`; advice = 'Use a scale for accurate weight tracking. Log the verified weight in Tracker.';
          } else if (mode === 'fur') {
            title = 'Skin / Fur Check';
            if (['red', 'rash', 'wound', 'patch', 'itch', 'hair loss', 'bald'].some(w => desc.toLowerCase().includes(w))) { risk = 'danger'; result = 'Possible skin/fur concern mentioned.'; advice = 'Monitor closely and consult a veterinarian if irritation, wounds, or hair loss continue.'; }
            else { risk = 'safe'; result = 'No obvious issue detected from the provided description.'; advice = 'Keep checking coat shine, itching, smell, and shedding.'; }
          }
        }
      } else {
        // Local simulation for text-only inputs
        const unsafeWords = ['chocolate', 'grape', 'raisin', 'onion', 'garlic', 'alcohol', 'caffeine', 'xylitol', 'avocado', 'spicy', 'salt'];
        if (mode === 'food') {
          title = 'Food Safety Scan';
          const bad = unsafeWords.find(w => desc.toLowerCase().includes(w));
          if (bad) { risk = 'danger'; result = `Potential unsafe food detected: ${bad}.`; advice = 'Do not feed this item. Check the unsafe food guide and ask a vet if consumed.'; }
          else { risk = 'safe'; result = 'No obvious unsafe keyword detected in the description.'; advice = 'Still verify ingredients before feeding.'; }
        } else if (mode === 'breed') {
          title = 'Breed Detection'; risk = 'warn'; result = `Estimated pet type: ${active.type || 'Dog/Cat'}${active.breed ? ' · possible breed: ' + active.breed : ''}.`; advice = 'Breed estimate is based on your pet profile details.';
        } else if (mode === 'weight') {
          title = 'Body Weight Estimation'; risk = 'warn'; result = `Estimated weight range: ${active.weight ? (Math.max(0.5, Number(active.weight) - 1).toFixed(1) + '–' + (Number(active.weight) + 1).toFixed(1) + ' kg') : 'profile weight not available'}.`; advice = 'Use a scale for accurate weight tracking. Log the verified weight in Tracker.';
        } else if (mode === 'fur') {
          title = 'Skin / Fur Check';
          if (['red', 'rash', 'wound', 'patch', 'itch', 'hair loss', 'bald'].some(w => desc.toLowerCase().includes(w))) { risk = 'danger'; result = 'Possible skin/fur concern mentioned.'; advice = 'Monitor closely and consult a veterinarian if irritation, wounds, or hair loss continue.'; }
          else { risk = 'safe'; result = 'No obvious issue detected from the provided description.'; advice = 'Keep checking coat shine, itching, smell, and shedding.'; }
        }
      }
      
      const cls = risk === 'danger' ? 'risk-danger' : risk === 'warn' ? 'risk-warn' : 'risk-safe';
      const html = `<div class="scan-result"><h3 style="font-weight:900">${title}</h3><span class="scan-risk ${cls}">${risk.toUpperCase()}</span><p style="font-size:14px;line-height:1.5;margin-top:8px"><b>Result:</b> ${result}</p><p style="font-size:13px;color:var(--muted);line-height:1.5"><b>Advice:</b> ${advice}</p></div>`;
      document.getElementById('visionResultBox').innerHTML = html;
      
      const hist = getScanHistory();
      hist.unshift({ id: Date.now(), mode, title, risk, result, advice, image: selectedVisionImage, date: new Date().toISOString() });
      saveScanHistory(hist.slice(0, 25));
      renderVisionHistory();
      renderGameTab();
    }
    function renderVisionHistory() {
      const box = document.getElementById('scanHistoryBox'); if (!box) return;
      const hist = getScanHistory();
      if (!hist.length) { box.innerHTML = `<div class="card empty-state"><h3>No scans yet</h3><p>Upload a photo to test the smart scan prototype.</p></div>`; return; }
      box.innerHTML = hist.map(h => `<div class="history-item"><div class="history-icon">${h.mode === 'food' ? '🥣' : h.mode === 'breed' ? '🐾' : h.mode === 'weight' ? '⚖️' : '🩺'}</div><div class="history-text"><b>${h.title}</b><span>${h.risk.toUpperCase()} · ${new Date(h.date).toLocaleString()}</span></div></div>`).join('');
    }
    function escapeHtml(str) { return String(str).replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s])); }


    // ==================== HOMEMADE FOOD PRO PAGE ====================
    const HOME_RECIPES = [
      { id: 'r1', title: 'Chicken Rice Comfort Bowl', pet: ['Dog', 'Cat'], type: 'Non-Veg', cat: 'Meal', time: 25, diff: 'Easy', cal: 340, protein: 32, fiber: 4, vit: 70, vet: true, budget: true, season: 'All season', ingredients: ['boiled chicken', 'rice', 'carrot', 'pumpkin'], steps: ['Boil chicken without salt, onion, garlic, or spices.', 'Cook rice until soft and easy to digest.', 'Steam carrot and pumpkin until tender.', 'Mix all ingredients, cool fully, and serve in measured portions.'] },
      { id: 'r2', title: 'Pumpkin Oats Digestive Meal', pet: ['Dog'], type: 'Veg', cat: 'Allergy', time: 18, diff: 'Easy', cal: 250, protein: 12, fiber: 8, vit: 82, vet: true, budget: true, season: 'Monsoon digestion', ingredients: ['pumpkin', 'oats', 'curd small amount', 'carrot'], steps: ['Cook oats in plain water.', 'Steam pumpkin and carrot.', 'Mix with a small spoon of plain curd if tolerated.', 'Serve fresh and store leftovers safely.'] },
      { id: 'r3', title: 'Fish Flake Protein Plate', pet: ['Cat', 'Fish'], type: 'Non-Veg', cat: 'Meal', time: 20, diff: 'Medium', cal: 290, protein: 36, fiber: 2, vit: 64, vet: true, budget: false, season: 'Winter protein', ingredients: ['boneless fish', 'rice water', 'peas small amount'], steps: ['Steam boneless fish fully.', 'Remove bones carefully.', 'Add a tiny amount of mashed peas for cats only.', 'Cool before serving. For aquarium fish, use tiny flakes only.'] },
      { id: 'r4', title: 'Rabbit Leafy Safe Bowl', pet: ['Rabbit'], type: 'Veg', cat: 'Meal', time: 8, diff: 'Easy', cal: 110, protein: 6, fiber: 14, vit: 88, vet: true, budget: true, season: 'Summer fresh', ingredients: ['romaine lettuce', 'coriander', 'carrot small amount', 'hay'], steps: ['Wash leaves well.', 'Chop into small pieces.', 'Add only a small carrot portion.', 'Serve with unlimited hay and clean water.'] },
      { id: 'r5', title: 'Bird Seed Fruit Treat', pet: ['Bird'], type: 'Veg', cat: 'Snack', time: 10, diff: 'Easy', cal: 95, protein: 7, fiber: 5, vit: 76, vet: false, budget: true, season: 'Summer treat', ingredients: ['millet', 'apple without seeds', 'carrot', 'boiled corn small amount'], steps: ['Remove all apple seeds.', 'Chop fruit and carrot very small.', 'Mix with millet.', 'Serve as a small treat, not full meal.'] },
      { id: 'r6', title: 'Emergency Egg Rice Mini Meal', pet: ['Dog', 'Cat'], type: 'Non-Veg', cat: 'Quick', time: 12, diff: 'Easy', cal: 220, protein: 18, fiber: 2, vit: 55, vet: false, budget: true, season: 'Emergency', ingredients: ['boiled egg', 'rice', 'water'], steps: ['Boil egg completely.', 'Cook soft rice.', 'Mash together with warm water.', 'Serve only as a quick temporary meal.'] },
      { id: 'r7', title: 'Budget Veg Protein Mix', pet: ['Dog'], type: 'Veg', cat: 'Budget', time: 22, diff: 'Easy', cal: 260, protein: 15, fiber: 7, vit: 69, vet: false, budget: true, season: 'Budget friendly', ingredients: ['rice', 'lentil water', 'pumpkin', 'beans small amount'], steps: ['Cook rice softly.', 'Use cooked lentil water, not spicy dal.', 'Steam pumpkin and beans.', 'Mix, cool, and serve in small portions.'] },
      { id: 'r8', title: 'Frozen Hydration Snack', pet: ['Dog'], type: 'Veg', cat: 'Seasonal', time: 5, diff: 'Easy', cal: 60, protein: 3, fiber: 3, vit: 60, vet: true, budget: true, season: 'Hot summer', ingredients: ['watermelon seedless', 'curd', 'water'], steps: ['Use seedless watermelon only.', 'Blend with plain curd and water.', 'Freeze in small cubes.', 'Give as an occasional cooling treat.'] }
    ];
    let activeRecipeId = null;
    let foodTimer = null;
    let timerSecondsLeft = 0;
    let timerTotalSeconds = 0;
    let timerIsPaused = true;
    let timerVoiceEnabled = true;
    let timerCurrentStage = 'prep';
    let recipeLimit = 15;

    function getRecipeStore() {
      return pawCache.recipes || { favorites: [], saved: [], recent: [], reviews: [], weekly: [], shopping: [], reactions: [] };
    }

    async function saveRecipeStore(st) {
      pawCache.recipes = st;
      localStorage.setItem('pawfeedRecipes', JSON.stringify(st));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        await window.supabaseClient.from('user_profiles').upsert({
          id: userId,
          recipe_store: st
        });
      } catch (err) {
        console.error("Error syncing recipe store:", err);
      }
    }

    function normalizeAndMergeDB() {
      if (!recipeDB || Object.keys(recipeDB).length === 0) return;
      const petKeys = {
        dog: 'Dog',
        cat: 'Cat',
        rabbit: 'Rabbit',
        parrot: 'Bird',
        fish: 'Fish'
      };
      const nonVegKeywords = ['chicken', 'beef', 'turkey', 'fish', 'meat', 'egg', 'salmon', 'pork', 'shrimp', 'lamb', 'duck', 'tuna', 'sardine', 'liver', 'krill', 'cod', 'prawn', 'crab', 'bacon', 'venison', 'bison', 'anchovy', 'mackerel', 'herring', 'shellfish', 'squid', 'octopus'];

      // Clear previous database entries
      const customRecipes = HOME_RECIPES.filter(r => !r.id.toString().startsWith('db_'));
      HOME_RECIPES.length = 0;
      HOME_RECIPES.push(...customRecipes);

      for (const key in recipeDB) {
        const petType = petKeys[key] || (key.charAt(0).toUpperCase() + key.slice(1));
        const list = recipeDB[key];
        if (!Array.isArray(list)) continue;

        list.forEach(r => {
          const ingredientsLower = (r.ingredients || []).map(i => i.toLowerCase());
          const isNonVeg = ingredientsLower.some(ing =>
            nonVegKeywords.some(keyword => ing.includes(keyword))
          );
          const type = isNonVeg ? 'Non-Veg' : 'Veg';

          let cat = 'Meal';
          const mType = (r.mealType || '').toLowerCase();
          if (mType.includes('snack') || mType.includes('treat')) {
            cat = 'Snack';
          } else if (mType.includes('quick') || mType.includes('emergency')) {
            cat = 'Quick';
          } else if (mType.includes('allergy')) {
            cat = 'Allergy';
          } else if (mType.includes('budget')) {
            cat = 'Budget';
          } else if (mType.includes('season')) {
            cat = 'Seasonal';
          }

          const time = parseInt(r.cookTime) || 15;
          const cal = parseInt(r.nutrition?.calories) || 100;
          const protein = parseInt(r.nutrition?.protein) || 10;
          const fiber = parseInt(r.nutrition?.fiber) || 2;
          const vit = Math.round(protein * 2 + fiber * 5) || 50;

          const normalized = {
            id: `db_${key}_${r.id}`,
            title: r.name,
            pet: [petType],
            type: type,
            cat: cat,
            time: time,
            diff: r.difficulty || 'Easy',
            cal: cal,
            protein: protein,
            fiber: fiber,
            vit: Math.min(95, Math.max(10, vit)),
            vet: !!r.vetTip,
            budget: true,
            season: 'All season',
            ingredients: r.ingredients || [],
            steps: r.steps || [],
            benefits: r.benefits || [],
            frequency: r.frequency || '1-2 times/week',
            vetTip: r.vetTip || '',
            nutritionObj: r.nutrition || {}
          };
          HOME_RECIPES.push(normalized);
        });
      }
      console.log("Recipes merged into HOME_RECIPES. Total:", HOME_RECIPES.length);
    }

    function renderHomemadeTab(keepLimit) {
      if (!keepLimit) recipeLimit = 15;
      const pets = getPets(); const activeIdx = getActivePetIdx(); const pet = pets[activeIdx] || null;
      const tabs = document.getElementById('homemadePetTabs'); if (!tabs) return;
      tabs.innerHTML = pets.length ? pets.map((p, i) => `<div class="pet-tab ${i === activeIdx ? 'active' : ''}" onclick="setActivePet(${i});renderHomemadeTab()">${p.avatar ? '<img src="' + p.avatar + '" style="width:18px;height:18px;border-radius:50%;vertical-align:middle;margin-right:4px">' : PET_ICONS[p.type]} ${p.name}</div>`).join('') : '<div class="pet-tab active">General Recipes</div>';
      const search = (document.getElementById('recipeSearch')?.value || '').toLowerCase();
      const cat = document.getElementById('recipeCategory')?.value || 'All'; const veg = document.getElementById('recipeVegFilter')?.value || 'All';
      const recipes = HOME_RECIPES.filter(r => (!pet || r.pet.includes(pet.type)) && (cat === 'All' || r.cat === cat) && (veg === 'All' || r.type === veg) && (r.title.toLowerCase().includes(search) || r.ingredients.join(' ').toLowerCase().includes(search)));
      renderHomemadeDashboard(pet, recipes); renderRecipeLibrary(recipes); renderRecipeMemory();
    }
    function renderHomemadeDashboard(pet, recipes) {
      const box = document.getElementById('homemadeDashboard'); if (!box) return;
      const weight = pet ? parseFloat(pet.weight || 5) : 5; const age = pet ? parseFloat(pet.age || 2) : 2; const condition = (pet?.health || 'healthy').toLowerCase();
      const meal = Math.max(40, Math.round(weight * 28)); const water = Math.round(weight * 55); const calories = Math.round(weight * 70 * (age < 1 ? 1.4 : age > 7 ? .85 : 1));
      const healthTip = condition.includes('obes') ? 'Use low-calorie pumpkin/oats recipes and reduce treats.' : condition.includes('allerg') ? 'Prefer single-protein allergy-friendly recipes and avoid new ingredients.' : condition.includes('dig') ? 'Choose soft rice, pumpkin, and small portions for digestion support.' : 'Balanced homemade meals with safe protein, fiber, vitamins, and fresh water.';
      box.innerHTML = `<div class="card"><h3 style="font-weight:900;color:var(--dark)">✨ Personalized Food Dashboard</h3><p class="subtitle" style="margin:5px 0">${pet ? `${pet.name} • ${pet.breed} ${pet.type} • ${pet.age} yrs • ${pet.weight} kg` : 'Add a pet profile for breed, age, weight, and health-based plans.'}</p><div class="nutrition-grid"><div class="nutrition-box"><b>${meal}g</b><span>Meal Qty</span></div><div class="nutrition-box"><b>${calories}</b><span>Calories/day</span></div><div class="nutrition-box"><b>${water}ml</b><span>Water/day</span></div><div class="nutrition-box"><b>${recipes.length}</b><span>Recipes</span></div></div><div class="list-item success"><span>🩺</span><div><b>Health Diet Recommendation</b><p>${healthTip}</p></div></div><div class="planner-grid"><div class="planner-day"><b>Morning</b>Fresh water + light meal</div><div class="planner-day"><b>Afternoon</b>Small portion / snack</div><div class="planner-day"><b>Evening</b>Main homemade meal</div><div class="planner-day"><b>Storage</b>Refrigerate cooked food, use within 48 hours</div></div></div><div id="weeklyPlanBox"></div><div id="calcResultBox"></div><div id="timerBox"></div>`;
    }
    function renderRecipeLibrary(recipes) {
      const box = document.getElementById('recipeLibraryBox'); if (!box) return;
      if (!recipes.length) { box.innerHTML = '<div class="empty-state"><h3>No matching recipes</h3><p>Try another search or filter.</p></div>'; return; }

      const displayed = recipes.slice(0, recipeLimit);
      let html = displayed.map(r => `<div class="recipe-card"><div class="recipe-top"><div><div class="recipe-title">${r.title}</div><div class="recipe-meta"><span class="recipe-badge ${r.vet ? 'vet-badge' : ''}">${r.vet ? '✅ Vet-approved badge' : 'Community recipe'}</span><span class="recipe-badge">${r.type}</span><span class="recipe-badge">${r.cat}</span><span class="recipe-badge">⏱️ ${r.time} min</span><span class="recipe-badge">${r.diff}</span></div></div><button class="small-btn" onclick="viewRecipe('${r.id}')">View</button></div><p style="font-size:13px;color:var(--muted);line-height:1.45">${r.ingredients.join(', ')}</p><div class="nutrition-grid"><div class="nutrition-box"><b>${r.cal}</b><span>Calories</span></div><div class="nutrition-box"><b>${r.protein}g</b><span>Protein</span></div><div class="nutrition-box"><b>${r.fiber}g</b><span>Fiber</span></div><div class="nutrition-box"><b>${r.vit}%</b><span>Vitamin</span></div></div><div id="recipeDetail_${r.id}"></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button class="small-btn" onclick="saveRecipe('${r.id}')">💾 Save</button><button class="small-btn" onclick="favoriteRecipe('${r.id}')">⭐ Favorite</button><button class="small-btn" onclick="completeMeal('${r.id}')">✅ Meal Done</button><button class="small-btn" onclick="shareRecipeCommunity('${r.id}')">👥 Share</button></div></div>`).join('');

      if (recipes.length > recipeLimit) {
        html += `<div style="text-align:center;margin-top:15px;margin-bottom:15px"><button class="primary-btn" onclick="loadMoreRecipes()" style="width:auto;padding:10px 24px">Load More Recipes (${recipes.length - recipeLimit} left)</button></div>`;
      }
      box.innerHTML = html;
    }
    function loadMoreRecipes() {
      recipeLimit += 15;
      renderHomemadeTab(true);
    }
    function viewRecipe(id) {
      const r = HOME_RECIPES.find(x => x.id === id);
      if (!r) return;
      activeRecipeId = id;
      const st = getRecipeStore();
      st.recent = [id, ...st.recent.filter(x => x !== id)].slice(0, 5);
      saveRecipeStore(st);
      const detail = document.getElementById('recipeDetail_' + id);

      let extraHtml = '';
      if (r.benefits && r.benefits.length > 0) {
        extraHtml += `<div class="list-item"><span>✨</span><div><b>Benefits</b><p>${r.benefits.join(', ')}</p></div></div>`;
      }
      if (r.frequency) {
        extraHtml += `<div class="list-item"><span>📅</span><div><b>Recommended Frequency</b><p>${r.frequency}</p></div></div>`;
      }
      if (r.vetTip) {
        extraHtml += `<div class="list-item danger"><span>🩺</span><div><b>Vet Tip</b><p>${r.vetTip}</p></div></div>`;
      }

      detail.innerHTML = `
        <ol class="step-list">${r.steps.map(s => `<li>${s}</li>`).join('')}</ol>
        ${extraHtml}
        <div class="list-item"><span>🧊</span><div><b>Food Storage Guide</b><p>Cool within 30 minutes. Store in airtight box. Refrigeration expiry: 48 hours. Freeze small portions for up to 2 weeks.</p></div></div>
        <div class="list-item"><span>🔁</span><div><b>Ingredient Substitutes</b><p>Chicken → egg/fish for non-veg pets. Rice → oats/pumpkin for sensitive stomach. Avoid salt, sugar, onion, garlic and spices.</p></div></div>
      `;
      renderRecipeMemory();
    }
    function saveRecipe(id) { const st = getRecipeStore(); if (!st.saved.includes(id)) st.saved.push(id); saveRecipeStore(st); showToast('Recipe saved 💾'); renderRecipeMemory(); }
    function favoriteRecipe(id) {
      if (typeof toggleRecipeFavorite === 'function') {
        toggleRecipeFavorite(id);
      } else {
        const st = getRecipeStore();
        st.favorites = st.favorites.includes(id) ? st.favorites.filter(x => x !== id) : [...st.favorites, id];
        saveRecipeStore(st);
        showToast('Favorite recipes updated ⭐');
        renderRecipeMemory();
      }
    }
    function renderRecipeMemory() {
      const st = getRecipeStore();
      const favs = typeof getRecipeFavorites === 'function' ? getRecipeFavorites() : (st.favorites || []);
      const box = document.getElementById('recipeMemoryBox');
      if (!box) return;
      const names = a => a.map(id => HOME_RECIPES.find(r => r.id === id)?.title).filter(Boolean).map(t => `<span class="recipe-chip" style="cursor:pointer" onclick="openRecipeDetailModal('${HOME_RECIPES.find(r => r.title === t || r.id === t)?.id}')">${t}</span>`).join('') || '<p class="subtitle" style="margin:0">Nothing yet.</p>';
      const success = st.reactions.filter(r => r.ok).length, total = st.reactions.length;
      box.innerHTML = `<div class="card"><b>⭐ Favorite Recipes</b><div>${names(favs)}</div><div class="divider"></div><b>💾 Saved Recipes</b><div>${names(st.saved)}</div><div class="divider"></div><b>👀 Recently Viewed</b><div>${names(st.recent)}</div><div class="divider"></div><b>📈 Feeding Success Rate</b><div class="progress-bar-wrap"><div class="progress-bar" style="width:${total ? Math.round(success / total * 100) : 0}%"></div></div><p class="subtitle" style="margin:0">${total ? Math.round(success / total * 100) : 0}% positive reactions from ${total} logged meals.</p></div>`;
    }
    function generateWeeklyPlan() {
      const pets = getPets(); const activeIdx = getActivePetIdx(); const pet = pets[activeIdx] || null;
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const filtered = HOME_RECIPES.filter(r => !pet || r.pet.includes(pet.type));
      const meals = filtered.length ? filtered : HOME_RECIPES;
      const html = `<div class="card"><h3 style="font-weight:900;color:var(--dark)">📅 AI Weekly Nutrition Plan</h3><div class="planner-grid">${days.map((d, i) => `<div class="planner-day"><b>${d}</b>${meals[i % meals.length].title}<br><small>Morning / Evening portions</small></div>`).join('')}</div></div>`;
      document.getElementById('weeklyPlanBox').innerHTML = html;
      showToast('Weekly meal planner ready 📅');
    }
    function generateShoppingList() {
      const pets = getPets(); const activeIdx = getActivePetIdx(); const pet = pets[activeIdx] || null;
      const filtered = HOME_RECIPES.filter(r => !pet || r.pet.includes(pet.type));
      const meals = filtered.length ? filtered : HOME_RECIPES;
      const items = [...new Set(meals.slice(0, 5).flatMap(r => r.ingredients))];
      document.getElementById('shoppingListBox').innerHTML = `<div class="card"><h3 style="font-weight:900;color:var(--dark)">🛒 Smart Shopping List</h3>${items.map(i => `<span class="recipe-chip">${i}</span>`).join('')}</div>`;
    }
    function checkUnsafeIngredient() { const val = prompt('Enter ingredient to check:'); if (!val) return; const pets = getPets(), pet = pets[getActivePetIdx()] || { type: 'Dog' }; const unsafe = (UNSAFE[pet.type] || []).join(' ').toLowerCase(); const bad = unsafe.includes(val.toLowerCase()); showToast(bad ? 'Unsafe for ' + pet.type + ' ⚠️' : 'Looks safe in small quantity ✅'); }
    function calculateMealAndWater() {
      const calcBox = document.getElementById('calcResultBox');
      if (!calcBox) return;

      // If already open, clicking again toggles it off
      if (calcBox.innerHTML && !calcBox.classList.contains('hidden-widget')) {
        calcBox.innerHTML = '';
        calcBox.classList.add('hidden-widget');
        return;
      }
      calcBox.classList.remove('hidden-widget');

      const pets = getPets();
      const activeIdx = getActivePetIdx();
      const activePet = pets[activeIdx] || { name: 'Custom Pet', type: 'Dog', weight: 10, activityLevel: 'Moderate' };

      renderMealCalculatorCard(activePet);
    }

    window.renderMealCalculatorCard = function(pet) {
      const calcBox = document.getElementById('calcResultBox');
      if (!calcBox) return;

      const name = pet.name || 'Pet';
      const weight = pet.weight || 10;
      const type = pet.type || 'Dog';
      const activity = pet.activityLevel || 'Moderate';

      // Default ratio is 50/50 mixed diet
      const selectedRatio = window.calculatorDietRatio || 'mixed';
      window.calculatorDietRatio = selectedRatio;

      calcBox.innerHTML = `
        <div class="calc-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 style="font-weight:900;color:var(--dark);margin:0">⚖️ Homemade Meal Calculator</h3>
            <button onclick="document.getElementById('calcResultBox').innerHTML='';document.getElementById('calcResultBox').classList.add('hidden-widget');" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;padding:4px">✕</button>
          </div>
          <p class="subtitle" style="margin-bottom:16px">Adjust parameters below to calculate feeding portion targets dynamically.</p>

          <div class="calc-input-grid">
            <div>
              <label style="margin:0 0 4px 0">Pet Species</label>
              <select id="calcPetType" onchange="updateMealCalculations()">
                <option value="Dog" ${type === 'Dog' ? 'selected' : ''}>Dog</option>
                <option value="Cat" ${type === 'Cat' ? 'selected' : ''}>Cat</option>
              </select>
            </div>
            <div>
              <label style="margin:0 0 4px 0">Activity Level</label>
              <select id="calcPetActivity" onchange="updateMealCalculations()">
                <option value="Sedentary" ${activity === 'Sedentary' ? 'selected' : ''}>Sedentary</option>
                <option value="Moderate" ${activity === 'Moderate' ? 'selected' : ''}>Moderate</option>
                <option value="Active" ${activity === 'Active' ? 'selected' : ''}>Active / High</option>
              </select>
            </div>
          </div>

          <div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <label style="margin:0">Weight (kg)</label>
              <b id="calcWeightVal" style="color:var(--dark)">${weight} kg</b>
            </div>
            <input type="range" id="calcPetWeight" min="0.5" max="80" step="0.5" value="${weight}" oninput="updateMealCalculations()" style="width:100%;accent-color:var(--orange);margin:0;padding:0;height:8px;" />
          </div>

          <label style="margin:0 0 4px 0">Diet Plan Ratio</label>
          <div class="calc-ratio-picker">
            <div class="ratio-btn ${selectedRatio === 'dry' ? 'active' : ''}" id="ratioDry" onclick="selectCalcDietRatio('dry')">100% Dry Food</div>
            <div class="ratio-btn ${selectedRatio === 'mixed' ? 'active' : ''}" id="ratioMixed" onclick="selectCalcDietRatio('mixed')">50/50 Mixed Diet</div>
            <div class="ratio-btn ${selectedRatio === 'wet' ? 'active' : ''}" id="ratioWet" onclick="selectCalcDietRatio('wet')">100% Wet Food</div>
          </div>

          <div id="calcOutputsContainer"></div>
        </div>
      `;

      updateMealCalculations();
    }

    window.selectCalcDietRatio = function(ratio) {
      window.calculatorDietRatio = ratio;
      document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
      if (ratio === 'dry') document.getElementById('ratioDry').classList.add('active');
      if (ratio === 'mixed') document.getElementById('ratioMixed').classList.add('active');
      if (ratio === 'wet') document.getElementById('ratioWet').classList.add('active');
      updateMealCalculations();
    }

    window.updateMealCalculations = function() {
      const typeSelect = document.getElementById('calcPetType');
      const actSelect = document.getElementById('calcPetActivity');
      const weightSlider = document.getElementById('calcPetWeight');
      const weightLabel = document.getElementById('calcWeightVal');

      if (!typeSelect || !actSelect || !weightSlider) return;

      const type = typeSelect.value;
      const activity = actSelect.value;
      const weight = parseFloat(weightSlider.value);
      if (weightLabel) weightLabel.textContent = weight + ' kg';

      // Re-run formula calculations
      const petMock = { type, activityLevel: activity, weight };
      const calc = calculateFeedingAmount(petMock);
      if (!calc) return;

      const ratio = window.calculatorDietRatio || 'mixed';
      let foodBreakdownHTML = '';

      if (ratio === 'dry') {
        foodBreakdownHTML = `
          <div class="calc-box" style="grid-column: span 2">
            <b>~${calc.dryGrams}g</b>
            <span>Recommended Dry Food / Day</span>
          </div>
        `;
      } else if (ratio === 'wet') {
        foodBreakdownHTML = `
          <div class="calc-box" style="grid-column: span 2">
            <b>~${calc.wetGrams}g</b>
            <span>Recommended Wet Food / Day</span>
          </div>
        `;
      } else {
        const dryHalf = Math.round(calc.dryGrams / 2);
        const wetHalf = Math.round(calc.wetGrams / 2);
        foodBreakdownHTML = `
          <div class="calc-box">
            <b>~${dryHalf}g</b>
            <span>Dry Food Portion</span>
          </div>
          <div class="calc-box">
            <b>~${wetHalf}g</b>
            <span>Wet Food Portion</span>
          </div>
        `;
      }

      document.getElementById('calcOutputsContainer').innerHTML = `
        <div class="calc-results-grid">
          <div class="calc-box">
            <b>${calc.calories} kcal</b>
            <span>Daily Caloric Goal</span>
          </div>
          <div class="calc-box">
            <b>${calc.waterNeeds} ml</b>
            <span>Daily Water Needs</span>
          </div>
          ${foodBreakdownHTML}
        </div>
        <p class="calc-disclaimer">${calc.disclaimer}</p>
      `;
    }

    // Voice announcer helper
    function announceTimerStage(text) {
      if (!timerVoiceEnabled) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.0;
        window.speechSynthesis.speak(u);
      } catch (e) {
        console.error("Speech synthesis failed:", e);
      }
    }

    function startFoodTimer() {
      const timerBox = document.getElementById('timerBox');
      if (!timerBox) return;

      // If already open, clicking again toggles it off
      if (timerBox.innerHTML && !timerBox.classList.contains('hidden-widget')) {
        clearInterval(foodTimer);
        timerBox.innerHTML = '';
        timerBox.classList.add('hidden-widget');
        return;
      }
      timerBox.classList.remove('hidden-widget');

      renderTimerCard();
    }

    window.renderTimerCard = function() {
      const timerBox = document.getElementById('timerBox');
      if (!timerBox) return;

      timerBox.innerHTML = `
        <div class="timer-card">
          <div class="timer-header">
            <h3 style="font-weight:900;color:var(--dark);margin:0">⏲️ Cooking & Prep Timer</h3>
            <div style="display:flex;align-items:center;gap:10px">
              <label style="margin:0;cursor:pointer;font-size:12px;font-weight:800;color:var(--muted);display:flex;align-items:center;gap:4px">
                <input type="checkbox" id="voiceToggle" ${timerVoiceEnabled ? 'checked' : ''} onchange="toggleTimerVoice()" style="width:14px;height:14px;vertical-align:middle;margin:0" />Voice
              </label>
              <button onclick="closeCookingTimer()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;padding:4px">✕</button>
            </div>
          </div>

          <div class="stage-selector">
            <div class="stage-chip ${timerCurrentStage === 'prep' ? 'active' : ''}" id="chipPrep" onclick="setTimerStage('prep', 180)">1. Prep / Chop (3m)</div>
            <div class="stage-chip ${timerCurrentStage === 'cook' ? 'active' : ''}" id="chipCook" onclick="setTimerStage('cook', 900)">2. Simmer / Cook (15m)</div>
            <div class="stage-chip ${timerCurrentStage === 'cool' ? 'active' : ''}" id="chipCool" onclick="setTimerStage('cool', 600)">3. Cool Down (10m)</div>
            <div class="stage-chip ${timerCurrentStage === 'custom' ? 'active' : ''}" id="chipCustom" onclick="promptCustomTimer()">4. Custom Time</div>
          </div>

          <div class="timer-circle-wrap">
            <div class="timer-display" id="timerValueDisplay">03:00</div>
          </div>

          <div class="timer-progress-bar-wrap">
            <div class="timer-progress-bar" id="timerProgressBar" style="width: 100%"></div>
          </div>

          <div class="timer-controls">
            <button class="timer-btn timer-btn-primary" id="timerPlayPauseBtn" onclick="toggleTimerPlay()">Start</button>
            <button class="timer-btn timer-btn-secondary" onclick="resetTimerStage()">Reset</button>
          </div>
        </div>
      `;

      // Set initial state
      if (timerSecondsLeft <= 0) {
        setTimerStage('prep', 180);
      } else {
        updateTimerDisplay();
      }
    }

    window.toggleTimerVoice = function() {
      const chk = document.getElementById('voiceToggle');
      if (chk) timerVoiceEnabled = chk.checked;
    }

    window.closeCookingTimer = function() {
      clearInterval(foodTimer);
      timerIsPaused = true;
      const timerBox = document.getElementById('timerBox');
      if (timerBox) {
        timerBox.innerHTML = '';
        timerBox.classList.add('hidden-widget');
      }
    }

    window.setTimerStage = function(stage, seconds) {
      clearInterval(foodTimer);
      timerIsPaused = true;
      timerCurrentStage = stage;
      timerTotalSeconds = seconds;
      timerSecondsLeft = seconds;

      document.querySelectorAll('.stage-chip').forEach(c => c.classList.remove('active'));
      if (stage === 'prep') document.getElementById('chipPrep').classList.add('active');
      if (stage === 'cook') document.getElementById('chipCook').classList.add('active');
      if (stage === 'cool') document.getElementById('chipCool').classList.add('active');
      if (stage === 'custom') document.getElementById('chipCustom').classList.add('active');

      const playBtn = document.getElementById('timerPlayPauseBtn');
      if (playBtn) {
        playBtn.textContent = 'Start';
        playBtn.classList.remove('timer-btn-danger');
        playBtn.classList.add('timer-btn-primary');
      }

      updateTimerDisplay();
    }

    window.promptCustomTimer = function() {
      const minStr = prompt("Enter custom timer duration in minutes:", "5");
      if (!minStr) return;
      const min = parseInt(minStr);
      if (isNaN(min) || min <= 0) {
        showToast("Invalid duration!");
        return;
      }
      setTimerStage('custom', min * 60);
    }

    window.updateTimerDisplay = function() {
      const val = document.getElementById('timerValueDisplay');
      const progress = document.getElementById('timerProgressBar');

      if (!val) return;

      const m = Math.floor(timerSecondsLeft / 60);
      const s = timerSecondsLeft % 60;
      val.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      if (progress && timerTotalSeconds > 0) {
        const pct = (timerSecondsLeft / timerTotalSeconds) * 100;
        progress.style.width = pct + '%';
      }
    }

    window.toggleTimerPlay = function() {
      const btn = document.getElementById('timerPlayPauseBtn');
      if (!btn) return;

      if (timerIsPaused) {
        // Start/Resume
        timerIsPaused = false;
        btn.textContent = 'Pause';
        btn.classList.add('timer-btn-danger');
        btn.classList.remove('timer-btn-primary');

        // Announce stage starting
        if (timerSecondsLeft === timerTotalSeconds) {
          if (timerCurrentStage === 'prep') {
            announceTimerStage("Preparation timer started. Please chop and wash your ingredients. Make sure they are pet-friendly, like carrots and pumpkin.");
          } else if (timerCurrentStage === 'cook') {
            announceTimerStage("Cooking timer started. Simmer the food on low heat without spices, salt, or oil.");
          } else if (timerCurrentStage === 'cool') {
            announceTimerStage("Cooling timer started. Let the food cool down completely before serving to prevent burns.");
          } else {
            announceTimerStage("Custom cooking timer started.");
          }
        } else {
          announceTimerStage("Timer resumed.");
        }

        foodTimer = setInterval(() => {
          if (timerSecondsLeft > 0) {
            timerSecondsLeft--;
            updateTimerDisplay();

            // Give a 1-minute warning
            if (timerSecondsLeft === 60) {
              announceTimerStage("One minute left.");
            }
          } else {
            clearInterval(foodTimer);
            timerIsPaused = true;
            btn.textContent = 'Start';
            btn.classList.remove('timer-btn-danger');
            btn.classList.add('timer-btn-primary');

            // Complete announcements
            if (timerCurrentStage === 'prep') {
              announceTimerStage("Preparation finished. You are ready to start cooking!");
            } else if (timerCurrentStage === 'cook') {
              announceTimerStage("Cooking finished. Remember to cool the food down before serving.");
            } else if (timerCurrentStage === 'cool') {
              announceTimerStage("Cooling finished. The food is now safe to serve to your pets.");
            } else {
              announceTimerStage("Custom timer finished.");
            }

            showNotification('Homemade food timer finished.');
            showToast('Timer finished! ⏲️');
          }
        }, 1000);
      } else {
        // Pause
        timerIsPaused = true;
        btn.textContent = 'Resume';
        btn.classList.remove('timer-btn-danger');
        btn.classList.add('timer-btn-primary');
        clearInterval(foodTimer);
        announceTimerStage("Timer paused.");
      }
    }

    window.resetTimerStage = function() {
      clearInterval(foodTimer);
      timerIsPaused = true;
      timerSecondsLeft = timerTotalSeconds;

      const btn = document.getElementById('timerPlayPauseBtn');
      if (btn) {
        btn.textContent = 'Start';
        btn.classList.remove('timer-btn-danger');
        btn.classList.add('timer-btn-primary');
      }

      updateTimerDisplay();
      announceTimerStage("Timer reset.");
    }
    async function askFoodAssistant() {
      const input = document.getElementById('foodAIInput');
      const q = input.value.trim();
      if (!q) return;
      
      input.value = '';
      const replyBox = document.getElementById('foodAIReply');
      replyBox.innerHTML = `<div class="msg bot-msg typing-msg" style="max-width:100%">Thinking...</div>`;

      const pets = getPets();
      const activeIdx = getActivePetIdx();
      const pet = pets[activeIdx];

      let systemPrompt = `You are PawFeed AI Food Assistant. You specialize in pet food recipes, safe ingredients, ingredient substitutions, meal planning, and nutrition. Leverage the Grounding Reference Data provided to warn about any toxic ingredients or highlight safe guidelines. Give helpful, concise advice. Keep responses under 130 words.`;
      if (pet) {
        systemPrompt += ` The user's active pet is ${pet.name}, a ${pet.age}-year-old ${pet.breed} ${pet.type} weighing ${pet.weight}kg. Food preference: ${pet.foodPref}. Health notes: ${pet.health || 'healthy'}. Reference this pet specifically when relevant.`;
        if (pet.breedTraits) {
          systemPrompt += ` Breed details: Typical weight range: ${pet.breedTraits.weight || 'unknown'}, Lifespan: ${pet.breedTraits.life_span || 'unknown'}.`;
        }
        const feedingCalc = calculateFeedingAmount(pet);
        if (feedingCalc) {
          systemPrompt += ` Calculated baseline nutrition needs: RER is ${feedingCalc.rer} kcal/day. Maintenance energy requirement is ${feedingCalc.calories} kcal/day (Recommended portions: ~${feedingCalc.dryGrams}g dry or ~${feedingCalc.wetGrams}g wet food). Recommended water intake is ${feedingCalc.waterNeeds}ml/day. Remember: always advise the user that these are baseline estimates and do not substitute for customized professional veterinary care.`;
        }
      }
      const grounding = getGroundingContext(q, pet?.type);
      if (grounding) {
        systemPrompt += `\nGrounding Reference Data:\n${grounding}`;
      }

      async function attemptFetch() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(`${API_BASE_URL}/api/pawfeed-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt, userMessage: q }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error(`HTTP status ${response.status}`);
          return await response.json();
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      }

      try {
        let data = await attemptFetch();
        const reply = data && data.reply ? data.reply : 'Sorry, I encountered an error. Please try again.';
        replyBox.innerHTML = `<div class="msg bot-msg" style="max-width:100%">${reply}</div>`;
      } catch (err) {
        console.warn('[Food Assistant] First fetch failed, retrying once...', err);
        try {
          let data = await attemptFetch();
          const reply = data && data.reply ? data.reply : 'Sorry, I encountered an error. Please try again.';
          replyBox.innerHTML = `<div class="msg bot-msg" style="max-width:100%">${reply}</div>`;
        } catch (retryErr) {
          console.error('[Food Assistant] Retry failed:', retryErr);
          replyBox.innerHTML = `<div class="msg bot-msg" style="max-width:100%;background:rgba(255,0,0,0.1);color:#d93025">⚠️ Service unavailable. Please check your internet connection or try again.</div>`;
        }
      }
    }
    function handleFoodPhoto(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const preview = document.getElementById('foodPhotoPreview'); if (preview) preview.innerHTML = `<img src="${reader.result}" class="food-preview-img"><div class="photo-analysis"><b>AI Food Quality Analysis</b><p style="font-size:13px;color:var(--muted);line-height:1.45">Food looks fresh. Check that it has no onion, garlic, salt, masala, chocolate or bones. Serve only after cooling.</p></div>` }; reader.readAsDataURL(file); }
    function saveFoodReaction() { const st = getRecipeStore(); const el = document.getElementById('foodReaction'); const reaction = el ? el.value : '😄 Loved it'; st.reactions.unshift({ reaction, ok: reaction.includes('Loved') || reaction.includes('normally'), time: new Date().toISOString() }); saveRecipeStore(st); showToast('Meal reaction saved 😊'); renderRecipeMemory(); }
    function completeMeal(id) {
      saveRecipe(id);
      const el = document.getElementById('foodReaction');
      if (el) el.value = '😄 Loved it';
      saveFoodReaction();
      // Auto stock deduction for completed meals
      if (typeof deductStockAutomatically === 'function') {
        const r = typeof HOME_RECIPES !== 'undefined' ? HOME_RECIPES.find(x => x.id === id) : null;
        deductStockAutomatically(r ? r.title : 'recipe food', 'food');
      }
    }
    function seedRecipeReviews() { showToast('Recipe ratings & reviews added ⭐'); const box = document.getElementById('recipeLibraryBox'); box.insertAdjacentHTML('afterbegin', '<div class="card success"><b>⭐ Community Reviews</b><p class="subtitle" style="margin:5px 0 0">Chicken Rice Bowl: 4.8/5 • Easy digestion • Pets loved it.</p></div>'); }
    function shareRecipeCommunity(id) {
      const r = HOME_RECIPES.find(x => x.id === id);
      if (!r) return;
      const user = getUser() || { name: 'Pet Parent' };
      const pets = getPets();
      const active = pets[getActivePetIdx()] || pets[0] || null;
      const posts = getCommunityPosts();
      posts.unshift({
        id: Date.now(),
        type: 'recipe',
        caption: `Shared homemade recipe: ${r.title}. Ingredients: ${r.ingredients.join(', ')}`,
        author: user.name || 'Pet Parent',
        petName: active ? active.name : 'Pet',
        petAvatar: active ? active.avatar : '',
        petIcon: active ? (PET_ICONS[active.type] || '🐾') : '🐾',
        likes: 0,
        date: new Date().toISOString()
      });
      saveCommunityPosts(posts.slice(0, 60));
      showToast('Recipe shared to community 👥');
    }

    // ==================== MOOD TRACKER ====================
    function getMoodLog() {
      return pawCache.moodLog || [];
    }

    async function saveMoodLog(d) {
      pawCache.moodLog = d;
      localStorage.setItem('pawMoodLog', JSON.stringify(d));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        await window.supabaseClient.from('mood_logs').delete().eq('user_id', userId);
        if (d.length > 0) {
          const rows = d.map(item => {
            const petId = pawCache.pets[item.petIdx]?.id || null;
            return {
              user_id: userId,
              pet_id: petId,
              date: item.date,
              label: item.label
            };
          });
          await window.supabaseClient.from('mood_logs').insert(rows);
        }
      } catch (err) {
        console.error("Error syncing mood log to Supabase:", err);
      }
    }
    function logMood(emoji, label) {
      const pets = getPets(); const idx = getActivePetIdx();
      const pet = pets[idx]; if (!pet) { showToast('Add a pet first'); return; }
      const log = getMoodLog();
      log.unshift({ petIdx: idx, petName: pet.name, emoji, label, date: todayStr(), ts: new Date().toISOString() });
      saveMoodLog(log.slice(0, 120));
      document.querySelectorAll('.mood-emoji-btn').forEach(b => b.classList.remove('selected'));
      document.querySelector(`[data-mood="${label}"]`)?.classList.add('selected');
      showToast(`${emoji} ${pet.name}'s mood logged as ${label}!`);
      renderMoodTab();
    }
    function renderMoodTab() {
      const pets = getPets(); const idx = getActivePetIdx();
      const sel = document.getElementById('moodPetSelect');
      if (sel) sel.innerHTML = pets.map((p, i) => `<div class="pet-tab ${i === idx ? 'active' : ''}" onclick="setActivePet(${i});renderMoodTab()">${PET_ICONS[p.type] || '🐾'} ${p.name}</div>`).join('');
      const log = getMoodLog().filter(m => m.petIdx === idx);
      const box = document.getElementById('moodHistoryBox'); if (!box) return;
      if (!log.length) { box.innerHTML = '<div class="card empty-state"><h3>No moods logged yet</h3><p>Tap an emoji above to log today\'s mood.</p></div>'; return; }
      const MOOD_COLOR = { Happy: '#B5EAD7', Tired: '#FFF5B7', Sick: '#FFCCE0', Playful: '#a855f7', Sad: '#3b82f6' };
      box.innerHTML = `<div class="card"><b>📅 Mood History</b><div style="margin-top:10px">${log.slice(0, 14).map(m => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)"><span style="font-size:22px">${m.emoji}</span><span style="font-weight:700;color:${MOOD_COLOR[m.label] || 'var(--text)'}">${m.label}</span><span style="font-size:12px;color:var(--muted)">${m.date}</span></div>`).join('')}</div></div>`;
    }

    // ==================== MEDICATION ====================
    function getMeds() {
      return pawCache.meds || [];
    }

    async function saveMeds(d) {
      pawCache.meds = d;
      localStorage.setItem('pawMeds', JSON.stringify(d));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        const { data: dbMeds } = await window.supabaseClient.from('meds').select('id').eq('user_id', userId);
        if (dbMeds) {
          const activeIds = d.map(item => item.id).filter(id => typeof id === 'number' && id < 10000000000);
          const deletedIds = dbMeds.filter(m => !activeIds.includes(m.id)).map(m => m.id);
          if (deletedIds.length > 0) {
            await window.supabaseClient.from('meds').delete().in('id', deletedIds);
          }
        }
        for (let i = 0; i < d.length; i++) {
          const item = d[i];
          const payload = {
            user_id: userId,
            name: item.name,
            dosage: item.dose || '',
            frequency: item.time || '',
            next_due: item.time ? new Date().toISOString().slice(0, 10) + 'T' + item.time : null
          };
          if (item.id && typeof item.id === 'number' && item.id < 10000000000) {
            payload.id = item.id;
          }
          const { data, error } = await window.supabaseClient.from('meds').upsert(payload).select('id').single();
          if (!error && data) item.id = data.id;
        }
      } catch (err) {
        console.error("Error syncing meds to Supabase:", err);
      }
    }
    function addMed() {
      const name = document.getElementById('medName').value.trim();
      const dose = document.getElementById('medDose').value.trim();
      const time = document.getElementById('medTime').value;
      const notes = document.getElementById('medNotes').value.trim();
      if (!name) { showToast('Enter medicine name'); return; }
      const pets = getPets(); const idx = getActivePetIdx();
      const pet = pets[idx];
      const meds = getMeds();
      meds.unshift({ id: Date.now(), petIdx: idx, petName: pet?.name || 'General', name, dose, time, notes, active: true });
      saveMeds(meds);
      ['medName', 'medDose', 'medNotes'].forEach(id => document.getElementById(id).value = '');
      showToast('💊 Medication added!');
      renderMedTab();
    }
    function deleteMed(id) { saveMeds(getMeds().filter(m => m.id !== id)); renderMedTab(); showToast('Removed'); }
    function renderMedTab() {
      const meds = getMeds(); const box = document.getElementById('medListBox'); if (!box) return;
      if (!meds.length) { box.innerHTML = '<div class="card empty-state"><h3>No medications yet</h3><p>Add a medicine above to start tracking.</p></div>'; return; }
      box.innerHTML = meds.map(m => `<div class="card" style="display:flex;justify-content:space-between;align-items:flex-start">
    <div><div style="font-size:16px;font-weight:900;color:var(--dark)">💊 ${m.name}</div>
    <div style="font-size:13px;color:var(--muted);margin-top:3px">${m.petName} · ${m.dose || '—'} · ${m.time || 'No time set'}</div>
    ${m.notes ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${m.notes}</div>` : ''}
    </div><button onclick="deleteMed(${m.id})" style="background:var(--danger-bg);color:#d64040;border:none;border-radius:10px;padding:6px 10px;font-size:12px;cursor:pointer;font-weight:800">✕</button></div>`).join('');
    }

    // ==================== VET LOG ====================
    function getVetLog() {
      return pawCache.vetLog || [];
    }

    async function saveVetLog(d) {
      pawCache.vetLog = d;
      localStorage.setItem('pawVetLog', JSON.stringify(d));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        await window.supabaseClient.from('vet_logs').delete().eq('user_id', userId);
        if (d.length > 0) {
          const rows = d.map(item => {
            const petId = pawCache.pets[item.petIdx]?.id || null;
            return {
              user_id: userId,
              pet_id: petId,
              date: item.date,
              clinic: item.clinic || '',
              notes: (item.reason || '') + (item.notes ? '\n' + item.notes : '')
            };
          });
          await window.supabaseClient.from('vet_logs').insert(rows);
        }
      } catch (err) {
        console.error("Error syncing vet logs to Supabase:", err);
      }
    }
    function addVetVisit() {
      const date = document.getElementById('vetDate').value;
      const clinic = document.getElementById('vetClinic').value.trim();
      const reason = document.getElementById('vetReason').value.trim();
      const next = document.getElementById('vetNext').value;
      const notes = document.getElementById('vetNotes').value.trim();
      if (!date || !reason) { showToast('Enter date and reason'); return; }
      const pets = getPets(); const idx = getActivePetIdx();
      const log = getVetLog();
      log.unshift({ id: Date.now(), petIdx: idx, petName: pets[idx]?.name || 'General', date, clinic, reason, next, notes });
      saveVetLog(log);
      ['vetDate', 'vetClinic', 'vetReason', 'vetNext', 'vetNotes'].forEach(id => document.getElementById(id).value = '');
      showToast('🩺 Vet visit logged!');
      renderVetTab();
    }
    function deleteVet(id) { saveVetLog(getVetLog().filter(v => v.id !== id)); renderVetTab(); showToast('Removed'); }
    function renderVetTab() {
      const log = getVetLog(); const box = document.getElementById('vetListBox'); if (!box) return;
      if (!log.length) { box.innerHTML = '<div class="card empty-state"><h3>No vet visits yet</h3><p>Log your first visit above.</p></div>'; return; }
      const today = new Date();
      box.innerHTML = log.map(v => {
        const upcoming = v.next && new Date(v.next) >= today;
        const daysUntil = v.next ? Math.ceil((new Date(v.next) - today) / (1000 * 60 * 60 * 24)) : null;
        return `<div class="card"><div style="display:flex;justify-content:space-between"><div><div style="font-weight:900;color:var(--dark)">🏥 ${v.reason}</div><div style="font-size:13px;color:var(--muted);margin-top:2px">${v.petName} · ${v.clinic || 'Clinic not noted'} · ${v.date}</div>${v.notes ? `<div style="font-size:12px;color:var(--muted);margin-top:3px">${v.notes}</div>` : ''}</div><button onclick="deleteVet(${v.id})" style="background:var(--danger-bg);color:#d64040;border:none;border-radius:10px;padding:6px 10px;font-size:12px;cursor:pointer;font-weight:800;flex-shrink:0">✕</button></div>${upcoming ? `<div style="margin-top:10px;padding:8px 12px;background:rgba(0,0,0,0.05);border-radius:12px;font-size:13px;font-weight:700;color:var(--orange)">⏰ Next visit: ${v.next} (${daysUntil} day${daysUntil !== 1 ? 's' : ''} away)</div>` : ''}</div>`;
      }).join('');
    }

    // ==================== SLEEP TRACKER ====================
    function getSleepLog() {
      return pawCache.sleepLog || [];
    }

    async function saveSleepLog(d) {
      pawCache.sleepLog = d;
      localStorage.setItem('pawSleepLog', JSON.stringify(d));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        await window.supabaseClient.from('sleep_logs').delete().eq('user_id', userId);
        if (d.length > 0) {
          const rows = d.map(item => {
            const petId = pawCache.pets[item.petIdx]?.id || null;
            return {
              user_id: userId,
              pet_id: petId,
              date: item.date,
              hours: parseFloat(item.hours || 0),
              quality: item.quality || 'Good'
            };
          });
          await window.supabaseClient.from('sleep_logs').insert(rows);
        }
      } catch (err) {
        console.error("Error syncing sleep log to Supabase:", err);
      }
    }
    function logSleep() {
      const hours = document.getElementById('sleepHours').value;
      const quality = document.getElementById('sleepQuality').value;
      const notes = document.getElementById('sleepNotes').value.trim();
      const pets = getPets(); const idx = getActivePetIdx();
      const pet = pets[idx];
      const log = getSleepLog();
      log.unshift({ id: Date.now(), petIdx: idx, petName: pet?.name || 'General', hours: parseFloat(hours), quality, notes, date: todayStr() });
      saveSleepLog(log.slice(0, 90));
      showToast(`🌙 ${hours}h sleep logged!`);
      renderSleepTab();
    }
    function renderSleepTab() {
      const pets = getPets(); const idx = getActivePetIdx();
      const log = getSleepLog().filter(s => s.petIdx === idx);
      const box = document.getElementById('sleepHistoryBox'); if (!box) return;
      const QUALITY_COLOR = { Excellent: '#B5EAD7', Good: '#A8D8EA', Normal: '#FFF5B7', Restless: '#f97316', Poor: '#FFCCE0' };
      const IDEAL = { Dog: 12, Cat: 15, Rabbit: 8, Bird: 10, Fish: 0 };
      const pet = pets[idx];
      const idealHrs = pet ? (IDEAL[pet.type] || 12) : 12;
      if (!log.length) { box.innerHTML = '<div class="card empty-state"><h3>No sleep logged yet</h3><p>Use the slider above to log today\'s sleep.</p></div>'; return; }
      const avg = (log.slice(0, 7).reduce((a, b) => a + b.hours, 0) / Math.min(log.length, 7)).toFixed(1);
      box.innerHTML = `<div class="card"><div style="display:flex;justify-content:space-between;margin-bottom:10px"><div><b>7-day Average</b><div style="font-size:24px;font-weight:900;color:var(--orange)">${avg}h</div></div><div style="text-align:right"><b>Ideal for ${pet?.type || 'pet'}</b><div style="font-size:24px;font-weight:900;color:var(--green)">${idealHrs}h</div></div></div>${log.slice(0, 10).map(s => `<div class="weight-log-item"><span style="font-weight:700">${s.date}</span><span style="color:${QUALITY_COLOR[s.quality] || 'var(--text)'};font-weight:800">${s.hours}h · ${s.quality}</span></div>`).join('')}</div>`;
    }

    // ==================== GALLERY ====================
    function getGallery(petIdx) {
      if (!pawCache.gallery) pawCache.gallery = {};
      return pawCache.gallery[petIdx] || [];
    }

    async function saveGallery(petIdx, d) {
      if (!pawCache.gallery) pawCache.gallery = {};
      pawCache.gallery[petIdx] = d;
      localStorage.setItem('pawGallery_' + petIdx, JSON.stringify(d));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      const petId = pawCache.pets[petIdx]?.id || null;
      if (!petId) return;
      try {
        await window.supabaseClient.from('pet_gallery').delete().eq('user_id', userId).eq('pet_id', petId);
        if (d.length > 0) {
          const rows = d.map(item => ({
            user_id: userId,
            pet_id: petId,
            image_url: item.image,
            created_at: item.time || new Date().toISOString()
          }));
          await window.supabaseClient.from('pet_gallery').insert(rows);
        }
      } catch (err) {
        console.error("Error syncing gallery to Supabase:", err);
      }
    }
    function handleGalleryUpload(e) {
      const files = Array.from(e.target.files);
      const idx = getActivePetIdx();
      const gallery = getGallery(idx);
      let count = 0;
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
          gallery.unshift({ id: Date.now() + count++, src: ev.target.result, date: todayStr() });
          saveGallery(idx, gallery.slice(0, 30));
          renderGalleryTab();
        };
        reader.readAsDataURL(file);
      });
    }
    function deletePhoto(petIdx, id) {
      saveGallery(petIdx, getGallery(petIdx).filter(p => p.id !== id));
      renderGalleryTab(); showToast('Photo removed');
    }
    function renderGalleryTab() {
      const pets = getPets(); const idx = getActivePetIdx();
      const sel = document.getElementById('galleryPetSelect');
      if (sel) sel.innerHTML = pets.map((p, i) => `<div class="pet-tab ${i === idx ? 'active' : ''}" onclick="setActivePet(${i});renderGalleryTab()">${PET_ICONS[p.type] || '🐾'} ${p.name}</div>`).join('');
      const gallery = getGallery(idx);
      const grid = document.getElementById('photoGrid'); if (!grid) return;
      if (!gallery.length) { grid.innerHTML = '<div style="grid-column:span 3;text-align:center;padding:30px;color:var(--muted);font-weight:700">No photos yet. Upload one above! 📷</div>'; return; }
      grid.innerHTML = gallery.map(p => `<div style="position:relative"><img src="${p.src}" class="photo-thumb" /><div onclick="deletePhoto(${idx},${p.id})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.55);color:white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;font-weight:800">✕</div></div>`).join('');
    }

    // ==================== BIRTHDAY ====================
    function renderBirthdayTab() {
      const pets = getPets(); const box = document.getElementById('birthdayCards'); if (!box) return;
      if (!pets.length) { box.innerHTML = '<div class="card empty-state"><h3>No pets added yet</h3></div>'; return; }
      const now = new Date();
      box.innerHTML = pets.map(pet => {
        const age = parseFloat(pet.age) || 1;
        const approxBirth = new Date(now.getFullYear() - Math.floor(age), now.getMonth(), now.getDate());
        const nextBday = new Date(now.getFullYear(), approxBirth.getMonth(), approxBirth.getDate());
        if (nextBday < now) nextBday.setFullYear(nextBday.getFullYear() + 1);
        const days = Math.ceil((nextBday - now) / (1000 * 60 * 60 * 24));
        const turnsAge = Math.floor(age) + 1;
        return `<div class="birthday-card"><div class="birthday-icon">${PET_ICONS[pet.type] || '🐾'}</div><div><div style="font-size:18px;font-weight:900">${pet.name}</div><div class="birthday-lbl">${pet.breed} ${pet.type} · Turning ${turnsAge}</div><div style="display:flex;align-items:baseline;gap:6px;margin-top:6px"><span class="birthday-days">${days === 0 ? '🎉' : days}</span><span class="birthday-lbl">${days === 0 ? 'Happy Birthday!' : days === 1 ? 'day away!' : 'days away!'}</span></div></div></div>`;
      }).join('');
    }

    // ==================== WEIGHT CHART ====================
    function getWeightHistory(petIdx) {
      if (!pawCache.weightHistory) pawCache.weightHistory = {};
      return pawCache.weightHistory[petIdx] || [];
    }

    async function saveWeightHistory(petIdx, d) {
      if (!pawCache.weightHistory) pawCache.weightHistory = {};
      pawCache.weightHistory[petIdx] = d;
      localStorage.setItem('pawWeightHistory_' + petIdx, JSON.stringify(d));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      const petId = pawCache.pets[petIdx]?.id || null;
      if (!petId) return;
      try {
        await window.supabaseClient.from('weight_history').delete().eq('user_id', userId).eq('pet_id', petId);
        if (d.length > 0) {
          const rows = d.map(item => ({
            user_id: userId,
            pet_id: petId,
            date: item.date,
            weight: parseFloat(item.weight || 0)
          }));
          await window.supabaseClient.from('weight_history').insert(rows);
        }
      } catch (err) {
        console.error("Error syncing weight history to Supabase:", err);
      }
    }
    function logWeight() {
      const val = parseFloat(document.getElementById('weightInput').value);
      if (isNaN(val) || val <= 0) { showToast('Enter a valid weight'); return; }
      const idx = getActivePetIdx(); const pets = getPets();
      const history = getWeightHistory(idx);
      history.push({ date: todayStr(), weight: val });
      saveWeightHistory(idx, history.slice(-30));
      // Also update pet profile weight
      const pet = pets[idx]; if (pet) { pet.weight = val; pets[idx] = pet; localStorage.setItem('pawPets', JSON.stringify(pets)); }
      document.getElementById('weightInput').value = '';
      showToast(`⚖️ ${val}kg logged!`);
      renderWeightChartTab();
    }
    function renderWeightChartTab() {
      const pets = getPets(); const idx = getActivePetIdx();
      const sel = document.getElementById('weightChartPetSelect');
      if (sel) sel.innerHTML = pets.map((p, i) => `<div class="pet-tab ${i === idx ? 'active' : ''}" onclick="setActivePet(${i});renderWeightChartTab()">${PET_ICONS[p.type] || '🐾'} ${p.name}</div>`).join('');
      const history = getWeightHistory(idx);
      const list = document.getElementById('weightHistoryList');
      const canvas = document.getElementById('weightChart');
      if (!canvas) return;
      if (history.length < 2) {
        canvas.style.display = 'none';
        if (list) list.innerHTML = `<div class="card empty-state"><h3>Not enough data</h3><p>Log at least 2 weights to see the chart.</p></div>`;
        return;
      }
      canvas.style.display = 'block';
      const ctx = canvas.getContext('2d');
      canvas.width = canvas.parentElement.offsetWidth - 24;
      const W = canvas.width, H = 200, PAD = 36;
      const weights = history.map(h => h.weight);
      const minW = Math.min(...weights) - 0.5, maxW = Math.max(...weights) + 0.5;
      const pts = history.map((h, i) => ({
        x: PAD + (i / (history.length - 1)) * (W - PAD * 2),
        y: H - PAD - ((h.weight - minW) / (maxW - minW)) * (H - PAD * 2)
      }));
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const bg = isDark ? '#1a2535' : '#ffffff', text = isDark ? '#cdd9e5' : '#2b3a47', muted = isDark ? '#7a92a8' : '#7a8d9a';
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // Grid lines
      ctx.strokeStyle = isDark ? '#253445' : '#f0e4d0'; ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { const y = PAD + (i / 4) * (H - PAD * 2); ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke(); }
      // Line
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#FFD5A8'); grad.addColorStop(1, '#FFCCE0');
      ctx.strokeStyle = grad; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.stroke();
      // Fill under
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts[pts.length - 1].x, H - PAD); ctx.lineTo(pts[0].x, H - PAD); ctx.closePath();
      const fillGrad = ctx.createLinearGradient(0, 0, 0, H);
      fillGrad.addColorStop(0, 'rgba(255,159,67,0.25)'); fillGrad.addColorStop(1, 'rgba(255,159,67,0)');
      ctx.fillStyle = fillGrad; ctx.fill();
      // Dots + labels
      pts.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFD5A8'; ctx.fill();
        ctx.strokeStyle = bg; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = text; ctx.font = 'bold 10px Nunito,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(history[i].weight + 'kg', p.x, p.y - 10);
      });
      // X labels (show every nth)
      ctx.fillStyle = muted; ctx.font = '10px Nunito,sans-serif';
      const step = Math.max(1, Math.floor(history.length / 5));
      pts.forEach((p, i) => { if (i % step === 0 || i === history.length - 1) { const d = history[i].date.slice(5); ctx.fillText(d, p.x, H - 8); } });
      if (list) list.innerHTML = `<div class="card" style="margin-top:8px"><b>📋 Weight Log</b>${history.slice().reverse().slice(0, 8).map(h => `<div class="weight-log-item"><span style="font-weight:700">${h.date}</span><span style="font-weight:900;color:var(--orange)">${h.weight} kg</span></div>`).join('')}</div>`;
    }



    // ==================== WEEKLY AI SUMMARY ====================
    async function generateWeeklySummary() {
      const box = document.getElementById('weeklySummaryBox'); if (!box) return;
      box.innerHTML = '<div class="card" style="text-align:center;padding:30px"><div style="font-size:32px;animation:spin 1s linear infinite">⚙️</div><p style="margin-top:12px;color:var(--muted);font-weight:700">Generating your weekly summary...</p></div>';
      const pets = getPets(); const idx = getActivePetIdx(); const pet = pets[idx];
      const log = getLog(); const moodLog = getMoodLog(); const sleepLog = getSleepLog();
      const days7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().slice(0, 10); });
      const fedCount = log.filter(e => e.type === 'fed' && days7.includes(e.timestamp?.slice(0, 10))).length;
      const moods7 = moodLog.filter(m => m.petIdx === idx && days7.includes(m.date)).map(m => m.label).join(', ') || 'not logged';
      const sleep7 = sleepLog.filter(s => s.petIdx === idx && days7.includes(s.date)).map(s => `${s.hours}h(${s.quality})`).join(', ') || 'not logged';
      const weight = pet?.weight ? pet.weight + 'kg' : 'not logged';

      const feedingCalc = pet ? calculateFeedingAmount(pet) : null;
      let feedingGuide = '';
      if (feedingCalc) {
        feedingGuide = `Daily caloric target: ${feedingCalc.calories} kcal/day (recommended daily portions: ~${feedingCalc.dryGrams}g dry or ~${feedingCalc.wetGrams}g wet food). Recommended daily water: ${feedingCalc.waterNeeds}ml.`;
      }

      const promptText = `You are PawFeed AI generating a friendly weekly health summary.

Pet: ${pet ? `${pet.name}, ${pet.age}yr ${pet.breed} ${pet.type}, ${weight}` : 'Unknown'}
Nutritional Target Guidelines: ${feedingGuide || 'none'}

Last 7 days:
Feedings logged: ${fedCount}
Moods: ${moods7}
Sleep: ${sleep7}

Write:
1. Overall assessment
2. Feeding summary (compare actual feedings logged with the target guidelines above)
3. Mood trend
4. Sleep notes
5. One actionable tip

Use emojis and keep under 150 words.`;

      async function attemptFetch() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          const response = await fetch(`${API_BASE_URL}/api/pawfeed-weekly-summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ promptText }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            throw new Error(`HTTP status ${response.status}`);
          }
          return await response.json();
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      }

      let data;
      try {
        data = await attemptFetch();
      } catch (err) {
        console.warn('First weekly summary fetch failed, retrying once...', err);
        try {
          data = await attemptFetch();
        } catch (retryErr) {
          console.error('Weekly summary retry failed:', retryErr);
          let errorMsg = 'Could not generate summary. Check your internet connection and try again.';
          if (retryErr.name === 'AbortError') {
            errorMsg = 'Could not generate summary. Request timed out.';
          }
          box.innerHTML = errorMsg;
          return;
        }
      }

      const reply = data.reply || 'Could not generate summary.';
      box.innerHTML = `
<div class="card">
  <h3 style="font-weight:900;color:var(--dark);margin-bottom:10px">
    📊 ${pet?.name || 'Your pet'}'s Week in Review
  </h3>
  <p style="line-height:1.7;font-size:14px;color:var(--text)">
    ${reply.replace(/\n/g, '<br>')}
  </p>
</div>`;
    }
    // ==================== STREAKS & MILESTONES ====================
    function renderStreaksTab() {
      const boxes = document.querySelectorAll('#streaksDashboard'); if (!boxes.length) return;
      const streak = calculateStreak();
      const log = getLog();
      const totalFeedings = log.filter(e => e.type === 'fed').length;
      const totalWater = log.filter(e => e.type === 'water').length;
      const MILESTONES = [
        { days: 1, label: 'First Feed!', icon: '🌱', desc: 'Logged your first feeding' },
        { days: 3, label: '3-Day Streak', icon: '⚡', desc: '3 days of consistent care' },
        { days: 7, label: 'One Week!', icon: '🔥', desc: 'A full week of dedication' },
        { days: 14, label: 'Two Weeks!', icon: '💪', desc: 'Incredible consistency' },
        { days: 30, label: 'Monthly Champion', icon: '🏅', desc: '30 days — you\'re amazing!' },
        { days: 60, label: 'Streak Legend', icon: '👑', desc: '60 days of perfect care' },
        { days: 100, label: 'Century Club', icon: '🏆', desc: '100 days — hall of fame!' },
      ];
      const feedMilestones = [
        { count: 10, icon: '🍽️', label: '10 Feedings' },
        { count: 50, icon: '🌟', label: '50 Feedings' },
        { count: 100, icon: '💫', label: '100 Feedings' },
        { count: 500, icon: '🎯', label: '500 Feedings' },
      ];
      boxes.forEach(box => box.innerHTML = `
    <div class="card" style="background: #FFD5A8;color:white;border:none">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="font-size:52px">🔥</div>
        <div><div style="font-size:36px;font-weight:900;line-height:1">${streak}</div><div style="font-size:14px;opacity:0.9;font-weight:700">Day${streak !== 1 ? 's' : ''} Feeding Streak</div></div>
      </div>
      <div style="display:flex;gap:16px;margin-top:14px">
        <div style="text-align:center"><div style="font-size:22px;font-weight:900">${totalFeedings}</div><div style="font-size:11px;opacity:0.85">Total Feedings</div></div>
        <div style="text-align:center"><div style="font-size:22px;font-weight:900">${totalWater}</div><div style="font-size:11px;opacity:0.85">Water Logs</div></div>
      </div>
    </div>
    <h3 class="section-title">🏅 Streak Milestones</h3>
    ${MILESTONES.map(m => {
        const earned = streak >= m.days;
        return `<div class="milestone-card ${earned ? 'milestone-earned' : ''}">
        <div class="milestone-icon" style="${earned ? '' : 'filter:grayscale(1);opacity:0.4'}">${m.icon}</div>
        <div style="flex:1"><div style="font-weight:900;color:var(--dark)">${m.label}${earned ? ' ✓' : ''}</div><div style="font-size:12px;color:var(--muted)">${m.desc} · ${m.days} days</div></div>
        ${earned ? '<span style="color:var(--orange);font-weight:900;font-size:12px">Earned!</span>' : '<span style="font-size:12px;color:var(--muted)">${m.days - streak} to go</span>'}
      </div>`;
      }).join('')}
    <h3 class="section-title">🍽️ Feeding Milestones</h3>
    ${feedMilestones.map(m => {
        const earned = totalFeedings >= m.count;
        return `<div class="milestone-card ${earned ? 'milestone-earned' : ''}">
        <div class="milestone-icon" style="${earned ? '' : 'filter:grayscale(1);opacity:0.4'}">${m.icon}</div>
        <div style="flex:1"><div style="font-weight:900;color:var(--dark)">${m.label}${earned ? ' ✓' : ''}</div><div style="font-size:12px;color:var(--muted)">${totalFeedings}/${m.count} feedings</div></div>
        ${earned ? '<span style="color:var(--orange);font-weight:900;font-size:12px">Earned!</span>' : '<span style="font-size:12px;color:var(--muted)">${m.count-totalFeedings} more</span>'}
      </div>`;
      }).join('')}
  `);
    }
    let calYear, calMonth, calSelectedDate;

    function initCalendar() {
      const now = new Date();
      calYear = now.getFullYear();
      calMonth = now.getMonth();
      calSelectedDate = now.toDateString();
      renderCalendar();
    }

    function toggleCalendar() {
      const cal = document.getElementById('calendarDropdown');
      if (!cal) return;
      if (cal.style.display === 'none') {
        if (!calYear) initCalendar();
        renderCalendar();
        cal.style.display = '';
        // close when clicking outside
        setTimeout(() => document.addEventListener('click', calOutsideClick), 10);
      } else {
        cal.style.display = 'none';
        document.removeEventListener('click', calOutsideClick);
      }
    }

    function calOutsideClick(e) {
      const cal = document.getElementById('calendarDropdown');
      const btn = document.getElementById('calendarBtn');
      if (cal && !cal.contains(e.target) && e.target !== btn) {
        cal.style.display = 'none';
        document.removeEventListener('click', calOutsideClick);
      }
    }

    function calNav(dir) {
      calMonth += dir;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendar();
    }

    function calGoToday() {
      const now = new Date();
      calYear = now.getFullYear();
      calMonth = now.getMonth();
      calSelectedDate = now.toDateString();
      renderCalendar();
      showCalSelectedInfo(now);
    }

    function renderCalendar() {
      const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      document.getElementById('calMonthLabel').textContent = MONTHS[calMonth] + ' ' + calYear;

      const grid = document.getElementById('calGrid');
      const firstDay = new Date(calYear, calMonth, 1).getDay();
      const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
      const today = new Date();
      const log = getLog ? getLog() : [];

      let cells = '';
      // Empty cells before first day
      for (let i = 0; i < firstDay; i++) {
        cells += `<div style="padding:5px"></div>`;
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(calYear, calMonth, d);
        const dateStr = date.toDateString();
        const isToday = date.toDateString() === today.toDateString();
        const isSelected = dateStr === calSelectedDate;
        const dateISO = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        // Check if any feeding logged this day
        const hasFed = log.some(e => e.timestamp && e.timestamp.slice(0, 10) === dateISO && e.type === 'fed');
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;

        let bg = 'transparent', color = isWeekend ? '#9060D0' : 'var(--text)', border = 'none', shadow = '';
        if (isSelected) { bg = '#D4BBFF'; color = '#4A1A8A'; shadow = '0 4px 10px rgba(212,187,255,0.4)'; }
        else if (isToday) { bg = '#B5EAD7'; color = '#1A6A4A'; border = '2px solid #B5EAD7'; }

        cells += `<div onclick="calSelectDay(${d})" style="
      text-align:center;padding:6px 2px;border-radius:10px;cursor:pointer;
      background:${bg};color:${color};border:${border};
      font-size:13px;font-weight:${isToday || isSelected ? '900' : '700'};
      box-shadow:${shadow};position:relative;transition:0.15s"
      onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
      ${d}
      ${hasFed ? `<div style="width:5px;height:5px;border-radius:50%;background:${isSelected ? 'white' : 'var(--green)'};margin:2px auto 0"></div>` : '<div style="height:7px"></div>'}
    </div>`;
      }
      grid.innerHTML = cells;

      // Show info for selected date
      if (calSelectedDate) {
        const sel = new Date(calSelectedDate);
        showCalSelectedInfo(sel);
      }
    }

    function calSelectDay(d) {
      const date = new Date(calYear, calMonth, d);
      calSelectedDate = date.toDateString();
      renderCalendar();
      showCalSelectedInfo(date);
    }

    function showCalSelectedInfo(date) {
      const box = document.getElementById('calSelectedInfo');
      if (!box) return;
      const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dateISO = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const log = getLog ? getLog() : [];
      const dayLogs = log.filter(e => e.timestamp && e.timestamp.slice(0, 10) === dateISO);
      const fed = dayLogs.filter(e => e.type === 'fed').length;
      const water = dayLogs.filter(e => e.type === 'water').length;
      const isToday = date.toDateString() === new Date().toDateString();
      const label = `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;

      if (dayLogs.length > 0) {
        box.innerHTML = `<span style="font-size:18px">📋</span><div><div style="font-size:12px;color:var(--muted);font-weight:700">${label}${isToday ? ' · Today' : ''}</div><div style="margin-top:3px">${fed ? `🍽️ ${fed} feeding${fed > 1 ? 's' : ''}` : ''} ${water ? `💧 ${water} water log${water > 1 ? 's' : ''}` : ''}</div></div>`;
      } else {
        box.innerHTML = `<span style="font-size:18px">${isToday ? '📅' : '🗓️'}</span><div><div style="font-size:12px;color:var(--muted);font-weight:700">${label}${isToday ? ' · Today' : ''}</div><div style="margin-top:3px;color:var(--muted);font-weight:600;font-size:12px">No activity logged</div></div>`;
      }
    }


// ── Script block 2: splash/login logic ─────────────────────────────────────
    // Dismiss anime splash and show loading screen
    function dismissAnimeSplash() {
      const splash = document.getElementById("animeSplash");
      const loading = document.getElementById("loadingScreen");
      if (!splash) return;
      splash.classList.add("fade-out");
      setTimeout(() => {
        splash.style.display = "none";
        if (loading) {
          loading.style.display = "flex";
          // animate loading bar
          let w = 0;
          const bar = document.getElementById("loadingBar");
          const iv = setInterval(() => {
            w += 8;
            if (bar) bar.style.width = Math.min(w, 100) + "%";
            if (w >= 100) clearInterval(iv);
          }, 80);
          setTimeout(() => { loading.style.display = "none"; }, 1500);
        }
      }, 600);
    }

    // Auto-dismiss splash after 3.5s if user doesn't tap
    window.addEventListener('load', function () {
      setTimeout(dismissAnimeSplash, 3500);

      const loginScreen = document.getElementById("loginScreen");
      const registerScreen = document.getElementById("registerScreen");
      const mainApp = document.getElementById("mainApp");

      if (loginScreen) loginScreen.classList.remove("hidden");
      if (registerScreen) registerScreen.classList.add("hidden");
      if (mainApp) mainApp.classList.add("hidden");

      // Prevent automatic login
      localStorage.removeItem("pawfeedCurrentUser");
    });

// ── Script block 3: recipeDB + main app logic ───────────────────────────────

    // your existing JavaScript code

    const recipeDB = {
      "dog": [
        {
          "id": 1,
          "name": "Beef & Sweet Potato Delight #1",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "11 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Beef",
            "Sweet Potato",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the beef.",
            "Prepare the sweet potato.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "83 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 2,
          "name": "Pumpkin & Egg Delight #2",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "12 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Egg",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the egg.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "86 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 3,
          "name": "Rice & Turkey Delight #3",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "13 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Turkey",
            "Oats",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the turkey.",
            "Mix with oats.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "89 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 4,
          "name": "Sweet Potato & Carrot Delight #4",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "14 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Sweet Potato",
            "Carrot",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sweet potato.",
            "Prepare the carrot.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "92 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 5,
          "name": "Egg & Spinach Delight #5",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "15 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Egg",
            "Spinach",
            "Beef",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the spinach.",
            "Mix with beef.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "95 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 6,
          "name": "Turkey & Oats Delight #6",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "16 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Oats",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the oats.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "98 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 7,
          "name": "Carrot & Chicken Delight #7",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "17 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Chicken",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the chicken.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "101 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 8,
          "name": "Spinach & Beef Delight #8",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "18 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Beef",
            "Sweet Potato",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the beef.",
            "Mix with sweet potato.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "104 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 9,
          "name": "Oats & Pumpkin Delight #9",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "19 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Oats",
            "Pumpkin",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the oats.",
            "Prepare the pumpkin.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "107 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 10,
          "name": "Chicken & Rice Delight #10",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "20 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Rice",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the rice.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "110 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 11,
          "name": "Beef & Sweet Potato Delight #11",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "21 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Beef",
            "Sweet Potato",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the beef.",
            "Prepare the sweet potato.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "113 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 12,
          "name": "Pumpkin & Egg Delight #12",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "22 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Egg",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the egg.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "116 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 13,
          "name": "Rice & Turkey Delight #13",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "23 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Turkey",
            "Oats",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the turkey.",
            "Mix with oats.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "119 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 14,
          "name": "Sweet Potato & Carrot Delight #14",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "24 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Sweet Potato",
            "Carrot",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sweet potato.",
            "Prepare the carrot.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "122 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 15,
          "name": "Egg & Spinach Delight #15",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "25 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Egg",
            "Spinach",
            "Beef",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the spinach.",
            "Mix with beef.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "125 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 16,
          "name": "Turkey & Oats Delight #16",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "26 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Oats",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the oats.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "128 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 17,
          "name": "Carrot & Chicken Delight #17",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "27 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Chicken",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the chicken.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "131 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 18,
          "name": "Spinach & Beef Delight #18",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "28 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Beef",
            "Sweet Potato",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the beef.",
            "Mix with sweet potato.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "134 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 19,
          "name": "Oats & Pumpkin Delight #19",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "29 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Oats",
            "Pumpkin",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the oats.",
            "Prepare the pumpkin.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "137 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 20,
          "name": "Chicken & Rice Delight #20",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "30 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Rice",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the rice.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "140 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 21,
          "name": "Beef & Sweet Potato Delight #21",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "10 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Beef",
            "Sweet Potato",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the beef.",
            "Prepare the sweet potato.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "143 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 22,
          "name": "Pumpkin & Egg Delight #22",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "11 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Egg",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the egg.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "146 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 23,
          "name": "Rice & Turkey Delight #23",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "12 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Turkey",
            "Oats",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the turkey.",
            "Mix with oats.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "149 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 24,
          "name": "Sweet Potato & Carrot Delight #24",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "13 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Sweet Potato",
            "Carrot",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sweet potato.",
            "Prepare the carrot.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "152 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 25,
          "name": "Egg & Spinach Delight #25",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "14 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Egg",
            "Spinach",
            "Beef",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the spinach.",
            "Mix with beef.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "155 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 26,
          "name": "Turkey & Oats Delight #26",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "15 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Oats",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the oats.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "158 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 27,
          "name": "Carrot & Chicken Delight #27",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "16 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Chicken",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the chicken.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "161 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 28,
          "name": "Spinach & Beef Delight #28",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "17 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Beef",
            "Sweet Potato",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the beef.",
            "Mix with sweet potato.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "164 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 29,
          "name": "Oats & Pumpkin Delight #29",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "18 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Oats",
            "Pumpkin",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the oats.",
            "Prepare the pumpkin.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "167 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 30,
          "name": "Chicken & Rice Delight #30",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "19 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Rice",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the rice.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "170 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 31,
          "name": "Beef & Sweet Potato Delight #31",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "20 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Beef",
            "Sweet Potato",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the beef.",
            "Prepare the sweet potato.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "173 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 32,
          "name": "Pumpkin & Egg Delight #32",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "21 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Egg",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the egg.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "176 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 33,
          "name": "Rice & Turkey Delight #33",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "22 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Turkey",
            "Oats",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the turkey.",
            "Mix with oats.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "179 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 34,
          "name": "Sweet Potato & Carrot Delight #34",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "23 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Sweet Potato",
            "Carrot",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sweet potato.",
            "Prepare the carrot.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "182 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 35,
          "name": "Egg & Spinach Delight #35",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "24 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Egg",
            "Spinach",
            "Beef",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the spinach.",
            "Mix with beef.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "185 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 36,
          "name": "Turkey & Oats Delight #36",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "25 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Oats",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the oats.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "188 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 37,
          "name": "Carrot & Chicken Delight #37",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "26 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Chicken",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the chicken.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "191 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 38,
          "name": "Spinach & Beef Delight #38",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "27 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Beef",
            "Sweet Potato",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the beef.",
            "Mix with sweet potato.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "194 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 39,
          "name": "Oats & Pumpkin Delight #39",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "28 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Oats",
            "Pumpkin",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the oats.",
            "Prepare the pumpkin.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "197 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 40,
          "name": "Chicken & Rice Delight #40",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "29 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Rice",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the rice.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "200 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 41,
          "name": "Beef & Sweet Potato Delight #41",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "30 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Beef",
            "Sweet Potato",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the beef.",
            "Prepare the sweet potato.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "203 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 42,
          "name": "Pumpkin & Egg Delight #42",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "10 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Egg",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the egg.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "206 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 43,
          "name": "Rice & Turkey Delight #43",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "11 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Turkey",
            "Oats",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the turkey.",
            "Mix with oats.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "209 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 44,
          "name": "Sweet Potato & Carrot Delight #44",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "12 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Sweet Potato",
            "Carrot",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sweet potato.",
            "Prepare the carrot.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "212 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 45,
          "name": "Egg & Spinach Delight #45",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "13 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Egg",
            "Spinach",
            "Beef",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the spinach.",
            "Mix with beef.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "215 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 46,
          "name": "Turkey & Oats Delight #46",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "14 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Oats",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the oats.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "218 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 47,
          "name": "Carrot & Chicken Delight #47",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "15 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Chicken",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the chicken.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "221 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 48,
          "name": "Spinach & Beef Delight #48",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "16 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Beef",
            "Sweet Potato",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the beef.",
            "Mix with sweet potato.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "224 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 49,
          "name": "Oats & Pumpkin Delight #49",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "17 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Oats",
            "Pumpkin",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the oats.",
            "Prepare the pumpkin.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "227 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 50,
          "name": "Chicken & Rice Delight #50",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "18 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Rice",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the rice.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "230 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 51,
          "name": "Beef & Sweet Potato Delight #51",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "19 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Beef",
            "Sweet Potato",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the beef.",
            "Prepare the sweet potato.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "233 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 52,
          "name": "Pumpkin & Egg Delight #52",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "20 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Egg",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the egg.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "236 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 53,
          "name": "Rice & Turkey Delight #53",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "21 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Turkey",
            "Oats",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the turkey.",
            "Mix with oats.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "239 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 54,
          "name": "Sweet Potato & Carrot Delight #54",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "22 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Sweet Potato",
            "Carrot",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sweet potato.",
            "Prepare the carrot.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "242 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 55,
          "name": "Egg & Spinach Delight #55",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "23 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Egg",
            "Spinach",
            "Beef",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the spinach.",
            "Mix with beef.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "245 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 56,
          "name": "Turkey & Oats Delight #56",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "24 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Oats",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the oats.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "248 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 57,
          "name": "Carrot & Chicken Delight #57",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "25 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Chicken",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the chicken.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "251 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 58,
          "name": "Spinach & Beef Delight #58",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "26 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Beef",
            "Sweet Potato",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the beef.",
            "Mix with sweet potato.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "254 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 59,
          "name": "Oats & Pumpkin Delight #59",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "27 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Oats",
            "Pumpkin",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the oats.",
            "Prepare the pumpkin.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "257 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 60,
          "name": "Chicken & Rice Delight #60",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "28 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Rice",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the rice.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "260 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 61,
          "name": "Beef & Sweet Potato Delight #61",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "29 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Beef",
            "Sweet Potato",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the beef.",
            "Prepare the sweet potato.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "263 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 62,
          "name": "Pumpkin & Egg Delight #62",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "30 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Egg",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the egg.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "266 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 63,
          "name": "Rice & Turkey Delight #63",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "10 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Turkey",
            "Oats",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the turkey.",
            "Mix with oats.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "269 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 64,
          "name": "Sweet Potato & Carrot Delight #64",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "11 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Sweet Potato",
            "Carrot",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sweet potato.",
            "Prepare the carrot.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "272 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 65,
          "name": "Egg & Spinach Delight #65",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "12 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Egg",
            "Spinach",
            "Beef",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the spinach.",
            "Mix with beef.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "275 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 66,
          "name": "Turkey & Oats Delight #66",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "13 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Oats",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the oats.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "278 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 67,
          "name": "Carrot & Chicken Delight #67",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "14 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Chicken",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the chicken.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "281 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 68,
          "name": "Spinach & Beef Delight #68",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "15 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Beef",
            "Sweet Potato",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the beef.",
            "Mix with sweet potato.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "284 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 69,
          "name": "Oats & Pumpkin Delight #69",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "16 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Oats",
            "Pumpkin",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the oats.",
            "Prepare the pumpkin.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "287 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 70,
          "name": "Chicken & Rice Delight #70",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "17 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Rice",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the rice.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "290 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 71,
          "name": "Beef & Sweet Potato Delight #71",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "18 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Beef",
            "Sweet Potato",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the beef.",
            "Prepare the sweet potato.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "293 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 72,
          "name": "Pumpkin & Egg Delight #72",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "19 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Egg",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the egg.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "296 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 73,
          "name": "Rice & Turkey Delight #73",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "20 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Turkey",
            "Oats",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the turkey.",
            "Mix with oats.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "299 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 74,
          "name": "Sweet Potato & Carrot Delight #74",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "21 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Sweet Potato",
            "Carrot",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sweet potato.",
            "Prepare the carrot.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "302 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 75,
          "name": "Egg & Spinach Delight #75",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "22 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Egg",
            "Spinach",
            "Beef",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the spinach.",
            "Mix with beef.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "305 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 76,
          "name": "Turkey & Oats Delight #76",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "23 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Oats",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the oats.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "308 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 77,
          "name": "Carrot & Chicken Delight #77",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "24 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Chicken",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the chicken.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "311 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 78,
          "name": "Spinach & Beef Delight #78",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "25 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Beef",
            "Sweet Potato",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the beef.",
            "Mix with sweet potato.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "314 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 79,
          "name": "Oats & Pumpkin Delight #79",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "26 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Oats",
            "Pumpkin",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the oats.",
            "Prepare the pumpkin.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "317 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 80,
          "name": "Chicken & Rice Delight #80",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "27 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Rice",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the rice.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "320 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 81,
          "name": "Beef & Sweet Potato Delight #81",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "28 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Beef",
            "Sweet Potato",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the beef.",
            "Prepare the sweet potato.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "323 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 82,
          "name": "Pumpkin & Egg Delight #82",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "29 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Egg",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the egg.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "326 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 83,
          "name": "Rice & Turkey Delight #83",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "30 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Turkey",
            "Oats",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the turkey.",
            "Mix with oats.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "329 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 84,
          "name": "Sweet Potato & Carrot Delight #84",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "10 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Sweet Potato",
            "Carrot",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sweet potato.",
            "Prepare the carrot.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "332 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 85,
          "name": "Egg & Spinach Delight #85",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "11 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Egg",
            "Spinach",
            "Beef",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the spinach.",
            "Mix with beef.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "335 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 86,
          "name": "Turkey & Oats Delight #86",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "12 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Oats",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the oats.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "338 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 87,
          "name": "Carrot & Chicken Delight #87",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "13 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Chicken",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the chicken.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "341 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 88,
          "name": "Spinach & Beef Delight #88",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "14 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Beef",
            "Sweet Potato",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the beef.",
            "Mix with sweet potato.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "344 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 89,
          "name": "Oats & Pumpkin Delight #89",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "15 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Oats",
            "Pumpkin",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the oats.",
            "Prepare the pumpkin.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "347 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 90,
          "name": "Chicken & Rice Delight #90",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "16 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Rice",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the rice.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "350 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 91,
          "name": "Beef & Sweet Potato Delight #91",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "17 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Beef",
            "Sweet Potato",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the beef.",
            "Prepare the sweet potato.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "353 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 92,
          "name": "Pumpkin & Egg Delight #92",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "18 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Egg",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the egg.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "356 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 93,
          "name": "Rice & Turkey Delight #93",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "19 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Turkey",
            "Oats",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the turkey.",
            "Mix with oats.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "359 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 94,
          "name": "Sweet Potato & Carrot Delight #94",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "20 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Sweet Potato",
            "Carrot",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sweet potato.",
            "Prepare the carrot.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "362 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 95,
          "name": "Egg & Spinach Delight #95",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "21 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Egg",
            "Spinach",
            "Beef",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the spinach.",
            "Mix with beef.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "365 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 96,
          "name": "Turkey & Oats Delight #96",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "22 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Oats",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the oats.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "368 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 97,
          "name": "Carrot & Chicken Delight #97",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "23 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Chicken",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the chicken.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "371 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 98,
          "name": "Spinach & Beef Delight #98",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "24 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Beef",
            "Sweet Potato",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the beef.",
            "Mix with sweet potato.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "374 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 99,
          "name": "Oats & Pumpkin Delight #99",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "25 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Oats",
            "Pumpkin",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the oats.",
            "Prepare the pumpkin.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "377 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 100,
          "name": "Chicken & Rice Delight #100",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "26 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Rice",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the rice.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "380 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        }
      ],
      "cat": [
        {
          "id": 1,
          "name": "Tuna & Egg Delight #1",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "11 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Tuna",
            "Egg",
            "Liver",
            "Fresh Water"
          ],
          "steps": [
            "Wash the tuna.",
            "Prepare the egg.",
            "Mix with liver.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "83 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 2,
          "name": "Salmon & Pumpkin Delight #2",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "12 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Salmon",
            "Pumpkin",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the salmon.",
            "Prepare the pumpkin.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "86 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 3,
          "name": "Turkey & Sardine Delight #3",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "13 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Sardine",
            "Duck",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the sardine.",
            "Mix with duck.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "89 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 4,
          "name": "Egg & Liver Delight #4",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "14 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Egg",
            "Liver",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the liver.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "92 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 5,
          "name": "Pumpkin & Rice Delight #5",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "15 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Rice",
            "Tuna",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the rice.",
            "Mix with tuna.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "95 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 6,
          "name": "Sardine & Duck Delight #6",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "16 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Sardine",
            "Duck",
            "Salmon",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sardine.",
            "Prepare the duck.",
            "Mix with salmon.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "98 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 7,
          "name": "Liver & Chicken Delight #7",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "17 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Liver",
            "Chicken",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the liver.",
            "Prepare the chicken.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "101 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 8,
          "name": "Rice & Tuna Delight #8",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "18 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Tuna",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the tuna.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "104 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 9,
          "name": "Duck & Salmon Delight #9",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "19 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Duck",
            "Salmon",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duck.",
            "Prepare the salmon.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "107 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 10,
          "name": "Chicken & Turkey Delight #10",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "20 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Turkey",
            "Sardine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the turkey.",
            "Mix with sardine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "110 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 11,
          "name": "Tuna & Egg Delight #11",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "21 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Tuna",
            "Egg",
            "Liver",
            "Fresh Water"
          ],
          "steps": [
            "Wash the tuna.",
            "Prepare the egg.",
            "Mix with liver.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "113 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 12,
          "name": "Salmon & Pumpkin Delight #12",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "22 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Salmon",
            "Pumpkin",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the salmon.",
            "Prepare the pumpkin.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "116 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 13,
          "name": "Turkey & Sardine Delight #13",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "23 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Sardine",
            "Duck",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the sardine.",
            "Mix with duck.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "119 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 14,
          "name": "Egg & Liver Delight #14",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "24 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Egg",
            "Liver",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the liver.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "122 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 15,
          "name": "Pumpkin & Rice Delight #15",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "25 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Rice",
            "Tuna",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the rice.",
            "Mix with tuna.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "125 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 16,
          "name": "Sardine & Duck Delight #16",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "26 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Sardine",
            "Duck",
            "Salmon",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sardine.",
            "Prepare the duck.",
            "Mix with salmon.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "128 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 17,
          "name": "Liver & Chicken Delight #17",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "27 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Liver",
            "Chicken",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the liver.",
            "Prepare the chicken.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "131 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 18,
          "name": "Rice & Tuna Delight #18",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "28 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Tuna",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the tuna.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "134 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 19,
          "name": "Duck & Salmon Delight #19",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "29 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Duck",
            "Salmon",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duck.",
            "Prepare the salmon.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "137 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 20,
          "name": "Chicken & Turkey Delight #20",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "30 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Turkey",
            "Sardine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the turkey.",
            "Mix with sardine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "140 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 21,
          "name": "Tuna & Egg Delight #21",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "10 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Tuna",
            "Egg",
            "Liver",
            "Fresh Water"
          ],
          "steps": [
            "Wash the tuna.",
            "Prepare the egg.",
            "Mix with liver.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "143 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 22,
          "name": "Salmon & Pumpkin Delight #22",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "11 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Salmon",
            "Pumpkin",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the salmon.",
            "Prepare the pumpkin.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "146 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 23,
          "name": "Turkey & Sardine Delight #23",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "12 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Sardine",
            "Duck",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the sardine.",
            "Mix with duck.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "149 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 24,
          "name": "Egg & Liver Delight #24",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "13 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Egg",
            "Liver",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the liver.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "152 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 25,
          "name": "Pumpkin & Rice Delight #25",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "14 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Rice",
            "Tuna",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the rice.",
            "Mix with tuna.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "155 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 26,
          "name": "Sardine & Duck Delight #26",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "15 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Sardine",
            "Duck",
            "Salmon",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sardine.",
            "Prepare the duck.",
            "Mix with salmon.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "158 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 27,
          "name": "Liver & Chicken Delight #27",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "16 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Liver",
            "Chicken",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the liver.",
            "Prepare the chicken.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "161 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 28,
          "name": "Rice & Tuna Delight #28",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "17 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Tuna",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the tuna.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "164 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 29,
          "name": "Duck & Salmon Delight #29",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "18 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Duck",
            "Salmon",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duck.",
            "Prepare the salmon.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "167 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 30,
          "name": "Chicken & Turkey Delight #30",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "19 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Turkey",
            "Sardine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the turkey.",
            "Mix with sardine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "170 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 31,
          "name": "Tuna & Egg Delight #31",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "20 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Tuna",
            "Egg",
            "Liver",
            "Fresh Water"
          ],
          "steps": [
            "Wash the tuna.",
            "Prepare the egg.",
            "Mix with liver.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "173 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 32,
          "name": "Salmon & Pumpkin Delight #32",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "21 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Salmon",
            "Pumpkin",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the salmon.",
            "Prepare the pumpkin.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "176 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 33,
          "name": "Turkey & Sardine Delight #33",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "22 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Sardine",
            "Duck",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the sardine.",
            "Mix with duck.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "179 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 34,
          "name": "Egg & Liver Delight #34",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "23 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Egg",
            "Liver",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the liver.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "182 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 35,
          "name": "Pumpkin & Rice Delight #35",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "24 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Rice",
            "Tuna",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the rice.",
            "Mix with tuna.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "185 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 36,
          "name": "Sardine & Duck Delight #36",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "25 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Sardine",
            "Duck",
            "Salmon",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sardine.",
            "Prepare the duck.",
            "Mix with salmon.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "188 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 37,
          "name": "Liver & Chicken Delight #37",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "26 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Liver",
            "Chicken",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the liver.",
            "Prepare the chicken.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "191 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 38,
          "name": "Rice & Tuna Delight #38",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "27 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Tuna",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the tuna.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "194 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 39,
          "name": "Duck & Salmon Delight #39",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "28 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Duck",
            "Salmon",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duck.",
            "Prepare the salmon.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "197 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 40,
          "name": "Chicken & Turkey Delight #40",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "29 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Turkey",
            "Sardine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the turkey.",
            "Mix with sardine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "200 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 41,
          "name": "Tuna & Egg Delight #41",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "30 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Tuna",
            "Egg",
            "Liver",
            "Fresh Water"
          ],
          "steps": [
            "Wash the tuna.",
            "Prepare the egg.",
            "Mix with liver.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "203 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 42,
          "name": "Salmon & Pumpkin Delight #42",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "10 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Salmon",
            "Pumpkin",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the salmon.",
            "Prepare the pumpkin.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "206 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 43,
          "name": "Turkey & Sardine Delight #43",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "11 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Sardine",
            "Duck",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the sardine.",
            "Mix with duck.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "209 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 44,
          "name": "Egg & Liver Delight #44",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "12 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Egg",
            "Liver",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the liver.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "212 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 45,
          "name": "Pumpkin & Rice Delight #45",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "13 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Rice",
            "Tuna",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the rice.",
            "Mix with tuna.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "215 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 46,
          "name": "Sardine & Duck Delight #46",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "14 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Sardine",
            "Duck",
            "Salmon",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sardine.",
            "Prepare the duck.",
            "Mix with salmon.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "218 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 47,
          "name": "Liver & Chicken Delight #47",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "15 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Liver",
            "Chicken",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the liver.",
            "Prepare the chicken.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "221 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 48,
          "name": "Rice & Tuna Delight #48",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "16 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Tuna",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the tuna.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "224 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 49,
          "name": "Duck & Salmon Delight #49",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "17 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Duck",
            "Salmon",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duck.",
            "Prepare the salmon.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "227 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 50,
          "name": "Chicken & Turkey Delight #50",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "18 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Turkey",
            "Sardine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the turkey.",
            "Mix with sardine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "230 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 51,
          "name": "Tuna & Egg Delight #51",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "19 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Tuna",
            "Egg",
            "Liver",
            "Fresh Water"
          ],
          "steps": [
            "Wash the tuna.",
            "Prepare the egg.",
            "Mix with liver.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "233 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 52,
          "name": "Salmon & Pumpkin Delight #52",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "20 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Salmon",
            "Pumpkin",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the salmon.",
            "Prepare the pumpkin.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "236 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 53,
          "name": "Turkey & Sardine Delight #53",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "21 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Sardine",
            "Duck",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the sardine.",
            "Mix with duck.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "239 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 54,
          "name": "Egg & Liver Delight #54",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "22 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Egg",
            "Liver",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the liver.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "242 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 55,
          "name": "Pumpkin & Rice Delight #55",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "23 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Rice",
            "Tuna",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the rice.",
            "Mix with tuna.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "245 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 56,
          "name": "Sardine & Duck Delight #56",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "24 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Sardine",
            "Duck",
            "Salmon",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sardine.",
            "Prepare the duck.",
            "Mix with salmon.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "248 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 57,
          "name": "Liver & Chicken Delight #57",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "25 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Liver",
            "Chicken",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the liver.",
            "Prepare the chicken.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "251 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 58,
          "name": "Rice & Tuna Delight #58",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "26 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Tuna",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the tuna.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "254 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 59,
          "name": "Duck & Salmon Delight #59",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "27 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Duck",
            "Salmon",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duck.",
            "Prepare the salmon.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "257 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 60,
          "name": "Chicken & Turkey Delight #60",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "28 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Turkey",
            "Sardine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the turkey.",
            "Mix with sardine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "260 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 61,
          "name": "Tuna & Egg Delight #61",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "29 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Tuna",
            "Egg",
            "Liver",
            "Fresh Water"
          ],
          "steps": [
            "Wash the tuna.",
            "Prepare the egg.",
            "Mix with liver.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "263 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 62,
          "name": "Salmon & Pumpkin Delight #62",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "30 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Salmon",
            "Pumpkin",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the salmon.",
            "Prepare the pumpkin.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "266 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 63,
          "name": "Turkey & Sardine Delight #63",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "10 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Sardine",
            "Duck",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the sardine.",
            "Mix with duck.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "269 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 64,
          "name": "Egg & Liver Delight #64",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "11 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Egg",
            "Liver",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the liver.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "272 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 65,
          "name": "Pumpkin & Rice Delight #65",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "12 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Rice",
            "Tuna",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the rice.",
            "Mix with tuna.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "275 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 66,
          "name": "Sardine & Duck Delight #66",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "13 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Sardine",
            "Duck",
            "Salmon",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sardine.",
            "Prepare the duck.",
            "Mix with salmon.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "278 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 67,
          "name": "Liver & Chicken Delight #67",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "14 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Liver",
            "Chicken",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the liver.",
            "Prepare the chicken.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "281 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 68,
          "name": "Rice & Tuna Delight #68",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "15 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Tuna",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the tuna.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "284 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 69,
          "name": "Duck & Salmon Delight #69",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "16 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Duck",
            "Salmon",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duck.",
            "Prepare the salmon.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "287 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 70,
          "name": "Chicken & Turkey Delight #70",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "17 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Turkey",
            "Sardine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the turkey.",
            "Mix with sardine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "290 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 71,
          "name": "Tuna & Egg Delight #71",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "18 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Tuna",
            "Egg",
            "Liver",
            "Fresh Water"
          ],
          "steps": [
            "Wash the tuna.",
            "Prepare the egg.",
            "Mix with liver.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "293 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 72,
          "name": "Salmon & Pumpkin Delight #72",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "19 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Salmon",
            "Pumpkin",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the salmon.",
            "Prepare the pumpkin.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "296 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 73,
          "name": "Turkey & Sardine Delight #73",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "20 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Sardine",
            "Duck",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the sardine.",
            "Mix with duck.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "299 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 74,
          "name": "Egg & Liver Delight #74",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "21 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Egg",
            "Liver",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the liver.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "302 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 75,
          "name": "Pumpkin & Rice Delight #75",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "22 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Rice",
            "Tuna",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the rice.",
            "Mix with tuna.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "305 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 76,
          "name": "Sardine & Duck Delight #76",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "23 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Sardine",
            "Duck",
            "Salmon",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sardine.",
            "Prepare the duck.",
            "Mix with salmon.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "308 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 77,
          "name": "Liver & Chicken Delight #77",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "24 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Liver",
            "Chicken",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the liver.",
            "Prepare the chicken.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "311 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 78,
          "name": "Rice & Tuna Delight #78",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "25 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Tuna",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the tuna.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "314 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 79,
          "name": "Duck & Salmon Delight #79",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "26 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Duck",
            "Salmon",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duck.",
            "Prepare the salmon.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "317 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 80,
          "name": "Chicken & Turkey Delight #80",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "27 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Turkey",
            "Sardine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the turkey.",
            "Mix with sardine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "320 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 81,
          "name": "Tuna & Egg Delight #81",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "28 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Tuna",
            "Egg",
            "Liver",
            "Fresh Water"
          ],
          "steps": [
            "Wash the tuna.",
            "Prepare the egg.",
            "Mix with liver.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "323 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 82,
          "name": "Salmon & Pumpkin Delight #82",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "29 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Salmon",
            "Pumpkin",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the salmon.",
            "Prepare the pumpkin.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "326 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 83,
          "name": "Turkey & Sardine Delight #83",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "30 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Sardine",
            "Duck",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the sardine.",
            "Mix with duck.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "329 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 84,
          "name": "Egg & Liver Delight #84",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "10 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Egg",
            "Liver",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the liver.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "332 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 85,
          "name": "Pumpkin & Rice Delight #85",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "11 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Rice",
            "Tuna",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the rice.",
            "Mix with tuna.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "335 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 86,
          "name": "Sardine & Duck Delight #86",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "12 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Sardine",
            "Duck",
            "Salmon",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sardine.",
            "Prepare the duck.",
            "Mix with salmon.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "338 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 87,
          "name": "Liver & Chicken Delight #87",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "13 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Liver",
            "Chicken",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the liver.",
            "Prepare the chicken.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "341 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 88,
          "name": "Rice & Tuna Delight #88",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "14 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Tuna",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the tuna.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "344 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 89,
          "name": "Duck & Salmon Delight #89",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "15 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Duck",
            "Salmon",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duck.",
            "Prepare the salmon.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "347 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 90,
          "name": "Chicken & Turkey Delight #90",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "16 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Turkey",
            "Sardine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the turkey.",
            "Mix with sardine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "350 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 91,
          "name": "Tuna & Egg Delight #91",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "17 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Tuna",
            "Egg",
            "Liver",
            "Fresh Water"
          ],
          "steps": [
            "Wash the tuna.",
            "Prepare the egg.",
            "Mix with liver.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "353 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 92,
          "name": "Salmon & Pumpkin Delight #92",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "18 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Salmon",
            "Pumpkin",
            "Rice",
            "Fresh Water"
          ],
          "steps": [
            "Wash the salmon.",
            "Prepare the pumpkin.",
            "Mix with rice.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "356 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 93,
          "name": "Turkey & Sardine Delight #93",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "19 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Turkey",
            "Sardine",
            "Duck",
            "Fresh Water"
          ],
          "steps": [
            "Wash the turkey.",
            "Prepare the sardine.",
            "Mix with duck.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "359 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 94,
          "name": "Egg & Liver Delight #94",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "20 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Egg",
            "Liver",
            "Chicken",
            "Fresh Water"
          ],
          "steps": [
            "Wash the egg.",
            "Prepare the liver.",
            "Mix with chicken.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "362 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 95,
          "name": "Pumpkin & Rice Delight #95",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "21 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Pumpkin",
            "Rice",
            "Tuna",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the rice.",
            "Mix with tuna.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "365 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 96,
          "name": "Sardine & Duck Delight #96",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "22 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Sardine",
            "Duck",
            "Salmon",
            "Fresh Water"
          ],
          "steps": [
            "Wash the sardine.",
            "Prepare the duck.",
            "Mix with salmon.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "368 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 97,
          "name": "Liver & Chicken Delight #97",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "23 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Liver",
            "Chicken",
            "Turkey",
            "Fresh Water"
          ],
          "steps": [
            "Wash the liver.",
            "Prepare the chicken.",
            "Mix with turkey.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "371 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 98,
          "name": "Rice & Tuna Delight #98",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "24 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Rice",
            "Tuna",
            "Egg",
            "Fresh Water"
          ],
          "steps": [
            "Wash the rice.",
            "Prepare the tuna.",
            "Mix with egg.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "374 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 99,
          "name": "Duck & Salmon Delight #99",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "25 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Duck",
            "Salmon",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duck.",
            "Prepare the salmon.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "377 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 100,
          "name": "Chicken & Turkey Delight #100",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "26 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Chicken",
            "Turkey",
            "Sardine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the chicken.",
            "Prepare the turkey.",
            "Mix with sardine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "380 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        }
      ],
      "rabbit": [
        {
          "id": 1,
          "name": "Cilantro & Bell Pepper Delight #1",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "11 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cilantro",
            "Bell Pepper",
            "Broccoli Leaf",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cilantro.",
            "Prepare the bell pepper.",
            "Mix with broccoli leaf.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "83 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 2,
          "name": "Romaine & Basil Delight #2",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "12 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Romaine",
            "Basil",
            "Cucumber",
            "Fresh Water"
          ],
          "steps": [
            "Wash the romaine.",
            "Prepare the basil.",
            "Mix with cucumber.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "86 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 3,
          "name": "Parsley & Mint Delight #3",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "13 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Parsley",
            "Mint",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the parsley.",
            "Prepare the mint.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "89 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 4,
          "name": "Bell Pepper & Broccoli Leaf Delight #4",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "14 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Bell Pepper",
            "Broccoli Leaf",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bell pepper.",
            "Prepare the broccoli leaf.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "92 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 5,
          "name": "Basil & Cucumber Delight #5",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "15 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Basil",
            "Cucumber",
            "Cilantro",
            "Fresh Water"
          ],
          "steps": [
            "Wash the basil.",
            "Prepare the cucumber.",
            "Mix with cilantro.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "95 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 6,
          "name": "Mint & Zucchini Delight #6",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "16 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mint",
            "Zucchini",
            "Romaine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mint.",
            "Prepare the zucchini.",
            "Mix with romaine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "98 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 7,
          "name": "Broccoli Leaf & Carrot Delight #7",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "17 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Broccoli Leaf",
            "Carrot",
            "Parsley",
            "Fresh Water"
          ],
          "steps": [
            "Wash the broccoli leaf.",
            "Prepare the carrot.",
            "Mix with parsley.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "101 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 8,
          "name": "Cucumber & Cilantro Delight #8",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "18 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cucumber",
            "Cilantro",
            "Bell Pepper",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cucumber.",
            "Prepare the cilantro.",
            "Mix with bell pepper.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "104 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 9,
          "name": "Zucchini & Romaine Delight #9",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "19 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Romaine",
            "Basil",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the romaine.",
            "Mix with basil.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "107 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 10,
          "name": "Carrot & Parsley Delight #10",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "20 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Parsley",
            "Mint",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the parsley.",
            "Mix with mint.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "110 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 11,
          "name": "Cilantro & Bell Pepper Delight #11",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "21 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cilantro",
            "Bell Pepper",
            "Broccoli Leaf",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cilantro.",
            "Prepare the bell pepper.",
            "Mix with broccoli leaf.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "113 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 12,
          "name": "Romaine & Basil Delight #12",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "22 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Romaine",
            "Basil",
            "Cucumber",
            "Fresh Water"
          ],
          "steps": [
            "Wash the romaine.",
            "Prepare the basil.",
            "Mix with cucumber.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "116 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 13,
          "name": "Parsley & Mint Delight #13",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "23 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Parsley",
            "Mint",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the parsley.",
            "Prepare the mint.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "119 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 14,
          "name": "Bell Pepper & Broccoli Leaf Delight #14",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "24 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Bell Pepper",
            "Broccoli Leaf",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bell pepper.",
            "Prepare the broccoli leaf.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "122 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 15,
          "name": "Basil & Cucumber Delight #15",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "25 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Basil",
            "Cucumber",
            "Cilantro",
            "Fresh Water"
          ],
          "steps": [
            "Wash the basil.",
            "Prepare the cucumber.",
            "Mix with cilantro.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "125 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 16,
          "name": "Mint & Zucchini Delight #16",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "26 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mint",
            "Zucchini",
            "Romaine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mint.",
            "Prepare the zucchini.",
            "Mix with romaine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "128 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 17,
          "name": "Broccoli Leaf & Carrot Delight #17",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "27 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Broccoli Leaf",
            "Carrot",
            "Parsley",
            "Fresh Water"
          ],
          "steps": [
            "Wash the broccoli leaf.",
            "Prepare the carrot.",
            "Mix with parsley.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "131 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 18,
          "name": "Cucumber & Cilantro Delight #18",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "28 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cucumber",
            "Cilantro",
            "Bell Pepper",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cucumber.",
            "Prepare the cilantro.",
            "Mix with bell pepper.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "134 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 19,
          "name": "Zucchini & Romaine Delight #19",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "29 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Romaine",
            "Basil",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the romaine.",
            "Mix with basil.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "137 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 20,
          "name": "Carrot & Parsley Delight #20",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "30 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Parsley",
            "Mint",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the parsley.",
            "Mix with mint.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "140 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 21,
          "name": "Cilantro & Bell Pepper Delight #21",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "10 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cilantro",
            "Bell Pepper",
            "Broccoli Leaf",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cilantro.",
            "Prepare the bell pepper.",
            "Mix with broccoli leaf.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "143 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 22,
          "name": "Romaine & Basil Delight #22",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "11 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Romaine",
            "Basil",
            "Cucumber",
            "Fresh Water"
          ],
          "steps": [
            "Wash the romaine.",
            "Prepare the basil.",
            "Mix with cucumber.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "146 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 23,
          "name": "Parsley & Mint Delight #23",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "12 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Parsley",
            "Mint",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the parsley.",
            "Prepare the mint.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "149 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 24,
          "name": "Bell Pepper & Broccoli Leaf Delight #24",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "13 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Bell Pepper",
            "Broccoli Leaf",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bell pepper.",
            "Prepare the broccoli leaf.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "152 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 25,
          "name": "Basil & Cucumber Delight #25",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "14 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Basil",
            "Cucumber",
            "Cilantro",
            "Fresh Water"
          ],
          "steps": [
            "Wash the basil.",
            "Prepare the cucumber.",
            "Mix with cilantro.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "155 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 26,
          "name": "Mint & Zucchini Delight #26",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "15 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mint",
            "Zucchini",
            "Romaine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mint.",
            "Prepare the zucchini.",
            "Mix with romaine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "158 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 27,
          "name": "Broccoli Leaf & Carrot Delight #27",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "16 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Broccoli Leaf",
            "Carrot",
            "Parsley",
            "Fresh Water"
          ],
          "steps": [
            "Wash the broccoli leaf.",
            "Prepare the carrot.",
            "Mix with parsley.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "161 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 28,
          "name": "Cucumber & Cilantro Delight #28",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "17 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cucumber",
            "Cilantro",
            "Bell Pepper",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cucumber.",
            "Prepare the cilantro.",
            "Mix with bell pepper.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "164 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 29,
          "name": "Zucchini & Romaine Delight #29",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "18 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Romaine",
            "Basil",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the romaine.",
            "Mix with basil.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "167 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 30,
          "name": "Carrot & Parsley Delight #30",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "19 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Parsley",
            "Mint",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the parsley.",
            "Mix with mint.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "170 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 31,
          "name": "Cilantro & Bell Pepper Delight #31",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "20 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cilantro",
            "Bell Pepper",
            "Broccoli Leaf",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cilantro.",
            "Prepare the bell pepper.",
            "Mix with broccoli leaf.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "173 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 32,
          "name": "Romaine & Basil Delight #32",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "21 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Romaine",
            "Basil",
            "Cucumber",
            "Fresh Water"
          ],
          "steps": [
            "Wash the romaine.",
            "Prepare the basil.",
            "Mix with cucumber.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "176 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 33,
          "name": "Parsley & Mint Delight #33",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "22 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Parsley",
            "Mint",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the parsley.",
            "Prepare the mint.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "179 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 34,
          "name": "Bell Pepper & Broccoli Leaf Delight #34",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "23 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Bell Pepper",
            "Broccoli Leaf",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bell pepper.",
            "Prepare the broccoli leaf.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "182 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 35,
          "name": "Basil & Cucumber Delight #35",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "24 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Basil",
            "Cucumber",
            "Cilantro",
            "Fresh Water"
          ],
          "steps": [
            "Wash the basil.",
            "Prepare the cucumber.",
            "Mix with cilantro.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "185 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 36,
          "name": "Mint & Zucchini Delight #36",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "25 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mint",
            "Zucchini",
            "Romaine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mint.",
            "Prepare the zucchini.",
            "Mix with romaine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "188 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 37,
          "name": "Broccoli Leaf & Carrot Delight #37",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "26 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Broccoli Leaf",
            "Carrot",
            "Parsley",
            "Fresh Water"
          ],
          "steps": [
            "Wash the broccoli leaf.",
            "Prepare the carrot.",
            "Mix with parsley.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "191 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 38,
          "name": "Cucumber & Cilantro Delight #38",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "27 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cucumber",
            "Cilantro",
            "Bell Pepper",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cucumber.",
            "Prepare the cilantro.",
            "Mix with bell pepper.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "194 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 39,
          "name": "Zucchini & Romaine Delight #39",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "28 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Romaine",
            "Basil",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the romaine.",
            "Mix with basil.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "197 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 40,
          "name": "Carrot & Parsley Delight #40",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "29 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Parsley",
            "Mint",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the parsley.",
            "Mix with mint.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "200 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 41,
          "name": "Cilantro & Bell Pepper Delight #41",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "30 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cilantro",
            "Bell Pepper",
            "Broccoli Leaf",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cilantro.",
            "Prepare the bell pepper.",
            "Mix with broccoli leaf.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "203 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 42,
          "name": "Romaine & Basil Delight #42",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "10 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Romaine",
            "Basil",
            "Cucumber",
            "Fresh Water"
          ],
          "steps": [
            "Wash the romaine.",
            "Prepare the basil.",
            "Mix with cucumber.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "206 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 43,
          "name": "Parsley & Mint Delight #43",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "11 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Parsley",
            "Mint",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the parsley.",
            "Prepare the mint.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "209 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 44,
          "name": "Bell Pepper & Broccoli Leaf Delight #44",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "12 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Bell Pepper",
            "Broccoli Leaf",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bell pepper.",
            "Prepare the broccoli leaf.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "212 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 45,
          "name": "Basil & Cucumber Delight #45",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "13 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Basil",
            "Cucumber",
            "Cilantro",
            "Fresh Water"
          ],
          "steps": [
            "Wash the basil.",
            "Prepare the cucumber.",
            "Mix with cilantro.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "215 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 46,
          "name": "Mint & Zucchini Delight #46",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "14 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mint",
            "Zucchini",
            "Romaine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mint.",
            "Prepare the zucchini.",
            "Mix with romaine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "218 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 47,
          "name": "Broccoli Leaf & Carrot Delight #47",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "15 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Broccoli Leaf",
            "Carrot",
            "Parsley",
            "Fresh Water"
          ],
          "steps": [
            "Wash the broccoli leaf.",
            "Prepare the carrot.",
            "Mix with parsley.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "221 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 48,
          "name": "Cucumber & Cilantro Delight #48",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "16 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cucumber",
            "Cilantro",
            "Bell Pepper",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cucumber.",
            "Prepare the cilantro.",
            "Mix with bell pepper.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "224 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 49,
          "name": "Zucchini & Romaine Delight #49",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "17 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Romaine",
            "Basil",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the romaine.",
            "Mix with basil.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "227 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 50,
          "name": "Carrot & Parsley Delight #50",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "18 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Parsley",
            "Mint",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the parsley.",
            "Mix with mint.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "230 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 51,
          "name": "Cilantro & Bell Pepper Delight #51",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "19 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cilantro",
            "Bell Pepper",
            "Broccoli Leaf",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cilantro.",
            "Prepare the bell pepper.",
            "Mix with broccoli leaf.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "233 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 52,
          "name": "Romaine & Basil Delight #52",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "20 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Romaine",
            "Basil",
            "Cucumber",
            "Fresh Water"
          ],
          "steps": [
            "Wash the romaine.",
            "Prepare the basil.",
            "Mix with cucumber.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "236 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 53,
          "name": "Parsley & Mint Delight #53",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "21 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Parsley",
            "Mint",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the parsley.",
            "Prepare the mint.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "239 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 54,
          "name": "Bell Pepper & Broccoli Leaf Delight #54",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "22 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Bell Pepper",
            "Broccoli Leaf",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bell pepper.",
            "Prepare the broccoli leaf.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "242 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 55,
          "name": "Basil & Cucumber Delight #55",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "23 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Basil",
            "Cucumber",
            "Cilantro",
            "Fresh Water"
          ],
          "steps": [
            "Wash the basil.",
            "Prepare the cucumber.",
            "Mix with cilantro.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "245 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 56,
          "name": "Mint & Zucchini Delight #56",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "24 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mint",
            "Zucchini",
            "Romaine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mint.",
            "Prepare the zucchini.",
            "Mix with romaine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "248 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 57,
          "name": "Broccoli Leaf & Carrot Delight #57",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "25 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Broccoli Leaf",
            "Carrot",
            "Parsley",
            "Fresh Water"
          ],
          "steps": [
            "Wash the broccoli leaf.",
            "Prepare the carrot.",
            "Mix with parsley.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "251 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 58,
          "name": "Cucumber & Cilantro Delight #58",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "26 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cucumber",
            "Cilantro",
            "Bell Pepper",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cucumber.",
            "Prepare the cilantro.",
            "Mix with bell pepper.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "254 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 59,
          "name": "Zucchini & Romaine Delight #59",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "27 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Romaine",
            "Basil",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the romaine.",
            "Mix with basil.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "257 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 60,
          "name": "Carrot & Parsley Delight #60",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "28 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Parsley",
            "Mint",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the parsley.",
            "Mix with mint.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "260 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 61,
          "name": "Cilantro & Bell Pepper Delight #61",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "29 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cilantro",
            "Bell Pepper",
            "Broccoli Leaf",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cilantro.",
            "Prepare the bell pepper.",
            "Mix with broccoli leaf.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "263 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 62,
          "name": "Romaine & Basil Delight #62",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "30 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Romaine",
            "Basil",
            "Cucumber",
            "Fresh Water"
          ],
          "steps": [
            "Wash the romaine.",
            "Prepare the basil.",
            "Mix with cucumber.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "266 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 63,
          "name": "Parsley & Mint Delight #63",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "10 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Parsley",
            "Mint",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the parsley.",
            "Prepare the mint.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "269 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 64,
          "name": "Bell Pepper & Broccoli Leaf Delight #64",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "11 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Bell Pepper",
            "Broccoli Leaf",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bell pepper.",
            "Prepare the broccoli leaf.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "272 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 65,
          "name": "Basil & Cucumber Delight #65",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "12 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Basil",
            "Cucumber",
            "Cilantro",
            "Fresh Water"
          ],
          "steps": [
            "Wash the basil.",
            "Prepare the cucumber.",
            "Mix with cilantro.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "275 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 66,
          "name": "Mint & Zucchini Delight #66",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "13 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mint",
            "Zucchini",
            "Romaine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mint.",
            "Prepare the zucchini.",
            "Mix with romaine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "278 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 67,
          "name": "Broccoli Leaf & Carrot Delight #67",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "14 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Broccoli Leaf",
            "Carrot",
            "Parsley",
            "Fresh Water"
          ],
          "steps": [
            "Wash the broccoli leaf.",
            "Prepare the carrot.",
            "Mix with parsley.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "281 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 68,
          "name": "Cucumber & Cilantro Delight #68",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "15 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cucumber",
            "Cilantro",
            "Bell Pepper",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cucumber.",
            "Prepare the cilantro.",
            "Mix with bell pepper.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "284 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 69,
          "name": "Zucchini & Romaine Delight #69",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "16 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Romaine",
            "Basil",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the romaine.",
            "Mix with basil.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "287 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 70,
          "name": "Carrot & Parsley Delight #70",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "17 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Parsley",
            "Mint",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the parsley.",
            "Mix with mint.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "290 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 71,
          "name": "Cilantro & Bell Pepper Delight #71",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "18 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cilantro",
            "Bell Pepper",
            "Broccoli Leaf",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cilantro.",
            "Prepare the bell pepper.",
            "Mix with broccoli leaf.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "293 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 72,
          "name": "Romaine & Basil Delight #72",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "19 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Romaine",
            "Basil",
            "Cucumber",
            "Fresh Water"
          ],
          "steps": [
            "Wash the romaine.",
            "Prepare the basil.",
            "Mix with cucumber.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "296 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 73,
          "name": "Parsley & Mint Delight #73",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "20 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Parsley",
            "Mint",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the parsley.",
            "Prepare the mint.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "299 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 74,
          "name": "Bell Pepper & Broccoli Leaf Delight #74",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "21 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Bell Pepper",
            "Broccoli Leaf",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bell pepper.",
            "Prepare the broccoli leaf.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "302 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 75,
          "name": "Basil & Cucumber Delight #75",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "22 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Basil",
            "Cucumber",
            "Cilantro",
            "Fresh Water"
          ],
          "steps": [
            "Wash the basil.",
            "Prepare the cucumber.",
            "Mix with cilantro.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "305 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 76,
          "name": "Mint & Zucchini Delight #76",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "23 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mint",
            "Zucchini",
            "Romaine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mint.",
            "Prepare the zucchini.",
            "Mix with romaine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "308 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 77,
          "name": "Broccoli Leaf & Carrot Delight #77",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "24 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Broccoli Leaf",
            "Carrot",
            "Parsley",
            "Fresh Water"
          ],
          "steps": [
            "Wash the broccoli leaf.",
            "Prepare the carrot.",
            "Mix with parsley.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "311 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 78,
          "name": "Cucumber & Cilantro Delight #78",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "25 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cucumber",
            "Cilantro",
            "Bell Pepper",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cucumber.",
            "Prepare the cilantro.",
            "Mix with bell pepper.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "314 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 79,
          "name": "Zucchini & Romaine Delight #79",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "26 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Romaine",
            "Basil",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the romaine.",
            "Mix with basil.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "317 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 80,
          "name": "Carrot & Parsley Delight #80",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "27 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Parsley",
            "Mint",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the parsley.",
            "Mix with mint.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "320 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 81,
          "name": "Cilantro & Bell Pepper Delight #81",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "28 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cilantro",
            "Bell Pepper",
            "Broccoli Leaf",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cilantro.",
            "Prepare the bell pepper.",
            "Mix with broccoli leaf.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "323 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 82,
          "name": "Romaine & Basil Delight #82",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "29 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Romaine",
            "Basil",
            "Cucumber",
            "Fresh Water"
          ],
          "steps": [
            "Wash the romaine.",
            "Prepare the basil.",
            "Mix with cucumber.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "326 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 83,
          "name": "Parsley & Mint Delight #83",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "30 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Parsley",
            "Mint",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the parsley.",
            "Prepare the mint.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "329 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 84,
          "name": "Bell Pepper & Broccoli Leaf Delight #84",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "10 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Bell Pepper",
            "Broccoli Leaf",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bell pepper.",
            "Prepare the broccoli leaf.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "332 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 85,
          "name": "Basil & Cucumber Delight #85",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "11 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Basil",
            "Cucumber",
            "Cilantro",
            "Fresh Water"
          ],
          "steps": [
            "Wash the basil.",
            "Prepare the cucumber.",
            "Mix with cilantro.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "335 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 86,
          "name": "Mint & Zucchini Delight #86",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "12 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mint",
            "Zucchini",
            "Romaine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mint.",
            "Prepare the zucchini.",
            "Mix with romaine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "338 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 87,
          "name": "Broccoli Leaf & Carrot Delight #87",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "13 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Broccoli Leaf",
            "Carrot",
            "Parsley",
            "Fresh Water"
          ],
          "steps": [
            "Wash the broccoli leaf.",
            "Prepare the carrot.",
            "Mix with parsley.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "341 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 88,
          "name": "Cucumber & Cilantro Delight #88",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "14 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cucumber",
            "Cilantro",
            "Bell Pepper",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cucumber.",
            "Prepare the cilantro.",
            "Mix with bell pepper.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "344 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 89,
          "name": "Zucchini & Romaine Delight #89",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "15 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Romaine",
            "Basil",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the romaine.",
            "Mix with basil.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "347 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 90,
          "name": "Carrot & Parsley Delight #90",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "16 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Parsley",
            "Mint",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the parsley.",
            "Mix with mint.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "350 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 91,
          "name": "Cilantro & Bell Pepper Delight #91",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "17 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cilantro",
            "Bell Pepper",
            "Broccoli Leaf",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cilantro.",
            "Prepare the bell pepper.",
            "Mix with broccoli leaf.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "353 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 92,
          "name": "Romaine & Basil Delight #92",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "18 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Romaine",
            "Basil",
            "Cucumber",
            "Fresh Water"
          ],
          "steps": [
            "Wash the romaine.",
            "Prepare the basil.",
            "Mix with cucumber.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "356 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 93,
          "name": "Parsley & Mint Delight #93",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "19 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Parsley",
            "Mint",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the parsley.",
            "Prepare the mint.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "359 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 94,
          "name": "Bell Pepper & Broccoli Leaf Delight #94",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "20 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Bell Pepper",
            "Broccoli Leaf",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bell pepper.",
            "Prepare the broccoli leaf.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "362 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 95,
          "name": "Basil & Cucumber Delight #95",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "21 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Basil",
            "Cucumber",
            "Cilantro",
            "Fresh Water"
          ],
          "steps": [
            "Wash the basil.",
            "Prepare the cucumber.",
            "Mix with cilantro.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "365 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 96,
          "name": "Mint & Zucchini Delight #96",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "22 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mint",
            "Zucchini",
            "Romaine",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mint.",
            "Prepare the zucchini.",
            "Mix with romaine.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "368 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 97,
          "name": "Broccoli Leaf & Carrot Delight #97",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "23 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Broccoli Leaf",
            "Carrot",
            "Parsley",
            "Fresh Water"
          ],
          "steps": [
            "Wash the broccoli leaf.",
            "Prepare the carrot.",
            "Mix with parsley.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "371 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 98,
          "name": "Cucumber & Cilantro Delight #98",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "24 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Cucumber",
            "Cilantro",
            "Bell Pepper",
            "Fresh Water"
          ],
          "steps": [
            "Wash the cucumber.",
            "Prepare the cilantro.",
            "Mix with bell pepper.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "374 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 99,
          "name": "Zucchini & Romaine Delight #99",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "25 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Romaine",
            "Basil",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the romaine.",
            "Mix with basil.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "377 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 100,
          "name": "Carrot & Parsley Delight #100",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "26 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Parsley",
            "Mint",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the parsley.",
            "Mix with mint.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "380 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        }
      ],
      "parrot": [
        {
          "id": 1,
          "name": "Banana & Peas Delight #1",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "11 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Banana",
            "Peas",
            "Guava",
            "Fresh Water"
          ],
          "steps": [
            "Wash the banana.",
            "Prepare the peas.",
            "Mix with guava.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "83 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 2,
          "name": "Papaya & Carrot Delight #2",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "12 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Papaya",
            "Carrot",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the papaya.",
            "Prepare the carrot.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "86 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 3,
          "name": "Corn & Mango Delight #3",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "13 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Corn",
            "Mango",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the corn.",
            "Prepare the mango.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "89 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 4,
          "name": "Peas & Guava Delight #4",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "14 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Peas",
            "Guava",
            "Apple",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the guava.",
            "Mix with apple.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "92 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 5,
          "name": "Carrot & Spinach Delight #5",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "15 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Spinach",
            "Banana",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the spinach.",
            "Mix with banana.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "95 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 6,
          "name": "Mango & Pumpkin Delight #6",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "16 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mango",
            "Pumpkin",
            "Papaya",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mango.",
            "Prepare the pumpkin.",
            "Mix with papaya.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "98 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 7,
          "name": "Guava & Apple Delight #7",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "17 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Guava",
            "Apple",
            "Corn",
            "Fresh Water"
          ],
          "steps": [
            "Wash the guava.",
            "Prepare the apple.",
            "Mix with corn.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "101 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 8,
          "name": "Spinach & Banana Delight #8",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "18 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Banana",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the banana.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "104 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 9,
          "name": "Pumpkin & Papaya Delight #9",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "19 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Papaya",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the papaya.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "107 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 10,
          "name": "Apple & Corn Delight #10",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "20 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Apple",
            "Corn",
            "Mango",
            "Fresh Water"
          ],
          "steps": [
            "Wash the apple.",
            "Prepare the corn.",
            "Mix with mango.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "110 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 11,
          "name": "Banana & Peas Delight #11",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "21 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Banana",
            "Peas",
            "Guava",
            "Fresh Water"
          ],
          "steps": [
            "Wash the banana.",
            "Prepare the peas.",
            "Mix with guava.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "113 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 12,
          "name": "Papaya & Carrot Delight #12",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "22 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Papaya",
            "Carrot",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the papaya.",
            "Prepare the carrot.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "116 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 13,
          "name": "Corn & Mango Delight #13",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "23 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Corn",
            "Mango",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the corn.",
            "Prepare the mango.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "119 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 14,
          "name": "Peas & Guava Delight #14",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "24 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Peas",
            "Guava",
            "Apple",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the guava.",
            "Mix with apple.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "122 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 15,
          "name": "Carrot & Spinach Delight #15",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "25 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Spinach",
            "Banana",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the spinach.",
            "Mix with banana.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "125 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 16,
          "name": "Mango & Pumpkin Delight #16",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "26 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mango",
            "Pumpkin",
            "Papaya",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mango.",
            "Prepare the pumpkin.",
            "Mix with papaya.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "128 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 17,
          "name": "Guava & Apple Delight #17",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "27 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Guava",
            "Apple",
            "Corn",
            "Fresh Water"
          ],
          "steps": [
            "Wash the guava.",
            "Prepare the apple.",
            "Mix with corn.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "131 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 18,
          "name": "Spinach & Banana Delight #18",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "28 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Banana",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the banana.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "134 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 19,
          "name": "Pumpkin & Papaya Delight #19",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "29 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Papaya",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the papaya.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "137 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 20,
          "name": "Apple & Corn Delight #20",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "30 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Apple",
            "Corn",
            "Mango",
            "Fresh Water"
          ],
          "steps": [
            "Wash the apple.",
            "Prepare the corn.",
            "Mix with mango.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "140 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 21,
          "name": "Banana & Peas Delight #21",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "10 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Banana",
            "Peas",
            "Guava",
            "Fresh Water"
          ],
          "steps": [
            "Wash the banana.",
            "Prepare the peas.",
            "Mix with guava.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "143 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 22,
          "name": "Papaya & Carrot Delight #22",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "11 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Papaya",
            "Carrot",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the papaya.",
            "Prepare the carrot.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "146 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 23,
          "name": "Corn & Mango Delight #23",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "12 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Corn",
            "Mango",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the corn.",
            "Prepare the mango.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "149 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 24,
          "name": "Peas & Guava Delight #24",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "13 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Peas",
            "Guava",
            "Apple",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the guava.",
            "Mix with apple.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "152 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 25,
          "name": "Carrot & Spinach Delight #25",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "14 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Spinach",
            "Banana",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the spinach.",
            "Mix with banana.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "155 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 26,
          "name": "Mango & Pumpkin Delight #26",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "15 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mango",
            "Pumpkin",
            "Papaya",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mango.",
            "Prepare the pumpkin.",
            "Mix with papaya.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "158 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 27,
          "name": "Guava & Apple Delight #27",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "16 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Guava",
            "Apple",
            "Corn",
            "Fresh Water"
          ],
          "steps": [
            "Wash the guava.",
            "Prepare the apple.",
            "Mix with corn.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "161 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 28,
          "name": "Spinach & Banana Delight #28",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "17 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Banana",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the banana.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "164 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 29,
          "name": "Pumpkin & Papaya Delight #29",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "18 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Papaya",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the papaya.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "167 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 30,
          "name": "Apple & Corn Delight #30",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "19 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Apple",
            "Corn",
            "Mango",
            "Fresh Water"
          ],
          "steps": [
            "Wash the apple.",
            "Prepare the corn.",
            "Mix with mango.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "170 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 31,
          "name": "Banana & Peas Delight #31",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "20 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Banana",
            "Peas",
            "Guava",
            "Fresh Water"
          ],
          "steps": [
            "Wash the banana.",
            "Prepare the peas.",
            "Mix with guava.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "173 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 32,
          "name": "Papaya & Carrot Delight #32",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "21 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Papaya",
            "Carrot",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the papaya.",
            "Prepare the carrot.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "176 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 33,
          "name": "Corn & Mango Delight #33",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "22 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Corn",
            "Mango",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the corn.",
            "Prepare the mango.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "179 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 34,
          "name": "Peas & Guava Delight #34",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "23 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Peas",
            "Guava",
            "Apple",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the guava.",
            "Mix with apple.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "182 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 35,
          "name": "Carrot & Spinach Delight #35",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "24 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Spinach",
            "Banana",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the spinach.",
            "Mix with banana.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "185 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 36,
          "name": "Mango & Pumpkin Delight #36",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "25 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mango",
            "Pumpkin",
            "Papaya",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mango.",
            "Prepare the pumpkin.",
            "Mix with papaya.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "188 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 37,
          "name": "Guava & Apple Delight #37",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "26 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Guava",
            "Apple",
            "Corn",
            "Fresh Water"
          ],
          "steps": [
            "Wash the guava.",
            "Prepare the apple.",
            "Mix with corn.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "191 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 38,
          "name": "Spinach & Banana Delight #38",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "27 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Banana",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the banana.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "194 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 39,
          "name": "Pumpkin & Papaya Delight #39",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "28 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Papaya",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the papaya.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "197 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 40,
          "name": "Apple & Corn Delight #40",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "29 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Apple",
            "Corn",
            "Mango",
            "Fresh Water"
          ],
          "steps": [
            "Wash the apple.",
            "Prepare the corn.",
            "Mix with mango.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "200 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 41,
          "name": "Banana & Peas Delight #41",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "30 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Banana",
            "Peas",
            "Guava",
            "Fresh Water"
          ],
          "steps": [
            "Wash the banana.",
            "Prepare the peas.",
            "Mix with guava.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "203 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 42,
          "name": "Papaya & Carrot Delight #42",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "10 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Papaya",
            "Carrot",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the papaya.",
            "Prepare the carrot.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "206 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 43,
          "name": "Corn & Mango Delight #43",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "11 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Corn",
            "Mango",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the corn.",
            "Prepare the mango.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "209 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 44,
          "name": "Peas & Guava Delight #44",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "12 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Peas",
            "Guava",
            "Apple",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the guava.",
            "Mix with apple.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "212 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 45,
          "name": "Carrot & Spinach Delight #45",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "13 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Spinach",
            "Banana",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the spinach.",
            "Mix with banana.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "215 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 46,
          "name": "Mango & Pumpkin Delight #46",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "14 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mango",
            "Pumpkin",
            "Papaya",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mango.",
            "Prepare the pumpkin.",
            "Mix with papaya.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "218 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 47,
          "name": "Guava & Apple Delight #47",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "15 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Guava",
            "Apple",
            "Corn",
            "Fresh Water"
          ],
          "steps": [
            "Wash the guava.",
            "Prepare the apple.",
            "Mix with corn.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "221 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 48,
          "name": "Spinach & Banana Delight #48",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "16 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Banana",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the banana.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "224 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 49,
          "name": "Pumpkin & Papaya Delight #49",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "17 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Papaya",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the papaya.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "227 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 50,
          "name": "Apple & Corn Delight #50",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "18 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Apple",
            "Corn",
            "Mango",
            "Fresh Water"
          ],
          "steps": [
            "Wash the apple.",
            "Prepare the corn.",
            "Mix with mango.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "230 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 51,
          "name": "Banana & Peas Delight #51",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "19 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Banana",
            "Peas",
            "Guava",
            "Fresh Water"
          ],
          "steps": [
            "Wash the banana.",
            "Prepare the peas.",
            "Mix with guava.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "233 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 52,
          "name": "Papaya & Carrot Delight #52",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "20 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Papaya",
            "Carrot",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the papaya.",
            "Prepare the carrot.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "236 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 53,
          "name": "Corn & Mango Delight #53",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "21 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Corn",
            "Mango",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the corn.",
            "Prepare the mango.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "239 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 54,
          "name": "Peas & Guava Delight #54",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "22 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Peas",
            "Guava",
            "Apple",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the guava.",
            "Mix with apple.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "242 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 55,
          "name": "Carrot & Spinach Delight #55",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "23 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Spinach",
            "Banana",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the spinach.",
            "Mix with banana.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "245 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 56,
          "name": "Mango & Pumpkin Delight #56",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "24 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mango",
            "Pumpkin",
            "Papaya",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mango.",
            "Prepare the pumpkin.",
            "Mix with papaya.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "248 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 57,
          "name": "Guava & Apple Delight #57",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "25 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Guava",
            "Apple",
            "Corn",
            "Fresh Water"
          ],
          "steps": [
            "Wash the guava.",
            "Prepare the apple.",
            "Mix with corn.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "251 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 58,
          "name": "Spinach & Banana Delight #58",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "26 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Banana",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the banana.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "254 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 59,
          "name": "Pumpkin & Papaya Delight #59",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "27 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Papaya",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the papaya.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "257 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 60,
          "name": "Apple & Corn Delight #60",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "28 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Apple",
            "Corn",
            "Mango",
            "Fresh Water"
          ],
          "steps": [
            "Wash the apple.",
            "Prepare the corn.",
            "Mix with mango.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "260 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 61,
          "name": "Banana & Peas Delight #61",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "29 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Banana",
            "Peas",
            "Guava",
            "Fresh Water"
          ],
          "steps": [
            "Wash the banana.",
            "Prepare the peas.",
            "Mix with guava.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "263 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 62,
          "name": "Papaya & Carrot Delight #62",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "30 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Papaya",
            "Carrot",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the papaya.",
            "Prepare the carrot.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "266 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 63,
          "name": "Corn & Mango Delight #63",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "10 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Corn",
            "Mango",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the corn.",
            "Prepare the mango.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "269 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 64,
          "name": "Peas & Guava Delight #64",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "11 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Peas",
            "Guava",
            "Apple",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the guava.",
            "Mix with apple.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "272 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 65,
          "name": "Carrot & Spinach Delight #65",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "12 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Spinach",
            "Banana",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the spinach.",
            "Mix with banana.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "275 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 66,
          "name": "Mango & Pumpkin Delight #66",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "13 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mango",
            "Pumpkin",
            "Papaya",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mango.",
            "Prepare the pumpkin.",
            "Mix with papaya.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "278 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 67,
          "name": "Guava & Apple Delight #67",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "14 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Guava",
            "Apple",
            "Corn",
            "Fresh Water"
          ],
          "steps": [
            "Wash the guava.",
            "Prepare the apple.",
            "Mix with corn.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "281 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 68,
          "name": "Spinach & Banana Delight #68",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "15 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Banana",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the banana.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "284 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 69,
          "name": "Pumpkin & Papaya Delight #69",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "16 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Papaya",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the papaya.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "287 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 70,
          "name": "Apple & Corn Delight #70",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "17 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Apple",
            "Corn",
            "Mango",
            "Fresh Water"
          ],
          "steps": [
            "Wash the apple.",
            "Prepare the corn.",
            "Mix with mango.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "290 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 71,
          "name": "Banana & Peas Delight #71",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "18 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Banana",
            "Peas",
            "Guava",
            "Fresh Water"
          ],
          "steps": [
            "Wash the banana.",
            "Prepare the peas.",
            "Mix with guava.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "293 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 72,
          "name": "Papaya & Carrot Delight #72",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "19 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Papaya",
            "Carrot",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the papaya.",
            "Prepare the carrot.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "296 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 73,
          "name": "Corn & Mango Delight #73",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "20 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Corn",
            "Mango",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the corn.",
            "Prepare the mango.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "299 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 74,
          "name": "Peas & Guava Delight #74",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "21 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Peas",
            "Guava",
            "Apple",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the guava.",
            "Mix with apple.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "302 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 75,
          "name": "Carrot & Spinach Delight #75",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "22 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Spinach",
            "Banana",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the spinach.",
            "Mix with banana.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "305 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 76,
          "name": "Mango & Pumpkin Delight #76",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "23 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mango",
            "Pumpkin",
            "Papaya",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mango.",
            "Prepare the pumpkin.",
            "Mix with papaya.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "308 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 77,
          "name": "Guava & Apple Delight #77",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "24 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Guava",
            "Apple",
            "Corn",
            "Fresh Water"
          ],
          "steps": [
            "Wash the guava.",
            "Prepare the apple.",
            "Mix with corn.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "311 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 78,
          "name": "Spinach & Banana Delight #78",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "25 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Banana",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the banana.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "314 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 79,
          "name": "Pumpkin & Papaya Delight #79",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "26 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Papaya",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the papaya.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "317 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 80,
          "name": "Apple & Corn Delight #80",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "27 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Apple",
            "Corn",
            "Mango",
            "Fresh Water"
          ],
          "steps": [
            "Wash the apple.",
            "Prepare the corn.",
            "Mix with mango.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "320 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 81,
          "name": "Banana & Peas Delight #81",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "28 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Banana",
            "Peas",
            "Guava",
            "Fresh Water"
          ],
          "steps": [
            "Wash the banana.",
            "Prepare the peas.",
            "Mix with guava.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "323 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 82,
          "name": "Papaya & Carrot Delight #82",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "29 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Papaya",
            "Carrot",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the papaya.",
            "Prepare the carrot.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "326 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 83,
          "name": "Corn & Mango Delight #83",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "30 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Corn",
            "Mango",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the corn.",
            "Prepare the mango.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "329 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 84,
          "name": "Peas & Guava Delight #84",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "10 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Peas",
            "Guava",
            "Apple",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the guava.",
            "Mix with apple.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "332 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 85,
          "name": "Carrot & Spinach Delight #85",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "11 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Spinach",
            "Banana",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the spinach.",
            "Mix with banana.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "335 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 86,
          "name": "Mango & Pumpkin Delight #86",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "12 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mango",
            "Pumpkin",
            "Papaya",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mango.",
            "Prepare the pumpkin.",
            "Mix with papaya.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "338 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 87,
          "name": "Guava & Apple Delight #87",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "13 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Guava",
            "Apple",
            "Corn",
            "Fresh Water"
          ],
          "steps": [
            "Wash the guava.",
            "Prepare the apple.",
            "Mix with corn.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "341 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 88,
          "name": "Spinach & Banana Delight #88",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "14 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Banana",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the banana.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "344 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 89,
          "name": "Pumpkin & Papaya Delight #89",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "15 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Papaya",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the papaya.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "347 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 90,
          "name": "Apple & Corn Delight #90",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "16 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Apple",
            "Corn",
            "Mango",
            "Fresh Water"
          ],
          "steps": [
            "Wash the apple.",
            "Prepare the corn.",
            "Mix with mango.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "350 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 91,
          "name": "Banana & Peas Delight #91",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "17 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Banana",
            "Peas",
            "Guava",
            "Fresh Water"
          ],
          "steps": [
            "Wash the banana.",
            "Prepare the peas.",
            "Mix with guava.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "353 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 92,
          "name": "Papaya & Carrot Delight #92",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "18 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Papaya",
            "Carrot",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the papaya.",
            "Prepare the carrot.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "356 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 93,
          "name": "Corn & Mango Delight #93",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "19 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Corn",
            "Mango",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the corn.",
            "Prepare the mango.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "359 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 94,
          "name": "Peas & Guava Delight #94",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "20 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Peas",
            "Guava",
            "Apple",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the guava.",
            "Mix with apple.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "362 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 95,
          "name": "Carrot & Spinach Delight #95",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "21 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Carrot",
            "Spinach",
            "Banana",
            "Fresh Water"
          ],
          "steps": [
            "Wash the carrot.",
            "Prepare the spinach.",
            "Mix with banana.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "365 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 96,
          "name": "Mango & Pumpkin Delight #96",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "22 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Mango",
            "Pumpkin",
            "Papaya",
            "Fresh Water"
          ],
          "steps": [
            "Wash the mango.",
            "Prepare the pumpkin.",
            "Mix with papaya.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "368 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 97,
          "name": "Guava & Apple Delight #97",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "23 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Guava",
            "Apple",
            "Corn",
            "Fresh Water"
          ],
          "steps": [
            "Wash the guava.",
            "Prepare the apple.",
            "Mix with corn.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "371 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 98,
          "name": "Spinach & Banana Delight #98",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "24 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Banana",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the banana.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "374 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 99,
          "name": "Pumpkin & Papaya Delight #99",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "25 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Papaya",
            "Carrot",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the papaya.",
            "Mix with carrot.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "377 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 100,
          "name": "Apple & Corn Delight #100",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "26 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Apple",
            "Corn",
            "Mango",
            "Fresh Water"
          ],
          "steps": [
            "Wash the apple.",
            "Prepare the corn.",
            "Mix with mango.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "380 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        }
      ],
      "fish": [
        {
          "id": 1,
          "name": "Shrimp & Zucchini Delight #1",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "11 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Shrimp",
            "Zucchini",
            "Daphnia",
            "Fresh Water"
          ],
          "steps": [
            "Wash the shrimp.",
            "Prepare the zucchini.",
            "Mix with daphnia.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "83 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 2,
          "name": "Bloodworms & Algae Delight #2",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "12 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Bloodworms",
            "Algae",
            "Duckweed",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bloodworms.",
            "Prepare the algae.",
            "Mix with duckweed.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "86 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 3,
          "name": "Spinach & Brine Shrimp Delight #3",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "13 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Brine Shrimp",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the brine shrimp.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "89 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 4,
          "name": "Zucchini & Daphnia Delight #4",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "14 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Daphnia",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the daphnia.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "92 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 5,
          "name": "Algae & Duckweed Delight #5",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "15 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Algae",
            "Duckweed",
            "Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the algae.",
            "Prepare the duckweed.",
            "Mix with shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "95 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 6,
          "name": "Brine Shrimp & Pumpkin Delight #6",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "16 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Brine Shrimp",
            "Pumpkin",
            "Bloodworms",
            "Fresh Water"
          ],
          "steps": [
            "Wash the brine shrimp.",
            "Prepare the pumpkin.",
            "Mix with bloodworms.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "98 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 7,
          "name": "Daphnia & Peas Delight #7",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "17 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Daphnia",
            "Peas",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the daphnia.",
            "Prepare the peas.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "101 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 8,
          "name": "Duckweed & Shrimp Delight #8",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "18 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Duckweed",
            "Shrimp",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duckweed.",
            "Prepare the shrimp.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "104 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 9,
          "name": "Pumpkin & Bloodworms Delight #9",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "19 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Bloodworms",
            "Algae",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the bloodworms.",
            "Mix with algae.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "107 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 10,
          "name": "Peas & Spinach Delight #10",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "20 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Peas",
            "Spinach",
            "Brine Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the spinach.",
            "Mix with brine shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "110 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 11,
          "name": "Shrimp & Zucchini Delight #11",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "21 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Shrimp",
            "Zucchini",
            "Daphnia",
            "Fresh Water"
          ],
          "steps": [
            "Wash the shrimp.",
            "Prepare the zucchini.",
            "Mix with daphnia.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "113 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 12,
          "name": "Bloodworms & Algae Delight #12",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "22 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Bloodworms",
            "Algae",
            "Duckweed",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bloodworms.",
            "Prepare the algae.",
            "Mix with duckweed.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "116 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 13,
          "name": "Spinach & Brine Shrimp Delight #13",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "23 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Brine Shrimp",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the brine shrimp.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "119 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 14,
          "name": "Zucchini & Daphnia Delight #14",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "24 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Daphnia",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the daphnia.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "122 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 15,
          "name": "Algae & Duckweed Delight #15",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "25 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Algae",
            "Duckweed",
            "Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the algae.",
            "Prepare the duckweed.",
            "Mix with shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "125 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 16,
          "name": "Brine Shrimp & Pumpkin Delight #16",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "26 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Brine Shrimp",
            "Pumpkin",
            "Bloodworms",
            "Fresh Water"
          ],
          "steps": [
            "Wash the brine shrimp.",
            "Prepare the pumpkin.",
            "Mix with bloodworms.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "128 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 17,
          "name": "Daphnia & Peas Delight #17",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "27 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Daphnia",
            "Peas",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the daphnia.",
            "Prepare the peas.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "131 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 18,
          "name": "Duckweed & Shrimp Delight #18",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "28 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Duckweed",
            "Shrimp",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duckweed.",
            "Prepare the shrimp.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "134 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 19,
          "name": "Pumpkin & Bloodworms Delight #19",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "29 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Bloodworms",
            "Algae",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the bloodworms.",
            "Mix with algae.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "137 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 20,
          "name": "Peas & Spinach Delight #20",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "30 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Peas",
            "Spinach",
            "Brine Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the spinach.",
            "Mix with brine shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "140 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 21,
          "name": "Shrimp & Zucchini Delight #21",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "10 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Shrimp",
            "Zucchini",
            "Daphnia",
            "Fresh Water"
          ],
          "steps": [
            "Wash the shrimp.",
            "Prepare the zucchini.",
            "Mix with daphnia.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "143 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 22,
          "name": "Bloodworms & Algae Delight #22",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "11 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Bloodworms",
            "Algae",
            "Duckweed",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bloodworms.",
            "Prepare the algae.",
            "Mix with duckweed.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "146 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 23,
          "name": "Spinach & Brine Shrimp Delight #23",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "12 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Brine Shrimp",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the brine shrimp.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "149 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 24,
          "name": "Zucchini & Daphnia Delight #24",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "13 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Daphnia",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the daphnia.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "152 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 25,
          "name": "Algae & Duckweed Delight #25",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "14 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Algae",
            "Duckweed",
            "Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the algae.",
            "Prepare the duckweed.",
            "Mix with shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "155 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 26,
          "name": "Brine Shrimp & Pumpkin Delight #26",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "15 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Brine Shrimp",
            "Pumpkin",
            "Bloodworms",
            "Fresh Water"
          ],
          "steps": [
            "Wash the brine shrimp.",
            "Prepare the pumpkin.",
            "Mix with bloodworms.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "158 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 27,
          "name": "Daphnia & Peas Delight #27",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "16 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Daphnia",
            "Peas",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the daphnia.",
            "Prepare the peas.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "161 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 28,
          "name": "Duckweed & Shrimp Delight #28",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "17 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Duckweed",
            "Shrimp",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duckweed.",
            "Prepare the shrimp.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "164 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 29,
          "name": "Pumpkin & Bloodworms Delight #29",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "18 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Bloodworms",
            "Algae",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the bloodworms.",
            "Mix with algae.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "167 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 30,
          "name": "Peas & Spinach Delight #30",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "19 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Peas",
            "Spinach",
            "Brine Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the spinach.",
            "Mix with brine shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "170 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 31,
          "name": "Shrimp & Zucchini Delight #31",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "20 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Shrimp",
            "Zucchini",
            "Daphnia",
            "Fresh Water"
          ],
          "steps": [
            "Wash the shrimp.",
            "Prepare the zucchini.",
            "Mix with daphnia.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "173 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 32,
          "name": "Bloodworms & Algae Delight #32",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "21 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Bloodworms",
            "Algae",
            "Duckweed",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bloodworms.",
            "Prepare the algae.",
            "Mix with duckweed.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "176 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 33,
          "name": "Spinach & Brine Shrimp Delight #33",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "22 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Brine Shrimp",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the brine shrimp.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "179 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 34,
          "name": "Zucchini & Daphnia Delight #34",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "23 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Daphnia",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the daphnia.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "182 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 35,
          "name": "Algae & Duckweed Delight #35",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "24 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Algae",
            "Duckweed",
            "Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the algae.",
            "Prepare the duckweed.",
            "Mix with shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "185 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 36,
          "name": "Brine Shrimp & Pumpkin Delight #36",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "25 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Brine Shrimp",
            "Pumpkin",
            "Bloodworms",
            "Fresh Water"
          ],
          "steps": [
            "Wash the brine shrimp.",
            "Prepare the pumpkin.",
            "Mix with bloodworms.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "188 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 37,
          "name": "Daphnia & Peas Delight #37",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "26 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Daphnia",
            "Peas",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the daphnia.",
            "Prepare the peas.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "191 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 38,
          "name": "Duckweed & Shrimp Delight #38",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "27 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Duckweed",
            "Shrimp",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duckweed.",
            "Prepare the shrimp.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "194 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 39,
          "name": "Pumpkin & Bloodworms Delight #39",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "28 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Bloodworms",
            "Algae",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the bloodworms.",
            "Mix with algae.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "197 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 40,
          "name": "Peas & Spinach Delight #40",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "29 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Peas",
            "Spinach",
            "Brine Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the spinach.",
            "Mix with brine shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "200 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 41,
          "name": "Shrimp & Zucchini Delight #41",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "30 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Shrimp",
            "Zucchini",
            "Daphnia",
            "Fresh Water"
          ],
          "steps": [
            "Wash the shrimp.",
            "Prepare the zucchini.",
            "Mix with daphnia.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "203 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 42,
          "name": "Bloodworms & Algae Delight #42",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "10 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Bloodworms",
            "Algae",
            "Duckweed",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bloodworms.",
            "Prepare the algae.",
            "Mix with duckweed.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "206 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 43,
          "name": "Spinach & Brine Shrimp Delight #43",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "11 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Brine Shrimp",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the brine shrimp.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "209 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 44,
          "name": "Zucchini & Daphnia Delight #44",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "12 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Daphnia",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the daphnia.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "212 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 45,
          "name": "Algae & Duckweed Delight #45",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "13 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Algae",
            "Duckweed",
            "Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the algae.",
            "Prepare the duckweed.",
            "Mix with shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "215 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 46,
          "name": "Brine Shrimp & Pumpkin Delight #46",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "14 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Brine Shrimp",
            "Pumpkin",
            "Bloodworms",
            "Fresh Water"
          ],
          "steps": [
            "Wash the brine shrimp.",
            "Prepare the pumpkin.",
            "Mix with bloodworms.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "218 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 47,
          "name": "Daphnia & Peas Delight #47",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "15 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Daphnia",
            "Peas",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the daphnia.",
            "Prepare the peas.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "221 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 48,
          "name": "Duckweed & Shrimp Delight #48",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "16 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Duckweed",
            "Shrimp",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duckweed.",
            "Prepare the shrimp.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "224 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 49,
          "name": "Pumpkin & Bloodworms Delight #49",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "17 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Bloodworms",
            "Algae",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the bloodworms.",
            "Mix with algae.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "227 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 50,
          "name": "Peas & Spinach Delight #50",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "18 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Peas",
            "Spinach",
            "Brine Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the spinach.",
            "Mix with brine shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "230 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 51,
          "name": "Shrimp & Zucchini Delight #51",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "19 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Shrimp",
            "Zucchini",
            "Daphnia",
            "Fresh Water"
          ],
          "steps": [
            "Wash the shrimp.",
            "Prepare the zucchini.",
            "Mix with daphnia.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "233 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 52,
          "name": "Bloodworms & Algae Delight #52",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "20 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Bloodworms",
            "Algae",
            "Duckweed",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bloodworms.",
            "Prepare the algae.",
            "Mix with duckweed.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "236 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 53,
          "name": "Spinach & Brine Shrimp Delight #53",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "21 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Brine Shrimp",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the brine shrimp.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "239 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 54,
          "name": "Zucchini & Daphnia Delight #54",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "22 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Daphnia",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the daphnia.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "242 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 55,
          "name": "Algae & Duckweed Delight #55",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "23 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Algae",
            "Duckweed",
            "Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the algae.",
            "Prepare the duckweed.",
            "Mix with shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "245 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 56,
          "name": "Brine Shrimp & Pumpkin Delight #56",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "24 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Brine Shrimp",
            "Pumpkin",
            "Bloodworms",
            "Fresh Water"
          ],
          "steps": [
            "Wash the brine shrimp.",
            "Prepare the pumpkin.",
            "Mix with bloodworms.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "248 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 57,
          "name": "Daphnia & Peas Delight #57",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "25 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Daphnia",
            "Peas",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the daphnia.",
            "Prepare the peas.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "251 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 58,
          "name": "Duckweed & Shrimp Delight #58",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "26 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Duckweed",
            "Shrimp",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duckweed.",
            "Prepare the shrimp.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "254 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 59,
          "name": "Pumpkin & Bloodworms Delight #59",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "27 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Bloodworms",
            "Algae",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the bloodworms.",
            "Mix with algae.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "257 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 60,
          "name": "Peas & Spinach Delight #60",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "28 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Peas",
            "Spinach",
            "Brine Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the spinach.",
            "Mix with brine shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "260 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 61,
          "name": "Shrimp & Zucchini Delight #61",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "29 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Shrimp",
            "Zucchini",
            "Daphnia",
            "Fresh Water"
          ],
          "steps": [
            "Wash the shrimp.",
            "Prepare the zucchini.",
            "Mix with daphnia.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "263 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 62,
          "name": "Bloodworms & Algae Delight #62",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "30 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Bloodworms",
            "Algae",
            "Duckweed",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bloodworms.",
            "Prepare the algae.",
            "Mix with duckweed.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "266 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 63,
          "name": "Spinach & Brine Shrimp Delight #63",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "10 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Brine Shrimp",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the brine shrimp.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "269 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 64,
          "name": "Zucchini & Daphnia Delight #64",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "11 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Daphnia",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the daphnia.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "272 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 65,
          "name": "Algae & Duckweed Delight #65",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "12 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Algae",
            "Duckweed",
            "Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the algae.",
            "Prepare the duckweed.",
            "Mix with shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "275 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 66,
          "name": "Brine Shrimp & Pumpkin Delight #66",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "13 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Brine Shrimp",
            "Pumpkin",
            "Bloodworms",
            "Fresh Water"
          ],
          "steps": [
            "Wash the brine shrimp.",
            "Prepare the pumpkin.",
            "Mix with bloodworms.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "278 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 67,
          "name": "Daphnia & Peas Delight #67",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "14 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Daphnia",
            "Peas",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the daphnia.",
            "Prepare the peas.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "281 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 68,
          "name": "Duckweed & Shrimp Delight #68",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "15 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Duckweed",
            "Shrimp",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duckweed.",
            "Prepare the shrimp.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "284 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 69,
          "name": "Pumpkin & Bloodworms Delight #69",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "16 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Bloodworms",
            "Algae",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the bloodworms.",
            "Mix with algae.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "287 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 70,
          "name": "Peas & Spinach Delight #70",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "17 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Peas",
            "Spinach",
            "Brine Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the spinach.",
            "Mix with brine shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "290 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 71,
          "name": "Shrimp & Zucchini Delight #71",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "18 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Shrimp",
            "Zucchini",
            "Daphnia",
            "Fresh Water"
          ],
          "steps": [
            "Wash the shrimp.",
            "Prepare the zucchini.",
            "Mix with daphnia.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "293 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 72,
          "name": "Bloodworms & Algae Delight #72",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "19 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Bloodworms",
            "Algae",
            "Duckweed",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bloodworms.",
            "Prepare the algae.",
            "Mix with duckweed.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "296 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 73,
          "name": "Spinach & Brine Shrimp Delight #73",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "20 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Brine Shrimp",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the brine shrimp.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "299 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 74,
          "name": "Zucchini & Daphnia Delight #74",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "21 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Daphnia",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the daphnia.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "302 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 75,
          "name": "Algae & Duckweed Delight #75",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "22 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Algae",
            "Duckweed",
            "Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the algae.",
            "Prepare the duckweed.",
            "Mix with shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "305 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 76,
          "name": "Brine Shrimp & Pumpkin Delight #76",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "23 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Brine Shrimp",
            "Pumpkin",
            "Bloodworms",
            "Fresh Water"
          ],
          "steps": [
            "Wash the brine shrimp.",
            "Prepare the pumpkin.",
            "Mix with bloodworms.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "308 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 77,
          "name": "Daphnia & Peas Delight #77",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "24 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Daphnia",
            "Peas",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the daphnia.",
            "Prepare the peas.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "6 g",
            "fat": "7 g",
            "calories": "311 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 78,
          "name": "Duckweed & Shrimp Delight #78",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "25 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Duckweed",
            "Shrimp",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duckweed.",
            "Prepare the shrimp.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "1 g",
            "fat": "8 g",
            "calories": "314 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 79,
          "name": "Pumpkin & Bloodworms Delight #79",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "26 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Bloodworms",
            "Algae",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the bloodworms.",
            "Mix with algae.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "2 g",
            "fat": "9 g",
            "calories": "317 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 80,
          "name": "Peas & Spinach Delight #80",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "27 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Peas",
            "Spinach",
            "Brine Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the spinach.",
            "Mix with brine shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "3 g",
            "fat": "2 g",
            "calories": "320 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 81,
          "name": "Shrimp & Zucchini Delight #81",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "28 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Shrimp",
            "Zucchini",
            "Daphnia",
            "Fresh Water"
          ],
          "steps": [
            "Wash the shrimp.",
            "Prepare the zucchini.",
            "Mix with daphnia.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "11 g",
            "fiber": "4 g",
            "fat": "3 g",
            "calories": "323 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 82,
          "name": "Bloodworms & Algae Delight #82",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "29 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Bloodworms",
            "Algae",
            "Duckweed",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bloodworms.",
            "Prepare the algae.",
            "Mix with duckweed.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "12 g",
            "fiber": "5 g",
            "fat": "4 g",
            "calories": "326 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 83,
          "name": "Spinach & Brine Shrimp Delight #83",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "30 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Brine Shrimp",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the brine shrimp.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "13 g",
            "fiber": "6 g",
            "fat": "5 g",
            "calories": "329 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 84,
          "name": "Zucchini & Daphnia Delight #84",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "10 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Daphnia",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the daphnia.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "14 g",
            "fiber": "1 g",
            "fat": "6 g",
            "calories": "332 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 85,
          "name": "Algae & Duckweed Delight #85",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "11 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Algae",
            "Duckweed",
            "Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the algae.",
            "Prepare the duckweed.",
            "Mix with shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "15 g",
            "fiber": "2 g",
            "fat": "7 g",
            "calories": "335 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 86,
          "name": "Brine Shrimp & Pumpkin Delight #86",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "12 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Brine Shrimp",
            "Pumpkin",
            "Bloodworms",
            "Fresh Water"
          ],
          "steps": [
            "Wash the brine shrimp.",
            "Prepare the pumpkin.",
            "Mix with bloodworms.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "16 g",
            "fiber": "3 g",
            "fat": "8 g",
            "calories": "338 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 87,
          "name": "Daphnia & Peas Delight #87",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "13 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Daphnia",
            "Peas",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the daphnia.",
            "Prepare the peas.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "17 g",
            "fiber": "4 g",
            "fat": "9 g",
            "calories": "341 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 88,
          "name": "Duckweed & Shrimp Delight #88",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "14 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Duckweed",
            "Shrimp",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duckweed.",
            "Prepare the shrimp.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "18 g",
            "fiber": "5 g",
            "fat": "2 g",
            "calories": "344 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 89,
          "name": "Pumpkin & Bloodworms Delight #89",
          "ageGroup": "Senior",
          "mealType": "Lunch",
          "cookTime": "15 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Bloodworms",
            "Algae",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the bloodworms.",
            "Mix with algae.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "19 g",
            "fiber": "6 g",
            "fat": "3 g",
            "calories": "347 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 90,
          "name": "Peas & Spinach Delight #90",
          "ageGroup": "Baby",
          "mealType": "Dinner",
          "cookTime": "16 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Peas",
            "Spinach",
            "Brine Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the spinach.",
            "Mix with brine shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "20 g",
            "fiber": "1 g",
            "fat": "4 g",
            "calories": "350 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 91,
          "name": "Shrimp & Zucchini Delight #91",
          "ageGroup": "Adult",
          "mealType": "Snack",
          "cookTime": "17 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Shrimp",
            "Zucchini",
            "Daphnia",
            "Fresh Water"
          ],
          "steps": [
            "Wash the shrimp.",
            "Prepare the zucchini.",
            "Mix with daphnia.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "21 g",
            "fiber": "2 g",
            "fat": "5 g",
            "calories": "353 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 92,
          "name": "Bloodworms & Algae Delight #92",
          "ageGroup": "Senior",
          "mealType": "Breakfast",
          "cookTime": "18 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Bloodworms",
            "Algae",
            "Duckweed",
            "Fresh Water"
          ],
          "steps": [
            "Wash the bloodworms.",
            "Prepare the algae.",
            "Mix with duckweed.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "22 g",
            "fiber": "3 g",
            "fat": "6 g",
            "calories": "356 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 93,
          "name": "Spinach & Brine Shrimp Delight #93",
          "ageGroup": "Baby",
          "mealType": "Lunch",
          "cookTime": "19 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Spinach",
            "Brine Shrimp",
            "Pumpkin",
            "Fresh Water"
          ],
          "steps": [
            "Wash the spinach.",
            "Prepare the brine shrimp.",
            "Mix with pumpkin.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "23 g",
            "fiber": "4 g",
            "fat": "7 g",
            "calories": "359 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 94,
          "name": "Zucchini & Daphnia Delight #94",
          "ageGroup": "Adult",
          "mealType": "Dinner",
          "cookTime": "20 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Zucchini",
            "Daphnia",
            "Peas",
            "Fresh Water"
          ],
          "steps": [
            "Wash the zucchini.",
            "Prepare the daphnia.",
            "Mix with peas.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "24 g",
            "fiber": "5 g",
            "fat": "8 g",
            "calories": "362 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 95,
          "name": "Algae & Duckweed Delight #95",
          "ageGroup": "Senior",
          "mealType": "Snack",
          "cookTime": "21 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Algae",
            "Duckweed",
            "Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the algae.",
            "Prepare the duckweed.",
            "Mix with shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "25 g",
            "fiber": "6 g",
            "fat": "9 g",
            "calories": "365 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 96,
          "name": "Brine Shrimp & Pumpkin Delight #96",
          "ageGroup": "Baby",
          "mealType": "Breakfast",
          "cookTime": "22 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Brine Shrimp",
            "Pumpkin",
            "Bloodworms",
            "Fresh Water"
          ],
          "steps": [
            "Wash the brine shrimp.",
            "Prepare the pumpkin.",
            "Mix with bloodworms.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "26 g",
            "fiber": "1 g",
            "fat": "2 g",
            "calories": "368 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 97,
          "name": "Daphnia & Peas Delight #97",
          "ageGroup": "Adult",
          "mealType": "Lunch",
          "cookTime": "23 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Daphnia",
            "Peas",
            "Spinach",
            "Fresh Water"
          ],
          "steps": [
            "Wash the daphnia.",
            "Prepare the peas.",
            "Mix with spinach.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "27 g",
            "fiber": "2 g",
            "fat": "3 g",
            "calories": "371 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 98,
          "name": "Duckweed & Shrimp Delight #98",
          "ageGroup": "Senior",
          "mealType": "Dinner",
          "cookTime": "24 mins",
          "difficulty": "Medium",
          "ingredients": [
            "Duckweed",
            "Shrimp",
            "Zucchini",
            "Fresh Water"
          ],
          "steps": [
            "Wash the duckweed.",
            "Prepare the shrimp.",
            "Mix with zucchini.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "28 g",
            "fiber": "3 g",
            "fat": "4 g",
            "calories": "374 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 99,
          "name": "Pumpkin & Bloodworms Delight #99",
          "ageGroup": "Baby",
          "mealType": "Snack",
          "cookTime": "25 mins",
          "difficulty": "Hard",
          "ingredients": [
            "Pumpkin",
            "Bloodworms",
            "Algae",
            "Fresh Water"
          ],
          "steps": [
            "Wash the pumpkin.",
            "Prepare the bloodworms.",
            "Mix with algae.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "29 g",
            "fiber": "4 g",
            "fat": "5 g",
            "calories": "377 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        },
        {
          "id": 100,
          "name": "Peas & Spinach Delight #100",
          "ageGroup": "Adult",
          "mealType": "Breakfast",
          "cookTime": "26 mins",
          "difficulty": "Easy",
          "ingredients": [
            "Peas",
            "Spinach",
            "Brine Shrimp",
            "Fresh Water"
          ],
          "steps": [
            "Wash the peas.",
            "Prepare the spinach.",
            "Mix with brine shrimp.",
            "Serve fresh in suitable portions."
          ],
          "nutrition": {
            "protein": "10 g",
            "fiber": "5 g",
            "fat": "6 g",
            "calories": "380 kcal"
          },
          "benefits": [
            "Supports digestion",
            "Provides vitamins",
            "Helps maintain energy"
          ],
          "frequency": "1-2 times/week",
          "vetTip": "Adjust portions according to pet size and consult a veterinarian for special diets."
        }
      ]
    };


    // ==================== NEW RECIPE DB CRUD & MEAL PLANNER ====================
    let recipeAnimalFilter = 'All';

    function getDeletedRecipes() {
      return pawCache.deletedRecipes || [];
    }

    async function saveDeletedRecipes(list) {
      pawCache.deletedRecipes = list;
      localStorage.setItem('pawfeed_deleted_recipes', JSON.stringify(list));
      if (!window.supabaseClient || !currentUser) return;
      const currentStore = pawCache.recipes || {};
      currentStore.deletedRecipesList = list;
      await saveRecipeStore(currentStore);
    }

    def_custom_recipes = [];
    function getCustomRecipes() {
      return pawCache.customRecipes || [];
    }

    async function saveCustomRecipes(list) {
      pawCache.customRecipes = list;
      localStorage.setItem('pawfeed_custom_recipes', JSON.stringify(list));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        await window.supabaseClient.from('custom_recipes').delete().eq('user_id', userId);
        if (list.length > 0) {
          const rows = list.map(r => ({
            user_id: userId,
            name: r.name,
            ingredients: r.ingredients,
            steps: r.steps,
            notes: r.notes || ''
          }));
          await window.supabaseClient.from('custom_recipes').insert(rows);
        }
      } catch (err) {
        console.error("Error syncing custom recipes to Supabase:", err);
      }
    }

    function getEditedRecipes() {
      return pawCache.editedRecipes || {};
    }

    async function saveEditedRecipes(map) {
      pawCache.editedRecipes = map;
      localStorage.setItem('pawfeed_edited_recipes', JSON.stringify(map));
      if (!window.supabaseClient || !currentUser) return;
      const currentStore = pawCache.recipes || {};
      currentStore.editedRecipesMap = map;
      await saveRecipeStore(currentStore);
    }

    function getRecipeFavorites() {
      return pawCache.recipeFavorites || [];
    }

    async function saveRecipeFavorites(favs) {
      pawCache.recipeFavorites = favs;
      localStorage.setItem('pawfeed_recipe_favorites', JSON.stringify(favs));
      if (!window.supabaseClient || !currentUser) return;
      const currentStore = pawCache.recipes || {};
      currentStore.recipeFavoritesList = favs;
      await saveRecipeStore(currentStore);
    }
    function isRecipeFavorite(id) { return getRecipeFavorites().includes(id); }

    function toggleRecipeFavorite(id) {
      let favs = getRecipeFavorites();
      if (favs.includes(id)) {
        favs = favs.filter(x => x !== id);
        showToast('Removed from favorites ⭐');
      } else {
        favs.push(id);
        showToast('Added to favorites! ⭐');
      }
      saveRecipeFavorites(favs);
      renderHomemadeTab();
      if (typeof renderRecipeMemory === 'function') renderRecipeMemory();
    }

    function setRecipeAnimalFilter(animal) {
      recipeAnimalFilter = animal;
      const chips = ['All', 'Dog', 'Cat', 'Fish', 'Rabbit', 'Bird'];
      chips.forEach(c => {
        const btn = document.getElementById('achip-' + c);
        if (btn) btn.classList.toggle('active', c === animal);
      });
      renderHomemadeTab();
    }

    // Override normalizeAndMergeDB to support custom edits, additions, and deletions
    function normalizeAndMergeDB() {
      if (!recipeDB || Object.keys(recipeDB).length === 0) return;
      const petKeys = {
        dog: 'Dog',
        cat: 'Cat',
        rabbit: 'Rabbit',
        parrot: 'Bird',
        fish: 'Fish'
      };
      const nonVegKeywords = ['chicken', 'beef', 'turkey', 'fish', 'meat', 'egg', 'salmon', 'pork', 'shrimp', 'lamb', 'duck', 'tuna', 'sardine', 'liver', 'krill', 'cod', 'prawn', 'crab', 'bacon', 'venison', 'bison', 'anchovy', 'mackerel', 'herring', 'shellfish', 'squid', 'octopus'];

      // Clear previous database entries
      const customRecipes = HOME_RECIPES.filter(r => !r.id.toString().startsWith('db_'));
      HOME_RECIPES.length = 0;
      HOME_RECIPES.push(...customRecipes);

      for (const key in recipeDB) {
        const petType = petKeys[key] || (key.charAt(0).toUpperCase() + key.slice(1));
        const list = recipeDB[key];
        if (!Array.isArray(list)) continue;

        list.forEach(r => {
          const ingredientsLower = (r.ingredients || []).map(i => i.toLowerCase());
          const isNonVeg = ingredientsLower.some(ing =>
            nonVegKeywords.some(keyword => ing.includes(keyword))
          );
          const type = isNonVeg ? 'Non-Veg' : 'Veg';

          let cat = 'Meal';
          const mType = (r.mealType || '').toLowerCase();
          if (mType.includes('snack') || mType.includes('treat')) {
            cat = 'Snack';
          } else if (mType.includes('quick') || mType.includes('emergency')) {
            cat = 'Quick';
          } else if (mType.includes('allergy')) {
            cat = 'Allergy';
          } else if (mType.includes('budget')) {
            cat = 'Budget';
          } else if (mType.includes('season')) {
            cat = 'Seasonal';
          }

          const time = parseInt(r.cookTime) || 15;
          const cal = parseInt(r.nutrition?.calories) || 100;
          const protein = parseInt(r.nutrition?.protein) || 10;
          const fiber = parseInt(r.nutrition?.fiber) || 2;
          const vit = Math.round(protein * 2 + fiber * 5) || 50;

          const normalized = {
            id: `db_${key}_${r.id}`,
            title: r.name,
            pet: [petType],
            type: type,
            cat: cat,
            time: time,
            cookTime: r.cookTime || time + ' mins',
            diff: r.difficulty || 'Easy',
            cal: cal,
            protein: protein,
            fiber: fiber,
            vit: Math.min(95, Math.max(10, vit)),
            vet: !!r.vetTip,
            budget: true,
            season: 'All season',
            ingredients: r.ingredients || [],
            steps: r.steps || [],
            benefits: r.benefits || [],
            frequency: r.frequency || '1-2 times/week',
            vetTip: r.vetTip || '',
            nutritionObj: r.nutrition || {},
            suitableAgeGroup: r.ageGroup || 'All',
            healthConditionCompatibility: r.healthCondition || 'Healthy'
          };
          HOME_RECIPES.push(normalized);
        });
      }

      // Apply CRUD Overrides
      const deleted = getDeletedRecipes();
      const edited = getEditedRecipes();
      const custom = getCustomRecipes();

      // 1. Delete blacklisted recipes
      for (let i = HOME_RECIPES.length - 1; i >= 0; i--) {
        if (deleted.includes(HOME_RECIPES[i].id)) {
          HOME_RECIPES.splice(i, 1);
        }
      }

      // 2. Override edited recipes
      HOME_RECIPES.forEach((r, idx) => {
        if (edited[r.id]) {
          HOME_RECIPES[idx] = { ...r, ...edited[r.id] };
        }
      });

      // 3. Append custom recipes
      custom.forEach(cr => {
        if (!deleted.includes(cr.id)) {
          const existingIdx = HOME_RECIPES.findIndex(r => r.id === cr.id);
          if (existingIdx !== -1) {
            HOME_RECIPES[existingIdx] = cr;
          } else {
            HOME_RECIPES.push(cr);
          }
        }
      });

      console.log("Recipes merged into HOME_RECIPES. Total after CRUD:", HOME_RECIPES.length);
    }

    // Override renderHomemadeTab to support multiple filters and search
    function renderHomemadeTab(keepLimit) {
      if (!keepLimit) recipeLimit = 15;
      const pets = getPets();
      const activeIdx = getActivePetIdx();
      const pet = pets[activeIdx] || null;

      // Render pet tabs
      const tabs = document.getElementById('homemadePetTabs');
      if (tabs) {
        tabs.innerHTML = pets.length ? pets.map((p, i) => `
          <div class="pet-tab ${i === activeIdx ? 'active' : ''}" onclick="setActivePet(${i}); setRecipeAnimalFilter('${p.type}'); renderHomemadeTab()">
            ${p.avatar ? '<img src="' + p.avatar + '" style="width:18px;height:18px;border-radius:50%;vertical-align:middle;margin-right:4px">' : PET_ICONS[p.type]} ${p.name}
          </div>
        `).join('') : '<div class="pet-tab active">General Recipes</div>';
      }

      // Add species chips row in HTML if it doesn't exist
      const dashboard = document.getElementById('homemadeDashboard');
      if (dashboard && !document.getElementById('achip-All')) {
        const chipContainer = document.createElement('div');
        chipContainer.className = 'animal-selector-wrap';
        chipContainer.style.margin = '14px 0 10px 0';
        chipContainer.innerHTML = `
          <h4 style="font-weight:900;color:var(--dark);margin-bottom:6px">🐶 Species Library Selector</h4>
          <div class="animal-selector" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px">
            <button class="animal-chip ${recipeAnimalFilter === 'All' ? 'active' : ''}" id="achip-All" onclick="setRecipeAnimalFilter('All')">🐾 All Pets</button>
            <button class="animal-chip ${recipeAnimalFilter === 'Dog' ? 'active' : ''}" id="achip-Dog" onclick="setRecipeAnimalFilter('Dog')">🐶 Dog</button>
            <button class="animal-chip ${recipeAnimalFilter === 'Cat' ? 'active' : ''}" id="achip-Cat" onclick="setRecipeAnimalFilter('Cat')">🐱 Cat</button>
            <button class="animal-chip ${recipeAnimalFilter === 'Fish' ? 'active' : ''}" id="achip-Fish" onclick="setRecipeAnimalFilter('Fish')">🐟 Fish</button>
            <button class="animal-chip ${recipeAnimalFilter === 'Rabbit' ? 'active' : ''}" id="achip-Rabbit" onclick="setRecipeAnimalFilter('Rabbit')">🐰 Rabbit</button>
            <button class="animal-chip ${recipeAnimalFilter === 'Bird' ? 'active' : ''}" id="achip-Bird" onclick="setRecipeAnimalFilter('Bird')">🐦 Bird</button>
          </div>
        `;
        dashboard.parentNode.insertBefore(chipContainer, dashboard.nextSibling);
      }

      // Read filter and search values
      const search = (document.getElementById('recipeSearch')?.value || '').toLowerCase();
      const cat = document.getElementById('recipeCategory')?.value || 'All';
      const filterVeg = document.getElementById('recipeVegFilter')?.value || 'All';

      const filterAge = document.getElementById('filterAgeGroup')?.value || 'All';
      const filterDiff = document.getElementById('filterDifficulty')?.value || 'All';
      const filterCook = document.getElementById('filterCookTime')?.value || 'All';
      const filterVet = document.getElementById('filterVetApproved')?.value || 'All';

      // Filtering logic
      let recipes = HOME_RECIPES.filter(r => {
        const currentAnimal = recipeAnimalFilter !== 'All' ? recipeAnimalFilter : (pet ? pet.type : 'All');
        const matchesAnimal = currentAnimal === 'All' || r.pet.includes(currentAnimal);
        const matchesSearch = r.title.toLowerCase().includes(search) ||
          r.ingredients.join(' ').toLowerCase().includes(search) ||
          (r.healthConditionCompatibility || '').toLowerCase().includes(search);

        let matchesCat = true;
        if (cat === 'Favorites') {
          matchesCat = isRecipeFavorite(r.id);
        } else if (cat !== 'All') {
          matchesCat = r.cat === cat;
        }

        const matchesVeg = filterVeg === 'All' || r.type === filterVeg;
        const matchesAge = filterAge === 'All' || r.suitableAgeGroup === filterAge || r.suitableAgeGroup === 'All';
        const matchesDiff = filterDiff === 'All' || r.diff === filterDiff;

        let matchesCook = true;
        if (filterCook === 'under15') {
          matchesCook = r.time < 15;
        } else if (filterCook === '15to30') {
          matchesCook = r.time >= 15 && r.time <= 30;
        } else if (filterCook === 'over30') {
          matchesCook = r.time > 30;
        }

        const matchesVet = filterVet === 'All' || r.vet;

        return matchesAnimal && matchesSearch && matchesCat && matchesVeg && matchesAge && matchesDiff && matchesCook && matchesVet;
      });

      renderHomemadeDashboard(pet, recipes);
      renderRecipeLibrary(recipes);
      renderRecipeMemory();
    }

    // Override renderHomemadeDashboard to support create, recommendations, and interactive planner
    function renderHomemadeDashboard(pet, recipes) {
      const box = document.getElementById('homemadeDashboard');
      if (!box) return;

      const weight = pet ? parseFloat(pet.weight || 5) : 5;
      const age = pet ? parseFloat(pet.age || 2) : 2;
      const condition = (pet?.health || 'healthy').toLowerCase();

      const meal = Math.max(40, Math.round(weight * 28));
      const water = Math.round(weight * 55);
      const calories = Math.round(weight * 70 * (age < 1 ? 1.4 : age > 7 ? .85 : 1));

      const healthTip = condition.includes('obes') ? 'Use low-calorie pumpkin/oats recipes and reduce treats.' :
        condition.includes('allerg') ? 'Prefer single-protein allergy-friendly recipes and avoid new ingredients.' :
          condition.includes('dig') ? 'Choose soft rice, pumpkin, and small portions for digestion support.' :
            'Balanced homemade meals with safe protein, fiber, vitamins, and fresh water.';

      box.innerHTML = `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3 style="font-weight:900;color:var(--dark)">✨ Personalized Food Dashboard</h3>
            <button class="small-btn" onclick="openRecipeAddModal()">+ Create Recipe</button>
          </div>
          <p class="subtitle" style="margin:5px 0">
            ${pet ? `${pet.name} • ${pet.breed} ${pet.type} • ${pet.age} yrs • ${pet.weight} kg` : 'Add a pet profile for breed, age, weight, and health-based plans.'}
          </p>
          <div class="nutrition-grid">
            <div class="nutrition-box"><b>${meal}g</b><span>Meal Qty</span></div>
            <div class="nutrition-box"><b>${calories}</b><span>Calories/day</span></div>
            <div class="nutrition-box"><b>${water}ml</b><span>Water/day</span></div>
            <div class="nutrition-box"><b>${recipes.length}</b><span>Recipes</span></div>
          </div>
          <div class="list-item success">
            <span>🩺</span>
            <div>
              <b>Health Diet Recommendation</b>
              <p>${healthTip}</p>
            </div>
          </div>
        </div>
        
        <div id="smartRecsBox"></div>
        <div id="weeklyPlanBox"></div>
      `;

      renderSmartRecommendations(pet);
      renderWeeklyPlan();
    }

    // Override renderRecipeLibrary to support custom recipe rendering
    function getAnimalSVGBowl(type) {
      const colors = { Dog: '#FFD5A8', Cat: '#FFCCE0', Fish: '#A8D8EA', Rabbit: '#FFF5B7', Bird: '#B5EAD7' };
      const color = colors[type] || '#E0E0E0';
      return `<svg viewBox="0 0 100 100" style="width:40px;height:40px;fill:${color}"><path d="M20 70 Q 50 100, 80 70 L 75 50 Q 50 40, 25 50 Z"/><circle cx="50" cy="30" r="10"/><path d="M50 40 L 50 60" stroke="#FFF" stroke-width="4"/></svg>`;
    }

    function renderRecipeLibrary(recipes) {
      const box = document.getElementById('recipeLibraryBox');
      if (!box) return;
      if (!recipes.length) {
        box.innerHTML = '<div class="empty-state"><h3>No matching recipes</h3><p>Try another search or filter.</p></div>';
        return;
      }

      const displayed = recipes.slice(0, recipeLimit);
      let html = `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));gap:12px">`;

      html += displayed.map(r => renderRecipeCard(r)).join('');
      html += `</div>`;

      if (recipes.length > recipeLimit) {
        html += `<div style="text-align:center;margin-top:15px;margin-bottom:15px">
          <button class="primary-btn" onclick="loadMoreRecipes()" style="width:auto;padding:10px 24px">Load More Recipes (${recipes.length - recipeLimit} left)</button>
        </div>`;
      }
      box.innerHTML = html;
    }

    function renderRecipeCard(r) {
      const isFav = isRecipeFavorite(r.id);
      return `
        <div class="recipe-card" style="background:var(--card);border-radius:18px;border:1px solid var(--border);overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.02);display:flex;flex-direction:column;position:relative;transition:0.2s">
          <div class="recipe-image-wrap" style="height:110px;background:var(--bg);display:flex;align-items:center;justify-content:center;position:relative;color:var(--text)">
            ${r.image ? `<img src="${r.image}" style="width:100%;height:100%;object-fit:cover" />` : getAnimalSVGBowl(r.pet[0] || 'Dog')}
            <div class="fav-heart-btn" onclick="event.stopPropagation();toggleRecipeFavorite('${r.id}')" style="position:absolute;top:8px;right:8px;background:rgba(255,255,255,0.85);backdrop-filter:blur(4px);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,0.08);color:${isFav ? '#FF6B6B' : '#A0A0A0'}">
              ${isFav ? '❤️' : '🤍'}
            </div>
            ${r.vet ? `<span style="position:absolute;bottom:8px;left:8px;background:#B5EAD7;color:#1A6A4A;font-size:10px;font-weight:900;padding:4px 8px;border-radius:12px">🩺 Vet Approved</span>` : ''}
          </div>
          <div style="padding:12px;flex:1;display:flex;flex-direction:column;justify-content:space-between">
            <div>
              <div style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">${r.pet[0] || 'Dog'} · ${r.cat || 'Recipe'}</div>
              <h4 style="font-size:14px;font-weight:900;color:var(--dark);margin:4px 0 8px 0;line-height:1.3">${r.title}</h4>
            </div>
            <div>
              <div style="display:flex;align-items:center;gap:12px;font-size:11px;color:var(--muted);font-weight:700">
                <span>⏱️ ${r.time}m</span>
                <span>📊 ${r.diff}</span>
              </div>
              <div style="display:flex;gap:4px;margin-top:10px">
                <button class="primary-btn" onclick="openRecipeDetailModal('${r.id}')" style="padding:6px 8px;font-size:11px;border-radius:8px;margin:0;flex:1">View</button>
                <button class="secondary-btn" onclick="openRecipeEditModal('${r.id}')" style="padding:6px;font-size:11px;border-radius:8px;margin:0">✏️</button>
                <button class="secondary-btn" onclick="deleteRecipe('${r.id}')" style="padding:6px;font-size:11px;border-radius:8px;margin:0;background:var(--danger-bg);color:#d64040;border:none">🗑️</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // CRUD functions
    function deleteRecipe(id) {
      if (confirm('Are you sure you want to delete this recipe?')) {
        const deleted = getDeletedRecipes();
        deleted.push(id);
        saveDeletedRecipes(deleted);

        const custom = getCustomRecipes().filter(r => r.id !== id);
        saveCustomRecipes(custom);

        normalizeAndMergeDB();
        renderHomemadeTab();
        showToast('Recipe deleted 🗑️');
      }
    }

    function openRecipeAddModal() {
      document.getElementById('recipeModalTitle').textContent = 'Add Custom Recipe';
      document.getElementById('editRecipeId').value = '';

      document.getElementById('formRecipeName').value = '';
      document.getElementById('formRecipeAnimal').value = 'Dog';
      document.getElementById('formRecipeCategory').value = 'Meal';
      document.getElementById('formRecipeAge').value = 'All';
      document.getElementById('formRecipeDiff').value = 'Easy';
      document.getElementById('formRecipeTime').value = '15 mins';
      document.getElementById('formRecipeCal').value = '';
      document.getElementById('formRecipeProt').value = '';
      document.getElementById('formRecipeFat').value = '';
      document.getElementById('formRecipeFib').value = '';
      document.getElementById('formRecipeCarb').value = '';
      document.getElementById('formRecipeCondition').value = '';
      document.getElementById('formRecipeIngredients').value = '';
      document.getElementById('formRecipeSteps').value = '';
      document.getElementById('formRecipeVetTip').value = '';
      document.getElementById('formRecipeVetApproved').checked = false;

      // Clear image fields
      document.getElementById('formRecipeImageFile').value = '';
      document.getElementById('formRecipeImage').value = '';
      document.getElementById('formRecipeImagePreviewImg').src = '';
      document.getElementById('formRecipeImagePreview').style.display = 'none';

      document.getElementById('recipeModal').classList.remove('hidden');
    }

    function openRecipeEditModal(id) {
      const r = HOME_RECIPES.find(x => x.id === id);
      if (!r) return;
      document.getElementById('recipeModalTitle').textContent = 'Edit Recipe';
      document.getElementById('editRecipeId').value = id;

      document.getElementById('formRecipeName').value = r.title;
      document.getElementById('formRecipeAnimal').value = r.pet[0] || 'Dog';
      document.getElementById('formRecipeCategory').value = r.cat || 'Meal';
      document.getElementById('formRecipeAge').value = r.suitableAgeGroup || r.ageGroup || 'All';
      document.getElementById('formRecipeDiff').value = r.diff || 'Easy';
      document.getElementById('formRecipeTime').value = r.cookTime || r.time + ' mins';
      document.getElementById('formRecipeCal').value = r.cal || '';
      document.getElementById('formRecipeProt').value = r.protein || '';
      document.getElementById('formRecipeFat').value = r.fat || '';
      document.getElementById('formRecipeFib').value = r.fiber || '';
      document.getElementById('formRecipeCarb').value = r.carbohydrates || '';
      document.getElementById('formRecipeCondition').value = r.healthConditionCompatibility || r.healthCondition || '';
      document.getElementById('formRecipeIngredients').value = (r.ingredients || []).join(', ');
      document.getElementById('formRecipeSteps').value = (r.steps || []).join('\n');
      document.getElementById('formRecipeVetTip').value = r.vetTip || '';
      document.getElementById('formRecipeVetApproved').checked = !!r.vet;

      // Set image fields
      document.getElementById('formRecipeImageFile').value = '';
      if (r.image) {
        document.getElementById('formRecipeImage').value = r.image;
        document.getElementById('formRecipeImagePreviewImg').src = r.image;
        document.getElementById('formRecipeImagePreview').style.display = 'block';
      } else {
        document.getElementById('formRecipeImage').value = '';
        document.getElementById('formRecipeImagePreviewImg').src = '';
        document.getElementById('formRecipeImagePreview').style.display = 'none';
      }

      document.getElementById('recipeModal').classList.remove('hidden');
    }

    function closeRecipeModal() {
      document.getElementById('recipeModal').classList.add('hidden');
    }

    function saveRecipeForm() {
      const id = document.getElementById('editRecipeId').value;
      const name = document.getElementById('formRecipeName').value.trim();
      const animal = document.getElementById('formRecipeAnimal').value;
      const category = document.getElementById('formRecipeCategory').value;
      const age = document.getElementById('formRecipeAge').value;
      const diff = document.getElementById('formRecipeDiff').value;
      const time = document.getElementById('formRecipeTime').value.trim() || '15 mins';
      const cal = parseInt(document.getElementById('formRecipeCal').value) || 150;
      const prot = document.getElementById('formRecipeProt').value.trim() || '10g';
      const fat = document.getElementById('formRecipeFat').value.trim() || '5g';
      const fib = document.getElementById('formRecipeFib').value.trim() || '2g';
      const carb = document.getElementById('formRecipeCarb').value.trim() || '12g';
      const condition = document.getElementById('formRecipeCondition').value.trim() || 'Healthy';
      const ingredients = document.getElementById('formRecipeIngredients').value.split(',').map(s => s.trim()).filter(Boolean);
      const steps = document.getElementById('formRecipeSteps').value.split('\n').map(s => s.trim()).filter(Boolean);
      const vetTip = document.getElementById('formRecipeVetTip').value.trim();
      const vetApproved = document.getElementById('formRecipeVetApproved').checked;
      const image = document.getElementById('formRecipeImage').value;

      if (!name) { showToast('Please enter a recipe name'); return; }
      if (!ingredients.length) { showToast('Please enter ingredients'); return; }
      if (!steps.length) { showToast('Please enter preparation steps'); return; }

      const recipeObj = {
        id: id || 'custom_' + Date.now(),
        title: name,
        pet: [animal],
        type: ingredients.some(i => ['chicken', 'beef', 'turkey', 'fish', 'meat', 'egg', 'shrimp', 'pork'].some(k => i.toLowerCase().includes(k))) ? 'Non-Veg' : 'Veg',
        cat: category,
        time: parseInt(time) || 15,
        cookTime: time,
        diff: diff,
        cal: cal,
        protein: prot,
        fat: fat,
        fiber: fib,
        carbohydrates: carb,
        suitableAgeGroup: age,
        healthConditionCompatibility: condition,
        ingredients: ingredients,
        steps: steps,
        vetTip: vetTip,
        vet: vetApproved,
        benefits: vetTip ? [vetTip] : ['Nutritious home-cooked food.'],
        warnings: ['Serve in portion-controlled sizes appropriate for weight.'],
        image: image || null,
        custom: true
      };

      if (id) {
        if (id.startsWith('custom_')) {
          const custom = getCustomRecipes().map(r => r.id === id ? recipeObj : r);
          saveCustomRecipes(custom);
        } else {
          const edited = getEditedRecipes();
          edited[id] = recipeObj;
          saveEditedRecipes(edited);
        }
        showToast('Recipe updated successfully!');
      } else {
        const custom = getCustomRecipes();
        custom.push(recipeObj);
        saveCustomRecipes(custom);
        showToast('New recipe added!');
      }

      closeRecipeModal();
      normalizeAndMergeDB();
      renderHomemadeTab();
    }

    function handleRecipeImageUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('formRecipeImage').value = e.target.result;
        document.getElementById('formRecipeImagePreviewImg').src = e.target.result;
        document.getElementById('formRecipeImagePreview').style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
    window.handleRecipeImageUpload = handleRecipeImageUpload;


    // Interactive Planner Functions
    function getWeeklyPlan() {
      return pawCache.weeklyPlan || {
        Mon: { breakfast: null, lunch: null, dinner: null },
        Tue: { breakfast: null, lunch: null, dinner: null },
        Wed: { breakfast: null, lunch: null, dinner: null },
        Thu: { breakfast: null, lunch: null, dinner: null },
        Fri: { breakfast: null, lunch: null, dinner: null },
        Sat: { breakfast: null, lunch: null, dinner: null },
        Sun: { breakfast: null, lunch: null, dinner: null }
      };
    }

    async function saveWeeklyPlan(plan) {
      pawCache.weeklyPlan = plan;
      localStorage.setItem('pawfeed_weekly_plan', JSON.stringify(plan));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        await window.supabaseClient.from('user_profiles').upsert({
          id: userId,
          weekly_plan: plan
        });
      } catch (err) {
        console.error("Error syncing weekly plan to Supabase:", err);
      }
    }

    let activePlannerDay = '';
    let activePlannerMeal = '';

    function openPlannerAssignModal(day, meal) {
      activePlannerDay = day;
      activePlannerMeal = meal;

      const db = HOME_RECIPES;
      const pets = getPets();
      const pet = pets[getActivePetIdx()];

      const suitable = db.filter(r => !pet || r.pet.includes(pet.type));

      const box = document.getElementById('plannerSelectBox');
      if (box) {
        box.innerHTML = suitable.map(r => `
          <div class="list-item" style="cursor:pointer;padding:10px;border-radius:12px;border:1px solid var(--border);margin-bottom:6px" onclick="assignRecipeToPlan('${r.id}')">
            <div>
              <div style="font-weight:900;color:var(--dark)">${r.title}</div>
              <div style="font-size:11px;color:var(--muted)">${r.pet.join(', ')} · ${r.cat} · ${r.time} mins</div>
            </div>
          </div>
        `).join('');
      }

      document.getElementById('plannerModal').classList.remove('hidden');
    }

    function assignRecipeToPlan(recipeId) {
      const plan = getWeeklyPlan();
      const r = HOME_RECIPES.find(x => x.id === recipeId);
      if (r) {
        plan[activePlannerDay][activePlannerMeal] = { id: r.id, title: r.title };
        saveWeeklyPlan(plan);
        showToast(`Assigned ${r.title} to ${activePlannerDay} ${activePlannerMeal}!`);
      }
      document.getElementById('plannerModal').classList.add('hidden');
      renderWeeklyPlan();
    }

    function clearWeeklyPlan() {
      const plan = {
        Mon: { breakfast: null, lunch: null, dinner: null },
        Tue: { breakfast: null, lunch: null, dinner: null },
        Wed: { breakfast: null, lunch: null, dinner: null },
        Thu: { breakfast: null, lunch: null, dinner: null },
        Fri: { breakfast: null, lunch: null, dinner: null },
        Sat: { breakfast: null, lunch: null, dinner: null },
        Sun: { breakfast: null, lunch: null, dinner: null }
      };
      saveWeeklyPlan(plan);
      renderWeeklyPlan();
      showToast('Meal plan cleared 🗑️');
    }

    function autoGenerateWeeklyPlan() {
      const plan = getWeeklyPlan();
      const pets = getPets();
      const pet = pets[getActivePetIdx()];
      const suitable = HOME_RECIPES.filter(r => !pet || r.pet.includes(pet.type));
      if (!suitable.length) { showToast('No recipes found for this pet'); return; }

      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const meals = ['breakfast', 'lunch', 'dinner'];

      days.forEach(day => {
        meals.forEach(meal => {
          const rand = suitable[Math.floor(Math.random() * suitable.length)];
          plan[day][meal] = { id: rand.id, title: rand.title };
        });
      });

      saveWeeklyPlan(plan);
      renderWeeklyPlan();
      showToast('AI Meal Plan Generated! 🤖📅');
    }

    function renderWeeklyPlan() {
      const box = document.getElementById('weeklyPlanBox');
      if (!box) return;
      const plan = getWeeklyPlan();
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      box.innerHTML = `
        <div class="card" style="margin-top:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 style="font-weight:900;color:var(--dark)">📅 Weekly Interactive Meal Planner</h3>
            <div style="display:flex;gap:6px">
              <button class="small-btn" onclick="autoGenerateWeeklyPlan()">🤖 Auto-Plan</button>
              <button class="small-btn" onclick="clearWeeklyPlan()" style="background:var(--danger-bg);color:#d64040">🗑️ Clear</button>
            </div>
          </div>
          <div class="planner-grid-scroll" style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="border-bottom:2px solid var(--border)">
                  <th style="padding:10px;text-align:left">Day</th>
                  <th style="padding:10px;text-align:left">🌅 Breakfast</th>
                  <th style="padding:10px;text-align:left">☀️ Lunch</th>
                  <th style="padding:10px;text-align:left">🌙 Dinner</th>
                </tr>
              </thead>
              <tbody>
                ${days.map(d => {
        const b = plan[d].breakfast;
        const l = plan[d].lunch;
        const dn = plan[d].dinner;
        return `
                    <tr style="border-bottom:1px solid var(--border)">
                      <td style="padding:10px;font-weight:900">${d}</td>
                      <td style="padding:10px">
                        ${b ? `<div class="plan-meal-chip" onclick="openRecipeDetailModal('${b.id}')">${b.title} <span class="remove-meal" onclick="event.stopPropagation();removeMealFromPlan('${d}','breakfast')">✕</span></div>` : `<span class="add-meal-link" onclick="openPlannerAssignModal('${d}','breakfast')">+ Add</span>`}
                      </td>
                      <td style="padding:10px">
                        ${l ? `<div class="plan-meal-chip" onclick="openRecipeDetailModal('${l.id}')">${l.title} <span class="remove-meal" onclick="event.stopPropagation();removeMealFromPlan('${d}','lunch')">✕</span></div>` : `<span class="add-meal-link" onclick="openPlannerAssignModal('${d}','lunch')">+ Add</span>`}
                      </td>
                      <td style="padding:10px">
                        ${dn ? `<div class="plan-meal-chip" onclick="openRecipeDetailModal('${dn.id}')">${dn.title} <span class="remove-meal" onclick="event.stopPropagation();removeMealFromPlan('${d}','dinner')">✕</span></div>` : `<span class="add-meal-link" onclick="openPlannerAssignModal('${d}','dinner')">+ Add</span>`}
                      </td>
                    </tr>
                  `;
      }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    function removeMealFromPlan(day, meal) {
      const plan = getWeeklyPlan();
      plan[day][meal] = null;
      saveWeeklyPlan(plan);
      renderWeeklyPlan();
      showToast('Meal removed');
    }

    // Smart Recommendations based on active pet metadata
    function renderSmartRecommendations(pet) {
      const box = document.getElementById('smartRecsBox');
      if (!box) return;
      if (!pet) {
        box.innerHTML = '';
        return;
      }

      const db = HOME_RECIPES;
      let matches = db.filter(r => r.pet.includes(pet.type));

      const age = parseFloat(pet.age) || 1;
      const petAgeGroup = age < 1 ? 'Baby' : age > 7 ? 'Senior' : 'Adult';
      let ageMatches = matches.filter(r => r.suitableAgeGroup === petAgeGroup || r.suitableAgeGroup === 'All');
      if (ageMatches.length > 0) matches = ageMatches;

      const condition = (pet.health || '').toLowerCase();
      if (condition && condition !== 'healthy') {
        let condMatches = matches.filter(r =>
          r.title.toLowerCase().includes(condition) ||
          (r.healthConditionCompatibility || '').toLowerCase().includes(condition) ||
          (r.vetTip || '').toLowerCase().includes(condition)
        );
        if (condMatches.length > 0) matches = condMatches;
      }

      const recs = matches.slice(0, 3);
      if (!recs.length) {
        box.innerHTML = '';
        return;
      }

      box.innerHTML = `
        <h4 style="font-weight:900;color:var(--dark);margin-top:16px;margin-bottom:8px">💡 Recommended for ${pet.name}</h4>
        <div style="display:grid;grid-template-columns:1fr;gap:8px">
          ${recs.map(r => `
            <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:12px;cursor:pointer" onclick="openRecipeDetailModal('${r.id}')">
              <div>
                <b style="color:var(--dark)">${r.title}</b>
                <div style="font-size:11px;color:var(--muted);margin-top:2px">${r.cat} · ${r.cookTime || r.time + ' mins'} · Suitable for ${r.suitableAgeGroup}</div>
              </div>
              <span style="font-size:18px">➔</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    function openRecipeDetailModal(id) {
      const r = HOME_RECIPES.find(recipe => recipe.id === id);
      if (!r) {
        showToast('Recipe not found');
        return;
      }

      const modal = document.getElementById('recipeDetailModal');
      const nameEl = document.getElementById('modalRecipeName');
      const bodyEl = document.getElementById('modalRecipeBody');
      if (!modal || !bodyEl) return;

      nameEl.textContent = r.title;

      const isFav = isRecipeFavorite(r.id);

      const st = getRecipeStore();
      st.recent = [id, ...st.recent.filter(x => x !== id)].slice(0, 5);
      saveRecipeStore(st);
      if (typeof renderRecipeMemory === 'function') renderRecipeMemory();

      const isSaved = st.saved.includes(r.id);

      let html = `
        <div style="display:flex;flex-direction:column;gap:16px">
          <div style="height:140px;background:var(--bg);border-radius:16px;display:flex;align-items:center;justify-content:center;position:relative;color:var(--text);overflow:hidden">
            ${r.image ? `<img src="${r.image}" style="width:100%;height:100%;object-fit:cover" />` : getAnimalSVGBowl(r.pet[0] || 'Dog')}
            ${r.vet ? `<span style="position:absolute;bottom:8px;left:8px;background:#B5EAD7;color:#1A6A4A;font-size:11px;font-weight:900;padding:4px 8px;border-radius:12px">🩺 Vet Approved</span>` : ''}
          </div>
          
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <span class="recipe-badge" style="background:var(--pill-bg);color:var(--pill-color);font-size:11px;padding:4px 10px;border-radius:12px;font-weight:700">${r.pet.join(', ')}</span>
            <span class="recipe-badge" style="background:var(--border);color:var(--text);font-size:11px;padding:4px 10px;border-radius:12px;font-weight:700">${r.cat || 'Recipe'}</span>
            <span class="recipe-badge" style="background:var(--border);color:var(--text);font-size:11px;padding:4px 10px;border-radius:12px;font-weight:700">⏱️ ${r.time} mins</span>
            <span class="recipe-badge" style="background:var(--border);color:var(--text);font-size:11px;padding:4px 10px;border-radius:12px;font-weight:700">📊 ${r.diff}</span>
            <span class="recipe-badge" style="background:var(--border);color:var(--text);font-size:11px;padding:4px 10px;border-radius:12px;font-weight:700">${r.type}</span>
            ${r.suitableAgeGroup ? `<span class="recipe-badge" style="background:var(--border);color:var(--text);font-size:11px;padding:4px 10px;border-radius:12px;font-weight:700">👶 ${r.suitableAgeGroup}</span>` : ''}
          </div>

          <div>
            <h4 style="font-weight:900;color:var(--dark);margin-bottom:8px">📊 Nutritional Info (per serving)</h4>
            <div class="nutrition-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
              <div class="nutrition-box" style="background:var(--bg);padding:8px;border-radius:12px;text-align:center">
                <b style="display:block;font-size:15px;color:var(--dark)">${r.cal || 150}</b>
                <span style="font-size:10px;color:var(--muted)">Calories</span>
              </div>
              <div class="nutrition-box" style="background:var(--bg);padding:8px;border-radius:12px;text-align:center">
                <b style="display:block;font-size:15px;color:var(--dark)">${r.protein || '10'}g</b>
                <span style="font-size:10px;color:var(--muted)">Protein</span>
              </div>
              <div class="nutrition-box" style="background:var(--bg);padding:8px;border-radius:12px;text-align:center">
                <b style="display:block;font-size:15px;color:var(--dark)">${r.fiber || '2'}g</b>
                <span style="font-size:10px;color:var(--muted)">Fiber</span>
              </div>
              <div class="nutrition-box" style="background:var(--bg);padding:8px;border-radius:12px;text-align:center">
                <b style="display:block;font-size:15px;color:var(--dark)">${r.vit || '50'}%</b>
                <span style="font-size:10px;color:var(--muted)">Vitamin</span>
              </div>
            </div>
          </div>
          
          ${r.healthConditionCompatibility ? `
            <div style="background:var(--pill-bg);color:var(--pill-color);padding:10px 14px;border-radius:12px;font-size:13px">
              <b>🏥 Health Compatibility:</b> ${r.healthConditionCompatibility}
            </div>
          ` : ''}

          <div>
            <h4 style="font-weight:900;color:var(--dark);margin-bottom:6px">🛒 Ingredients</h4>
            <ul style="padding-left:20px;font-size:13px;color:var(--text);line-height:1.6">
              ${r.ingredients.map(ing => `<li>` + ing + `</li>`).join('')}
            </ul>
          </div>

          <div>
            <h4 style="font-weight:900;color:var(--dark);margin-bottom:6px">🍳 Preparation Steps</h4>
            <ol style="padding-left:20px;font-size:13px;color:var(--text);line-height:1.6">
              ${r.steps.map(step => `<li>` + step + `</li>`).join('')}
            </ol>
          </div>

          ${r.vetTip || (r.benefits && r.benefits.length) ? `
            <div style="background:var(--success-bg);color:#1a6a4a;padding:12px;border-radius:12px;font-size:13px">
              <b>🩺 Doctor's Note / Vet Tip:</b>
              <p style="margin-top:4px">${r.vetTip || r.benefits.join(' ')}</p>
            </div>
          ` : ''}

          <div style="display:flex;gap:8px;margin-top:8px">
            <button id="modalFavBtn" class="secondary-btn" onclick="toggleRecipeFavoriteInModal('${r.id}')" style="flex:1;padding:12px;font-size:13px;border-radius:12px;margin:0">
              ${isFav ? '⭐ Unfavorite' : '⭐ Favorite'}
            </button>
            <button id="modalSaveBtn" class="secondary-btn" onclick="toggleRecipeSaveInModal('${r.id}')" style="flex:1;padding:12px;font-size:13px;border-radius:12px;margin:0">
              ${isSaved ? '💾 Unsave' : '💾 Save'}
            </button>
            <button class="primary-btn" onclick="completeMealFromModal('${r.id}')" style="flex:1.2;padding:12px;font-size:13px;border-radius:12px;margin:0">
              ✅ Meal Done
            </button>
          </div>
        </div>
      `;

      bodyEl.innerHTML = html;
      modal.classList.remove('hidden');
    }

    function closeRecipeDetailModal() {
      const modal = document.getElementById('recipeDetailModal');
      if (modal) {
        modal.classList.add('hidden');
      }
    }

    function toggleRecipeFavoriteInModal(id) {
      toggleRecipeFavorite(id);
      const isFav = isRecipeFavorite(id);
      const favBtn = document.getElementById('modalFavBtn');
      if (favBtn) {
        favBtn.textContent = isFav ? '⭐ Unfavorite' : '⭐ Favorite';
      }
    }

    function toggleRecipeSaveInModal(id) {
      const st = getRecipeStore();
      let msg = '';
      if (st.saved.includes(id)) {
        st.saved = st.saved.filter(x => x !== id);
        msg = 'Recipe unsaved 💾';
      } else {
        st.saved.push(id);
        msg = 'Recipe saved 💾';
      }
      saveRecipeStore(st);
      showToast(msg);
      if (typeof renderRecipeMemory === 'function') renderRecipeMemory();

      const isSaved = st.saved.includes(id);
      const saveBtn = document.getElementById('modalSaveBtn');
      if (saveBtn) {
        saveBtn.textContent = isSaved ? '💾 Unsave' : '💾 Save';
      }
    }

    function completeMealFromModal(id) {
      completeMeal(id);
      closeRecipeDetailModal();
    }

    // ==================== DAILY CARE CHECKLIST ====================
    function getDailyChecklist() {
      const defaultChecklist = {
        lastDate: todayStr(),
        autoReset: true,
        items: [
          { text: '🍽️ Feed Pet', checked: false, isCustom: false },
          { text: '💧 Refresh Water', checked: false, isCustom: false },
          { text: '🦮 Walk / Exercise', checked: false, isCustom: false },
          { text: '🧸 Playtime', checked: false, isCustom: false },
          { text: '💊 Give Medicine', checked: false, isCustom: false },
          { text: '🧼 Grooming / Clean Area', checked: false, isCustom: false }
        ]
      };
      
      let parsed = pawCache.dailyChecklist && Object.keys(pawCache.dailyChecklist).length > 0
        ? pawCache.dailyChecklist
        : null;
        
      if (!parsed) {
        try {
          const stored = localStorage.getItem('pawDailyChecklist');
          if (stored) parsed = JSON.parse(stored);
        } catch (e) { }
      }
      
      if (!parsed) {
        parsed = defaultChecklist;
      }
      
      const today = todayStr();
      if (parsed.lastDate !== today) {
        if (parsed.autoReset) {
          parsed.items.forEach(item => item.checked = false);
        }
        parsed.lastDate = today;
        saveDailyChecklist(parsed);
      }
      
      return parsed;
    }

    async function saveDailyChecklist(data) {
      pawCache.dailyChecklist = data;
      localStorage.setItem('pawDailyChecklist', JSON.stringify(data));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        await window.supabaseClient.from('user_profiles').upsert({
          id: userId,
          daily_checklist: data
        });
      } catch (err) {
        console.error("Error syncing daily checklist to Supabase:", err);
      }
    }

    function toggleDailyChecklistItem(index) {
      const data = getDailyChecklist();
      if (data.items[index]) {
        data.items[index].checked = !data.items[index].checked;
        saveDailyChecklist(data);
        showToast(data.items[index].checked ? 'Task checked! ✓' : 'Task unchecked');
        renderDailyChecklist();
      }
    }

    function addChecklistItem() {
      const input = document.getElementById('newChecklistItem');
      if (!input) return;
      const text = input.value.trim();
      if (!text) {
        showToast('Please enter task description');
        return;
      }
      const data = getDailyChecklist();
      data.items.push({ text: text, checked: false, isCustom: true });
      saveDailyChecklist(data);
      input.value = '';
      showToast('Custom task added 📋');
      renderDailyChecklist();
    }

    function deleteChecklistItem(index) {
      const data = getDailyChecklist();
      data.items.splice(index, 1);
      saveDailyChecklist(data);
      showToast('Task removed');
      renderDailyChecklist();
    }

    function toggleChecklistAutoReset() {
      const data = getDailyChecklist();
      data.autoReset = !data.autoReset;
      saveDailyChecklist(data);
      const btn = document.getElementById('checklistAutoResetToggle');
      if (btn) btn.classList.toggle('on', data.autoReset);
      showToast(data.autoReset ? 'Daily auto-reset enabled 🔄' : 'Daily auto-reset disabled');
    }

    function resetDailyChecklist(manual) {
      const data = getDailyChecklist();
      data.items.forEach(item => item.checked = false);
      saveDailyChecklist(data);
      if (manual) showToast('Checklist reset! 📋');
      renderDailyChecklist();
    }

    function renderDailyChecklist() {
      const container = document.getElementById('dailyChecklistContainer');
      if (container) {
        container.innerHTML = '';
      }
    }

    // ==================== HEALTH INSIGHTS ====================
    function generateHealthInsights(petIdx) {
      const pets = getPets();
      const pet = pets[petIdx];
      if (!pet) return `<div class="card empty-state"><p>Add a pet profile to see health insights.</p></div>`;

      const today = todayStr();
      const log = getLog();
      const petLog = log.filter(e => e.petIdx === petIdx);

      // 1. Water Intake Insights
      const totalDrops = Math.ceil((pet.waterGoal || 500) / 100);
      const currentDrops = (pet.waterDate === today ? (pet.waterDrops || []) : []);
      const waterMl = currentDrops.length * 100;
      const waterPct = Math.min(100, Math.round((currentDrops.length / totalDrops) * 100));

      let waterInsightMsg = "";
      let waterColor = "var(--muted)";
      if (waterPct >= 90) {
        waterInsightMsg = `💧 Great job! ${pet.name} met today's hydration goal!`;
        waterColor = "var(--success-bg)";
      } else if (waterPct >= 50) {
        waterInsightMsg = `💧 Halfway there! Keep encouraging ${pet.name} to drink more.`;
        waterColor = "var(--streak)";
      } else {
        waterInsightMsg = `💧 ${pet.name} needs more water today. Refill their bowl with fresh water.`;
        waterColor = "var(--danger-bg)";
      }

      // 2. Weight History Trend
      const wh = pet.weightHistory || [];
      let weightInsightMsg = "⚖️ Log weight regularly to see weight gain/loss trends.";
      if (wh.length >= 2) {
        const latest = wh[wh.length - 1].weight;
        const prev = wh[wh.length - 2].weight;
        const diff = (latest - prev).toFixed(2);
        if (diff > 0) {
          weightInsightMsg = `📈 Gained <b>+${diff} kg</b> since last log (${prev}kg to ${latest}kg).`;
        } else if (diff < 0) {
          weightInsightMsg = `📉 Lost <b>${diff} kg</b> since last log (${prev}kg to ${latest}kg).`;
        } else {
          weightInsightMsg = `↔️ Weight is stable at <b>${latest} kg</b>.`;
        }
      } else if (wh.length === 1) {
        weightInsightMsg = `⚖️ Initial weight logged: <b>${wh[0].weight} kg</b>. Log next weight to see trend.`;
      }

      // 3. Mood Trend
      let moodInsightMsg = "😊 Log today's mood in the tracker to monitor emotional health.";
      const moodLogs = petLog.filter(e => e.type === 'mood');
      if (moodLogs.length > 0) {
        const last14Days = new Date(Date.now() - 14 * 86400000);
        const recentMoods = moodLogs.filter(e => new Date(e.timestamp) >= last14Days);
        if (recentMoods.length > 0) {
          const counts = {};
          recentMoods.forEach(m => {
            const label = m.mood || m.note;
            counts[label] = (counts[label] || 0) + 1;
          });
          let topMood = "";
          let maxCount = 0;
          for (const key in counts) {
            if (counts[key] > maxCount) {
              maxCount = counts[key];
              topMood = key;
            }
          }
          const pct = Math.round((maxCount / recentMoods.length) * 100);
          moodInsightMsg = `😊 Primary mood: <b>${topMood}</b> (${pct}% of logs recently).`;
        }
      }

      // 4. 7-Day Care Activity Level (Bar Chart)
      const last7days = [];
      const activityCounts = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 86400000);
        const dStr = date.toISOString().slice(0, 10);
        last7days.push(date.toLocaleDateString('en-IN', { weekday: 'short' }));
        const dayLogs = petLog.filter(e => e.timestamp && e.timestamp.slice(0, 10) === dStr && ['fed', 'water', 'weight', 'mood', 'care'].includes(e.type));
        activityCounts.push(dayLogs.length);
      }
      const maxLogs = Math.max(...activityCounts, 1);

      const chartHtml = activityCounts.map((count, i) => {
        const h = Math.max(8, Math.round((count / maxLogs) * 60) + 10);
        return `
          <div class="weight-bar-wrap" style="flex:1; display:flex; flex-direction:column; align-items:center">
            <div class="weight-bar" style="height:${h}px; background:var(--purple); border-radius:6px; width:16px; margin: 0 auto 4px" title="${count} activities"></div>
            <div class="weight-label" style="font-size:10px; color:var(--muted)">${last7days[i]}</div>
            <div style="font-size:10px; font-weight:800; color:var(--dark)">${count}</div>
          </div>
        `;
      }).join('');

      return `
        <!-- HEALTH & ACTIVITY INSIGHTS CARD -->
        <div class="card" style="border-left: 5px solid var(--purple)">
          <h3 style="font-weight:900; margin-bottom:4px">📈 Health & Activity Insights</h3>
          <p class="subtitle" style="margin-bottom:12px">Weekly wellness breakdown and activity trends for ${pet.name}.</p>
          
          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px">
            <!-- Hydration Card -->
            <div style="background:${waterColor}; padding:10px 14px; border-radius:12px; font-size:13px; font-weight:700; color:var(--dark)">
              ${waterInsightMsg}
            </div>
            
            <!-- Weight Trend -->
            <div style="background:var(--pill-bg); color:var(--pill-color); padding:10px 14px; border-radius:12px; font-size:13px">
              ${weightInsightMsg}
            </div>

            <!-- Mood Trend -->
            <div style="background:var(--bg); border:1px solid var(--border); padding:10px 14px; border-radius:12px; font-size:13px">
              ${moodInsightMsg}
            </div>
          </div>

          <h4 style="font-weight:900; color:var(--dark); margin-bottom:8px; font-size:14px">📅 7-Day Care Activity Trend</h4>
          <div class="weight-chart-wrap" style="padding:10px 0; background:var(--bg); border-radius:14px; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:flex-end; height:110px">
            ${chartHtml}
          </div>
          <p style="font-size:11px; color:var(--muted); text-align:center; margin-top:8px">Tracks feeds, water, weights, moods, and planner tasks logged daily.</p>
        </div>
      `;
    }

    // ==================== EXPENSE TRACKER ====================
    function getExpenses() {
      return pawCache.expenses || [];
    }

    async function saveExpenses(expenses) {
      pawCache.expenses = expenses;
      localStorage.setItem('pawExpenses', JSON.stringify(expenses));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        const { data: dbExpenses } = await window.supabaseClient.from('expenses').select('id').eq('user_id', userId);
        if (dbExpenses) {
          const activeIds = expenses.map(item => item.id).filter(id => typeof id === 'number' && id < 10000000000);
          const deletedIds = dbExpenses.filter(m => !activeIds.includes(m.id)).map(m => m.id);
          if (deletedIds.length > 0) {
            await window.supabaseClient.from('expenses').delete().in('id', deletedIds);
          }
        }
        for (let i = 0; i < expenses.length; i++) {
          const item = expenses[i];
          const payload = {
            user_id: userId,
            amount: parseFloat(item.amount || 0),
            category: item.category || 'Other',
            description: item.desc || '',
            date: item.date || new Date().toISOString().slice(0, 10)
          };
          if (item.id && typeof item.id === 'number' && item.id < 10000000000) {
            payload.id = item.id;
          }
          const { data, error } = await window.supabaseClient.from('expenses').upsert(payload).select('id').single();
          if (!error && data) item.id = data.id;
        }
      } catch (err) {
        console.error("Error syncing expenses to Supabase:", err);
      }
    }

    function addExpense() {
      const amtInput = document.getElementById('expenseAmount');
      const catSelect = document.getElementById('expenseCategory');
      const descInput = document.getElementById('expenseDesc');
      const dateInput = document.getElementById('expenseDate');

      if (!amtInput || !catSelect || !descInput || !dateInput) return;

      const amount = parseFloat(amtInput.value);
      const category = catSelect.value;
      const desc = descInput.value.trim();
      const dateVal = dateInput.value;

      if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid expense amount');
        return;
      }
      if (!desc) {
        showToast('Please enter description');
        return;
      }

      const expenses = getExpenses();
      expenses.unshift({
        id: Date.now(),
        amount,
        category,
        description: desc,
        date: dateVal || todayStr()
      });
      saveExpenses(expenses);
      amtInput.value = '';
      descInput.value = '';
      dateInput.value = todayStr();
      showToast('Expense logged! 💰');
      renderExpenseTracker();
    }

    function deleteExpense(id) {
      const expenses = getExpenses();
      const filtered = expenses.filter(e => e.id !== id);
      saveExpenses(filtered);
      showToast('Expense deleted');
      renderExpenseTracker();
    }

    function renderExpenseTracker() {
      const container = document.getElementById('expenseTrackerContainer');
      if (!container) return;

      const expenses = getExpenses();
      const today = new Date();
      const thisMonthYear = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

      const monthlyTotal = expenses.reduce((sum, e) => {
        if (e.date && e.date.slice(0, 7) === thisMonthYear) {
          return sum + e.amount;
        }
        return sum;
      }, 0);

      const categories = ['Food 🥣', 'Medicine 💊', 'Vet Visit 🩺', 'Toys & Play 🧸', 'Grooming 🧼', 'Other 🐾'];

      let html = `
        <div class="card" style="margin-top:16px; border-left: 5px solid var(--orange)">
          <h3 style="font-weight:900; margin-bottom:4px">💰 Pet Expense Tracker</h3>
          <p class="subtitle" style="margin-bottom:12px">Track feeding, veterinary, and care costs for your pets.</p>
          
          <div style="background:var(--success-bg); border: 1px solid #B5EAD7; border-radius:14px; padding:12px; text-align:center; margin-bottom:14px">
            <small style="color:#1A6A4A; font-weight:800; font-size:11px; text-transform:uppercase">This Month's Spending</small>
            <div style="font-size:26px; font-weight:900; color:#1A6A4A; margin-top:2px">₹${monthlyTotal.toLocaleString('en-IN')}</div>
          </div>

          <div style="background:var(--bg); border:1px solid var(--border); padding:14px; border-radius:16px; margin-bottom:14px">
            <h4 style="font-weight:900; margin-bottom:10px; font-size:14px; color:var(--dark)">➕ Add Expense</h4>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px">
              <div>
                <label style="font-size:11px; margin-bottom:4px">Amount (₹)</label>
                <input id="expenseAmount" type="number" placeholder="e.g. 500" style="margin:0; padding:8px 10px; font-size:13px; border-radius:10px; border:1px solid var(--border); background:#fff; color:var(--text)">
              </div>
              <div>
                <label style="font-size:11px; margin-bottom:4px">Category</label>
                <select id="expenseCategory" style="margin:0; padding:8px 10px; font-size:13px; border-radius:10px; border:1px solid var(--border); background:#fff; color:var(--text)">
                  ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
              </div>
            </div>

            <div style="margin-bottom:10px">
              <label style="font-size:11px; margin-bottom:4px">Description</label>
              <input id="expenseDesc" type="text" placeholder="e.g. Kibble bag, Ear cleaner" style="margin:0; padding:8px 10px; font-size:13px; border-radius:10px; border:1px solid var(--border); background:#fff; color:var(--text)">
            </div>

            <div style="margin-bottom:12px">
              <label style="font-size:11px; margin-bottom:4px">Expense Date</label>
              <input id="expenseDate" type="date" style="margin:0; padding:8px 10px; font-size:13px; border-radius:10px; border:1px solid var(--border); background:#fff; color:var(--text)">
            </div>

            <button class="primary-btn" onclick="addExpense()" style="margin:0; width:100%; padding:10px; border-radius:12px; font-size:13px">Log Expense</button>
          </div>

          <h4 style="font-weight:900; margin-bottom:8px; font-size:14px; color:var(--dark)">📜 Recent Expenses</h4>
          <div style="max-height:180px; overflow-y:auto; display:flex; flex-direction:column; gap:8px">
      `;

      if (expenses.length === 0) {
        html += `<p style="font-size:12px; color:var(--muted); text-align:center; padding:12px 0">No expenses logged yet.</p>`;
      } else {
        html += expenses.slice(0, 30).map(e => {
          const formattedDate = new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--bg); border:1px solid var(--border); border-radius:12px; font-size:13px">
              <div style="flex:1; min-width:0; padding-right:8px">
                <div style="font-weight:800; color:var(--dark); text-overflow:ellipsis; overflow:hidden; white-space:nowrap">${e.description}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:2px">${e.category} · ${formattedDate}</div>
              </div>
              <div style="display:flex; align-items:center; gap:10px">
                <b style="color:var(--dark); font-size:14px">₹${e.amount}</b>
                <button onclick="deleteExpense(${e.id})" style="background:none; border:none; color:#d64040; cursor:pointer; font-size:14px; padding:4px">✕</button>
              </div>
            </div>
          `;
        }).join('');
      }

      html += `
          </div>
        </div>
      `;
      container.innerHTML = html;

      const dateEl = document.getElementById('expenseDate');
      if (dateEl && !dateEl.value) {
        dateEl.value = todayStr();
      }
    }

    // ==================== FOOD & MEDICINE STOCK TRACKER ====================
    function getStockItems() {
      const demoStock = [
        { id: 1, name: 'Premium Puppy Kibble 🥣', type: 'food', quantity: 2500, unit: 'g', threshold: 500, decrementAmount: 100 },
        { id: 2, name: 'Tuna Wet Cans 🥣', type: 'food', quantity: 8, unit: 'cans', threshold: 2, decrementAmount: 1 },
        { id: 3, name: 'Deworming Pills 💊', type: 'medicine', quantity: 6, unit: 'pills', threshold: 2, decrementAmount: 1 },
        { id: 4, name: 'Amoxicillin Syrup 💊', type: 'medicine', quantity: 120, unit: 'ml', threshold: 30, decrementAmount: 5 }
      ];
      
      let items = pawCache.stockItems || [];
      if (items.length === 0) {
        try {
          const stored = localStorage.getItem('pawStock');
          if (stored) items = JSON.parse(stored);
        } catch (e) { }
        if (!items || items.length === 0) {
          items = demoStock;
          saveStockItems(items);
        } else {
          pawCache.stockItems = items;
        }
      }
      return items;
    }

    async function saveStockItems(items) {
      pawCache.stockItems = items;
      localStorage.setItem('pawStock', JSON.stringify(items));
      if (!window.supabaseClient || !currentUser) return;
      const userId = currentUser.id;
      try {
        await window.supabaseClient.from('stock_items').delete().eq('user_id', userId);
        if (items.length > 0) {
          const rows = items.map(item => ({
            user_id: userId,
            name: item.name,
            type: item.type,
            quantity: parseFloat(item.quantity || 0),
            unit: item.unit || 'g',
            threshold: parseFloat(item.threshold || 0),
            decrement_amount: parseFloat(item.decrementAmount || 0)
          }));
          await window.supabaseClient.from('stock_items').insert(rows);
        }
      } catch (err) {
        console.error("Error syncing stock items to Supabase:", err);
      }
    }

    function addStockItem() {
      const nameInput = document.getElementById('stockName');
      const typeSelect = document.getElementById('stockType');
      const qtyInput = document.getElementById('stockQty');
      const unitInput = document.getElementById('stockUnit');
      const threshInput = document.getElementById('stockThreshold');
      const decInput = document.getElementById('stockDecAmount');

      if (!nameInput || !typeSelect || !qtyInput || !unitInput || !threshInput || !decInput) return;

      const name = nameInput.value.trim();
      const type = typeSelect.value;
      const quantity = parseFloat(qtyInput.value);
      const unit = unitInput.value.trim() || 'units';
      const threshold = parseFloat(threshInput.value);
      const decrementAmount = parseFloat(decInput.value) || 1;

      if (!name) {
        showToast('Please enter item name');
        return;
      }
      if (isNaN(quantity) || quantity < 0) {
        showToast('Please enter valid quantity');
        return;
      }
      if (isNaN(threshold) || threshold < 0) {
        showToast('Please enter valid threshold');
        return;
      }

      const items = getStockItems();
      items.push({
        id: Date.now(),
        name,
        type,
        quantity,
        unit,
        threshold,
        decrementAmount
      });
      saveStockItems(items);

      nameInput.value = '';
      qtyInput.value = '';
      unitInput.value = '';
      threshInput.value = '';
      decInput.value = '';

      showToast(`${name} added to stock! 📦`);
      renderStockTracker();
    }

    function deleteStockItem(id) {
      const items = getStockItems();
      const filtered = items.filter(i => i.id !== id);
      saveStockItems(filtered);
      showToast('Item deleted');
      renderStockTracker();
    }

    function useStockItem(id, manualAmount) {
      const items = getStockItems();
      const item = items.find(i => i.id === id);
      if (!item) return;

      const amt = manualAmount !== undefined ? manualAmount : item.decrementAmount;
      if (item.quantity <= 0) {
        showToast(`Stock empty: ${item.name} is already at 0!`);
        return;
      }

      item.quantity = Math.max(0, parseFloat((item.quantity - amt).toFixed(2)));
      saveStockItems(items);

      let msg = `Used ${amt} ${item.unit} of ${item.name}. Remaining: ${item.quantity} ${item.unit}`;
      showToast(msg);

      if (item.quantity <= item.threshold) {
        setTimeout(() => {
          showToast(`⚠️ Low stock warning: ${item.name} is running low!`);
          if (typeof showNotification === 'function') {
            showNotification(`⚠️ Low stock: ${item.name} has only ${item.quantity} ${item.unit} left!`);
          }
        }, 800);
      }

      renderStockTracker();
    }

    function deductStockAutomatically(keyword, type) {
      const items = getStockItems();
      const keywordLower = keyword.toLowerCase();

      let item = items.find(i => i.type === type && keywordLower.includes(i.name.toLowerCase().replace(/🥣|💊/g, '').trim()));

      if (!item) {
        item = items.find(i => i.type === type);
      }

      if (item) {
        const amt = item.decrementAmount;
        if (item.quantity > 0) {
          item.quantity = Math.max(0, parseFloat((item.quantity - amt).toFixed(2)));
          saveStockItems(items);
          console.log(`Auto-deducted stock: ${amt} ${item.unit} from ${item.name}`);

          if (item.quantity <= item.threshold) {
            setTimeout(() => {
              showToast(`⚠️ Low stock warning: ${item.name} is running low!`);
              if (typeof showNotification === 'function') {
                showNotification(`⚠️ Low stock: ${item.name} has only ${item.quantity} ${item.unit} left!`);
              }
            }, 1000);
          }
          renderStockTracker();
        }
      }
    }

    function renderStockTracker() {
      const container = document.getElementById('stockTrackerContainer');
      if (!container) return;

      const items = getStockItems();

      let html = `
        <div class="card" style="margin-top:14px; border-left: 5px solid var(--purple)">
          <h3 style="font-weight:900; margin-bottom:4px">📦 Food & Medicine Stock Tracker</h3>
          <p class="subtitle" style="margin-bottom:12px">Track quantity, usage, and receive alerts when items run low.</p>
          
          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px">
      `;

      if (items.length === 0) {
        html += `<p style="font-size:12px; color:var(--muted); text-align:center; padding:12px 0">No items in stock. Add one below!</p>`;
      } else {
        html += items.map(i => {
          const isLow = i.quantity <= i.threshold;
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--bg); border:1px solid var(--border); border-radius:14px; position:relative">
              <div style="flex:1; padding-right:10px">
                <div style="font-weight:900; color:var(--dark); font-size:14px; display:flex; align-items:center; gap:6px">
                  ${i.name}
                  ${isLow ? `<span style="background:var(--danger-bg); color:#d64040; border:1px solid #FFCCE0; font-size:9px; padding:1px 6px; border-radius:10px; font-weight:800">⚠️ LOW</span>` : ''}
                </div>
                <div style="font-size:12px; color:var(--muted); margin-top:2px">
                  Type: ${i.type === 'food' ? 'Bowl Food 🍽️' : 'Meds 💊'} · Usage portion: -${i.decrementAmount} ${i.unit}
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px">
                <div style="text-align:right; margin-right:6px">
                  <div style="font-size:16px; font-weight:900; color:var(--dark)">${i.quantity} ${i.unit}</div>
                  <div style="font-size:10px; color:var(--muted)">Min: ${i.threshold} ${i.unit}</div>
                </div>
                <button class="small-btn" onclick="useStockItem(${i.id})" style="padding:6px 12px; font-weight:800; font-size:12px; border-radius:10px" title="Use Portion">Use</button>
                <button onclick="deleteStockItem(${i.id})" style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:14px; padding:4px">✕</button>
              </div>
            </div>
          `;
        }).join('');
      }

      html += `
          </div>

          <div style="background:var(--bg); border:1px solid var(--border); padding:14px; border-radius:16px">
            <h4 style="font-weight:900; margin-bottom:10px; font-size:14px; color:var(--dark)">➕ Add Stock Item</h4>
            
            <div style="margin-bottom:10px">
              <label style="font-size:11px; margin-bottom:4px">Item Name</label>
              <input id="stockName" type="text" placeholder="e.g. Dry Salmon, Heartgard 6" style="margin:0; padding:8px 10px; font-size:13px; border-radius:10px; border:1px solid var(--border); background:#fff; color:var(--text)">
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px">
              <div>
                <label style="font-size:11px; margin-bottom:4px">Type</label>
                <select id="stockType" style="margin:0; padding:8px 10px; font-size:13px; border-radius:10px; border:1px solid var(--border); background:#fff; color:var(--text)">
                  <option value="food">Bowl Food 🍽️</option>
                  <option value="medicine">Medicine 💊</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px; margin-bottom:4px">Current Qty</label>
                <input id="stockQty" type="number" placeholder="e.g. 500" style="margin:0; padding:8px 10px; font-size:13px; border-radius:10px; border:1px solid var(--border); background:#fff; color:var(--text)">
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:12px">
              <div>
                <label style="font-size:11px; margin-bottom:4px">Unit</label>
                <input id="stockUnit" type="text" placeholder="e.g. g, cans, pills" style="margin:0; padding:8px 10px; font-size:13px; border-radius:10px; border:1px solid var(--border); background:#fff; color:var(--text)">
              </div>
              <div>
                <label style="font-size:11px; margin-bottom:4px">Low Limit</label>
                <input id="stockThreshold" type="number" placeholder="e.g. 100" style="margin:0; padding:8px 10px; font-size:13px; border-radius:10px; border:1px solid var(--border); background:#fff; color:var(--text)">
              </div>
              <div>
                <label style="font-size:11px; margin-bottom:4px">Portion Use</label>
                <input id="stockDecAmount" type="number" placeholder="e.g. 50" style="margin:0; padding:8px 10px; font-size:13px; border-radius:10px; border:1px solid var(--border); background:#fff; color:var(--text)">
              </div>
            </div>

            <button class="primary-btn" onclick="addStockItem()" style="margin:0; width:100%; padding:10px; border-radius:12px; font-size:13px">Add Item</button>
          </div>
        </div>
      `;
      container.innerHTML = html;
    }

    // ==================== END NEW JS ====================

    console.log('Recipe database loaded from embedded JSON!');
    normalizeAndMergeDB();
    renderHomemadeTab();


// =============================================================================
// CAPACITOR NATIVE NOTIFICATION BRIDGE
// Extends showNotification(), enableNotifications(), startAllReminders(), 
// and saveCareTasks() to support native local notifications on Android/iOS.
// =============================================================================
(async function initCapacitor() {
  if (!window.Capacitor || !Capacitor.isNativePlatform()) return;

  const { LocalNotifications, StatusBar, SplashScreen } = Capacitor.Plugins;

  // ── 1. Request notification permissions on launch ──────────────────────────
  try {
    const perm = await LocalNotifications.requestPermissions();
    console.log('[PawFeed] Notification permission:', perm.display);
  } catch (e) {
    console.warn('[PawFeed] Notification permission request failed:', e);
  }

  // ── 2. Hide native splash once the web app is ready ───────────────────────
  await SplashScreen.hide({ fadeOutDuration: 400 });

  // ── 3. Sync status bar with light/dark theme ──────────────────────────────
  function syncStatusBar() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    StatusBar.setStyle({ style: isDark ? 'DARK' : 'LIGHT' }).catch(() => {});
    StatusBar.setBackgroundColor({ color: isDark ? '#0f1923' : '#ffffff' }).catch(() => {});
  }
  syncStatusBar();

  // Observe theme changes
  new MutationObserver(syncStatusBar).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  // ── 4. Native notification handler ────────────────────────────────────────
  let _nativeNotifId = 2000; // Start high for arbitrary notifications

  const _originalShowNotification = window.showNotification || function(){};
  window.showNotification = async function(title, message, type) {
    let finalTitle = title;
    let finalBody = message;

    // Handle single-argument calls (e.g. showNotification(msg))
    if (finalBody === undefined) {
      finalBody = title;
      finalTitle = '🐾 PawFeed';
    }

    // Keep existing in-app toast/notification working exactly as before
    _originalShowNotification(finalBody);

    try {
      await LocalNotifications.schedule({
        notifications: [{
          id:    _nativeNotifId++,
          title: finalTitle || 'PawFeed',
          body:  finalBody  || '',
          schedule: { at: new Date(Date.now() + 1000) },
          sound: null,
          smallIcon: 'ic_notification',
        }]
      });
    } catch (e) {
      console.warn('[PawFeed] Native notification failed:', e);
    }
  };

  // ── 5. Override enableNotifications ───────────────────────────────────────
  window.enableNotifications = async function() {
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display === 'granted') {
        showToast('Notifications enabled ✅');
        startAllReminders();
      } else {
        showToast('Permission denied');
      }
    } catch (e) {
      showToast('Notifications not supported');
      console.error('[PawFeed] Native enableNotifications failed:', e);
    }
  };

  // ── 6. Native feeding reminder scheduler ──────────────────────────────────
  const _originalStartAllReminders = window.startAllReminders || function(){};
  window.startAllReminders = async function() {
    _originalStartAllReminders();

    try {
      const pets = typeof getPets === 'function' ? getPets() : [];
      if (!pets || !pets.length) return;

      // Cancel all existing scheduled feeding reminders first (IDs 1-999)
      const pending = await LocalNotifications.getPending();
      if (pending && pending.notifications) {
        const toCancel = pending.notifications
          .filter(n => n.id >= 1 && n.id < 1000)
          .map(n => ({ id: n.id }));
        if (toCancel.length > 0) {
          await LocalNotifications.cancel({ notifications: toCancel });
        }
      }

      const nativeNotifications = [];
      let notifId = 1;

      pets.forEach(pet => {
        const times = [
          { hour: 7, minute: 0, title: 'Morning Meal 🌅', body: `Time to feed ${pet.name} their morning meal!` },
          { hour: 13, minute: 0, title: 'Afternoon Check ☀️', body: `Time to check on ${pet.name}!` },
          { hour: 19, minute: 30, title: 'Dinner Time 🌙', body: `Time to feed ${pet.name} their dinner!` }
        ];

        times.forEach(t => {
          nativeNotifications.push({
            id: notifId++,
            title: `🐾 ${t.title}`,
            body: t.body,
            schedule: {
              on: { hour: t.hour, minute: t.minute },
              repeats: true
            },
            sound: null,
            smallIcon: 'ic_notification',
          });
        });
      });

      if (nativeNotifications.length > 0) {
        await LocalNotifications.schedule({
          notifications: nativeNotifications
        });
        console.log(`[PawFeed] Scheduled ${nativeNotifications.length} native feeding reminders`);
      }
    } catch (e) {
      console.warn('[PawFeed] Failed to schedule native reminders:', e);
    }
  };

  const _originalToggleReminderSetting = window.toggleReminderSetting || function(){};
  window.toggleReminderSetting = async function() {
    _originalToggleReminderSetting();

    try {
      const toggle = document.getElementById('reminderToggle');
      const isEnabled = toggle && toggle.classList.contains('on');
      if (!isEnabled) {
        // Cancel all pending native feeding reminders (IDs 1-999)
        const pending = await LocalNotifications.getPending();
        if (pending && pending.notifications) {
          const toCancel = pending.notifications
            .filter(n => n.id >= 1 && n.id < 1000)
            .map(n => ({ id: n.id }));
          if (toCancel.length > 0) {
            await LocalNotifications.cancel({ notifications: toCancel });
          }
        }
        console.log('[PawFeed] Cancelled all native feeding reminders');
      }
    } catch (e) {
      console.warn('[PawFeed] Failed to toggle native reminders:', e);
    }
  };

  // ── 7. Custom Care Task Reminders ──────────────────────────────────────────
  window._syncNativeTaskReminders = async function(tasks) {
    if (!tasks) return;
    try {
      const pending = await LocalNotifications.getPending();
      
      const stringToHash = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = (hash << 5) - hash + str.charCodeAt(i);
          hash |= 0;
        }
        return Math.abs(hash) % 1000000 + 10000; // range 10000 - 1010000
      };

      const currentTaskIds = [];
      const nowMs = Date.now();
      const notificationsToSchedule = [];

      tasks.forEach(t => {
        if (t.reminder && !t.completed && t.dateTime) {
          const taskTime = new Date(t.dateTime).getTime();
          if (taskTime > nowMs) {
            const notifId = stringToHash(t.id);
            currentTaskIds.push(notifId);

            notificationsToSchedule.push({
              id: notifId,
              title: '📋 Care Task Reminder',
              body: t.title,
              schedule: { at: new Date(taskTime) },
              sound: null,
              smallIcon: 'ic_notification',
            });
          }
        }
      });

      // Cancel pending task notifications that are no longer active/needed
      if (pending && pending.notifications) {
        const toCancel = pending.notifications
          .filter(n => n.id >= 10000 && !currentTaskIds.includes(n.id))
          .map(n => ({ id: n.id }));
        if (toCancel.length > 0) {
          await LocalNotifications.cancel({ notifications: toCancel });
        }
      }

      // Schedule new reminders
      if (notificationsToSchedule.length > 0) {
        await LocalNotifications.schedule({
          notifications: notificationsToSchedule
        });
        console.log(`[PawFeed] Scheduled ${notificationsToSchedule.length} native task reminders`);
      }
    } catch (e) {
      console.warn('[PawFeed] Failed to sync task reminders:', e);
    }
  };

  const _originalSaveCareTasks = window.saveCareTasks || function(){};
  window.saveCareTasks = async function(tasks) {
    await _originalSaveCareTasks(tasks);
    await window._syncNativeTaskReminders(tasks);
  };

  // Sync existing task reminders on startup
  try {
    const tasks = typeof getCareTasks === 'function' ? getCareTasks() : [];
    if (tasks && tasks.length > 0) {
      await window._syncNativeTaskReminders(tasks);
    }
  } catch (e) {
    console.warn('[PawFeed] Startup task reminders sync failed:', e);
  }
})();

