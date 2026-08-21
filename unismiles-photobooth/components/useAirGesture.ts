import { useRef, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
export type GestureType = 'none' | 'pinch' | 'open_hand';

export interface CursorState { x: number; y: number; }

export interface AirGestureState {
  cursorPos: CursorState | null;
  gesture: GestureType;
  holdProgress: number;
  holdFired: boolean;
  isPinching: boolean;
  isScrolling: boolean;
}

export interface AirGestureCallbacks {
  onHoldClick?: (element: Element) => void;
  onOpenHandHold?: (durationMs: number, element: Element | null) => void;
}

interface CalibrationBox {
  minX: number; maxX: number; minY: number; maxY: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SMOOTHING         = 0.65;  // cursor EMA when hand open (0=raw, 1=frozen)

const PINCH_ENTER_RATIO = 0.22;  // gap < 22% handSize  → pinch starts
const PINCH_EXIT_RATIO  = 0.32;  // gap > 32% handSize  → pinch ends (hysteresis)

// --- Click vs Scroll discrimination ---
// Scroll mode ONLY activates when BOTH conditions are met:
//   1. Pinch has been held for at least DRAG_MIN_HOLD_MS
//   2. Hand has moved more than DRAG_THRESHOLD_PX from pinch-start
// This prevents natural hand tremor during a click from accidentally starting scroll.
const DRAG_THRESHOLD_PX = 55;    // px of movement required to enter scroll mode
const DRAG_MIN_HOLD_MS  = 350;   // ms pinch must be held before scroll can activate

// Max pinch duration to still fire a click
const CLICK_MAX_MS      = 2500;

// Min time between two clicks (prevent double-fire)
const CLICK_DEBOUNCE_MS = 500;

// Scroll amplification
const SCROLL_SPEED      = 3.2;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const dist2D = (a: any, b: any) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const mapRange = (v: number, lo: number, hi: number): number => {
  const c = (v - lo) / (hi - lo);
  return Math.max(0, Math.min(1, (c - 0.5) * 1.3 + 0.5));
};

const findClickable = (el: Element | null): HTMLElement | null => {
  if (!el) return null;
  const found = el.closest('button, a, [role="button"], .clickable, input, label, select');
  return found instanceof HTMLElement ? found
       : el instanceof HTMLElement    ? el
       : null;
};

const findScrollable = (el: Element | null): Element | null => {
  if (!el || el === document.body) return null;
  const s = window.getComputedStyle(el);
  if (
    (['auto', 'scroll'].includes(s.overflowY) || ['auto', 'scroll'].includes(s.overflow)) &&
    el.scrollHeight > el.clientHeight
  ) return el;
  return findScrollable(el.parentElement);
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAirGesture(
  enabled: boolean,
  calibrationBox: CalibrationBox,
  callbacks: AirGestureCallbacks = {}
) {
  const enabledRef   = useRef(enabled);
  const calibBoxRef  = useRef(calibrationBox);
  const callbacksRef = useRef(callbacks);
  enabledRef.current   = enabled;
  calibBoxRef.current  = calibrationBox;
  callbacksRef.current = callbacks;

  // ── Smoothed cursor for display (NOT updated during pinch) ───────────────
  const smoothedPos   = useRef<{ x: number; y: number } | null>(null);

  // ── Raw/fast tracker – updated every frame including during pinch ─────────
  // This is intentionally NOT heavily smoothed so drag deltas are responsive
  const rawPos        = useRef<{ x: number; y: number } | null>(null);
  const prevRawPos    = useRef<{ x: number; y: number } | null>(null);

  // ── Pinch state ───────────────────────────────────────────────────────────
  const pinchingRef   = useRef(false);
  const isDragging    = useRef(false);         // have we committed to drag mode?
  const pinchStartMs  = useRef(0);
  const pinchStartRaw = useRef<{ x: number; y: number } | null>(null); // raw pos at pinch start
  const frozenCursor  = useRef<{ x: number; y: number } | null>(null); // display freeze pos
  const clickTarget   = useRef<HTMLElement | null>(null);
  const scrollTarget  = useRef<Element | null>(null);
  const lastClickMs   = useRef(0);

  // ── Open-hand (CAPTURE trigger) ──────────────────────────────────────────
  const holdStartRef  = useRef<number | null>(null);

  const [state, setState] = useState<AirGestureState>({
    cursorPos: null, gesture: 'none', holdProgress: 0,
    holdFired: false, isPinching: false, isScrolling: false,
  });

  const processLandmarks = useCallback((landmarks: any[]) => {
    if (!enabledRef.current) {
      smoothedPos.current = null;
      rawPos.current      = null;
      setState(s => ({ ...s, cursorPos: null, gesture: 'none' }));
      return;
    }
    const box = calibBoxRef.current;

    // ── Landmarks ──────────────────────────────────────────────────────────
    const wrist     = landmarks[0];
    const thumbTip  = landmarks[4];
    const indexTip  = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip   = landmarks[16];
    const pinkyTip  = landmarks[20];
    const middleMcp = landmarks[9];

    // ── Gesture classification ────────────────────────────────────────────
    const handSize = dist2D(wrist, middleMcp);
    const pinchGap = dist2D(thumbTip, indexTip);

    const isPinchNow = pinchingRef.current
      ? pinchGap < handSize * PINCH_EXIT_RATIO
      : pinchGap < handSize * PINCH_ENTER_RATIO;

    const fingerUp = (tip: any, mcp: any) => tip.y < mcp.y - handSize * 0.05;
    const isOpenHand =
      !isPinchNow &&
      fingerUp(indexTip,  landmarks[5]) &&
      fingerUp(middleTip, landmarks[9]) &&
      fingerUp(ringTip,   landmarks[13]) &&
      fingerUp(pinkyTip,  landmarks[17]);

    const gesture: GestureType = isPinchNow ? 'pinch' : isOpenHand ? 'open_hand' : 'none';

    // ── Raw position (lightly smoothed, always updated) ──────────────────
    // Used for drag delta – must update every frame for accurate scrolling
    const rawX    = 1 - indexTip.x;
    const rawY    = indexTip.y;
    const targetX = mapRange(rawX, box.minX, box.maxX) * window.innerWidth;
    const targetY = mapRange(rawY, box.minY, box.maxY) * window.innerHeight;

    prevRawPos.current = rawPos.current ? { ...rawPos.current } : null;
    const RAW_SMOOTH = 0.40; // light smoothing on raw tracker
    rawPos.current = rawPos.current
      ? { x: rawPos.current.x * RAW_SMOOTH + targetX * (1 - RAW_SMOOTH),
          y: rawPos.current.y * RAW_SMOOTH + targetY * (1 - RAW_SMOOTH) }
      : { x: targetX, y: targetY };

    // ── Smooth display cursor (only updated when NOT pinching) ───────────
    if (!isPinchNow) {
      smoothedPos.current = smoothedPos.current
        ? { x: smoothedPos.current.x * SMOOTHING + targetX * (1 - SMOOTHING),
            y: smoothedPos.current.y * SMOOTHING + targetY * (1 - SMOOTHING) }
        : { x: targetX, y: targetY };
    }

    // ── Pinch state machine ──────────────────────────────────────────────
    let holdFired = false;

    if (isPinchNow && !pinchingRef.current) {
      // ─── PINCH START ────────────────────────────────────────────────────
      pinchingRef.current  = true;
      isDragging.current   = false;
      pinchStartMs.current = Date.now();

      // Freeze display cursor at current smooth position
      frozenCursor.current  = smoothedPos.current ? { ...smoothedPos.current } : null;

      // Record raw position at pinch start (for drag detection)
      pinchStartRaw.current = rawPos.current ? { ...rawPos.current } : null;

      // Record targets from frozen cursor position
      if (frozenCursor.current) {
        const el = document.elementFromPoint(frozenCursor.current.x, frozenCursor.current.y);
        clickTarget.current  = findClickable(el);
        scrollTarget.current = findScrollable(el);
      }

    } else if (isPinchNow && pinchingRef.current) {
      // ─── STILL PINCHING ─────────────────────────────────────────────────

      // Check if user has dragged enough to commit to scroll.
      // Requires BOTH: enough time held AND enough distance moved.
      // This prevents natural tremor during a click from triggering scroll.
      if (!isDragging.current && rawPos.current && pinchStartRaw.current) {
        const heldMs    = Date.now() - pinchStartMs.current;
        const totalDrag = Math.sqrt(
          (rawPos.current.x - pinchStartRaw.current.x) ** 2 +
          (rawPos.current.y - pinchStartRaw.current.y) ** 2
        );
        if (heldMs >= DRAG_MIN_HOLD_MS && totalDrag > DRAG_THRESHOLD_PX) {
          isDragging.current = true;
        }
      }

      // If dragging: apply scroll based on raw frame-to-frame delta
      if (isDragging.current && rawPos.current && prevRawPos.current) {
        const dx = prevRawPos.current.x - rawPos.current.x;
        const dy = prevRawPos.current.y - rawPos.current.y;
        if (scrollTarget.current) {
          scrollTarget.current.scrollBy(dx * SCROLL_SPEED, dy * SCROLL_SPEED);
        } else {
          window.scrollBy(dx * SCROLL_SPEED, dy * SCROLL_SPEED);
        }
      }

    } else if (!isPinchNow && pinchingRef.current) {
      // ─── PINCH RELEASE ──────────────────────────────────────────────────
      pinchingRef.current = false;
      const wasDragging   = isDragging.current;
      isDragging.current  = false;

      if (!wasDragging) {
        // Short pinch, no drag → fire click
        const now = Date.now();
        const dur = now - pinchStartMs.current;
        if (dur < CLICK_MAX_MS && (now - lastClickMs.current) > CLICK_DEBOUNCE_MS) {
          const el = clickTarget.current;
          if (el) {
            el.click();
            lastClickMs.current = now;
            holdFired = true;
          }
        }
      }
      // If was dragging → no click, scroll already applied

      // Unfreeze display cursor
      frozenCursor.current  = null;
      pinchStartRaw.current = null;
      clickTarget.current   = null;
      scrollTarget.current  = null;
    }

    // ── Open-hand hold (CAPTURE start trigger) ───────────────────────────
    const displayPos = frozenCursor.current ?? smoothedPos.current;
    if (isOpenHand && displayPos) {
      if (!holdStartRef.current) {
        holdStartRef.current = Date.now();
      } else {
        const elapsed = Date.now() - holdStartRef.current;
        callbacksRef.current.onOpenHandHold?.(
          elapsed,
          document.elementFromPoint(displayPos.x, displayPos.y)
        );
      }
    } else if (!isOpenHand) {
      holdStartRef.current = null;
    }

    // ── Commit state ─────────────────────────────────────────────────────
    const cursorPos = frozenCursor.current ?? smoothedPos.current ?? null;
    setState({
      cursorPos,
      gesture,
      holdProgress: 0,
      holdFired,
      isPinching: isPinchNow,
      isScrolling: isPinchNow && isDragging.current,
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processNoHand = useCallback(() => {
    smoothedPos.current   = null;
    rawPos.current        = null;
    prevRawPos.current    = null;
    holdStartRef.current  = null;
    frozenCursor.current  = null;
    pinchStartRaw.current = null;
    if (pinchingRef.current) {
      pinchingRef.current  = false;
      isDragging.current   = false;
      clickTarget.current  = null;
      scrollTarget.current = null;
    }
    setState({
      cursorPos: null, gesture: 'none', holdProgress: 0,
      holdFired: false, isPinching: false, isScrolling: false,
    });
  }, []);

  return { state, processLandmarks, processNoHand };
}
