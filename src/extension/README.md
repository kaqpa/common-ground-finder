# Letterboxd Movies in Common - Chrome Extension

A Chrome Extension that adds a "Movies in Common" feature to Letterboxd profile pages, showing which movies you and another user have both watched or added to your watchlist.

## Features

- **Smart Menu Injection**: Adds "Movies in common" to the profile navigation menu
- **Automatic Scraping**: Fetches all watched films and watchlist items with pagination
- **Shadow DOM UI**: Overlay modal isolated from Letterboxd's styles
- **Rich Display**: Movie posters, titles, ratings, and watched/watchlist status

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select this `extension` folder

## Files

| File | Description |
|------|-------------|
| `manifest.json` | Chrome Extension manifest (V3) |
| `content.js` | Main content script with all logic |
| `MoviesInCommonOverlay.tsx` | React component reference (optional) |

## Usage

1. Go to any Letterboxd user's profile page
2. Look for "Movies in common" in the profile navigation
3. Click it to see movies you both have watched or in your watchlists

## Notes

- The menu item only appears on other users' profiles (not your own)
- Scraping respects rate limits with 300ms delays between pages
- All data is processed client-side; nothing is sent to external servers

## Icons

You'll need to create icon files in an `icons/` folder:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

## Development

The `MoviesInCommonOverlay.tsx` is a React reference implementation. The actual `content.js` uses vanilla JavaScript with embedded CSS for maximum compatibility without build tools.

If you want to use React/bundlers, you can:
1. Build the TSX component
2. Bundle with your preferred tool (Vite, webpack, etc.)
3. Update `manifest.json` to point to your bundled output
