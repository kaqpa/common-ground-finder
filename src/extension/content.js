/**
 * Letterboxd Movies in Common - Content Script
 * Injects "Movies in common" menu item on user profile pages
 */

(function () {
  'use strict';

  // ========== CONFIGURATION ==========
  const EXCLUDED_PATHS = [
    /^\/$/,                    // Home page
    /^\/film\/.*/,             // Movie pages
    /^\/journal(\/.*)?$/,      // Journal pages
    /^\/members$/,             // Members page
    /^\/activity$/,            // Activity page
    /^\/settings(\/.*)?$/,     // Settings pages
    /^\/pro$/,                 // Pro page
    /^\/patron$/,              // Patron page
    /^\/search\/.*/,           // Search pages
    /^\/list\/.*/,             // List pages
    /^\/lists\/.*/,            // Lists pages
  ];

  // ========== UTILITY FUNCTIONS ==========

  /**
   * Get the logged-in user's username from the avatar
   */
  function getLoggedInUsername() {
    const avatar = document.querySelector('.avatar.-a24');
    if (avatar) {
      const alt = avatar.getAttribute('alt');
      if (alt) return alt.toLowerCase();
    }
    // Fallback: check the profile menu link
    const profileLink = document.querySelector('a[href^="/"][data-person]');
    if (profileLink) {
      const href = profileLink.getAttribute('href');
      return href.replace(/^\//, '').replace(/\/$/, '').toLowerCase();
    }
    return null;
  }

  /**
   * Get the profile username from the current URL
   */
  function getProfileUsername() {
    const path = window.location.pathname;
    const match = path.match(/^\/([a-zA-Z0-9_]+)(\/.*)?$/);
    if (match) {
      return match[1].toLowerCase();
    }
    return null;
  }

  /**
   * Check if current page is a profile page (not excluded)
   */
  function isValidProfilePage() {
    const path = window.location.pathname;
    
    // Check against excluded paths
    for (const pattern of EXCLUDED_PATHS) {
      if (pattern.test(path)) {
        console.log("excluded path");
        return false;
      }
    }
    
/*    // Must have a username in the path
    const profileUsername = getProfileUsername();
    console.log("no profile user name");
    if (!profileUsername) return false;
    
    // Must not be the logged-in user's page
    const loggedInUsername = getLoggedInUsername();
    console.log("logged in user name");
    if (!loggedInUsername) return false;   */
    
    return profileUsername !== loggedInUsername;
  }

  // ========== SCRAPING FUNCTIONS ==========

  /**
   * Movie data structure
   * @typedef {Object} Movie
   * @property {string} slug - Film slug from data-film-slug
   * @property {string} title - Film title
   * @property {string} poster - Poster image URL
   * @property {number|null} rating - User's rating (0-10, half stars = 0.5 increments)
   * @property {'watched'|'watchlist'} status - Whether watched or in watchlist
   */

  /**
   * Extract rating from a poster element
   */
  function extractRating(posterEl) {
    const ratingEl = posterEl.closest('.poster-container, .film-poster')?.querySelector('.rating');
    if (!ratingEl) return null;
    
    const ratingClass = Array.from(ratingEl.classList).find(c => c.startsWith('rated-'));
    if (ratingClass) {
      const ratingValue = parseInt(ratingClass.replace('rated-', ''), 10);
      return ratingValue / 2; // Convert to 5-star scale
    }
    return null;
  }

  /**
   * Extract poster image URL
   */
  function extractPosterUrl(posterEl) {
    const img = posterEl.querySelector('img');
    if (img) {
      return img.src || img.dataset.src || '';
    }
    // Check for background image
    const div = posterEl.querySelector('div[style*="background"]');
    if (div) {
      const match = div.style.backgroundImage?.match(/url\(['"]?(.+?)['"]?\)/);
      if (match) return match[1];
    }
    return '';
  }

  /**
   * Scrape movies from current page
   */
  function scrapeCurrentPage() {
    const movies = [];
    const posters = document.querySelectorAll('div.poster, li.poster-container div[data-film-slug]');
    
    posters.forEach(poster => {
      const slug = poster.dataset.filmSlug;
      if (!slug) return;
      
      const filmLink = poster.querySelector('a') || poster.closest('li')?.querySelector('a');
      const title = filmLink?.getAttribute('data-film-name') || 
                   poster.querySelector('img')?.alt || 
                   slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      
      movies.push({
        slug,
        title,
        poster: extractPosterUrl(poster),
        rating: extractRating(poster),
      });
    });
    
    return movies;
  }

  /**
   * Check if there's a next page and return its URL
   */
  function getNextPageUrl() {
    const nextLink = document.querySelector('.pagination .paginate-next:not(.disabled) a, .paginate-nextprev a.next');
    return nextLink?.href || null;
  }

  /**
   * Fetch and parse a page, returning movie data
   */
  async function fetchPageMovies(url) {
    try {
      const response = await fetch(url);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const movies = [];
      const posters = doc.querySelectorAll('div.poster, li.poster-container div[data-film-slug]');
      
      posters.forEach(poster => {
        const slug = poster.dataset.filmSlug;
        if (!slug) return;
        
        const filmLink = poster.querySelector('a') || poster.closest('li')?.querySelector('a');
        const title = filmLink?.getAttribute('data-film-name') || 
                     poster.querySelector('img')?.alt || 
                     slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        
        // Extract poster URL
        let posterUrl = '';
        const img = poster.querySelector('img');
        if (img) {
          posterUrl = img.src || img.dataset.src || '';
        }
        
        // Extract rating
        let rating = null;
        const ratingEl = poster.closest('.poster-container, .film-poster')?.querySelector('.rating');
        if (ratingEl) {
          const ratingClass = Array.from(ratingEl.classList).find(c => c.startsWith('rated-'));
          if (ratingClass) {
            rating = parseInt(ratingClass.replace('rated-', ''), 10) / 2;
          }
        }
        
        movies.push({ slug, title, poster: posterUrl, rating });
      });
      
      // Get next page URL from fetched document
      const nextLink = doc.querySelector('.pagination .paginate-next:not(.disabled) a, .paginate-nextprev a.next');
      const nextUrl = nextLink?.href || null;
      
      return { movies, nextUrl };
    } catch (error) {
      console.error('Error fetching page:', url, error);
      return { movies: [], nextUrl: null };
    }
  }

  /**
   * Scrape all movies from a user's films or watchlist (with pagination)
   */
  async function scrapeAllPages(baseUrl, status) {
    const allMovies = [];
    let currentUrl = baseUrl;
    let pageCount = 0;
    const maxPages = 100; // Safety limit
    
    while (currentUrl && pageCount < maxPages) {
      const { movies, nextUrl } = await fetchPageMovies(currentUrl);
      
      movies.forEach(movie => {
        allMovies.push({ ...movie, status });
      });
      
      currentUrl = nextUrl;
      pageCount++;
      
      // Small delay to be respectful to the server
      if (currentUrl) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    return allMovies;
  }

  /**
   * Get user info (avatar and display name)
   */
  async function getUserInfo(username) {
    try {
      const response = await fetch(`https://letterboxd.com/${username}/`);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const displayName = doc.querySelector('.profile-name h1, .person-summary h1')?.textContent?.trim() || username;
      const avatar = doc.querySelector('.profile-avatar img, .person-summary img')?.src || '';
      
      return { username, displayName, avatar };
    } catch (error) {
      console.error('Error fetching user info:', username, error);
      return { username, displayName: username, avatar: '' };
    }
  }

  /**
   * Scrape all movies for a user
   */
  async function scrapeUserMovies(username, onProgress) {
    const baseUrl = `https://letterboxd.com/${username}`;
    
    onProgress?.(`Scraping ${username}'s watched films...`);
    const watchedMovies = await scrapeAllPages(`${baseUrl}/films/`, 'watched');
    
    onProgress?.(`Scraping ${username}'s watchlist...`);
    const watchlistMovies = await scrapeAllPages(`${baseUrl}/watchlist/`, 'watchlist');
    
    // Merge, preferring watched status if movie appears in both
    const movieMap = new Map();
    
    watchlistMovies.forEach(movie => {
      movieMap.set(movie.slug, movie);
    });
    
    watchedMovies.forEach(movie => {
      movieMap.set(movie.slug, movie); // Watched overwrites watchlist
    });
    
    return Array.from(movieMap.values());
  }

  /**
   * Find common movies between two users
   */
  function findCommonMovies(userAMovies, userBMovies) {
    const userAMap = new Map(userAMovies.map(m => [m.slug, m]));
    const userBMap = new Map(userBMovies.map(m => [m.slug, m]));
    
    const commonSlugs = [...userAMap.keys()].filter(slug => userBMap.has(slug));
    
    return commonSlugs.map(slug => ({
      slug,
      userA: userAMap.get(slug),
      userB: userBMap.get(slug),
    }));
  }

  // ========== UI INJECTION ==========

  /**
   * Create and inject the overlay
   */
  function createOverlay() {
    // Create shadow host
    const host = document.createElement('div');
    host.id = 'movies-in-common-overlay-host';
    document.body.appendChild(host);
    
    // Attach shadow DOM
    const shadow = host.attachShadow({ mode: 'open' });
    
    // Inject styles
    const style = document.createElement('style');
    style.textContent = getOverlayStyles();
    shadow.appendChild(style);
    
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.className = 'mic-overlay';
    overlay.innerHTML = `
      <div class="mic-backdrop"></div>
      <div class="mic-modal">
        <div class="mic-header">
          <h2>Movies in Common</h2>
          <button class="mic-close" aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="mic-loading">
          <div class="mic-spinner"></div>
          <p class="mic-loading-text">Loading...</p>
        </div>
        <div class="mic-content" style="display: none;"></div>
      </div>
    `;
    shadow.appendChild(overlay);
    
    // Close button handler
    overlay.querySelector('.mic-close').addEventListener('click', () => {
      host.remove();
    });
    
    // Backdrop click handler
    overlay.querySelector('.mic-backdrop').addEventListener('click', () => {
      host.remove();
    });
    
    return {
      host,
      shadow,
      overlay,
      setLoading: (text) => {
        overlay.querySelector('.mic-loading-text').textContent = text;
      },
      showContent: (html) => {
        overlay.querySelector('.mic-loading').style.display = 'none';
        overlay.querySelector('.mic-content').style.display = 'block';
        overlay.querySelector('.mic-content').innerHTML = html;
      },
      close: () => host.remove(),
    };
  }

  /**
   * Generate HTML for movie card
   */
  function movieCardHtml(movie) {
    const posterUrl = movie.poster || 'https://letterboxd.com/static/img/empty-poster-230.c6baa486.png';
    const statusIcon = movie.status === 'watched' 
      ? `<svg class="mic-status-icon mic-watched" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`
      : `<svg class="mic-status-icon mic-watchlist" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`;
    
    const ratingHtml = movie.rating 
      ? `<span class="mic-rating">${'★'.repeat(Math.floor(movie.rating))}${movie.rating % 1 ? '½' : ''}</span>`
      : '';
    
    return `
      <div class="mic-movie-card">
        <a href="https://letterboxd.com/film/${movie.slug}/" target="_blank" class="mic-poster-link">
          <img src="${posterUrl}" alt="${movie.title}" class="mic-poster" loading="lazy" />
        </a>
        <div class="mic-movie-info">
          <a href="https://letterboxd.com/film/${movie.slug}/" target="_blank" class="mic-movie-title">${movie.title}</a>
          <div class="mic-movie-meta">
            ${statusIcon}
            ${ratingHtml}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate the content HTML for the overlay
   */
  function generateContentHtml(userA, userB, commonMovies) {
    const userAAvatar = userA.avatar || 'https://letterboxd.com/static/img/avatar70.1b45ce0c.png';
    const userBAvatar = userB.avatar || 'https://letterboxd.com/static/img/avatar70.1b45ce0c.png';
    
    if (commonMovies.length === 0) {
      return `
        <div class="mic-empty">
          <p>No movies in common found between ${userA.displayName} and ${userB.displayName}.</p>
        </div>
      `;
    }
    
    const userAMoviesHtml = commonMovies.map(cm => movieCardHtml(cm.userA)).join('');
    const userBMoviesHtml = commonMovies.map(cm => movieCardHtml(cm.userB)).join('');
    
    return `
      <div class="mic-stats">
        <span class="mic-count">${commonMovies.length} movies in common</span>
      </div>
      <div class="mic-table">
        <div class="mic-column">
          <div class="mic-column-header">
            <img src="${userAAvatar}" alt="${userA.displayName}" class="mic-avatar" />
            <span class="mic-username">${userA.displayName}</span>
          </div>
          <div class="mic-movies-grid">
            ${userAMoviesHtml}
          </div>
        </div>
        <div class="mic-column">
          <div class="mic-column-header">
            <img src="${userBAvatar}" alt="${userB.displayName}" class="mic-avatar" />
            <span class="mic-username">${userB.displayName}</span>
          </div>
          <div class="mic-movies-grid">
            ${userBMoviesHtml}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Main handler when "Movies in common" is clicked
   */
  async function handleMoviesInCommonClick() {
    const profileUsername = getProfileUsername();
    const loggedInUsername = getLoggedInUsername();
    
    if (!profileUsername || !loggedInUsername) {
      alert('Could not determine usernames. Please make sure you are logged in.');
      return;
    }
    
    const ui = createOverlay();
    
    try {
      // Get user info
      ui.setLoading('Fetching user profiles...');
      const [userAInfo, userBInfo] = await Promise.all([
        getUserInfo(profileUsername),
        getUserInfo(loggedInUsername),
      ]);
      
      // Scrape movies
      ui.setLoading(`Scraping ${userAInfo.displayName}'s movies...`);
      const userAMovies = await scrapeUserMovies(profileUsername, ui.setLoading);
      
      ui.setLoading(`Scraping ${userBInfo.displayName}'s movies...`);
      const userBMovies = await scrapeUserMovies(loggedInUsername, ui.setLoading);
      
      // Find common movies
      ui.setLoading('Finding common movies...');
      const commonMovies = findCommonMovies(userAMovies, userBMovies);
      
      // Show results
      const contentHtml = generateContentHtml(userAInfo, userBInfo, commonMovies);
      ui.showContent(contentHtml);
      
    } catch (error) {
      console.error('Error:', error);
      ui.showContent(`
        <div class="mic-error">
          <p>An error occurred while fetching movies.</p>
          <p>${error.message}</p>
        </div>
      `);
    }
  }

  /**
   * Inject the "Movies in common" menu item
   */
  function injectMenuItem() {
    // Check if already injected
    if (document.querySelector('#movies-in-common-menu-item')) return;
    
    // Check if this is a valid profile page
    if (!isValidProfilePage()) return;
    
    // Find the navigation list
    const navList = document.querySelector('.navlist, nav.nav-profile ul');
    if (!navList) return;
    
    // Create the menu item
    const menuItem = document.createElement('li');
    menuItem.id = 'movies-in-common-menu-item';
    menuItem.innerHTML = `<a href="#" class="navlink">Movies in common</a>`;
    
    // Add click handler
    menuItem.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      handleMoviesInCommonClick();
    });
    
    // Append to nav list
    navList.appendChild(menuItem);
  }

  // ========== INITIALIZATION ==========

  /**
   * Initialize the content script
   */
  function init() {
    // Try to inject immediately
    injectMenuItem();
    
    // Also observe for dynamic content
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          injectMenuItem();
        }
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    
    // Also handle navigation (for SPAs)
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        // Remove old menu item if present
        document.querySelector('#movies-in-common-menu-item')?.remove();
        // Try to inject again
        injectMenuItem();
      }
    }).observe(document, { subtree: true, childList: true });
  }

  // ========== SCOPED STYLES ==========

  function getOverlayStyles() {
    return `
      /* Reset */
      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      /* Overlay */
      .mic-overlay {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .mic-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(4px);
      }

      /* Modal */
      .mic-modal {
        position: relative;
        width: 90%;
        max-width: 1200px;
        max-height: 85vh;
        background: #14181c;
        border-radius: 8px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .mic-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #2c3440;
        background: #1c2228;
      }

      .mic-header h2 {
        color: #fff;
        font-size: 18px;
        font-weight: 600;
      }

      .mic-close {
        background: none;
        border: none;
        color: #9ab;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: all 0.2s;
      }

      .mic-close:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
      }

      /* Loading */
      .mic-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        gap: 16px;
      }

      .mic-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #2c3440;
        border-top-color: #00e054;
        border-radius: 50%;
        animation: mic-spin 0.8s linear infinite;
      }

      @keyframes mic-spin {
        to { transform: rotate(360deg); }
      }

      .mic-loading-text {
        color: #9ab;
        font-size: 14px;
      }

      /* Content */
      .mic-content {
        overflow-y: auto;
        padding: 20px;
        flex: 1;
      }

      .mic-stats {
        margin-bottom: 20px;
        text-align: center;
      }

      .mic-count {
        display: inline-block;
        background: #00e054;
        color: #14181c;
        font-weight: 600;
        font-size: 14px;
        padding: 6px 16px;
        border-radius: 20px;
      }

      /* Table layout */
      .mic-table {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
      }

      @media (max-width: 768px) {
        .mic-table {
          grid-template-columns: 1fr;
        }
      }

      .mic-column {
        background: #1c2228;
        border-radius: 8px;
        overflow: hidden;
      }

      .mic-column-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        border-bottom: 1px solid #2c3440;
        background: #242c34;
      }

      .mic-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
      }

      .mic-username {
        color: #fff;
        font-weight: 600;
        font-size: 16px;
      }

      /* Movies grid */
      .mic-movies-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        gap: 12px;
        padding: 16px;
        max-height: 400px;
        overflow-y: auto;
      }

      .mic-movie-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .mic-poster-link {
        display: block;
        border-radius: 4px;
        overflow: hidden;
        transition: transform 0.2s, box-shadow 0.2s;
      }

      .mic-poster-link:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
      }

      .mic-poster {
        width: 100%;
        aspect-ratio: 2/3;
        object-fit: cover;
        display: block;
        background: #2c3440;
      }

      .mic-movie-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .mic-movie-title {
        color: #9ab;
        font-size: 11px;
        text-decoration: none;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .mic-movie-title:hover {
        color: #00e054;
      }

      .mic-movie-meta {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .mic-status-icon {
        width: 14px;
        height: 14px;
      }

      .mic-watched {
        color: #00e054;
      }

      .mic-watchlist {
        color: #40bcf4;
      }

      .mic-rating {
        color: #00e054;
        font-size: 11px;
        letter-spacing: -1px;
      }

      /* Empty & Error states */
      .mic-empty,
      .mic-error {
        text-align: center;
        padding: 40px 20px;
        color: #9ab;
      }

      .mic-error {
        color: #ff8080;
      }

      /* Scrollbar styling */
      .mic-movies-grid::-webkit-scrollbar,
      .mic-content::-webkit-scrollbar {
        width: 8px;
      }

      .mic-movies-grid::-webkit-scrollbar-track,
      .mic-content::-webkit-scrollbar-track {
        background: #14181c;
      }

      .mic-movies-grid::-webkit-scrollbar-thumb,
      .mic-content::-webkit-scrollbar-thumb {
        background: #2c3440;
        border-radius: 4px;
      }

      .mic-movies-grid::-webkit-scrollbar-thumb:hover,
      .mic-content::-webkit-scrollbar-thumb:hover {
        background: #3c4a54;
      }
    `;
  }

  // Start the script
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
