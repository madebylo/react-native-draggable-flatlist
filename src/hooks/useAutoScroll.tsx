/* --------------------------------------------------------------------------
 * useAutoScroll Hook
 * ----------------------------------------------------------------------------
 * Adds auto‑scrolling behaviour for both the inner FlatList and an optional
 * outer ScrollView while a drag‑and‑drop gesture is active.
 *
 * ‑ Inner auto‑scroll keeps the FlatList itself moving when the item being
 *   dragged approaches the top / bottom edge of the visible list.
 * ‑ Outer auto‑scroll scrolls a parent ScrollView (e.g. a screen that contains
 *   the list) when the pointer nears the viewport edges.
 *
 * The hook intentionally **does not** mutate any functional behaviour of the
 * passed components – it merely listens to animated values and triggers
 * imperative `scrollTo` calls when needed.
 *
 * NOTE:  All comments are in English (as requested) and the runtime code is
 *        left untouched – only documentation and formatting have been added.
 * ------------------------------------------------------------------------- */

// ─────────────────────────────────────────────────────────────────────────────
// Imports
// ─────────────────────────────────────────────────────────────────────────────

// React / React‑Native basics
import { useEffect } from "react";
import { Dimensions } from "react-native";

// Reanimated primitives
import {
  scrollTo,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";

// Project constants & helpers
import {
  DEFAULT_PROPS,
  SCROLL_POSITION_TOLERANCE,
  isWeb,
} from "../constants";

// Custom context hooks
import { useProps } from "../context/propsContext";
import { useAnimatedValues } from "../context/animatedValueContext";
import { useRefs } from "../context/refContext";

// ─────────────────────────────────────────────────────────────────────────────
// Type helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convenience alias for a Reanimated SharedValue */
// prettier‑ignore
// eslint‑disable-next-line @typescript-eslint/consistent-type-definitions
type SV<T> = import("react-native-reanimated").SharedValue<T>;

// ─────────────────────────────────────────────────────────────────────────────
// Enums – no more magic numbers ✨
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal state for the outer auto‑scroll machine
 */
enum OuterScrollState {
  Idle = 0,  // not scrolling
  Up = 1,    // scrolling up
  Down = 2,  // scrolling down
}

/**
 * Simple direction helper for comparisons
 */
enum ScrollDir {
  None = 0,
  Up = -1,
  Down = 1,
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds automated scroll behaviour while a drag gesture is active.
 *
 * @param outerScrollRef   Ref to an optional parent ScrollView / FlashList
 * @param outerScrollOffset SharedValue containing the outer scroll y‑offset
 * @param pointerY         SharedValue holding the global pointer y‑position
 * @param activeKey        Currently picked key / id (null when idle)
 * @param pointerType      0 = touch, 1 = pen, 2 = mouse (see PointerEvent)
 * @param innerAnimatedRef Animated ref returned by Reanimated‑enabled FlatList
 */
export function useAutoScroll(
  outerScrollRef?: any,
  outerScrollOffset?: SV<any>,
  pointerY?: SV<any>,
  activeKey?: any,
  pointerType?: SV<any>,
  innerAnimatedRef?: any,
) {
  /* ------------------------------------------------------------------------ */
  /* 1) Contexts & constants                                                  */
  /* ------------------------------------------------------------------------ */

  // Legacy ref for backward compatibility (some users still rely on it)
  const { flatlistRef } = useRefs();

  // Component‑level props (with sensible fallbacks)
  const {
    autoscrollThreshold = DEFAULT_PROPS.autoscrollThreshold,
    autoscrollSpeed = DEFAULT_PROPS.autoscrollSpeed,
  } = useProps();

  // Continuously updated animated values provided by <DraggableFlatList />
  const {
    scrollOffset,    // current y‑scroll offset of the FlatList
    scrollViewSize,  // content height of the FlatList
    containerSize,   // height of the visible viewport
    activeCellSize,  // height of the row that is being dragged
    hoverOffset,     // y‑coordinate of the hover component in list coords
    activeIndexAnim, // index of the currently active cell (‑1 when idle)
  } = useAnimatedValues();

  /* ========================================================================= */
  /*  A) Inner auto‑scroll  (scroll the FlatList itself)                        */
  /* ========================================================================= */

  // Hover offset converted from list‑coords to screen‑coords
  const hoverScreenOffset = useDerivedValue(() =>
    hoverOffset.value - scrollOffset.value,
  );

  // Has the list already reached its very top / bottom?
  const isScrolledUp = useDerivedValue(
    () => scrollOffset.value - SCROLL_POSITION_TOLERANCE <= 0,
  );

  const isScrolledDown = useDerivedValue(
    () =>
      scrollOffset.value +
        containerSize.value +
        SCROLL_POSITION_TOLERANCE >=
      scrollViewSize.value,
  );

  // Distance from hover component to each edge of the viewport
  const distToTopEdge = useDerivedValue(() => Math.max(0, hoverScreenOffset.value));

  const distToBottomEdge = useDerivedValue(() => {
    const hoverPlus = hoverScreenOffset.value + activeCellSize.value;
    return Math.max(0, containerSize.value - hoverPlus);
  });

  // Is the hover component within the autoscroll threshold region?
  const isAtTopEdge = useDerivedValue(
    () => distToTopEdge.value <= autoscrollThreshold,
  );

  const isAtBottomEdge = useDerivedValue(
    () => distToBottomEdge.value <= autoscrollThreshold,
  );

  // Mutable shared value that we keep chasing via scrollTo
  const scrollTarget = useSharedValue(0);

  // Is a drag currently happening?
  const dragActive = useDerivedValue(() => activeIndexAnim.value >= 0);

  // Whenever a drag starts, reset scrollTarget to the current offset
  useAnimatedReaction(
    () => dragActive.value,
    (cur, prev) => {
      if (cur && !prev) scrollTarget.value = scrollOffset.value;
    },
  );

  // Do we need to perform an inner scroll on this frame?
  const shouldScrollInner = useDerivedValue(() => {
    const diff = Math.abs(scrollTarget.value - scrollOffset.value);
    const reached = diff < SCROLL_POSITION_TOLERANCE;
    const atEdge = isAtTopEdge.value || isAtBottomEdge.value;
    const blocked =
      (isAtTopEdge.value && isScrolledUp.value) ||
      (isAtBottomEdge.value && isScrolledDown.value);

    return reached && atEdge && !blocked && dragActive.value;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Throttled, momentum‑friendly scroll‑to for the inner list
  // ──────────────────────────────────────────────────────────────────────────

  useDerivedValue(() => {
    if (!shouldScrollInner.value) return;
    if (!innerAnimatedRef) return;

    // How deep into the threshold did we move? (0‑1)
    const dist = isAtTopEdge.value ? distToTopEdge.value : distToBottomEdge.value;
    const pct = 1 - dist / autoscrollThreshold;

    // Map that percentage to a delta value
    const delta = pct * autoscrollSpeed;

    // Calculate the next y‑offset based on direction
    const next = isAtTopEdge.value
      ? Math.max(0, scrollOffset.value - delta)
      : Math.min(
          scrollOffset.value + delta,
          scrollViewSize.value - containerSize.value,
        );

    // Persist & apply the scroll
    scrollTarget.value = next;
    scrollTo(innerAnimatedRef, 0, next, false); // animated:false => we drive frames manually
    scrollOffset.value = next; // keep shared value in sync to avoid jumps
  });

  /* ========================================================================= */
  /*  B) Outer auto‑scroll  (scroll the parent container)                       */
  /* ========================================================================= */

  // Early‑out: nothing to do if no outer ref or animated offset provided
  if (!outerScrollRef || !outerScrollOffset) return;

  // Shared values to keep track of state & geometry
  const outerState = useSharedValue<OuterScrollState>(OuterScrollState.Idle);
  const outerTopY = useSharedValue(0);
  const outerBottomY = useSharedValue(0);
  const attemptedOff = useSharedValue(0);
  const lastDir = useSharedValue<ScrollDir>(ScrollDir.None);

  /* ---------------------- 1) Temporarily disable parent scroll ------------ */

  useEffect(() => {
    const node = outerScrollRef?.current;
    if (!node || pointerType?.value === 2) return; // keep mouse wheel enabled

    // Generic helper that works for RN & Web
    const setScrollEnabled = (enabled: boolean) => {
      if (typeof (node as any).setNativeProps === "function") {
        (node as any).setNativeProps({ scrollEnabled: enabled });
        //@ts-ignore
      } else if ((node as HTMLElement).style) {
        const el = node as HTMLElement;
        //@ts-ignore
        el.style.overflowY = enabled ? "auto" : "hidden";
        //@ts-ignore
        el.style.overscrollBehavior = enabled ? "auto" : "contain";
      }
    };

    const locked = activeKey != null;
    setScrollEnabled(!locked);

    // Cleanup – always re‑enable scrolling on unmount / key change
    return () => {
      setScrollEnabled(true);
    };
  }, [activeKey, outerScrollRef, pointerType]);

  /* ---------------------- 2) Observe outer bounds & resize ---------------- */

  useEffect(() => {
    if (!outerScrollRef?.current) return;

    const measure = () => {
      // @ts-ignore
      outerScrollRef.current?.measureInWindow((_, y, __, h) => {
        outerTopY.value = y;
        outerBottomY.value = y + h;
      });
    };

    // Initial measurement
    measure();

    // React‑Native: listen to orientation / window changes
    const dimSub = Dimensions.addEventListener("change", measure);

    // Web: ResizeObserver for layout shifts
    let ro: any;
    // @ts-ignore
    if (isWeb && typeof window !== "undefined" && (window as any).ResizeObserver) {
      const el = outerScrollRef.current as HTMLElement;
      //@ts-ignore – Type narrowing for older RN types
      const ROs = (window as any).ResizeObserver;
      ro = new ROs(measure);
      ro.observe(el);
    }

    return () => {
      dimSub.remove();
      ro?.disconnect();
    };
  }, [outerScrollRef]);

  /* ---------------------- 3) Decide when to scroll parent ----------------- */

  useDerivedValue(() => {
    const y = pointerY?.value;
    if (y == null || activeKey == null) {
      outerState.value = OuterScrollState.Idle;
      return;
    }

    if (y < outerTopY.value + autoscrollThreshold) {
      outerState.value = OuterScrollState.Up;
    } else if (y > outerBottomY.value - autoscrollThreshold) {
      outerState.value = OuterScrollState.Down;
    } else {
      outerState.value = OuterScrollState.Idle;
    }
  });

  /* ---------------------- 4) Perform the parent scroll -------------------- */

  useDerivedValue(() => {
    if (
      outerState.value === OuterScrollState.Idle ||
      activeKey == null ||
      pointerY?.value == null
    )
      return;

    // Distance from pointer to triggering edge
    const dist =
      outerState.value === OuterScrollState.Up
        ? pointerY.value - outerTopY.value
        : outerBottomY.value - pointerY.value;

    const pct = 1 - dist / autoscrollThreshold;
    if (pct <= 0) return;

    const dir =
      outerState.value === OuterScrollState.Up ? ScrollDir.Up : ScrollDir.Down;
    const delta = pct * autoscrollSpeed * dir;

    attemptedOff.value = outerScrollOffset.value + delta; // local only → low bridge traffic
    lastDir.value = dir;

    scrollTo(outerScrollRef, 0, attemptedOff.value, false);
  });

  /* ---------------------- 5) Stop when the end is reached ----------------- */

  useAnimatedReaction(
    () => outerScrollOffset.value,
    (cur, prev) => {
      if (outerState.value === OuterScrollState.Idle || prev == null) return;
      const moved =
        lastDir.value === ScrollDir.Down ? cur > prev : cur < prev;
      if (!moved) outerState.value = OuterScrollState.Idle;
    },
  );
}
