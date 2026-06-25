#!/usr/bin/env python3
"""
extract_www.py — Splits pawfeed00.html into www/index.html, www/styles.css, www/app.js
for Capacitor packaging. Zero logic changes; only relocates code.
"""

import os
import sys

print("WARNING: This script is deprecated. Active development has moved to the 'www/' directory.")
print("Running this script will OVERWRITE all changes made directly in 'www/index.html', 'www/app.js', and 'www/styles.css'.")
choice = input("Are you absolutely sure you want to run this? (y/N): ")
if choice.lower() != 'y':
    print("Aborting to protect active files.")
    sys.exit(1)

SRC = "pawfeed00.html"
WWW = "www"
os.makedirs(WWW, exist_ok=True)

with open(SRC, "r", encoding="utf-8") as f:
    lines = f.readlines()

total = len(lines)
print(f"Read {total} lines from {SRC}")

# ── Line ranges (1-indexed, inclusive → 0-indexed slices) ────────────────────
# CSS:           lines 12–2665  (inside <style>…</style>)
# HTML body:     lines 2670–3798 (inside <body> before first <script>)
# Script 1:      lines 3800–6502 (0-based 3799:6502)
# Script 2:      lines 6506–6543 (0-based 6505:6543)
# Script 3:      lines 6546–24565 (0-based 6545:24565)

css_lines   = lines[11:2665]          # 0-idx 11 → 2664
html_lines  = lines[2669:3798]        # 0-idx 2669 → 3797
js1_lines   = lines[3799:6502]        # script block 1 (excludes closing script tag)
js2_lines   = lines[6505:6543]        # script block 2 (excludes closing script tag)
js3_lines   = lines[6545:24565]       # script block 3 (excludes closing script tag)

# ── www/styles.css ────────────────────────────────────────────────────────────
with open(f"{WWW}/styles.css", "w", encoding="utf-8") as f:
    f.write("/* styles.css - Verbatim CSS from pawfeed00.html <style> block. No changes made. */\n")
    f.writelines(css_lines)
print(f"  [OK] www/styles.css  ({len(css_lines)} lines)")

# Join Javascript blocks so we can perform global string replacements easily
js1_text = "".join(js1_lines)
js2_text = "".join(js2_lines)
js3_text = "".join(js3_lines)

# 1. Rename the duplicate handleGalleryUpload in script block 1
js1_text = js1_text.replace("function handleGalleryUpload(event)", "function handleModalGalleryUpload(event)")

# 2. Update HTML to call handleModalGalleryUpload in gallery modal
html_text = "".join(html_lines)
html_text = html_text.replace('onchange="handleGalleryUpload(event)"', 'onchange="handleModalGalleryUpload(event)"')

# 3. Convert window.onload in script block 1 to window.addEventListener('load', ...)
js1_text = js1_text.replace("window.onload = function () {", "window.addEventListener('load', function () {")
js1_text = js1_text.replace("    };\n\n    function initApp() {", "    });\n\n    function initApp() {")

# 4. Convert window.onload in script block 2 to window.addEventListener('load', ...)
js2_text = js2_text.replace("window.onload = function () {", "window.addEventListener('load', function () {")
js2_text = js2_text.replace('      localStorage.removeItem("pawfeedCurrentUser");\n    };', '      localStorage.removeItem("pawfeedCurrentUser");\n    });')

# ── www/app.js ────────────────────────────────────────────────────────────────
CAPACITOR_BRIDGE = '''
// =============================================================================
// CAPACITOR NATIVE NOTIFICATION BRIDGE
// Extends the existing showNotification() toast function so that low-stock
// alerts and feeding reminders also fire as real native local notifications.
// NOTE: localStorage is kept as-is (Capacitor WebView fully supports it).
//       For more reliable long-term persistence, migrate to @capacitor/preferences.
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

  // Observe theme changes (the existing dark-toggle sets data-theme on <html>)
  new MutationObserver(syncStatusBar).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  // ── 4. Extend showNotification() with native push ─────────────────────────
  let _nativeNotifId = 1000; // start above any app-scheduled IDs

  const _originalShowNotification = window.showNotification || function(){};
  window.showNotification = async function(title, message, type) {
    // Keep existing in-app toast working exactly as before
    _originalShowNotification(title, message, type);

    // Additionally fire a native local notification
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id:    _nativeNotifId++,
          title: title   || 'PawFeed',
          body:  message || '',
          // Schedule immediately (1 second from now)
          schedule: { at: new Date(Date.now() + 1000) },
          sound: null,
          smallIcon: 'ic_notification',
        }]
      });
    } catch (e) {
      console.warn('[PawFeed] Native notification failed:', e);
    }
  };

  // ── 5. Native feeding reminder scheduler ──────────────────────────────────
  // The existing app uses setInterval-based reminderTimers[]. This bridge also
  // registers a LocalNotifications.schedule() call whenever a feeding reminder
  // is set, so it fires even when the app is backgrounded.
  window._scheduleNativeFeedingReminder = async function(petName, feedTime, notifId) {
    try {
      const [h, m] = (feedTime || '').split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return;
      const at = new Date();
      at.setHours(h, m, 0, 0);
      if (at <= new Date()) at.setDate(at.getDate() + 1); // schedule for tomorrow if past
      await LocalNotifications.schedule({
        notifications: [{
          id:    notifId || (_nativeNotifId++),
          title: '🐾 Feeding Time!',
          body:  `Time to feed ${petName}!`,
          schedule: { at, repeats: true },
          sound: null,
          smallIcon: 'ic_notification',
        }]
      });
      console.log(`[PawFeed] Native feeding reminder set for ${petName} at ${feedTime}`);
    } catch (e) {
      console.warn('[PawFeed] Native feeding reminder failed:', e);
    }
  };
})();

'''

with open(f"{WWW}/app.js", "w", encoding="utf-8") as f:
    f.write("// app.js — All JavaScript from pawfeed00.html. Capacitor bridge appended below.\n")
    f.write(js1_text)
    f.write("\n// ── Script block 2: splash/login logic ─────────────────────────────────────\n")
    f.write(js2_text)
    f.write("\n// ── Script block 3: recipeDB + main app logic ───────────────────────────────\n")
    f.write(js3_text)
    f.write(CAPACITOR_BRIDGE)

js_total_lines = len(js1_text.splitlines()) + len(js2_text.splitlines()) + len(js3_text.splitlines())
print(f"  [OK] www/app.js  ({js_total_lines} lines + Capacitor bridge)")

# ── www/index.html ────────────────────────────────────────────────────────────
INDEX_HTML = """<!DOCTYPE html>
<!-- index.html — PawFeed markup only. CSS → styles.css, JS → app.js. No logic changes. -->
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="description" content="PawFeed — AI-powered pet care app for feeding schedules, health tracking, and more." />
  <title>PawFeed — AI Pet Care App</title>

  <!-- Google Fonts: Nunito + Poppins -->
  <link
    href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Poppins:wght@400;500;600;700&display=swap"
    rel="stylesheet">

  <!-- App styles -->
  <link rel="stylesheet" href="styles.css">
</head>

<body>

"""

# Note: We load app.js as a regular script (not type="module") to keep inline handlers global.
INDEX_FOOTER = """
  <!-- Capacitor runtime bridge (injected by native shell on device) -->
  <script src="capacitor.js"></script>

  <!-- PawFeed application logic -->
  <script src="app.js"></script>

</body>
</html>
"""

with open(f"{WWW}/index.html", "w", encoding="utf-8") as f:
    f.write(INDEX_HTML)
    f.write(html_text)
    f.write(INDEX_FOOTER)
print(f"  [OK] www/index.html  ({len(html_text.splitlines())} body lines)")

print("\n[DONE] Extraction complete! www/ folder ready.")
