# BagTracker: Offline-First Disc Golf Companion

BagTracker is a premium, high-performance, mobile-first application built for disc golfers. Designed to work completely offline, it combines a massive 3,000+ disc database with advanced tactical tools including a GPS rangefinder, custom shot logging, dynamic flight visualization, and offline scorekeeping.

## Core Features

### App Shell
* Offline-first Capacitor/Next.js app backed by SQLite on device and sql.js/localStorage on web.
* Static export for Android web assets.
* Desktop sidebar navigation for Catalog, My Bags, Throw Log, Scorecard, Rangefinder, Wishlist, My Courses, Location Pins, Data, Stats, Dictionary, and About.
* Mobile floating island navigation for Catalog, Bags, Score, Range, and More.
* Mobile More drawer with Throw Logger, Distance Tracker, Wishlist, My Courses, Location Pins, Data & Backup, Stats, Dictionary, and About.
* Swipe navigation between tabs on touch devices.
* Pull-to-refresh event dispatch.
* Android hardware back handling for drawer/tab navigation.
* Deep-link handling for ?bag= and shared bag import via ?share=.
* Dismissible backup reminder banner with shortcut to Data.

### Catalog
* Disc catalog search.
* Tokenized search across name, brand, category, and stability.
* Speed search syntax such as speed7 and ranges such as speed 4-6.
* Category filters: All, Putter, Midrange, Fairway, Distance, Approach.
* Group results by type or by stability.
* Disc cards with brand, normalized category, stability chip, and flight numbers.
* Disc detail modal.
* Expandable flight path visualization.
* Add disc to bag.
* Create a bag while adding a disc.
* Wishlist toggle from catalog.
* Swipe-revealed compare and flight path actions.
* Two-disc comparison sheet using flight charts and key differences.
* Add custom disc modal with name, brand, speed, glide, turn, and fade.

### My Bags
* Create, select, delete, import, and export bags.
* List discs in selected bag.
* Add/remove discs.
* Swipe-to-remove disc cards.
* Move or copy discs between bags.
* Edit bag disc details: plastic, weight, and notes.
* Disc photo button for custom disc photos.
* Flight numbers and expandable flight path per bag disc.
* Bag chart/flight model visualization.
* Bag Power Map.
* Overlap Analyzer.
* Weather-aware recommendation card when GPS is available.
* Throw logging entry point from bag discs.
* QR bag sharing with encoded bag payload.
* Confirmation dialogs and toast feedback.

### Throw Logger
* Select a bag disc and log a throw.
* Record distance.
* Record throw style/hand.
* Preset shot shapes.
* Custom editable throw path.
* Condition tags: headwind, tailwind, crosswind, uphill, downhill, OB, ace, skip.
* Notes.
* Save new throws.
* Edit existing throws.
* Delete throws.
* Recent throw history with date, distance, disc, throw style, condition tags, notes, and path thumbnail.

### Scorecard
* Start new rounds.
* Use custom course name or saved course.
* Choose hole count.
* Multi-player setup.
* Add/remove players.
* Per-hole par and score controls.
* Player switching.
* Saved course par and distance loading.
* Track throws on individual holes.
* Edit tracked throws.
* Round summary.
* Recent rounds list.
* Delete rounds.
* Personal-best detection.
* Share round summary.

### Rangefinder
* GPS permission flow.
* Live GPS tracking.
* GPS accuracy guidance.
* Set start point.
* Measure distance in feet.
* Reset measurement.
* Radar visualization.
* Satellite/map mode.
* Save measured shot.
* Pick or type disc name.
* Shot shape presets.
* Editable shot path.
* Distance/path slider.
* Recent shots list.
* Clear recent non-round shots.

### Wishlist
* List wishlisted discs.
* Empty/loading states.
* Disc detail modal support.
* Remove from wishlist through catalog state.

### My Courses
* Create custom courses.
* Course name, city, notes, cover photo, and hole count.
* Preset/custom hole counts.
* Course cards with recent and best round summaries.
* Course detail view.
* Edit hole par, distance, and notes.
* Course totals for holes, par, and distance.
* Recent rounds for a course.
* Delete custom course and associated holes.

### Location Pins
* Save location pins.
* Pin types: Tee, Basket, Practice Spot, Throw Start.
* Use current GPS.
* Reverse geocode location labels when online.
* Offline local storage of pins.
* List saved pins.
* Delete pins.

### Data & Backup
* Last backup status card.
* Backup vs bag-share explanation.
* Export backup by category.
* Backup categories from the backup exporter.
* Last-backup timestamp tracking.
* Backup reminders: Off, Weekly, Biweekly, Monthly.
* Restore from backup JSON.
* Merge restore mode.
* Full restore mode.
* Backup payload validation.
* Import discs from CSV or JSON.
* Auto-detect field mapping.
* Manual field mapping for name, brand, plastic, weight, speed, glide, turn, fade, notes, and status.
* Import preview with new, probable duplicate, exact duplicate, and parse error counts.
* Import audit logging.
* Nearby-device transfer through native share sheet or web download fallback.
* Transfer preflight guidance and error handling.
* Swipe-right back gesture from sub-sections.

### Stats
* Rounds played.
* Throws logged.
* Longest throw.
* Best round.
* Most-used disc.
* This-month counts.
* Empty states for no rounds or no throws.
* Detailed throw stats prompt after logging.

### Dictionary
* Disc golf terminology reference.
* Sectioned dictionary content.
* Terms for scoring, throws, disc types, flight numbers, stability, rules, and course features.

### About
* App identity and version.
* Disc catalog count/status.
* Version history/changelog.
* Hidden developer evaluation unlock.

### Developer Evaluation
* Hidden dev-only evaluation screen.
* Runs field usability checks.
* Displays status badges: Success, Error, Timeout.
* Shows raw JSON results.

### Shared UI/Infrastructure
* Native-feeling confirmation dialogs.
* Bottom sheets.
* Toast notifications.
* Haptics for supported actions.
* Weather widget.
* Flight number component.
* Flight path canvas and editable path canvas.
* Bag QR encode/decode helpers.
* Backup exporter/import parser.
* Recommendation, overlap, bag power, and throw path engines.

## Screenshots

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

## Technology Stack
* Framework: Next.js 16 (App Router, Static Export)
* Native Bridge: Capacitor 8
* Database: SQLite (capacitor-community/sqlite & sql.js for web fallback)
* Styling: TailwindCSS with custom CSS variables for precise theming
* Icons: Lucide React

## Build & Deployment

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
