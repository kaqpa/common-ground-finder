

# Letterboxd "Movies in Common" Chrome Extension

## Overview
A Chrome Extension content script that adds a "Movies in Common" feature to Letterboxd profile pages, showing which movies you and another user have both watched or added to your watchlist.

---

## Features

### 1. Smart Menu Injection
- Uses MutationObserver to detect when the navigation menu (`navlist`) loads
- Appends a new "Movies in common" menu item
- **Only appears on profile pages** - excludes:
  - Home page
  - Movie pages (`/film/*`)
  - Journal pages (`/journal/*`)
  - Members page (`/members`)
  - Activity page (`/activity`)
- **Only on other users' profiles** - compares URL username with logged-in user's avatar alt text

### 2. Automatic Movie Scraping
When clicked, the extension will:
- Scrape the viewed profile's `/username/films` and `/username/watchlist` pages
- Scrape your own profile's films and watchlist
- Automatically paginate through all pages (clicking "Next" until complete)
- Extract `data-film-slug` from all `div.poster` elements
- Store movies with their status (watched/watchlisted) and ratings

### 3. Overlay UI (React Component in Shadow DOM)
- **Isolated styling** using Shadow DOM to prevent CSS conflicts
- **Tailwind CSS** for modern, Letterboxd-matching dark theme design
- **Two-column table layout**:
  - Left column: Other user's avatar + name, their common movies
  - Right column: Your avatar + name, your common movies
- **For each movie**: Poster thumbnail, title (linked to Letterboxd), star rating (if available), watched/watchlist icon

### 4. Comparison Logic
- Finds intersection of both users' movie lists
- Groups by: movies both watched, movies both in watchlist, or mixed (one watched, one watchlisted)
- Displays all common movies together with status icons

---

## Files to be Created

| File | Purpose |
|------|---------|
| `content.js` | Main content script with MutationObserver, URL logic, scraping functions, and overlay injection |
| `MoviesInCommonOverlay.tsx` | React component for the overlay UI with table and movie cards |
| `overlay-styles.css` | Tailwind-based scoped CSS for Shadow DOM |
| `manifest.json` | Extension manifest (V3) - structure provided, you'll complete setup |

---

## Visual Design
- **Dark theme** matching Letterboxd's aesthetic
- **Orange accents** for interactive elements
- **Movie posters** displayed in grid within table columns
- **Clean icons** for watched (eye) and watchlist (bookmark)
- **Star ratings** using Letterboxd's half-star system

