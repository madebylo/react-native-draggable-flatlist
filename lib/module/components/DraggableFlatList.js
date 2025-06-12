function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { InteractionManager } from "react-native";
import { FlatList, Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedReaction, useAnimatedScrollHandler, useSharedValue, withSpring, useDerivedValue, //@madebylo
scrollTo //@madebylo
} from "react-native-reanimated";
import CellRendererComponent from "./CellRendererComponent";
import { DEFAULT_PROPS, isWeb } from "../constants"; //@madebylo

import PlaceholderItem from "./PlaceholderItem";
import RowItem from "./RowItem";
import PropsProvider from "../context/propsContext";
import AnimatedValueProvider, { useAnimatedValues } from "../context/animatedValueContext";
import RefProvider, { useRefs } from "../context/refContext";
import DraggableFlatListProvider from "../context/draggableFlatListContext";
import { useAutoScroll } from "../hooks/useAutoScroll";
import { useStableCallback } from "../hooks/useStableCallback";
import ScrollOffsetListener from "./ScrollOffsetListener";
import { typedMemo } from "../utils";
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

function DraggableFlatListInner(props) {
  const {
    cellDataRef,
    containerRef,
    flatlistRef,
    keyToIndexRef,
    propsRef,
    animationConfigRef
  } = useRefs();
  const {
    activeCellOffset,
    activeCellSize,
    activeIndexAnim,
    containerSize,
    scrollOffset,
    scrollViewSize,
    spacerIndexAnim,
    horizontalAnim,
    placeholderOffset,
    touchTranslate,
    autoScrollDistance,
    panGestureState,
    isTouchActiveNative,
    viewableIndexMin,
    viewableIndexMax,
    disabled
  } = useAnimatedValues();
  const reset = useStableCallback(() => {
    activeIndexAnim.value = -1;
    spacerIndexAnim.value = -1;
    touchTranslate.value = 0;
    activeCellSize.value = -1;
    activeCellOffset.value = -1;
    setActiveKey(null);
  });
  const {
    dragHitSlop = DEFAULT_PROPS.dragHitSlop,
    scrollEnabled = DEFAULT_PROPS.scrollEnabled,
    activationDistance: activationDistanceProp = DEFAULT_PROPS.activationDistance
  } = props;
  let [activeKey, setActiveKey] = useState(null);
  const [layoutAnimationDisabled, setLayoutAnimationDisabled] = useState(!propsRef.current.enableLayoutAnimationExperimental);
  const keyExtractor = useStableCallback((item, index) => {
    if (!props.keyExtractor) {
      throw new Error("You must provide a keyExtractor to DraggableFlatList");
    }

    return props.keyExtractor(item, index);
  });
  const dataRef = useRef(props.data);
  const dataHasChanged = dataRef.current.map(keyExtractor).join("") !== props.data.map(keyExtractor).join("");
  dataRef.current = props.data;

  if (dataHasChanged) {
    // When data changes make sure `activeKey` is nulled out in the same render pass
    activeKey = null;
    InteractionManager.runAfterInteractions(() => {
      reset();
    });
  }

  useEffect(() => {
    if (!propsRef.current.enableLayoutAnimationExperimental) return;

    if (activeKey) {
      setLayoutAnimationDisabled(true);
    } else {
      // setTimeout result of trial-and-error to determine how long to wait before
      // re-enabling layout animations so that a drag reorder does not trigger it.
      setTimeout(() => {
        setLayoutAnimationDisabled(false);
      }, 100);
    }
  }, [activeKey]);
  useLayoutEffect(() => {
    props.data.forEach((d, i) => {
      const key = keyExtractor(d, i);
      keyToIndexRef.current.set(key, i);
    });
  }, [props.data, keyExtractor, keyToIndexRef]);
  const drag = useStableCallback(activeKey => {
    if (disabled.value) return;
    const index = keyToIndexRef.current.get(activeKey);
    const cellData = cellDataRef.current.get(activeKey);

    if (cellData) {
      activeCellOffset.value = cellData.measurements.offset;
      activeCellSize.value = cellData.measurements.size;
    }

    const {
      onDragBegin
    } = propsRef.current;

    if (index !== undefined) {
      spacerIndexAnim.value = index;
      activeIndexAnim.value = index;
      setActiveKey(activeKey);
      onDragBegin === null || onDragBegin === void 0 ? void 0 : onDragBegin(index);
    }
  });

  const onContainerLayout = _ref => {
    var _props$onContainerLay;

    let {
      nativeEvent: {
        layout
      }
    } = _ref;
    const {
      width,
      height
    } = layout;
    containerSize.value = props.horizontal ? width : height;
    (_props$onContainerLay = props.onContainerLayout) === null || _props$onContainerLay === void 0 ? void 0 : _props$onContainerLay.call(props, {
      layout,
      containerRef
    });
  };

  const onListContentSizeChange = (w, h) => {
    var _props$onContentSizeC;

    scrollViewSize.value = props.horizontal ? w : h;
    (_props$onContentSizeC = props.onContentSizeChange) === null || _props$onContentSizeC === void 0 ? void 0 : _props$onContentSizeC.call(props, w, h);
  };

  const onContainerTouchStart = () => {
    if (!disabled.value) {
      isTouchActiveNative.value = true;
    }

    return false;
  };

  const onContainerTouchEnd = () => {
    isTouchActiveNative.value = false;
  };

  const extraData = useMemo(() => ({
    activeKey,
    extraData: props.extraData
  }), [activeKey, props.extraData]);
  const renderItem = useCallback(_ref2 => {
    let {
      item,
      index
    } = _ref2;
    const key = keyExtractor(item, index);

    if (index !== keyToIndexRef.current.get(key)) {
      keyToIndexRef.current.set(key, index);
    }

    return /*#__PURE__*/React.createElement(RowItem, {
      item: item,
      itemKey: key,
      renderItem: props.renderItem,
      drag: drag,
      extraData: props.extraData
    });
  }, [props.renderItem, props.extraData, drag, keyExtractor]);
  const onRelease = useStableCallback(index => {
    var _props$onRelease;

    (_props$onRelease = props.onRelease) === null || _props$onRelease === void 0 ? void 0 : _props$onRelease.call(props, index);
  });
  const onDragEnd = useStableCallback(_ref3 => {
    let {
      from,
      to
    } = _ref3;
    const {
      onDragEnd,
      data
    } = props;
    const newData = [...data];

    if (from !== to) {
      newData.splice(from, 1);
      newData.splice(to, 0, data[from]);
    }

    onDragEnd === null || onDragEnd === void 0 ? void 0 : onDragEnd({
      from,
      to,
      data: newData
    });
    setActiveKey(null);
  });
  const onPlaceholderIndexChange = useStableCallback(index => {
    var _props$onPlaceholderI;

    (_props$onPlaceholderI = props.onPlaceholderIndexChange) === null || _props$onPlaceholderI === void 0 ? void 0 : _props$onPlaceholderI.call(props, index);
  }); // Handle case where user ends drag without moving their finger.

  useAnimatedReaction(() => {
    return isTouchActiveNative.value;
  }, (cur, prev) => {
    if (cur !== prev && !cur) {
      const hasMoved = !!touchTranslate.value;

      if (!hasMoved && activeIndexAnim.value >= 0 && !disabled.value) {
        runOnJS(onRelease)(activeIndexAnim.value);
        runOnJS(onDragEnd)({
          from: activeIndexAnim.value,
          to: spacerIndexAnim.value
        });
      }
    }
  }, [isTouchActiveNative, onDragEnd, onRelease]);
  useAnimatedReaction(() => {
    return spacerIndexAnim.value;
  }, (cur, prev) => {
    if (prev !== null && cur !== prev && cur >= 0 && prev >= 0) {
      runOnJS(onPlaceholderIndexChange)(cur);
    }
  }, [spacerIndexAnim]);
  const gestureDisabled = useSharedValue(false); //#region @madebylo

  const {
    outerScrollRef,
    outerScrollOffset,
    autoscrollThreshold = DEFAULT_PROPS.autoscrollThreshold,
    autoscrollSpeed = DEFAULT_PROPS.autoscrollSpeed
  } = props;
  const propsForFlatList = { ...props
  };
  delete propsForFlatList.outerScrollRef;
  delete propsForFlatList.outerScrollOffset;
  delete propsForFlatList.autoscrollThreshold;
  delete propsForFlatList.autoscrollSpeed;
  const pointerPositionDuringDragY = useSharedValue(null);
  const pointerType = useSharedValue(0); // 0 = TOUCH, 1 = STYLUS, 2 = MOUSE, 3 = KEY, 4  OTHER

  const outerScrollState = useSharedValue(0); // 0 idle, 1 up, 2 down

  const outerScrollViewTopY = useSharedValue(0);
  const outerScrollViewBottomY = useSharedValue(0);
  const attemptedOffset = useSharedValue(0); // wohin wir scrollen wollen

  const lastDir = useSharedValue(0); // 1 ↓, -1 ↑
  // lock the scroll of the outer scroll view

  useEffect(() => {
    const node = outerScrollRef === null || outerScrollRef === void 0 ? void 0 : outerScrollRef.current;
    if (!node || pointerType.value == 2) return;

    if (isWeb) {
      // @ts-ignore – we know that node is an HTMLElement
      const el = node; // @ts-ignore – TypeScript does not know that el is an HTMLElement

      if (!(el !== null && el !== void 0 && el.style)) return; // @ts-ignore – we know that el is an HTMLElement

      const prevOverflow = el.style.overflowY; // @ts-ignore

      el.style.overflowY = activeKey == null ? "auto" : "hidden"; // @ts-ignore

      el.style.overscrollBehavior = activeKey == null ? "auto" : "contain";
      return () => {
        // @ts-ignore
        el.style.overflowY = prevOverflow; // @ts-ignore

        el.style.overscrollBehavior = "auto";
      };
    } else {
      node.setNativeProps({
        scrollEnabled: activeKey == null
      });
    }
  }, [activeKey, isWeb, outerScrollRef]); //measure the outer scroll view

  useEffect(() => {
    var _outerScrollRef$curre;

    // @ts-ignore – outerScrollRef is a ref to a ScrollView
    outerScrollRef === null || outerScrollRef === void 0 ? void 0 : (_outerScrollRef$curre = outerScrollRef.current) === null || _outerScrollRef$curre === void 0 ? void 0 : _outerScrollRef$curre.measureInWindow((_, y, __, h) => {
      outerScrollViewTopY.value = y;
      outerScrollViewBottomY.value = y + h;
    });
  }, [pointerType]); // check if the pointer is within the autoscroll threshold

  useDerivedValue(() => {
    const y = pointerPositionDuringDragY.value;

    if (y == null || activeKey == null) {
      outerScrollState.value = 0;
      return;
    }

    if (y < outerScrollViewTopY.value + autoscrollThreshold) outerScrollState.value = 1; // up
    else if (y > outerScrollViewBottomY.value - autoscrollThreshold) outerScrollState.value = 2; // down
    else outerScrollState.value = 0; // none
  }); // scroll the outer scroll view if the pointer is within the autoscroll threshold

  useDerivedValue(() => {
    if (outerScrollState.value === 0 || outerScrollRef == null || (outerScrollOffset === null || outerScrollOffset === void 0 ? void 0 : outerScrollOffset.value) == null || activeKey == null) return;
    const distFromEdge = outerScrollState.value === 1 ? pointerPositionDuringDragY.value - outerScrollViewTopY.value : outerScrollViewBottomY.value - pointerPositionDuringDragY.value;
    const speedPct = 1 - distFromEdge / autoscrollThreshold;
    if (speedPct <= 0) return;
    const dir = outerScrollState.value === 1 ? -1 : 1;
    const delta = speedPct * autoscrollSpeed * dir;
    attemptedOffset.value = outerScrollOffset.value + delta;
    lastDir.value = dir; // @ts-ignore

    scrollTo(outerScrollRef, 0, attemptedOffset.value, false); // UI-Thread
  }); // check if the outer scroll view has reached the limit

  if (outerScrollOffset) {
    useAnimatedReaction(() => outerScrollOffset.value, (real, prev) => {
      if (outerScrollState.value === 0 || prev == null) return;
      const dir = lastDir.value;
      const movedInDir = dir === 1 ? real > prev : real < prev;

      if (!movedInDir) {
        outerScrollState.value = 0;
      }
    });
  } //#endregion


  const panGesture = Gesture.Pan().onBegin(evt => {
    gestureDisabled.value = disabled.value;
    if (gestureDisabled.value) return;
    panGestureState.value = evt.state;
    pointerType.value = evt.pointerType; //@madebylo
  }).onUpdate(evt => {
    if (gestureDisabled.value) return;
    panGestureState.value = evt.state;
    const translation = horizontalAnim.value ? evt.translationX : evt.translationY;
    touchTranslate.value = translation;
    pointerPositionDuringDragY.value = evt.absoluteY; //@madebylo
  }).onEnd(evt => {
    pointerPositionDuringDragY.value = null; //@madebylo

    if (gestureDisabled.value) return; // Set touch val to current translate val

    isTouchActiveNative.value = false;
    const translation = horizontalAnim.value ? evt.translationX : evt.translationY;
    touchTranslate.value = translation + autoScrollDistance.value;
    panGestureState.value = evt.state; // Only call onDragEnd if actually dragging a cell

    if (activeIndexAnim.value === -1 || disabled.value) return;
    disabled.value = true;
    runOnJS(onRelease)(activeIndexAnim.value);
    const springTo = placeholderOffset.value - activeCellOffset.value;
    touchTranslate.value = withSpring(springTo, animationConfigRef.value, () => {
      runOnJS(onDragEnd)({
        from: activeIndexAnim.value,
        to: spacerIndexAnim.value
      });
      disabled.value = false;
    });
  }).onTouchesDown(() => {
    runOnJS(onContainerTouchStart)();
  }).onTouchesUp(() => {
    // Turning this into a worklet causes timing issues. We want it to run
    // just after the finger lifts.
    pointerPositionDuringDragY.value = null; //@madebylo

    runOnJS(onContainerTouchEnd)();
  });
  if (isWeb) panGesture.minDistance(0); //@madebylo

  if (dragHitSlop) panGesture.hitSlop(dragHitSlop);

  if (activationDistanceProp) {
    const activeOffset = [-activationDistanceProp, activationDistanceProp];

    if (props.horizontal) {
      //@ts-ignore
      panGesture.activeOffsetX(activeOffset);
    } else {
      //@ts-ignore
      panGesture.activeOffsetY(activeOffset);
    }
  }

  const onScroll = useStableCallback(scrollOffset => {
    var _props$onScrollOffset;

    (_props$onScrollOffset = props.onScrollOffsetChange) === null || _props$onScrollOffset === void 0 ? void 0 : _props$onScrollOffset.call(props, scrollOffset);
  });
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: evt => {
      scrollOffset.value = horizontalAnim.value ? evt.contentOffset.x : evt.contentOffset.y;
      runOnJS(onScroll)(scrollOffset.value);
    }
  }, [horizontalAnim]);
  useAutoScroll();
  const onViewableItemsChanged = useStableCallback(info => {
    var _props$onViewableItem;

    const viewableIndices = info.viewableItems.filter(item => item.isViewable).map(item => item.index).filter(index => typeof index === "number");
    const min = Math.min(...viewableIndices);
    const max = Math.max(...viewableIndices);
    viewableIndexMin.value = min;
    viewableIndexMax.value = max;
    (_props$onViewableItem = props.onViewableItemsChanged) === null || _props$onViewableItem === void 0 ? void 0 : _props$onViewableItem.call(props, info);
  });
  return /*#__PURE__*/React.createElement(DraggableFlatListProvider, {
    activeKey: activeKey,
    keyExtractor: keyExtractor,
    horizontal: !!props.horizontal,
    layoutAnimationDisabled: layoutAnimationDisabled
  }, /*#__PURE__*/React.createElement(GestureDetector, {
    gesture: panGesture,
    touchAction: props.horizontal ? "pan-x" : "pan-y",
    userSelect: "none"
  }, /*#__PURE__*/React.createElement(Animated.View, {
    style: props.containerStyle,
    ref: containerRef,
    onLayout: onContainerLayout
  }, props.renderPlaceholder && /*#__PURE__*/React.createElement(PlaceholderItem, {
    renderPlaceholder: props.renderPlaceholder
  }), /*#__PURE__*/React.createElement(AnimatedFlatList, _extends({}, propsForFlatList, {
    //@madebylo
    data: props.data,
    onViewableItemsChanged: onViewableItemsChanged,
    CellRendererComponent: CellRendererComponent,
    ref: flatlistRef,
    onContentSizeChange: onListContentSizeChange,
    scrollEnabled: !activeKey && scrollEnabled,
    renderItem: renderItem,
    extraData: extraData,
    keyExtractor: keyExtractor,
    onScroll: scrollHandler,
    scrollEventThrottle: 16,
    simultaneousHandlers: props.simultaneousHandlers,
    removeClippedSubviews: false
  })), !!props.onScrollOffsetChange && /*#__PURE__*/React.createElement(ScrollOffsetListener, {
    onScrollOffsetChange: props.onScrollOffsetChange,
    scrollOffset: scrollOffset
  }))));
}

function DraggableFlatList(props, ref) {
  return /*#__PURE__*/React.createElement(PropsProvider, props, /*#__PURE__*/React.createElement(AnimatedValueProvider, null, /*#__PURE__*/React.createElement(RefProvider, {
    flatListRef: ref
  }, /*#__PURE__*/React.createElement(MemoizedInner, props))));
}

const MemoizedInner = typedMemo(DraggableFlatListInner); // Generic forwarded ref type assertion taken from:
// https://fettblog.eu/typescript-react-generic-forward-refs/#option-1%3A-type-assertion

export default /*#__PURE__*/React.forwardRef(DraggableFlatList);
//# sourceMappingURL=DraggableFlatList.js.map