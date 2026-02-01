/**
 * React Component for Movies in Common Overlay
 * This is a reference implementation - the actual content script uses vanilla JS
 * You can use this if you want to build/bundle the extension with React
 */

import React from 'react';

// Types
interface Movie {
  slug: string;
  title: string;
  poster: string;
  rating: number | null;
  status: 'watched' | 'watchlist';
}

interface UserInfo {
  username: string;
  displayName: string;
  avatar: string;
}

interface CommonMovie {
  slug: string;
  userA: Movie;
  userB: Movie;
}

interface MoviesInCommonOverlayProps {
  userA: UserInfo;
  userB: UserInfo;
  commonMovies: CommonMovie[];
  isLoading?: boolean;
  loadingText?: string;
  onClose: () => void;
}

// Icons
const EyeIcon = () => (
  <svg className="w-3.5 h-3.5 text-[#00e054]" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
  </svg>
);

const BookmarkIcon = () => (
  <svg className="w-3.5 h-3.5 text-[#40bcf4]" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// Movie Card Component
const MovieCard: React.FC<{ movie: Movie }> = ({ movie }) => {
  const posterUrl = movie.poster || 'https://letterboxd.com/static/img/empty-poster-230.c6baa486.png';
  
  const renderRating = () => {
    if (!movie.rating) return null;
    const fullStars = Math.floor(movie.rating);
    const hasHalf = movie.rating % 1 !== 0;
    return (
      <span className="text-[#00e054] text-[11px] tracking-tighter">
        {'★'.repeat(fullStars)}{hasHalf && '½'}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <a
        href={`https://letterboxd.com/film/${movie.slug}/`}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
      >
        <img
          src={posterUrl}
          alt={movie.title}
          className="w-full aspect-[2/3] object-cover bg-[#2c3440]"
          loading="lazy"
        />
      </a>
      <div className="flex flex-col gap-1">
        <a
          href={`https://letterboxd.com/film/${movie.slug}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#9ab] text-[11px] leading-tight line-clamp-2 hover:text-[#00e054] no-underline"
        >
          {movie.title}
        </a>
        <div className="flex items-center gap-1.5">
          {movie.status === 'watched' ? <EyeIcon /> : <BookmarkIcon />}
          {renderRating()}
        </div>
      </div>
    </div>
  );
};

// User Column Component
const UserColumn: React.FC<{ user: UserInfo; movies: Movie[] }> = ({ user, movies }) => {
  const avatarUrl = user.avatar || 'https://letterboxd.com/static/img/avatar70.1b45ce0c.png';

  return (
    <div className="bg-[#1c2228] rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-[#2c3440] bg-[#242c34]">
        <img
          src={avatarUrl}
          alt={user.displayName}
          className="w-10 h-10 rounded-full object-cover"
        />
        <span className="text-white font-semibold text-base">{user.displayName}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3 p-4 max-h-[400px] overflow-y-auto">
        {movies.map((movie) => (
          <MovieCard key={movie.slug} movie={movie} />
        ))}
      </div>
    </div>
  );
};

// Loading Spinner
const LoadingSpinner: React.FC<{ text?: string }> = ({ text = 'Loading...' }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-4">
    <div className="w-10 h-10 border-[3px] border-[#2c3440] border-t-[#00e054] rounded-full animate-spin" />
    <p className="text-[#9ab] text-sm">{text}</p>
  </div>
);

// Main Overlay Component
export const MoviesInCommonOverlay: React.FC<MoviesInCommonOverlayProps> = ({
  userA,
  userB,
  commonMovies,
  isLoading = false,
  loadingText = 'Loading...',
  onClose,
}) => {
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center font-sans"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-[90%] max-w-[1200px] max-h-[85vh] bg-[#14181c] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2c3440] bg-[#1c2228]">
          <h2 className="text-white text-lg font-semibold">Movies in Common</h2>
          <button
            onClick={onClose}
            className="text-[#9ab] hover:text-white hover:bg-white/10 p-1 rounded transition-all"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <LoadingSpinner text={loadingText} />
        ) : (
          <div className="overflow-y-auto p-5 flex-1">
            {commonMovies.length === 0 ? (
              <div className="text-center py-10 text-[#9ab]">
                <p>No movies in common found between {userA.displayName} and {userB.displayName}.</p>
              </div>
            ) : (
              <>
                <div className="text-center mb-5">
                  <span className="inline-block bg-[#00e054] text-[#14181c] font-semibold text-sm px-4 py-1.5 rounded-full">
                    {commonMovies.length} movies in common
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <UserColumn
                    user={userA}
                    movies={commonMovies.map((cm) => cm.userA)}
                  />
                  <UserColumn
                    user={userB}
                    movies={commonMovies.map((cm) => cm.userB)}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MoviesInCommonOverlay;
