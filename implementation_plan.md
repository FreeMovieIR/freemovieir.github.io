# Implementation Plan: Free Movie Enhancements

## Phase 1: Branding & Cleanup
- [x] Remove all mentions of "Raha" and "Rahamovie".
- [x] Centralize site name and branding in `config.js`.

## Phase 2: Core UI Components (Shared)
- [x] **Professional Header**
    - [x] Redesign for a more "premium" and modern look.
    - [x] Ensure full responsiveness.
    - [x] Add glassmorphic effects.
- [x] **Settings Modal**
    - [x] Convert the settings page into a modal accessible from the header.
    - [x] Update `layout-shared.js` to handle the modal logic.
- [x] **Developer Page & Isegaro Shared Layout**
    - [x] Ensure the developer page correctly imports and uses the shared header and footer.
    - [x] Integrate shared header/footer into the subtitle translator page.

## Phase 3: Home Page Enhancements
- [x] **Advanced Slider**
    - [x] Display 4 items (2 movies, 2 series) in rotation.
    - [x] Auto-rotation every few seconds.
    - [x] Smooth transitions and high-quality backdrops.

## Phase 4: Download Source Integration (from Resolved Tasks)
- [x] **API Connectivity**
    - [x] Research and Verify `MOVIE_DATA` (RahaMovie) API endpoints.
    - [x] Centralize API keys in `config.js`.
- [x] **Functional Implementation**
    - [x] Create `fetchMovieDataDownloads` with search/imdb logic in `main.js`.
    - [x] Standardize Source Card UI with quality badges.
    - [x] Inject dynamic sources into `renderDetailsView`.
    - [x] Implement matching logic for titles and years.
- [x] **Resilience**
    - [x] Implement failsafe mechanisms (fallback to Berlin/SubtitleStar servers).
    - [x] Handle series/seasons mapping for multi-source providers.

## Phase 5: Watchlist Restoration
- [x] **Watchlist Fix**
    - [x] Debug and fix `pages/watchlist/watchlist.js`.
    - [x] Fix container ID mismatches in `index.html`.
    - [x] Ensure items are correctly added, removed, and displayed.

## Phase 6: Subtitle Translator (Isegaro) Enhancements
- [ ] **API Key Management**
    - [ ] Add a "Verify" button for each key.
    - [ ] Show status (Working, Rate Limited, Invalid).
- [ ] **Credit Blocks & Gap Detection**
    - [ ] Add starting and ending credit blocks.
    - [ ] Improve natural placement of credits.
- [x] **UI/UX Refinement**
    - [x] Finalize the glassmorphic card design.
    - [x] Add header/footer navigation.

## Phase 7: Final Polish
- [x] SEO optimization for all pages.
- [x] LinkedIn link integration (Footer & Config).
- [x] Performance check (caching, asset loading).
- [x] Final visual audit for premium consistency.

