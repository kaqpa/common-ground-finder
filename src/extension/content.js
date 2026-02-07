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
    // Strategy 1: Header navigation person link
    const personLink = document.querySelector('header a[href^="/"][data-person]');
    if (personLink) {
      const href = personLink.getAttribute('href');
      const username = href.replace(/^\//, '').replace(/\/$/, '').split('/')[0];
      console.log('[MIC] Found username via header person link:', username);
      return username.toLowerCase();
    }
    
    // Strategy 2: Account menu avatar with alt text
    const avatarWithAlt = document.querySelector('.avatar[alt], header .avatar[alt]');
    if (avatarWithAlt) {
      const alt = avatarWithAlt.getAttribute('alt');
      if (alt) {
        console.log('[MIC] Found username via avatar alt:', alt);
        return alt.toLowerCase();
      }
    }
    
    // Strategy 3: Account dropdown link
    const accountLink = document.querySelector('#header .account a[href^="/"], #header a.avatar[href^="/"]');
    if (accountLink) {
      const href = accountLink.getAttribute('href');
      const username = href.replace(/^\//, '').replace(/\/$/, '').split('/')[0];
      console.log('[MIC] Found username via account link:', username);
      return username.toLowerCase();
    }
    
    // Strategy 4: Look for navigation item with "Your" in text and extract from sibling links
    const navItems = document.querySelectorAll('nav a[href^="/"]');
    for (const item of navItems) {
      const href = item.getAttribute('href');
      if (href && href.match(/^\/[a-z0-9_-]+\/?$/i)) {
        const potentialUsername = href.replace(/^\//, '').replace(/\/$/, '');
        // Exclude known non-user paths
        const excludedPaths = ['film', 'films', 'lists', 'members', 'activity', 'journal', 'search', 'settings', 'pro', 'patron', 'about', 'contact', 'help'];
        if (!excludedPaths.includes(potentialUsername.toLowerCase())) {
          console.log('[MIC] Found potential username via nav:', potentialUsername);
          return potentialUsername.toLowerCase();
        }
      }
    }
    
    // Strategy 5: Legacy avatar class
    const legacyAvatar = document.querySelector('.avatar.-a24, .avatar.-a40');
    if (legacyAvatar) {
      const alt = legacyAvatar.getAttribute('alt');
      if (alt) {
        console.log('[MIC] Found username via legacy avatar:', alt);
        return alt.toLowerCase();
      }
    }
    
    console.log('[MIC] Could not detect logged-in username');
    return null;
  }

  /**
   * Get the profile username from the current URL
   */
  function getProfileUsername() {
    const path = window.location.pathname;
    const segments = path.split('/').filter(Boolean); // results in ["profile page"]
    
    if (segments.length > 0) {
        const username = segments[0].toLowerCase();
        console.log("Username extracted via split:", username);
        return username;
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
    
    // Must have a username in the path
    const profileUsername = getProfileUsername();
    console.log("no profile user name");
  //  if (!profileUsername) return false;
    
    // Must not be the logged-in user's page
    const loggedInUsername = getLoggedInUsername();
    console.log("logged in user name");
 //   if (!loggedInUsername) return false;   
    
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
   * Updated to target modern React-based DOM structure with LazyPoster components
   */
  async function fetchPageMovies(url) {
    try {
      const response = await fetch(url);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const movies = [];
      
      // Strategy 1: Modern React structure - LazyPoster components
      // Target elements with class 'react-component' and data-component-class='LazyPoster'
      const lazyPosters = doc.querySelectorAll('[data-component-class="LazyPoster"], .react-component[data-component-class="LazyPoster"]');
      
      if (lazyPosters.length > 0) {
        console.log(`[MIC] Found ${lazyPosters.length} LazyPoster elements on ${url}`);
        
        lazyPosters.forEach(poster => {
          // Extract movie slug from data-item-link attribute
          const itemLink = poster.getAttribute('data-item-link');
          if (!itemLink) return;
          
          // Clean the slug: remove /film/ prefix and trailing slashes
          const slug = itemLink.replace(/^\/film\//, '').replace(/\/$/, '');
          if (!slug) return;
          
          // Try to get title from various sources
          const img = poster.querySelector('img');
          const title = img?.alt || 
                       poster.getAttribute('data-film-name') ||
                       slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          
          // Extract poster URL
          let posterUrl = '';
          if (img) {
            posterUrl = img.src || img.dataset.src || '';
          }
          
          // Extract rating if available
          let rating = null;
          const container = poster.closest('li, .poster-container, .film-poster');
          const ratingEl = container?.querySelector('.rating, [class*="rating"]');
          if (ratingEl) {
            const ratingClass = Array.from(ratingEl.classList).find(c => c.startsWith('rated-'));
            if (ratingClass) {
              rating = parseInt(ratingClass.replace('rated-', ''), 10) / 2;
            }
          }
          
          movies.push({ slug, title, poster: posterUrl, rating });
        });
      }
      
      // Strategy 2: Fallback to legacy structure if no LazyPoster elements found
      if (movies.length === 0) {
        console.log(`[MIC] No LazyPoster elements found, trying legacy selectors on ${url}`);
        
        // Try data-film-slug attribute (older structure)
        const legacyPosters = doc.querySelectorAll('div.poster[data-film-slug], li.poster-container div[data-film-slug], [data-film-slug]');
        
        legacyPosters.forEach(poster => {
          const slug = poster.dataset.filmSlug || poster.getAttribute('data-film-slug');
          if (!slug) return;
          
          const filmLink = poster.querySelector('a') || poster.closest('li')?.querySelector('a');
          const title = filmLink?.getAttribute('data-film-name') || 
                       poster.querySelector('img')?.alt || 
                       slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          
          let posterUrl = '';
          const img = poster.querySelector('img');
          if (img) {
            posterUrl = img.src || img.dataset.src || '';
          }
          
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
        
        console.log(`[MIC] Legacy selectors found ${movies.length} movies on ${url}`);
      }
      
      // Get next page URL from fetched document
      const nextLink = doc.querySelector('.pagination .paginate-next:not(.disabled) a, .paginate-nextprev a.next, a.next');
      const nextUrl = nextLink?.href || null;
      
      console.log(`[MIC] Page ${url}: Found ${movies.length} movies, next page: ${nextUrl || 'none'}`);
      
      return { movies, nextUrl };
    } catch (error) {
      console.error('[MIC] Error fetching page:', url, error);
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
   * Create and inject the content overlay (replaces main content area only)
   */
  function createOverlay() {
    // Find the main content area
    const mainContent = document.querySelector('section.col-main, .col-main, #content .col-main');
    if (!mainContent) {
      console.error('[MIC] Could not find main content area');
      return null;
    }
    
    // Store original content
    const originalContent = mainContent.innerHTML;
    const originalOverflow = mainContent.style.overflow;
    
    // Create overlay container
    const overlayContainer = document.createElement('div');
    overlayContainer.id = 'movies-in-common-content';
    overlayContainer.innerHTML = `
      <style>${getOverlayStyles()}</style>
      <div class="mic-panel">
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
    
    // Replace main content with overlay
    mainContent.innerHTML = '';
    mainContent.style.overflow = 'visible';
    mainContent.appendChild(overlayContainer);
    
    // Close function to restore original content
    const close = () => {
      mainContent.innerHTML = originalContent;
      mainContent.style.overflow = originalOverflow;
    };
    
    // Close button handler
    overlayContainer.querySelector('.mic-close').addEventListener('click', close);
    
    return {
      container: overlayContainer,
      setLoading: (text) => {
        overlayContainer.querySelector('.mic-loading-text').textContent = text;
      },
      showContent: (html) => {
        overlayContainer.querySelector('.mic-loading').style.display = 'none';
        overlayContainer.querySelector('.mic-content').style.display = 'block';
        overlayContainer.querySelector('.mic-content').innerHTML = html;
      },
      close,
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
    if (!ui) {
      alert('Could not find main content area to display results.');
      return;
    }
    
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
      
      // Debug: Log all movies for profile user
      console.log(`[MIC] Movies found for ${profileUsername}:`, userAMovies);
      console.log(`[MIC] Total movies for ${profileUsername}: ${userAMovies.length}`);
      
      ui.setLoading(`Scraping ${userBInfo.displayName}'s movies...`);
      const userBMovies = await scrapeUserMovies(loggedInUsername, ui.setLoading);
      
      // Debug: Log all movies for logged-in user
      console.log(`[MIC] Movies found for ${loggedInUsername}:`, userBMovies);
      console.log(`[MIC] Total movies for ${loggedInUsername}: ${userBMovies.length}`);
      
      // Find common movies
      ui.setLoading('Finding common movies...');
      const commonMovies = findCommonMovies(userAMovies, userBMovies);
      
      // Debug: Log common movies
      console.log('[MIC] Common movies found:', commonMovies);
      console.log(`[MIC] Total common movies: ${commonMovies.length}`);
      
      // Show results
      const contentHtml = generateContentHtml(userAInfo, userBInfo, commonMovies);
      ui.showContent(contentHtml);
      
    } catch (error) {
      console.error('[MIC] Error:', error);
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
    
    // Create the menu item - match exact structure of other nav items
    const menuItem = document.createElement('li');
    menuItem.id = 'movies-in-common-menu-item';
    
    // Create the anchor to match other nav items exactly
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = 'Movies in common';
    
    // Copy classes from existing nav links to match styling
    const existingNavLink = navList.querySelector('li a');
    if (existingNavLink) {
      link.className = existingNavLink.className;
    }
    
    menuItem.appendChild(link);
    // Add click handler
    menuItem.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      handleMoviesInCommonClick();
    });
    
    // Find the "Network" menu item and insert after it
    const navItems = navList.querySelectorAll('li');
    let networkItem = null;
    
    for (const item of navItems) {
      const link = item.querySelector('a');
      if (link && link.textContent.trim().toLowerCase() === 'network') {
        networkItem = item;
        break;
      }
    }
    
    if (networkItem && networkItem.nextSibling) {
      // Insert after Network
      navList.insertBefore(menuItem, networkItem.nextSibling);
    } else if (networkItem) {
      // Network is the last item, append after it
      navList.appendChild(menuItem);
    } else if (navItems.length >= 10) {
      // Fallback: insert at position 11 (index 10)
      navList.insertBefore(menuItem, navItems[10] || null);
    } else {
      // Final fallback: append to end
      navList.appendChild(menuItem);
    }
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

      /* Panel (replaces main content) */
      .mic-panel {
        background: #14181c;
        min-height: 400px;
        display: flex;
        flex-direction: column;
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
