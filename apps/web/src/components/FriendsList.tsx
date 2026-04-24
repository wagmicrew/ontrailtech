import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface Friend {
  id: string;
  username: string;
  avatar_url: string | null;
  reputation_score: number;
}

interface FriendSuggestion extends Friend {
  mutual_friends: number;
  reason: string;
}

interface FriendsListProps {
  userId?: string;
  className?: string;
}

export default function FriendsList({ userId, className = "" }: FriendsListProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'friends' | 'suggestions'>('friends');

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load friends
      const friendsData = userId 
        ? await api.getUserFriends(userId)
        : await api.getMyFriends();
      setFriends(friendsData);

      // Load suggestions (only for own profile)
      if (!userId) {
        const suggestionsData = await api.getFriendSuggestions(10);
        setSuggestions(suggestionsData);
      }
    } catch (error) {
      console.error('Failed to load friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'similar_activity':
        return 'Similar activity';
      case 'mutual_friends':
        return 'Mutual friends';
      case 'nearby':
        return 'Nearby';
      default:
        return 'Suggested';
    }
  };

  const navigateToProfile = (username: string) => {
    window.location.href = `https://${username}.ontrail.tech`;
  };

  if (loading) {
    return (
      <div className={`bg-gray-800 rounded-xl p-6 ${className}`}>
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-2 border-gray-600 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-800 rounded-xl p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          {userId ? 'Friends' : 'Your Network'}
        </h3>
        {!userId && (
          <div className="flex bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('friends')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                activeTab === 'friends'
                  ? 'bg-emerald-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Friends ({friends.length})
            </button>
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                activeTab === 'suggestions'
                  ? 'bg-emerald-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Suggestions
            </button>
          </div>
        )}
      </div>

      {activeTab === 'friends' && (
        <>
          {friends.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No friends yet</p>
              <p className="text-sm mt-1">Connect with other runners!</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  onClick={() => navigateToProfile(friend.username)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold overflow-hidden flex-shrink-0">
                    {friend.avatar_url ? (
                      <img
                        src={friend.avatar_url}
                        alt={friend.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      friend.username[0].toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">
                      @{friend.username}
                    </p>
                    <p className="text-sm text-gray-400">
                      Rep: {Math.round(friend.reputation_score)}
                    </p>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-500 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'suggestions' && !userId && (
        <>
          {suggestions.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No suggestions yet</p>
              <p className="text-sm mt-1">Keep exploring to find runners!</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  onClick={() => navigateToProfile(suggestion.username)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold overflow-hidden flex-shrink-0">
                    {suggestion.avatar_url ? (
                      <img
                        src={suggestion.avatar_url}
                        alt={suggestion.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      suggestion.username[0].toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white truncate">
                        @{suggestion.username}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400">
                        Rep: {Math.round(suggestion.reputation_score)}
                      </span>
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                        {getReasonLabel(suggestion.reason)}
                      </span>
                      {suggestion.mutual_friends > 0 && (
                        <span className="text-gray-500">
                          {suggestion.mutual_friends} mutual
                        </span>
                      )}
                    </div>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-500 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
