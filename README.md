# BagTracker: Offline-First Disc Golf Companion

BagTracker is a premium, high-performance, mobile-first application built for disc golfers. Designed to work completely offline, it combines a massive 3,000+ disc database with advanced tactical tools including a GPS rangefinder, custom shot logging, dynamic flight visualization, and offline scorekeeping.

## 🚀 Core Features

### 🎒 Advanced Disc Management & Catalog
*   **Global Offline Catalog:** Search and filter a comprehensive database of over 3,000 discs with official manufacturer flight numbers (Speed, Glide, Turn, Fade).
*   **Multi-Bag Support:** Create customized bags for different scenarios (e.g., "Tournament Bag", "Field Work", "Glow Round").
*   **Deep Customization:** Track exact plastic types, weights, colors, and personalized notes for every disc you own.
*   **Move & Copy:** Seamlessly transfer discs between bags or duplicate them for quick management.
*   **Disc Photography:** Take and attach real photos to your discs for instant visual identification.

### 🎯 Tactical Rangefinder
*   **GPS Precision:** Utilize device location services to measure exact distances on the course.
*   **Interactive Target Plotting:** Manually drop a "Landing" marker on the satellite map to visualize your target line and calculate remaining distances to the basket.
*   **Tactical HUD:** A clean, responsive heads-up display showing your bearing, accuracy, and distance to the target in real-time.

### 🥏 Professional Throw Logger
*   **Dynamic Flight Visualization:** Automatically generates mathematical spline-based flight paths based on a disc's specific flight numbers and physics.
*   **Manual Path Sketching:** Use the interactive "Draw Free" or "Edit Points" canvas to manually map the exact flight path of your throw.
*   **Shot Metadata:** Tag every throw with specific release shapes (Hyzer, Flat, Anhyzer), throw styles (RHBH, RHFH, etc.), and distance.
*   **Environmental Tracking:** Log detailed conditions affecting your shot, including wind (headwind, tailwind, crosswind) and elevation (uphill, downhill).

### ⛳ Custom Course System & Scorekeeper
*   **Build Your Local Course:** Create completely custom offline course layouts without relying on a global server.
*   **Hole-by-Hole Details:** Set specific pars and distances for every single hole on your custom layout.
*   **Cover Photos:** Add unique cover photos to your courses to make your list visually stunning and personalized.
*   **Live Score Tracking:** Record scores stroke-by-stroke during your round with real-time calculations against par.
*   **Historical Stats:** View a history of your past rounds played at specific courses, tracking your best scores over time.

### ⚡ Power User Features
*   **Real-Time Weather Integration:** Pulls local wind speed, direction, and temperature data to inform your shot decisions (requires API key).
*   **Total Data Portability:** Export your entire database (bags, throws, courses, rounds) as CSV, JSON, or a full encrypted SQLite binary backup. Never lose your data.
*   **Haptic Feedback:** Tactile native device feedback for critical UI interactions, providing a premium app feel.
*   **Native Dark Mode:** A sleek, high-contrast dark-mode interface meticulously designed for maximum visibility in bright sunlight on the course.
*   **100% Offline Capable:** Built on Capacitor and SQLite (`capacitor-sqlite`), all your data lives on your device. Zero cell service required on remote courses.
## 📸 Screenshots

*(Replace the placeholder links below with actual screenshots of the app running on a mobile device)*

<div align="center">
  <img src="https://via.placeholder.com/300x600.png?text=Bags+Dashboard" width="30%" alt="Bags Dashboard">
  &nbsp;&nbsp;&nbsp;
  <img src="https://via.placeholder.com/300x600.png?text=Catalog+Search" width="30%" alt="Catalog Search">
  &nbsp;&nbsp;&nbsp;
  <img src="https://via.placeholder.com/300x600.png?text=Rangefinder" width="30%" alt="Rangefinder">
</div>

<br>

<div align="center">
  <img src="https://via.placeholder.com/300x600.png?text=Throw+Logger" width="30%" alt="Throw Logger">
  &nbsp;&nbsp;&nbsp;
  <img src="https://via.placeholder.com/300x600.png?text=Custom+Courses" width="30%" alt="Custom Courses">
  &nbsp;&nbsp;&nbsp;
  <img src="https://via.placeholder.com/300x600.png?text=Live+Scorekeeper" width="30%" alt="Live Scorekeeper">
</div>

---

## 🛠️ Technology Stack
*   **Framework:** Next.js 16 (App Router, Static Export)
*   **Native Bridge:** Capacitor 8
*   **Database:** SQLite (`capacitor-community/sqlite` & `sql.js` for web fallback)
*   **Styling:** TailwindCSS with custom CSS variables for precise theming
*   **Icons:** Lucide React

## 📱 Build & Deployment

### Local Development
```bash
npm install
npm run dev
```

### Android APK Build
```bash
# Build the static Next.js export
npm run build

# Sync assets to the native Android project
npx cap sync android

# Build the release APK via Gradle
cd android
./gradlew assembleRelease
```
The compiled APK will be located at `android/app/build/outputs/apk/release/app-release.apk`.
