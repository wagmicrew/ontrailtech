import { useState, useCallback, useEffect, useRef } from 'react';

// --- Types ---

export type JourneyPhase =
  | 'landing'
  | 'onboarding'
  | 'friendpass_purchase'
  | 'confirmation'
  | 'identity'
  | 'referral'
  | 'hook'
  | 'dashboard';

export interface JourneyState {
  phase: JourneyPhase;
  runnerUsername: string;
  userId: string | null;
  friendPassId: string | null;
  referrerUsername: string | null;
  claimedUsername: string | null;
  completedPhases: JourneyPhase[];
  softCommitted: boolean;
}

export interface JourneyOrchestrator {
  currentPhase: JourneyPhase;
  advance(): void;
  skipTo(phase: JourneyPhase): void;
  canAdvance(): boolean;
  getState(): JourneyState;
  setState: React.Dispatch<React.SetStateAction<JourneyState>>;
}

// --- Constants ---

export const PHASE_ORDER: JourneyPhase[] = [
  'landing',
  'onboarding',
  'friendpass_purchase',
  'confirmation',
  'identity',
  'referral',
  'hook',
  'dashboard',
];

/** Phases that require userId to be set (post-onboarding auth gate). */
export const AUTH_GATED_PHASES: Set<JourneyPhase> = new Set([
  'friendpass_purchase',
  'confirmation',
  'identity',
  'referral',
  'hook',
  'dashboard',
]);

/** Phases that can be skipped via skipTo. */
export const SKIPPABLE_PHASES: Set<JourneyPhase> = new Set(['identity']);

/**
 * Prerequisites map: phase → list of phases that must be in completedPhases.
 * Each phase requires all prior phases in the order to be completed,
 * except skippable phases which are not required by later phases.
 */
export function getPrerequisites(phase: JourneyPhase): JourneyPhase[] {
  const idx = PHASE_ORDER.indexOf(phase);
  if (idx <= 0) return [];
  // All prior phases except skippable ones are prerequisites
  return PHASE_ORDER.slice(0, idx).filter((p) => !SKIPPABLE_PHASES.has(p));
}

export const STORAGE_KEY = 'ontrail_journey_state';

export function createInitialState(runnerUsername: string): JourneyState {
  return {
    phase: 'landing',
    runnerUsername,
    userId: null,
    friendPassId: null,
    referrerUsername: null,
    claimedUsername: null,
    completedPhases: [],
    softCommitted: false,
  };
}

// --- Persistence helpers ---

export function saveState(state: JourneyState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (SSR, private browsing quota)
  }
}

export function loadState(): JourneyState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Basic shape validation
    if (parsed && typeof parsed.phase === 'string' && Array.isArray(parsed.completedPhases)) {
      return parsed as JourneyState;
    }
    return null;
  } catch {
    return null;
  }
}

// --- Pure logic helpers (exported for testing) ---

export function canAdvanceFrom(state: JourneyState): boolean {
  const idx = PHASE_ORDER.indexOf(state.phase);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return false;

  const nextPhase = PHASE_ORDER[idx + 1];

  // Auth gate: post-onboarding phases require userId
  if (AUTH_GATED_PHASES.has(nextPhase) && !state.userId) return false;

  // The current phase is implicitly completed when advancing
  const effectiveCompleted = new Set(state.completedPhases);
  effectiveCompleted.add(state.phase);

  // Check prerequisites for the next phase
  const prereqs = getPrerequisites(nextPhase);
  return prereqs.every((p) => effectiveCompleted.has(p));
}

export function advanceState(state: JourneyState): JourneyState {
  if (!canAdvanceFrom(state)) return state;

  const idx = PHASE_ORDER.indexOf(state.phase);
  const nextPhase = PHASE_ORDER[idx + 1];

  return {
    ...state,
    phase: nextPhase,
    completedPhases: state.completedPhases.includes(state.phase)
      ? state.completedPhases
      : [...state.completedPhases, state.phase],
  };
}

export function canSkipTo(state: JourneyState, target: JourneyPhase): boolean {
  const currentIdx = PHASE_ORDER.indexOf(state.phase);
  const targetIdx = PHASE_ORDER.indexOf(target);

  // Can only skip forward
  if (targetIdx <= currentIdx) return false;

  // Auth gate
  if (AUTH_GATED_PHASES.has(target) && !state.userId) return false;

  // Check prerequisites for the target phase
  // We need to figure out which phases would be "completed" if we skip.
  // The current phase gets completed, plus any skippable phases in between.
  const wouldComplete = new Set(state.completedPhases);
  wouldComplete.add(state.phase);
  // Mark skippable phases between current and target as implicitly skipped
  for (let i = currentIdx + 1; i < targetIdx; i++) {
    if (SKIPPABLE_PHASES.has(PHASE_ORDER[i])) {
      // Skippable phases don't need to be completed
      continue;
    }
    // Non-skippable phases in between must already be completed
    if (!wouldComplete.has(PHASE_ORDER[i])) return false;
  }

  const prereqs = getPrerequisites(target);
  return prereqs.every((p) => wouldComplete.has(p));
}

export function skipToState(state: JourneyState, target: JourneyPhase): JourneyState {
  if (!canSkipTo(state, target)) return state;

  const completed = new Set(state.completedPhases);
  completed.add(state.phase);

  return {
    ...state,
    phase: target,
    completedPhases: Array.from(completed),
  };
}

// --- React Hook ---

export function useJourney(runnerUsername: string): JourneyOrchestrator {
  const [state, setState] = useState<JourneyState>(() => {
    const persisted = loadState();
    if (persisted && persisted.runnerUsername === runnerUsername) {
      return persisted;
    }
    return createInitialState(runnerUsername);
  });

  // Persist on every state change
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    saveState(state);
  }, [state]);

  const advance = useCallback(() => {
    setState((prev) => advanceState(prev));
  }, []);

  const skipTo = useCallback((phase: JourneyPhase) => {
    setState((prev) => skipToState(prev, phase));
  }, []);

  const canAdvance = useCallback(() => {
    return canAdvanceFrom(state);
  }, [state]);

  const getState = useCallback(() => {
    return state;
  }, [state]);

  return {
    currentPhase: state.phase,
    advance,
    skipTo,
    canAdvance,
    getState,
    setState,
  };
}
