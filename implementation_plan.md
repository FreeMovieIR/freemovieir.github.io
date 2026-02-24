# Subtitle Translation & Download Link Enhancement Plan

## Phase 1: Subtitle Translator (Isegaro) Enhancements
- [ ] **API Key Management**
    - [ ] Add a "Verify" button for each key to check if it's working.
    - [ ] Show status of each key (Working, Rate Limited, Invalid).
    - [ ] Persist the last used key.
- [ ] **Credit Blocks & Gap Detection**
    - [ ] Add a starting credit block (at 00:00:01,000).
    - [ ] Add an ending credit block.
    - [ ] Improve gap detection to ensure credits are placed naturally.
- [ ] **Context-Aware Translation**
    - [ ] Improve the prompt for better Persian flow.
    - [ ] Use a more robust language detection.
- [ ] **UI/UX Improvements**
    - [ ] Add a "Clear Cache/Progress" button.
    - [ ] Improve the progress bar (vibrant gradients, smooth transitions).
    - [ ] Enhance the Flash Message system with better styles.
    - [ ] Add tooltips or help text for settings.

## Phase 2: Download Link Integration (Rahamovie)
- [ ] **API Integration**
    - [ ] Modify `fetchDetails` in `assets/js/main.js` to call Rahamovie API for download links.
    - [ ] Handle failures by falling back to the default `DOWNLOAD_PROXY`.
- [ ] **UI Update**
    - [ ] Render multiple links (480p, 720p, 1080p, etc.) nicely in the details view.
    - [ ] Add a "Copy Link" button for each quality.

## Phase 3: Final Polish
- [ ] Refactor `main.js` and `scripts.js` for better modularity.
- [ ] Ensure SEO best practices are met for the new content.
