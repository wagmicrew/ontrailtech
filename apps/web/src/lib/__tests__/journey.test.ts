import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PHASE_ORDER,
  AUTH_GATED_PHASES,
  SKIPPABLE_PHASES,
  getPrerequisites,
  createInitialState,
  canAdvanceFrom,
  advanceState,
  canSkipTo,
  skipToState,
  saveState,
  loadState,
  STORAGE_KEY,
  JourneyState,
} from '../journey';

// --- localStorage mock ---
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((_i: number) => null),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

function makeState(overrides: Partial<JourneyState> = {}): JourneyState {
  return { ...createInitialState('hansen'), ...overrides };
}

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

// ─── Phase order ───────────────────────────────────────────────
describe('PHASE_ORDER', () => {
  /** Validates: Requirements 10.1 */
  it('defines the correct 8-phase order', () => {
    expect(PHASE_ORDER).toEqual([
      'landing',
      'onboarding',
      'friendpass_purchase',
      'confirmation',
      'identity',
      'referral',
      'hook',
      'dashboard',
    ]);
  });
});

// ─── Prerequisites ─────────────────────────────────────────────
describe('getPrerequisites', () => {
  /** Validates: Requirements 10.2 */
  it('landing has no prerequisites', () => {
    expect(getPrerequisites('landing')).toEqual([]);
  });

  it('onboarding requires landing', () => {
    expect(getPrerequisites('onboarding')).toEqual(['landing']);
  });

  it('friendpass_purchase requires landing + onboarding', () => {
    expect(getPrerequisites('friendpass_purchase')).toEqual(['landing', 'onboarding']);
  });

  it('referral does not require identity (skippable)', () => {
    const prereqs = getPrerequisites('referral');
    expect(prereqs).not.toContain('identity');
    expect(prereqs).toContain('confirmation');
  });

  it('dashboard requires all non-skippable phases', () => {
    const prereqs = getPrerequisites('dashboard');
    expect(prereqs).toContain('hook');
    expect(prereqs).not.toContain('identity');
  });
});

// ─── Auth gating ───────────────────────────────────────────────
describe('AUTH_GATED_PHASES', () => {
  /** Validates: Requirements 10.3 */
  it('gates all post-onboarding phases', () => {
    expect(AUTH_GATED_PHASES.has('friendpass_purchase')).toBe(true);
    expect(AUTH_GATED_PHASES.has('confirmation')).toBe(true);
    expect(AUTH_GATED_PHASES.has('identity')).toBe(true);
    expect(AUTH_GATED_PHASES.has('referral')).toBe(true);
    expect(AUTH_GATED_PHASES.has('hook')).toBe(true);
    expect(AUTH_GATED_PHASES.has('dashboard')).toBe(true);
  });

  it('does not gate landing or onboarding', () => {
    expect(AUTH_GATED_PHASES.has('landing')).toBe(false);
    expect(AUTH_GATED_PHASES.has('onboarding')).toBe(false);
  });
});

// ─── Skippable phases ──────────────────────────────────────────
describe('SKIPPABLE_PHASES', () => {
  /** Validates: Requirements 10.6 */
  it('identity is skippable', () => {
    expect(SKIPPABLE_PHASES.has('identity')).toBe(true);
  });

  it('other phases are not skippable', () => {
    PHASE_ORDER.filter((p) => p !== 'identity').forEach((p) => {
      expect(SKIPPABLE_PHASES.has(p)).toBe(false);
    });
  });
});

// ─── canAdvanceFrom ────────────────────────────────────────────
describe('canAdvanceFrom', () => {
  /** Validates: Requirements 10.1, 10.2, 10.3 */
  it('can advance from landing to onboarding', () => {
    const state = makeState({ phase: 'landing' });
    expect(canAdvanceFrom(state)).toBe(true);
  });

  it('can advance from onboarding to friendpass_purchase when authenticated', () => {
    const state = makeState({
      phase: 'onboarding',
      userId: 'user-1',
      completedPhases: ['landing'],
    });
    expect(canAdvanceFrom(state)).toBe(true);
  });

  it('cannot advance from onboarding without userId (auth gate)', () => {
    const state = makeState({
      phase: 'onboarding',
      userId: null,
      completedPhases: ['landing'],
    });
    expect(canAdvanceFrom(state)).toBe(false);
  });

  it('cannot advance from dashboard (last phase)', () => {
    const state = makeState({
      phase: 'dashboard',
      userId: 'user-1',
      completedPhases: ['landing', 'onboarding', 'friendpass_purchase', 'confirmation', 'referral', 'hook'],
    });
    expect(canAdvanceFrom(state)).toBe(false);
  });

  it('cannot advance when prerequisites are missing', () => {
    // Try to advance from confirmation without having completed onboarding
    const state = makeState({
      phase: 'confirmation',
      userId: 'user-1',
      completedPhases: ['landing'],
    });
    expect(canAdvanceFrom(state)).toBe(false);
  });
});

// ─── advanceState ──────────────────────────────────────────────
describe('advanceState', () => {
  /** Validates: Requirements 10.1, 10.2 */
  it('moves to next phase and marks current as completed', () => {
    const state = makeState({ phase: 'landing' });
    const next = advanceState(state);
    expect(next.phase).toBe('onboarding');
    expect(next.completedPhases).toContain('landing');
  });

  it('returns same state if cannot advance', () => {
    const state = makeState({ phase: 'onboarding', userId: null, completedPhases: ['landing'] });
    const next = advanceState(state);
    expect(next).toBe(state);
  });

  it('does not duplicate completed phases', () => {
    const state = makeState({
      phase: 'landing',
      completedPhases: ['landing'],
    });
    const next = advanceState(state);
    expect(next.completedPhases.filter((p) => p === 'landing')).toHaveLength(1);
  });

  it('progresses through full authenticated flow', () => {
    let state = makeState({ phase: 'landing' });
    // landing → onboarding
    state = advanceState(state);
    expect(state.phase).toBe('onboarding');

    // Simulate auth
    state = { ...state, userId: 'user-1' };

    // onboarding → friendpass_purchase
    state = advanceState(state);
    expect(state.phase).toBe('friendpass_purchase');

    // friendpass_purchase → confirmation
    state = advanceState(state);
    expect(state.phase).toBe('confirmation');

    // confirmation → identity
    state = advanceState(state);
    expect(state.phase).toBe('identity');

    // identity → referral
    state = advanceState(state);
    expect(state.phase).toBe('referral');

    // referral → hook
    state = advanceState(state);
    expect(state.phase).toBe('hook');

    // hook → dashboard
    state = advanceState(state);
    expect(state.phase).toBe('dashboard');
  });
});

// ─── skipTo ────────────────────────────────────────────────────
describe('canSkipTo / skipToState', () => {
  /** Validates: Requirements 10.6 */
  it('can skip identity phase (go from confirmation to referral)', () => {
    const state = makeState({
      phase: 'confirmation',
      userId: 'user-1',
      completedPhases: ['landing', 'onboarding', 'friendpass_purchase'],
    });
    expect(canSkipTo(state, 'referral')).toBe(true);

    const next = skipToState(state, 'referral');
    expect(next.phase).toBe('referral');
    expect(next.completedPhases).toContain('confirmation');
  });

  it('cannot skip backward', () => {
    const state = makeState({
      phase: 'referral',
      userId: 'user-1',
      completedPhases: ['landing', 'onboarding', 'friendpass_purchase', 'confirmation'],
    });
    expect(canSkipTo(state, 'landing')).toBe(false);
  });

  it('cannot skip to same phase', () => {
    const state = makeState({
      phase: 'identity',
      userId: 'user-1',
      completedPhases: ['landing', 'onboarding', 'friendpass_purchase', 'confirmation'],
    });
    expect(canSkipTo(state, 'identity')).toBe(false);
  });

  it('cannot skip to auth-gated phase without userId', () => {
    const state = makeState({
      phase: 'onboarding',
      userId: null,
      completedPhases: ['landing'],
    });
    expect(canSkipTo(state, 'friendpass_purchase')).toBe(false);
  });

  it('cannot skip over non-skippable incomplete phases', () => {
    // Try to skip from landing directly to confirmation (missing onboarding, friendpass_purchase)
    const state = makeState({
      phase: 'landing',
      userId: 'user-1',
    });
    expect(canSkipTo(state, 'confirmation')).toBe(false);
  });

  it('returns same state if skip is not allowed', () => {
    const state = makeState({ phase: 'landing' });
    const result = skipToState(state, 'dashboard');
    expect(result).toBe(state);
  });
});

// ─── softCommitted flag ────────────────────────────────────────
describe('softCommitted flag', () => {
  /** Validates: Requirements 2.2, 2.3 */
  it('starts as false', () => {
    const state = createInitialState('hansen');
    expect(state.softCommitted).toBe(false);
  });

  it('persists through save/load round-trip', () => {
    const state = makeState({ softCommitted: true });
    saveState(state);
    const loaded = loadState();
    expect(loaded?.softCommitted).toBe(true);
  });
});

// ─── Persistence ───────────────────────────────────────────────
describe('persistence (saveState / loadState)', () => {
  /** Validates: Requirements 10.4, 10.5 */
  it('saves state to localStorage', () => {
    const state = makeState({ phase: 'onboarding', completedPhases: ['landing'] });
    saveState(state);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(state),
    );
  });

  it('loads state from localStorage', () => {
    const state = makeState({
      phase: 'confirmation',
      userId: 'user-1',
      completedPhases: ['landing', 'onboarding', 'friendpass_purchase'],
    });
    store[STORAGE_KEY] = JSON.stringify(state);
    const loaded = loadState();
    expect(loaded).toEqual(state);
  });

  it('returns null when localStorage is empty', () => {
    expect(loadState()).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    store[STORAGE_KEY] = 'not-json';
    expect(loadState()).toBeNull();
  });

  it('returns null for invalid shape (missing phase)', () => {
    store[STORAGE_KEY] = JSON.stringify({ foo: 'bar' });
    expect(loadState()).toBeNull();
  });

  it('round-trips full state correctly', () => {
    const state = makeState({
      phase: 'referral',
      userId: 'user-42',
      friendPassId: 'fp-1',
      referrerUsername: 'alice',
      claimedUsername: 'bob',
      completedPhases: ['landing', 'onboarding', 'friendpass_purchase', 'confirmation', 'identity'],
      softCommitted: true,
    });
    saveState(state);
    const loaded = loadState();
    expect(loaded).toEqual(state);
  });
});
