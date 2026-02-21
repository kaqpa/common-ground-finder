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
    // 1. Look for the image tag
    const img = posterEl.querySelector('img');
    
    if (img) {
        // Priority: srcset (high res) > data-src (lazy load) > src (fallback)
        const url = img.srcset ? img.srcset.split(' ')[0] : (img.dataset.src || img.src);
        if (url && !url.includes('empty.png')) return url;
    }

    // 2. Letterboxd specific: Check for the 'content' attribute in meta/link tags 
    // often found near the poster container for SEO
    const metaImg = posterEl.querySelector('meta[itemprop="image"]');
    if (metaImg && metaImg.content) return metaImg.content;

    // 3. Fallback for background-image
    const bgElement = posterEl.querySelector('.image') || posterEl;
    const style = window.getComputedStyle(bgElement).backgroundImage;
    if (style && style !== 'none') {
        const match = style.match(/url\(['"]?(.+?)['"]?\)/);
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
      }
      
      // Get next page URL from fetched document
      const nextLink = doc.querySelector('.pagination .paginate-next:not(.disabled) a, .paginate-nextprev a.next, a.next');
      const nextUrl = nextLink?.href || null;
      
      // Console log: page URL and movie count
      console.log(`[MIC] Page: ${url} - Found ${movies.length} movies`);
      
      return { movies, nextUrl };
    } catch (error) {
      console.error('[MIC] Error fetching page:', url, error);
      return { movies: [], nextUrl: null };
    }
  }

  /**
   * Scrape all movies from a user's films or watchlist (with pagination)
   */
  async function scrapeAllPages(baseUrl, status, onProgress) {
    const allMovies = [];
    let currentUrl = baseUrl;
    let pageCount = 0;
    const maxPages = 100; // Safety limit
    const statusLabel = status === 'watchlist' ? 'watchlist' : 'films';
    
    while (currentUrl && pageCount < maxPages) {
      pageCount++;
      
      // Update UI progress with page and total count
      onProgress?.(`Scraping ${statusLabel} page ${pageCount}... (${allMovies.length} movies found)`);
      
      const { movies, nextUrl } = await fetchPageMovies(currentUrl);
      
      movies.forEach(movie => {
        allMovies.push({ ...movie, status });
      });
      
      currentUrl = nextUrl;
      
      // Small delay to be respectful to the server
      if (currentUrl) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    // Final update
    onProgress?.(`Scraped ${pageCount} ${statusLabel} pages (${allMovies.length} movies found)`);
    
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
    
    onProgress?.(`Scraping ${username}'s films page 1...`);
    const watchedMovies = await scrapeAllPages(`${baseUrl}/films/`, 'watched', (msg) => {
      onProgress?.(`${username}: ${msg}`);
    });
    
    onProgress?.(`Scraping ${username}'s watchlist page 1...`);
    const watchlistMovies = await scrapeAllPages(`${baseUrl}/watchlist/`, 'watchlist', (msg) => {
      onProgress?.(`${username}: ${msg}`);
    });
    
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
   * Fetch poster URL from a movie page
   * Targets div.poster.film-poster on /film/movie-name/ pages
   * Excludes empty-poster images
   */
  async function fetchPosterUrl(slug) {
  try {
    const movieUrl = `https://letterboxd.com/film/${slug}/`;
    const response = await fetch(movieUrl);
    
    if (!response.ok) throw new Error('Network response was not ok');
    
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. Best Method: Check JSON-LD (Structured Data)
    const jsonLdScript = doc.querySelector('script[type="application/ld+json"]');
    if (jsonLdScript) {
      try {
        const data = JSON.parse(jsonLdScript.textContent);
        if (data.image) return data.image;
      } 
      catch (e) { console.error("JSON-LD parse error", e); }
    }

   // 2. Second Best: Open Graph Image (the social media thumbnail)
    const ogImage = doc.querySelector('meta[property="og:image"]');
    if (ogImage && ogImage.content) return ogImage.content;

    // 3. Third Best: The Actual Poster Image Tag
    const posterImg = doc.querySelector('.poster img');
    if (posterImg) {
      const url = posterImg.srcset ? posterImg.srcset.split(' ')[0] : posterImg.src;
      if (url && !url.includes('empty-poster')) return url;
    }

    return '';
  } catch (error) {
    console.error("Failed to fetch poster for:", slug, error);
    return '';
  }
}
      
    

  /**
   * Batch fetch posters for movies (with rate limiting)
   */
  async function fetchPostersForMovies(movies, onProgress) {
    const batchSize = 5;
    const delay = 200;
    
    for (let i = 0; i < movies.length; i += batchSize) {
      const batch = movies.slice(i, i + batchSize);
      onProgress?.(`Fetching posters... ${Math.min(i + batchSize, movies.length)}/${movies.length}`);
      
      await Promise.all(batch.map(async (movie) => {
        if (!movie.poster || movie.poster.includes('empty-poster')) {
          movie.poster = await fetchPosterUrl(movie.slug);
        }
      }));
      
      if (i + batchSize < movies.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Create and inject the content overlay (replaces main content area only)
   */
  function createOverlay() {
    // Find the main content area - try section.col-main first, then .cols-2
    let mainContent = document.querySelector('section.col-main, .col-main, #content .col-main');
    
    if (!mainContent) {
      // Fallback to cols-2
      mainContent = document.querySelector('.cols-2, #content .cols-2');
      console.log('[MIC] col-main not found, using cols-2 fallback');
    }
    
    if (!mainContent) {
      console.error('[MIC] Could not find main content area (tried col-main and cols-2)');
      return null;
    }
    
    // Store original content
    const originalContent = mainContent.innerHTML;
    const originalOverflow = mainContent.style.overflow;
    
    // Create overlay container (no close button - user navigates away to close)
    const overlayContainer = document.createElement('div');
    overlayContainer.id = 'movies-in-common-content';
    overlayContainer.innerHTML = `
      <style>${getOverlayStyles()}</style>
      <div class="mic-panel">
        <div class="mic-header">
          <h2>Movies in Common</h2>
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
   * Generate the content HTML for the overlay - single table with poster rows
   */
  function generateContentHtml(userA, userB, commonMovies) {
    const userAAvatar = userA.avatar || 'https://letterboxd.com/static/img/avatar70.1b45ce0c.png';
    const userBAvatar = userB.avatar || 'https://letterboxd.com/static/img/avatar70.1b45ce0c.png';
    const defaultPoster = 'https://letterboxd.com/static/img/empty-poster-230.c6baa486.png';
    
    if (commonMovies.length === 0) {
      return `
        <div class="mic-empty">
          <p>No movies in common found between ${userA.displayName} and ${userB.displayName}.</p>
        </div>
      `;
    }
    
    // Generate table rows - one row per movie with both users' data
    const rowsHtml = commonMovies.map(cm => {
      const userAPoster = cm.userA.poster || defaultPoster;
      const userBPoster = cm.userB.poster || defaultPoster;
      
      const userARating = cm.userA.rating 
        ? `<span class="mic-rating">${'★'.repeat(Math.floor(cm.userA.rating))}${cm.userA.rating % 1 ? '½' : ''}</span>`
        : '';
      const userBRating = cm.userB.rating 
        ? `<span class="mic-rating">${'★'.repeat(Math.floor(cm.userB.rating))}${cm.userB.rating % 1 ? '½' : ''}</span>`
        : '';
      
      const userAStatusIcon = cm.userA.status === 'watched' 
        ? `<svg class="mic-status-icon mic-watched" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`
        : `<svg class="mic-status-icon mic-watchlist" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`;
      
      const userBStatusIcon = cm.userB.status === 'watched' 
        ? `<svg class="mic-status-icon mic-watched" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`
        : `<svg class="mic-status-icon mic-watchlist" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`;
      
      return `
        <tr class="mic-row">
          <td class="mic-cell mic-cell-user">
            <a href="https://letterboxd.com/film/${cm.userA.slug}/" target="_blank" class="mic-poster-link">
              <img src="${userAPoster}" alt="${cm.userA.title}" class="mic-poster" loading="lazy" />
            </a>
            <div class="mic-movie-meta">
              ${userAStatusIcon}
              ${userARating}
            </div>
          </td>
          <td class="mic-cell mic-cell-title">
            <a href="https://letterboxd.com/film/${cm.userA.slug}/" target="_blank" class="mic-movie-title">${cm.userA.title}</a>
          </td>
          <td class="mic-cell mic-cell-user">
            <a href="https://letterboxd.com/film/${cm.userB.slug}/" target="_blank" class="mic-poster-link">
              <img src="${userBPoster}" alt="${cm.userB.title}" class="mic-poster" loading="lazy" />
            </a>
            <div class="mic-movie-meta">
              ${userBStatusIcon}
              ${userBRating}
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    return `
      <div class="mic-stats">
        <span class="mic-count">${commonMovies.length} movies in common</span>
      </div>
      <table class="mic-table">
        <thead>
          <tr class="mic-header-row">
            <th class="mic-th">
              <img src="${userAAvatar}" alt="${userA.displayName}" class="mic-avatar" />
              <span class="mic-username">${userA.displayName}</span>
            </th>
            <th class="mic-th mic-th-title">Movie</th>
            <th class="mic-th">
              <img src="${userBAvatar}" alt="${userB.displayName}" class="mic-avatar" />
              <span class="mic-username">${userB.displayName}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
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
      
      // Fetch posters for common movies
      if (commonMovies.length > 0) {
        const allMoviesToFetchPosters = [
          ...commonMovies.map(cm => cm.userA),
          ...commonMovies.map(cm => cm.userB)
        ];
        await fetchPostersForMovies(allMoviesToFetchPosters, ui.setLoading);
      }
      
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
   * Remove active state from all nav items
   */
  function clearNavActiveStates() {
    const navList = document.querySelector('.navlist, nav.nav-profile ul');
    if (!navList) return;
    
    // Remove 'selected' class from all nav links (this controls the green underline)
    navList.querySelectorAll('li a.navlink').forEach(link => {
      link.classList.remove('selected');
    });
    
    // Also remove -active class from navitem li elements
    navList.querySelectorAll('li.navitem').forEach(li => {
      li.classList.remove('-active');
    });
  }

  /**
   * Set active state on 'Movies in common' menu item
   */
  function setMoviesInCommonActive() {
    clearNavActiveStates();
    
    const micItem = document.querySelector('#movies-in-common-menu-item');
    const micLink = document.querySelector('#movies-in-common-menu-item a');
    if (micItem) {
      micItem.className = 'navitem js-page-network -active';
    }
    if (micLink) {
      micLink.classList.add('navlink', 'selected');
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
    
    // Don't show if user is not logged in (username is 'sign in')
    const loggedInUser = getLoggedInUsername();
    if (!loggedInUser || loggedInUser === 'sign-in') return;
    
    // Find the navigation list
    const navList = document.querySelector('.navlist, nav.nav-profile ul');
    if (!navList) return;
    
    // Create the menu item - use navitem js-page-network class
    const menuItem = document.createElement('li');
    menuItem.id = 'movies-in-common-menu-item';
    menuItem.className = 'navitem js-page-network';
    
    // Create the anchor to match other nav items exactly
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = 'Movies in common';
    link.style.display = 'block'; // Ensure vertical alignment matches other items
    link.className = 'navlink';
    
    menuItem.appendChild(link);
    // Add click handler
    menuItem.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      // Set active state on this item
      setMoviesInCommonActive();
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
        font-size: .8125rem;
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
        font-size: 1.125rem;
        font-weight: 600;
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
        font-size: .8125rem;
      }

      /* Content - no internal scroll, uses page scroll */
      .mic-content {
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
        font-size: .8125rem;
        padding: 6px 16px;
        border-radius: 20px;
      }

      /* Table layout - actual HTML table */
      .mic-table {
        width: 100%;
        border-collapse: collapse;
        background: #1c2228;
        border-radius: 8px;
        overflow: hidden;
      }

      .mic-header-row {
        background: #242c34;
      }

      .mic-th {
        padding: 12px 16px;
        text-align: left;
        border-bottom: 1px solid #2c3440;
        color: #fff;
        font-weight: 600;
        font-size: .8125rem;
      }

      .mic-th-title {
        text-align: center;
      }

      .mic-th .mic-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        object-fit: cover;
        vertical-align: middle;
        margin-right: 8px;
      }

      .mic-th .mic-username {
        vertical-align: middle;
        font-size: .8125rem;
      }

      .mic-row {
        border-bottom: 1px solid #2c3440;
      }

      .mic-row:last-child {
        border-bottom: none;
      }

      .mic-row:hover {
        background: rgba(255, 255, 255, 0.03);
      }

      .mic-cell {
        padding: 12px 16px;
        vertical-align: middle;
      }

      .mic-cell-user {
        width: 100px;
      }

      .mic-cell-title {
        text-align: center;
      }

      .mic-poster-link {
        display: inline-block;
        border-radius: 4px;
        overflow: hidden;
        transition: transform 0.2s, box-shadow 0.2s;
      }

      .mic-poster-link:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      }

      .mic-poster {
        width: 60px;
        height: 90px;
        object-fit: cover;
        display: block;
        background: #2c3440;
        border-radius: 3px;
      }

      .mic-movie-title {
        color: #fff;
        font-size: .8125rem;
        text-decoration: none;
        font-weight: 500;
      }

      .mic-movie-title:hover {
        color: #00e054;
      }

      .mic-movie-meta {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;
      }

      .mic-status-icon {
        width: 12px;
        height: 12px;
      }

      .mic-watched {
        color: #00e054;
      }

      .mic-watchlist {
        color: #40bcf4;
      }

      .mic-rating {
        color: #00e054;
        font-size: .6875rem;
        letter-spacing: -1px;
      }

      /* Empty & Error states */
      .mic-empty,
      .mic-error {
        text-align: center;
        padding: 40px 20px;
        color: #9ab;
        font-size: .8125rem;
      }

      .mic-error {
        color: #ff8080;
      }

      /* Avatar in header */
      .mic-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        object-fit: cover;
      }

      .mic-username {
        color: #fff;
        font-weight: 600;
        font-size: .8125rem;
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
