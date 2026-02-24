# Implementation Plan: FreeMovieIR Enhancements

## Phase 1: Branding & Cleanup
- [x] Remove all mentions of "Raha" and "Rahamovie".
- [ ] Centralize site name and branding in `config.js`.

## Phase 2: Core UI Components (Shared)
- [ ] **Professional Header**
    - [ ] Redesign for a more "premium" and modern look.
    - [ ] Ensure full responsiveness.
    - [ ] Add glassmorphic effects.
- [ ] **Settings Modal**
    - [ ] Convert the settings page into a modal accessible from the header.
    - [ ] Update `layout-shared.js` to handle the modal logic.
- [ ] **Developer Page Fix**
    - [ ] Ensure the developer page correctly imports and uses the shared header and footer.

## Phase 3: Home Page Enhancements
- [ ] **Advanced Slider**
    - [ ] Display 4 items (2 movies, 2 series) simultaneously.
    - [ ] Featured item (largest) with auto-rotation every few seconds.
    - [ ] Smooth transitions and high-quality posters.

## Phase 5: Functional Fixes
- [ ] **Watchlist Fix**
    - [ ] Debug and fix `pages/watchlist/watchlist.js`.
    - [ ] Ensure items are correctly added, removed, and displayed.

## Phase 6: Subtitle Translator (Isegaro) Enhancements
- [ ] **API Key Management**
    - [ ] Add a "Verify" button for each key.
    - [ ] Show status (Working, Rate Limited, Invalid).
- [ ] **Credit Blocks & Gap Detection**
    - [ ] Add starting and ending credit blocks.
    - [ ] Improve natural placement of credits.
- [ ] **UI/UX Refinement**
    - [ ] Finalize the progress bar and flash messages.

## Phase 7: Final Polish
- [ ] SEO optimization for all pages.
- [ ] Performance check (caching, asset loading).

