import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  WALKTHROUGH_CHAPTER_PREVIEWS,
  WALKTHROUGH_CHAPTERS,
  WALKTHROUGH_STEPS,
  WALKTHROUGH_WELCOME_META,
  type WalkthroughPlacement,
  type WalkthroughStep,
} from "../data/walkthroughSteps";
import { NominalXLogo } from "./Icons";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

interface CardPosition {
  top: number;
  left: number;
  width: number;
  placement: Exclude<WalkthroughPlacement, "center">;
  arrowOffset: number;
  showArrow: boolean;
}

export interface WalkthroughTourProps {
  open: boolean;
  stepIndex: number;
  onChangeStep: (index: number) => void;
  onComplete: () => void;
  onSkip: () => void;
}

const VIEWPORT_MARGIN = 14;
const CARD_GAP = 14;
const STICKY_HEADER_CLEARANCE = 62;
const DEFAULT_HORIZONTAL_CARD_WIDTH = 626;
const MIN_SIDE_CARD_WIDTH = 360;

function clamp(val: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, val));
}

function rectsDisjoint(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
  clearance = 4,
): boolean {
  return (
    a.right <= b.left - clearance ||
    a.left >= b.right + clearance ||
    a.bottom <= b.top - clearance ||
    a.top >= b.bottom + clearance
  );
}

function computeAnchoredCardPosition(
  target: Rect,
  measuredCardH: number,
  vw: number,
  vh: number,
  preferred: WalkthroughPlacement,
): CardPosition {
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const baseWidth = Math.min(DEFAULT_HORIZONTAL_CARD_WIDTH, vw - VIEWPORT_MARGIN * 2);

  const order: Exclude<WalkthroughPlacement, "center">[] = [];
  if (preferred !== "center") order.push(preferred);
  for (const dir of ["bottom", "top", "right", "left"] as const) {
    if (!order.includes(dir)) order.push(dir);
  }

  for (const dir of order) {
    let width = baseWidth;
    let left = 0;
    let top = 0;

    if (dir === "left") {
      const availLeft = target.left - CARD_GAP - VIEWPORT_MARGIN;
      if (availLeft < MIN_SIDE_CARD_WIDTH) continue;
      width = Math.min(540, availLeft);
      left = target.left - width - CARD_GAP;
      top = clamp(
        targetCenterY - measuredCardH / 2,
        VIEWPORT_MARGIN,
        vh - measuredCardH - VIEWPORT_MARGIN,
      );
    } else if (dir === "right") {
      const availRight = vw - target.right - CARD_GAP - VIEWPORT_MARGIN;
      if (availRight < MIN_SIDE_CARD_WIDTH) continue;
      width = Math.min(540, availRight);
      left = target.right + CARD_GAP;
      top = clamp(
        targetCenterY - measuredCardH / 2,
        VIEWPORT_MARGIN,
        vh - measuredCardH - VIEWPORT_MARGIN,
      );
    } else if (dir === "bottom") {
      const availBelow = vh - target.bottom - CARD_GAP - VIEWPORT_MARGIN;
      if (availBelow < measuredCardH) continue;
      top = target.bottom + CARD_GAP;
      left = clamp(
        targetCenterX - width / 2,
        VIEWPORT_MARGIN,
        vw - width - VIEWPORT_MARGIN,
      );
    } else {
      const availAbove = target.top - CARD_GAP - VIEWPORT_MARGIN;
      if (availAbove < measuredCardH) continue;
      top = target.top - measuredCardH - CARD_GAP;
      left = clamp(
        targetCenterX - width / 2,
        VIEWPORT_MARGIN,
        vw - width - VIEWPORT_MARGIN,
      );
    }

    const box = {
      left,
      top,
      right: left + width,
      bottom: top + measuredCardH,
    };

    const fitsViewport =
      box.left >= VIEWPORT_MARGIN - 1 &&
      box.top >= VIEWPORT_MARGIN - 1 &&
      box.right <= vw - VIEWPORT_MARGIN + 1 &&
      box.bottom <= vh - VIEWPORT_MARGIN + 1;

    if (fitsViewport && rectsDisjoint(box, target, 4)) {
      const arrowOffset =
        dir === "top" || dir === "bottom"
          ? clamp(targetCenterX - left, 24, width - 24)
          : clamp(targetCenterY - top, 24, measuredCardH - 24);
      return {
        top: Math.round(top),
        left: Math.round(left),
        width: Math.round(width),
        placement: dir,
        arrowOffset: Math.round(arrowOffset),
        showArrow: true,
      };
    }
  }

  // Emergency fallback for extremely small viewports: pick the largest non-overlapping side
  const spaces: {
    dir: Exclude<WalkthroughPlacement, "center">;
    space: number;
  }[] = [
    { dir: "bottom", space: vh - target.bottom - VIEWPORT_MARGIN },
    { dir: "top", space: target.top - VIEWPORT_MARGIN },
    { dir: "right", space: vw - target.right - VIEWPORT_MARGIN },
    { dir: "left", space: target.left - VIEWPORT_MARGIN },
  ];
  spaces.sort((a, b) => b.space - a.space);
  const best = spaces[0]!.dir;

  let width = baseWidth;
  let left = clamp(
    targetCenterX - width / 2,
    VIEWPORT_MARGIN,
    vw - width - VIEWPORT_MARGIN,
  );
  let top = clamp(
    targetCenterY - measuredCardH / 2,
    VIEWPORT_MARGIN,
    vh - measuredCardH - VIEWPORT_MARGIN,
  );

  if (best === "bottom") {
    top = Math.min(target.bottom + CARD_GAP, vh - measuredCardH - VIEWPORT_MARGIN);
  } else if (best === "top") {
    top = Math.max(VIEWPORT_MARGIN, target.top - measuredCardH - CARD_GAP);
  } else if (best === "left") {
    width = Math.max(300, Math.min(500, target.left - CARD_GAP - VIEWPORT_MARGIN));
    left = Math.max(VIEWPORT_MARGIN, target.left - width - CARD_GAP);
  } else {
    width = Math.max(300, Math.min(500, vw - target.right - CARD_GAP - VIEWPORT_MARGIN));
    left = Math.min(target.right + CARD_GAP, vw - width - VIEWPORT_MARGIN);
  }

  return {
    top: Math.round(clamp(top, VIEWPORT_MARGIN, vh - measuredCardH - VIEWPORT_MARGIN)),
    left: Math.round(clamp(left, VIEWPORT_MARGIN, vw - width - VIEWPORT_MARGIN)),
    width: Math.round(width),
    placement: best,
    arrowOffset: 32,
    showArrow: false,
  };
}

function measureSpotlightRect(step: WalkthroughStep): Rect | null {
  if (!step.targetSelector || typeof document === "undefined") return null;
  const el = document.querySelector(step.targetSelector);
  if (!el) return null;

  const raw = el.getBoundingClientRect();
  if (raw.width <= 0 || raw.height <= 0) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isDrawerTarget = step.openDrawer === "customize";
  const pad = isDrawerTarget ? 0 : 7;
  const edgeClamp = isDrawerTarget ? 0 : 4;

  const left = Math.max(edgeClamp, Math.round(raw.left - pad));
  const top = Math.max(edgeClamp, Math.round(raw.top - pad));
  const right = Math.min(vw - edgeClamp, Math.round(raw.right + pad));
  const bottom = Math.min(vh - edgeClamp, Math.round(raw.bottom + pad));

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function WalkthroughTour({
  open,
  stepIndex,
  onChangeStep,
  onComplete,
  onSkip,
}: WalkthroughTourProps) {
  const maskId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [spotlightRect, setSpotlightRect] = useState<Rect | null>(null);
  const [cardPos, setCardPos] = useState<CardPosition | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: typeof window !== "undefined" ? window.innerWidth : 1440,
    h: typeof window !== "undefined" ? window.innerHeight : 900,
  });

  const safeIndex = clamp(stepIndex, 0, WALKTHROUGH_STEPS.length - 1);
  const step = WALKTHROUGH_STEPS[safeIndex]!;
  const isFirst = safeIndex === 0;
  const isLast = safeIndex === WALKTHROUGH_STEPS.length - 1;
  const isCentered = step.placement === "center" || !step.targetSelector;

  const recomputeLayout = useCallback(() => {
    if (!open || typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setViewport((prev) => (prev.w === vw && prev.h === vh ? prev : { w: vw, h: vh }));

    if (isCentered) {
      setSpotlightRect(null);
      setCardPos(null);
      return;
    }

    const rect = measureSpotlightRect(step);
    setSpotlightRect(rect);

    if (!rect) {
      setCardPos(null);
      return;
    }

    const cardEl = cardRef.current;
    const cardH = cardEl ? cardEl.getBoundingClientRect().height || 210 : 210;

    setCardPos(
      computeAnchoredCardPosition(rect, cardH, vw, vh, step.placement),
    );
  }, [open, isCentered, step]);

  // Actively scroll the viewport so every spotlight target leaves strict non-overlapping clearance
  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    let cancelled = false;
    const timers: number[] = [];

    const scrollTargetIntoView = () => {
      if (cancelled) return;

      if (
        isCentered ||
        step.targetSelector === '[data-tour="mission-bar"]' ||
        step.targetSelector === '[data-tour="tour-replay-wrap"]'
      ) {
        if (window.scrollY > 4) {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        recomputeLayout();
        return;
      }

      if (step.openDrawer === "customize") {
        recomputeLayout();
        return;
      }

      const el = step.targetSelector
        ? document.querySelector(step.targetSelector)
        : null;
      if (!el) {
        recomputeLayout();
        return;
      }

      const raw = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const cardH = cardRef.current?.getBoundingClientRect().height || 215;

      let targetScrollY = window.scrollY;

      if (step.placement === "bottom") {
        const neededBelow = cardH + CARD_GAP + VIEWPORT_MARGIN + 10;
        const maxTopForClearance = vh - raw.height - neededBelow;
        const desiredTop = Math.max(
          10,
          Math.min(STICKY_HEADER_CLEARANCE + 10, maxTopForClearance),
        );
        targetScrollY = Math.max(0, window.scrollY + raw.top - desiredTop);
      } else if (step.placement === "top") {
        const minTopForClearance = cardH + CARD_GAP + VIEWPORT_MARGIN + 10;
        const bottomFitTop = vh - raw.height - VIEWPORT_MARGIN - 8;
        const desiredTop = Math.max(minTopForClearance, bottomFitTop);
        targetScrollY = Math.max(0, window.scrollY + raw.top - desiredTop);
      } else {
        // Side placement ("left" or "right"): center vertically while staying below sticky header
        const desiredTop = Math.max(
          STICKY_HEADER_CLEARANCE + 10,
          Math.round((vh - raw.height) / 2),
        );
        targetScrollY = Math.max(0, window.scrollY + raw.top - desiredTop);
      }

      if (Math.abs(targetScrollY - window.scrollY) > 6) {
        window.scrollTo({ top: Math.round(targetScrollY), behavior: "smooth" });
      }
      recomputeLayout();
    };

    const raf1 = window.requestAnimationFrame(() => {
      const raf2 = window.requestAnimationFrame(() => {
        scrollTargetIntoView();
      });
      timers.push(raf2);
    });
    timers.push(raf1);

    const settleTimeouts = [90, 220, 420, 620].map((ms) =>
      window.setTimeout(() => {
        if (!cancelled) recomputeLayout();
      }, ms),
    );

    return () => {
      cancelled = true;
      for (const id of timers) window.cancelAnimationFrame(id);
      for (const id of settleTimeouts) window.clearTimeout(id);
    };
  }, [open, safeIndex, isCentered, step, recomputeLayout]);

  useLayoutEffect(() => {
    if (!open) return;
    recomputeLayout();
  }, [open, safeIndex, recomputeLayout]);

  useEffect(() => {
    if (!open) return;

    const handleSync = () => recomputeLayout();
    window.addEventListener("scroll", handleSync, true);
    window.addEventListener("resize", handleSync);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && cardRef.current) {
      ro = new ResizeObserver(handleSync);
      ro.observe(cardRef.current);
    }

    return () => {
      window.removeEventListener("scroll", handleSync, true);
      window.removeEventListener("resize", handleSync);
      ro?.disconnect();
    };
  }, [open, recomputeLayout]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onSkip();
        return;
      }

      const activeTag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        if (isLast) {
          onComplete();
        } else {
          onChangeStep(safeIndex + 1);
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        if (!isFirst) {
          onChangeStep(safeIndex - 1);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, safeIndex, isFirst, isLast, onChangeStep, onComplete, onSkip]);

  if (!open || typeof document === "undefined") return null;

  const isDrawerSpotlight = step.openDrawer === "customize";
  const progressPct = ((safeIndex + 1) / WALKTHROUGH_STEPS.length) * 100;

  return createPortal(
    <div
      className="tour-portal-root"
      role="dialog"
      aria-modal="true"
      aria-label={`NominalX Guided Walkthrough — Step ${safeIndex + 1} of ${WALKTHROUGH_STEPS.length}: ${step.title}`}
      data-testid="walkthrough-tour"
      data-tour-step={step.id}
      data-tour-step-number={safeIndex + 1}
    >
      {/* Dimmed Backdrop with Accurate SVG Cutout Spotlight */}
      <svg
        className="tour-backdrop-svg"
        width={viewport.w}
        height={viewport.h}
        viewBox={`0 0 ${viewport.w} ${viewport.h}`}
        aria-hidden="true"
      >
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width={viewport.w} height={viewport.h} fill="white" />
            {spotlightRect && (
              <rect
                x={spotlightRect.left}
                y={spotlightRect.top}
                width={spotlightRect.width}
                height={spotlightRect.height}
                rx={isDrawerSpotlight ? 0 : 14}
                ry={isDrawerSpotlight ? 0 : 14}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width={viewport.w}
          height={viewport.h}
          fill="var(--tour-backdrop)"
          mask={`url(#${maskId})`}
        />
      </svg>

      {/* Crisp Glowing Spotlight Ring around Active Target */}
      {spotlightRect && (
        <div
          className={`tour-spotlight-ring ${isDrawerSpotlight ? "is-drawer" : ""}`}
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
          }}
          data-testid="tour-spotlight-ring"
          aria-hidden="true"
        />
      )}

      {/* Step 1: Welcome Hero Card (Centered Modal) */}
      {isCentered ? (
        <div className="tour-center-stage">
          <div
            ref={cardRef}
            className="tour-welcome-card"
            data-testid="tour-callout-card"
          >
            <div className="tour-card-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <NominalXLogo size={32} />
                <span className="tour-chapter-badge mono">
                  {WALKTHROUGH_WELCOME_META.badge}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="tour-step-counter mono" data-testid="tour-step-counter">
                  STEP {safeIndex + 1} OF {WALKTHROUGH_STEPS.length}
                </span>
                <button
                  type="button"
                  className="tour-close-icon-btn"
                  onClick={onSkip}
                  aria-label="Skip walkthrough tour"
                  data-testid="tour-close-btn"
                >
                  ×
                </button>
              </div>
            </div>

            <h2 className="tour-welcome-headline">
              {WALKTHROUGH_WELCOME_META.headline}
            </h2>

            <div className="tour-quote-banner">
              <span className="tour-quote-bar" aria-hidden="true" />
              <p className="tour-quote-text">
                &ldquo;{WALKTHROUGH_WELCOME_META.quote}&rdquo;
              </p>
            </div>

            <div className="tour-welcome-pillars">
              <div className="tour-pillar-box">
                <div className="eyebrow" style={{ color: "var(--active-text)" }}>
                  {WALKTHROUGH_WELCOME_META.goalTitle}
                </div>
                <p className="tour-pillar-body">
                  {WALKTHROUGH_WELCOME_META.goalBody}
                </p>
              </div>

              <div className="tour-pillar-box tour-pillar-highlight">
                <div className="eyebrow" style={{ color: "var(--nominal-text)" }}>
                  {WALKTHROUGH_WELCOME_META.positioningTitle}
                </div>
                <p className="tour-pillar-body">
                  {WALKTHROUGH_WELCOME_META.positioningBody}
                </p>
              </div>
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span className="eyebrow">
                  WHAT WE&apos;LL WALK THROUGH LIVE ({WALKTHROUGH_STEPS.length} FOCUSED STEPS)
                </span>
                <span className="mono" style={{ fontSize: "0.66rem", color: "var(--text-dim)" }}>
                  CLICK ANY CHAPTER TO JUMP
                </span>
              </div>
              <div className="tour-chapter-preview-grid">
                {WALKTHROUGH_CHAPTER_PREVIEWS.map((chapter) => (
                  <button
                    key={chapter.id}
                    type="button"
                    className="tour-chapter-preview-tile"
                    onClick={() => onChangeStep(chapter.stepIndex)}
                  >
                    <span className="mono tour-preview-tag">{chapter.tag}</span>
                    <strong className="tour-preview-title">{chapter.title}</strong>
                    <span className="tour-preview-summary">{chapter.summary}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="tour-progress-track" aria-hidden="true">
              <div
                className="tour-progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="tour-card-footer">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={onSkip}
                  data-testid="tour-skip-btn"
                >
                  Skip Tour
                </button>
                <span className="tour-kbd-hint mono">
                  ← / → navigate · Esc close
                </span>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => onChangeStep(1)}
                data-testid="tour-start-btn"
              >
                {step.ctaLabel ?? "Start Guided Walkthrough"} →
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Steps 2–21: Compact Wide Single-Concept Callout Card (Strict Zero Overlap) */
        <div
          ref={cardRef}
          className={`tour-callout-card ${cardPos ? `placement-${cardPos.placement}` : ""}`}
          style={
            cardPos
              ? {
                  top: cardPos.top,
                  left: cardPos.left,
                  width: cardPos.width,
                }
              : {
                  top: Math.max(VIEWPORT_MARGIN, Math.round(viewport.h / 2 - 105)),
                  left: Math.max(VIEWPORT_MARGIN, Math.round(viewport.w / 2 - 300)),
                  width: Math.min(DEFAULT_HORIZONTAL_CARD_WIDTH, viewport.w - VIEWPORT_MARGIN * 2),
                }
          }
          data-testid="tour-callout-card"
        >
          {cardPos?.showArrow && (
            <span
              className="tour-callout-arrow"
              style={
                cardPos.placement === "top" || cardPos.placement === "bottom"
                  ? { left: cardPos.arrowOffset }
                  : { top: cardPos.arrowOffset }
              }
              aria-hidden="true"
            />
          )}

          <div className="tour-callout-inner">
            <div className="tour-card-header">
              <span className="tour-chapter-badge mono">{step.chapter}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="tour-step-counter mono" data-testid="tour-step-counter">
                  STEP {safeIndex + 1} OF {WALKTHROUGH_STEPS.length}
                </span>
                <button
                  type="button"
                  className="tour-close-icon-btn"
                  onClick={onSkip}
                  aria-label="Skip walkthrough tour"
                  data-testid="tour-close-btn"
                >
                  ×
                </button>
              </div>
            </div>

            <h3 className="tour-callout-title">{step.title}</h3>
            <p className="tour-callout-summary">{step.summary}</p>

            {step.takeaway && (
              <div className="tour-takeaway-pill">
                <span className="tour-highlight-dot" aria-hidden="true" />
                <span>
                  <strong className="tour-highlight-label">{step.takeaway.label}:</strong>{" "}
                  <span className="tour-highlight-detail">{step.takeaway.detail}</span>
                </span>
              </div>
            )}

            {/* Clean Chapter Jump Pills + Smooth Step Progress Bar */}
            <div className="tour-progress-wrap">
              <div
                className="tour-chapter-pills"
                role="navigation"
                aria-label="Jump to tour chapter"
              >
                {WALKTHROUGH_CHAPTERS.map((ch) => {
                  const isCurrent = ch.id === step.chapterId;
                  const isPassed = ch.firstStepIndex < safeIndex && !isCurrent;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      className={`tour-chapter-pill mono ${isCurrent ? "active" : isPassed ? "done" : ""}`}
                      onClick={() => onChangeStep(ch.firstStepIndex)}
                      title={`Jump to ${ch.shortLabel} (Step ${ch.firstStepIndex + 1})`}
                      data-testid={`tour-chapter-${ch.id}`}
                    >
                      {ch.shortLabel}
                    </button>
                  );
                })}
              </div>
              <div className="tour-progress-track" aria-hidden="true">
                <div
                  className="tour-progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="tour-card-footer">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  className="btn tour-btn-sm"
                  onClick={onSkip}
                  data-testid="tour-skip-btn"
                >
                  Skip
                </button>
                <span className="tour-kbd-hint mono">← / → · Esc</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  className="btn tour-btn-sm"
                  onClick={() => onChangeStep(safeIndex - 1)}
                  disabled={isFirst}
                  data-testid="tour-back-btn"
                >
                  ← Back
                </button>
                {isLast ? (
                  <button
                    type="button"
                    className="btn btn-nominal tour-btn-sm"
                    onClick={onComplete}
                    data-testid="tour-finish-btn"
                  >
                    {step.ctaLabel ?? "Finish & Launch"} ✓
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary tour-btn-sm"
                    onClick={() => onChangeStep(safeIndex + 1)}
                    data-testid="tour-next-btn"
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
