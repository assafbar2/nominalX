import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { HELP_COPY, type HelpCopyKey, type HelpEntry } from "../data/helpCopy";

const OPEN_EVENT = "nominalx:helptip-open";
const VIEWPORT_MARGIN = 12;
const TOOLTIP_GAP = 10;

export interface HelpTipProps {
  copyKey?: HelpCopyKey;
  entry?: HelpEntry;
  /**
   * Use "span" whenever HelpTip is placed inside an interactive element
   * (<button>, <label>, <a>) so we never produce invalid nested <button> HTML.
   */
  asSpan?: boolean;
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
  testId?: string;
}

interface PopoverCoords {
  top: number;
  left: number;
  placement: "top" | "bottom";
  arrowLeft: number;
  ready: boolean;
}

export function HelpTip({
  copyKey,
  entry,
  asSpan = false,
  size = "sm",
  ariaLabel,
  className = "",
  testId,
}: HelpTipProps) {
  const resolved: HelpEntry =
    entry ??
    (copyKey ? HELP_COPY[copyKey] : { title: "Help", body: "Contextual help." });

  const instanceId = useId();
  const tooltipId = `helptip-popover-${instanceId}`;
  const triggerRef = useRef<HTMLElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords>({
    top: -9999,
    left: -9999,
    placement: "top",
    arrowLeft: 16,
    ready: false,
  });

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const announceOpen = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<string>(OPEN_EVENT, { detail: instanceId }),
      );
    }
  }, [instanceId]);

  const openTip = useCallback(() => {
    clearCloseTimer();
    announceOpen();
    setOpen(true);
  }, [announceOpen, clearCloseTimer]);

  const scheduleClose = useCallback(
    (delayMs = 150) => {
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setOpen(false);
        setPinned(false);
      }, delayMs);
    },
    [clearCloseTimer],
  );

  const closeImmediately = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
    setPinned(false);
  }, [clearCloseTimer]);

  const computePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    const popoverEl = popoverRef.current;
    if (!triggerEl || !popoverEl) return;

    const triggerRect = triggerEl.getBoundingClientRect();
    const popRect = popoverEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const popW = popRect.width || 300;
    const popH = popRect.height || 100;

    // Prefer top placement; flip to bottom if insufficient room above
    const spaceAbove = triggerRect.top - VIEWPORT_MARGIN;
    const spaceBelow = vh - triggerRect.bottom - VIEWPORT_MARGIN;

    let placement: "top" | "bottom" = "top";
    let top = triggerRect.top - popH - TOOLTIP_GAP;

    if (spaceAbove < popH + TOOLTIP_GAP && spaceBelow >= spaceAbove) {
      placement = "bottom";
      top = triggerRect.bottom + TOOLTIP_GAP;
    }

    // Clamp top strictly inside viewport
    top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(top, Math.max(VIEWPORT_MARGIN, vh - popH - VIEWPORT_MARGIN)),
    );

    const triggerCenterX = triggerRect.left + triggerRect.width / 2;
    const rawLeft = triggerCenterX - popW / 2;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rawLeft, Math.max(VIEWPORT_MARGIN, vw - popW - VIEWPORT_MARGIN)),
    );

    const arrowLeft = Math.max(14, Math.min(triggerCenterX - left, popW - 14));

    setCoords({
      top: Math.round(top),
      left: Math.round(left),
      placement,
      arrowLeft: Math.round(arrowLeft),
      ready: true,
    });
  }, []);

  // Measure and position whenever open changes
  useLayoutEffect(() => {
    if (!open) {
      setCoords((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
    computePosition();
    const raf = window.requestAnimationFrame(computePosition);
    return () => window.cancelAnimationFrame(raf);
  }, [open, computePosition, resolved.title, resolved.body]);

  // Reposition on scroll/resize, close on Escape, outside click, or another HelpTip opening
  useEffect(() => {
    if (!open) return;

    const handleReposition = () => computePosition();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeImmediately();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (
        target &&
        (triggerRef.current?.contains(target) ||
          popoverRef.current?.contains(target))
      ) {
        return;
      }
      closeImmediately();
    };

    const handleOtherOpen = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom.detail !== instanceId) {
        closeImmediately();
      }
    };

    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener(OPEN_EVENT, handleOtherOpen);

    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener(OPEN_EVENT, handleOtherOpen);
    };
  }, [open, instanceId, computePosition, closeImmediately]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  const stopOnly = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearCloseTimer();
    if (open && pinned) {
      closeImmediately();
    } else {
      announceOpen();
      setOpen(true);
      setPinned(true);
    }
  };

  const handleKeyDownTrigger = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      clearCloseTimer();
      if (open && pinned) {
        closeImmediately();
      } else {
        announceOpen();
        setOpen(true);
        setPinned(true);
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      closeImmediately();
    }
  };

  const handleMouseEnter = () => {
    openTip();
  };

  const handleMouseLeave = () => {
    if (!pinned) {
      scheduleClose(160);
    }
  };

  const handleFocus = () => {
    openTip();
  };

  const handleBlur = () => {
    if (!pinned) {
      scheduleClose(120);
    }
  };

  const triggerClasses = [
    "help-tip-trigger",
    size === "md" ? "help-tip-md" : "help-tip-sm",
    open ? "is-open" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const label = ariaLabel ?? `Help: ${resolved.title}`;
  const resolvedTestId =
    testId ?? (copyKey ? `help-tip-${copyKey}` : "help-tip-custom");

  const commonProps = {
    className: triggerClasses,
    "aria-label": label,
    "aria-describedby": open ? tooltipId : undefined,
    "aria-expanded": open,
    "data-testid": resolvedTestId,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onMouseDown: stopOnly,
    onPointerDown: stopOnly,
    onClick: handleClick,
    onKeyDown: handleKeyDownTrigger,
  };

  const popoverNode =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popoverRef}
            id={tooltipId}
            role="tooltip"
            className={`help-tip-popover placement-${coords.placement} ${coords.ready ? "is-ready" : ""}`}
            style={{
              top: coords.top,
              left: coords.left,
            }}
            data-testid="help-tip-popover"
            onMouseEnter={clearCloseTimer}
            onMouseLeave={() => {
              if (!pinned) scheduleClose(140);
            }}
            onClick={stopOnly}
            onMouseDown={stopOnly}
            onPointerDown={stopOnly}
          >
            <span
              className="help-tip-arrow"
              style={{ left: coords.arrowLeft }}
              aria-hidden="true"
            />
            {resolved.tag && (
              <div className="help-tip-tag mono">{resolved.tag}</div>
            )}
            <div className="help-tip-title">{resolved.title}</div>
            <div className="help-tip-body">{resolved.body}</div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {asSpan ? (
        <span
          ref={(el) => {
            triggerRef.current = el;
          }}
          role="button"
          tabIndex={0}
          {...commonProps}
        >
          ?
        </span>
      ) : (
        <button
          ref={(el) => {
            triggerRef.current = el;
          }}
          type="button"
          {...commonProps}
        >
          ?
        </button>
      )}
      {popoverNode}
    </>
  );
}
