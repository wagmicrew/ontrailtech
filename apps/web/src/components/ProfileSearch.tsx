import React, { useState, useCallback, useRef } from 'react';
import { api } from '../lib/api';

interface ProfileResult {
  id: string;
  username: string;
  avatar_url: string | null;
  reputation_score: number;
  runner_token: boolean;
}

interface ProfileSearchProps {
  onSelect?: (username: string) => void;
  placeholder?: string;
  className?: string;
}

export default function ProfileSearch({ 
  onSelect, 
  placeholder = "Search runners...",
  className = ""
}: ProfileSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchProfiles = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const data = await api.searchProfiles(searchQuery, 10);
      setResults(data);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setShowResults(true);

    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchProfiles(value);
    }, 300);
  };

  const handleSelect = (username: string) => {
    setQuery('');
    setResults([]);
    setShowResults(false);
    onSelect?.(username);
  };

  const handleBlur = () => {
    // Delay to allow click on results
    setTimeout(() => setShowResults(false), 200);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setShowResults(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full px-4 py-2 pl-10 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <svg
          className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {loading && (
          <div className="absolute right-3 top-2.5">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {results.map((profile) => (
            <button
              key={profile.id}
              onClick={() => handleSelect(profile.username)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-700 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold overflow-hidden">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  profile.username[0].toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white truncate">
                    @{profile.username}
                  </span>
                  {profile.runner_token && (
                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                      Token
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-400">
                  Rep: {Math.round(profile.reputation_score)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showResults && query && !loading && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg px-4 py-3 text-gray-400">
          No runners found
        </div>
      )}
    </div>
  );
}
