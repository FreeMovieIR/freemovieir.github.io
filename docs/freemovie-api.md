# FreeMovie API Integration

This document outlines the implementation of the FreeMovie API integration layer for FreeMovie.

## Overview
The integration layer provides a robust set of functions to interact with the FreeMovie API, including fallback support for secondary servers and localized genre mapping.

## Key Features
- **Fallback Support**: Automatically tries helper servers if the primary server fails.
- **Genre Translation**: Maps Persian genre names to English for internal consistency.
- **Season Parsing**: Intelligently extracts season numbers and version info (quality, dubbing) from Persian titles.
- **Stremio-Ready**: Includes transformation functions for Stremio-compatible metadata and video objects.

## API Configuration
| Setting | Value |
|---------|-------|
| Primary Server | `https://server-hi-speed-iran.info` |
| Helper 1 | `https://hostinnegar.com` |
| Helper 2 | `https://windowsdiba.info` |

## Usage Examples

### Fetching Movies
```javascript
// Fetch the first page of new releases
const movies = await FreeMovieAPI.fetchMovies(0, 0, 'created');
```

### Searching
```javascript
// Search for a specific title
const results = await FreeMovieAPI.search('Inception');
```

## Internal Mapping Table
| Persian Genre | English Translation |
|---------------|---------------------|
| سریال های برتر | Top Series |
| تازه های باحال | New Releases |
| ... | ... |

## Error Handling
The integration uses a 30-second timeout for all requests and implements an exponential retry logic across multiple servers to ensure high availability.
