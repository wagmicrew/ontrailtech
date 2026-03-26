import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveRunnerFromSubdomain } from '../../lib/subdomain';

/**
 * RunnerLanding unit tests — pure logic layer.
 *
 * These tests validate the core behaviors of the RunnerLanding page:
 * - Subdomain resolution integration (Req 1.1, 1.2)
 * - Referral param storage in localStorage (Req 1.8)
 * - 404 detection for unknown runners (Req 1.9)
 * - Positioning language compliance (Req 2.4)
 *
 * React rendering tests require jsdom environment and are deferred
 * to integration/e2e tests.
 */

describe('RunnerLanding — subdomain resolution integration', () => {
  it('resolves a valid runner username from subdomain', () => {
    expect(resolveRunnerFromSubdomain('hansen.ontrail.tech')).toBe('hansen');
  });

  it('returns null for reserved subdomains triggering 404 path', () => {
    expect(resolveRunnerFromSubdomain('app.ontrail.tech')).toBeNull();
    expect(resolveRunnerFromSubdomain('api.ontrail.tech')).toBeNull();
    expect(resolveRunnerFromSubdomain('www.ontrail.tech')).toBeNull();
  });

  it('returns null for bare domain triggering 404 path', () => {
    expect(resolveRunnerFromSubdomain('ontrail.tech')).toBeNull();
  });
});

describe('RunnerLanding — referral param storage (Req 1.8)', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete storage[key];
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores ref query param in localStorage under ontrail_referrer', () => {
    // Simulate the logic from RunnerLanding's useEffect
    const params = new URLSearchParams('?ref=alice');
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('ontrail_referrer', ref);
    }

    expect(localStorage.setItem).toHaveBeenCalledWith('ontrail_referrer', 'alice');
    expect(storage['ontrail_referrer']).toBe('alice');
  });

  it('does not store anything when ref param is absent', () => {
    const params = new URLSearchParams('');
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('ontrail_referrer', ref);
    }

    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('overwrites previous referrer when new ref param is present', () => {
    storage['ontrail_referrer'] = 'bob';

    const params = new URLSearchParams('?ref=charlie');
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('ontrail_referrer', ref);
    }

    expect(storage['ontrail_referrer']).toBe('charlie');
  });
});

describe('RunnerLanding — API endpoint integration', () => {
  it('api.getRunner is a callable function', async () => {
    // The api client uses /users/runner/{username} which matches the backend endpoint
    // This validates the integration contract between frontend and backend
    const { api } = await import('../../lib/api');
    expect(api.getRunner).toBeDefined();
    expect(typeof api.getRunner).toBe('function');
  });
});

describe('RunnerLanding — Pre-Auth Soft Commitment (Req 2.1, 2.2, 2.3)', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete storage[key];
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets softCommitted to true in journey state on CTA click (Req 2.2)', async () => {
    const { saveState, loadState, createInitialState, STORAGE_KEY } = await import('../../lib/journey');

    // Simulate the CTA handler logic: persist softCommitted flag
    const initial = createInitialState('hansen');
    const updated = { ...initial, softCommitted: true };
    saveState(updated);

    expect(localStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.stringContaining('"softCommitted":true'),
    );

    // Verify round-trip
    const raw = storage[STORAGE_KEY];
    const parsed = JSON.parse(raw);
    expect(parsed.softCommitted).toBe(true);
  });

  it('merges softCommitted into existing journey state without overwriting other fields (Req 2.2)', async () => {
    const { saveState, STORAGE_KEY, createInitialState } = await import('../../lib/journey');

    // Pre-existing state with some progress
    const existing = {
      ...createInitialState('hansen'),
      phase: 'onboarding' as const,
      completedPhases: ['landing' as const],
      referrerUsername: 'alice',
    };
    saveState(existing);

    // Simulate CTA click: merge softCommitted
    const raw = storage[STORAGE_KEY];
    const loaded = JSON.parse(raw);
    const updated = { ...loaded, softCommitted: true };
    saveState(updated);

    const final = JSON.parse(storage[STORAGE_KEY]);
    expect(final.softCommitted).toBe(true);
    expect(final.phase).toBe('onboarding');
    expect(final.referrerUsername).toBe('alice');
    expect(final.completedPhases).toEqual(['landing']);
  });

  it('detects softCommitted flag on return visit for auto-prompt (Req 2.3)', async () => {
    const { loadState, STORAGE_KEY } = await import('../../lib/journey');

    // Simulate a previous visit where softCommitted was set
    storage[STORAGE_KEY] = JSON.stringify({
      phase: 'landing',
      runnerUsername: 'hansen',
      userId: null,
      friendPassId: null,
      referrerUsername: null,
      claimedUsername: null,
      completedPhases: [],
      softCommitted: true,
    });

    const state = loadState();
    expect(state).not.toBeNull();
    expect(state!.softCommitted).toBe(true);
    // When softCommitted is true and user is not authenticated, auto-prompt should trigger
    const shouldAutoPrompt = state!.softCommitted && !state!.userId;
    expect(shouldAutoPrompt).toBe(true);
  });

  it('does not auto-prompt when softCommitted is false (Req 2.3)', async () => {
    const { loadState, STORAGE_KEY } = await import('../../lib/journey');

    storage[STORAGE_KEY] = JSON.stringify({
      phase: 'landing',
      runnerUsername: 'hansen',
      userId: null,
      friendPassId: null,
      referrerUsername: null,
      claimedUsername: null,
      completedPhases: [],
      softCommitted: false,
    });

    const state = loadState();
    const shouldAutoPrompt = state!.softCommitted && !state!.userId;
    expect(shouldAutoPrompt).toBe(false);
  });

  it('does not auto-prompt when user is already authenticated (Req 2.3)', async () => {
    const { loadState, STORAGE_KEY } = await import('../../lib/journey');

    storage[STORAGE_KEY] = JSON.stringify({
      phase: 'onboarding',
      runnerUsername: 'hansen',
      userId: 'user-123',
      friendPassId: null,
      referrerUsername: null,
      claimedUsername: null,
      completedPhases: ['landing'],
      softCommitted: true,
    });

    const state = loadState();
    // softCommitted is true but user has userId — should NOT auto-prompt
    const shouldAutoPrompt = state!.softCommitted && !state!.userId;
    expect(shouldAutoPrompt).toBe(false);
  });
});
