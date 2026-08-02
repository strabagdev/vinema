"use client";

import type { SVGProps } from "react";
import { useEffect, useRef, useState } from "react";
import { brandTokens } from "@/brand/tokens/brand-tokens";
import { cn } from "@/lib/cn";

type IntroState = "running" | "settled";

type BrandIntroProps = SVGProps<SVGSVGElement> & {
  decorative?: boolean;
  label?: string;
};

export function BrandIntro({
  decorative = false,
  label = "Vinema",
  className,
  ...props
}: BrandIntroProps) {
  const initializedRef = useRef(false);
  const [state, setState] = useState<IntroState>(() =>
    prefersReducedMotion() ? "settled" : "running",
  );

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;

    const timer = window.setTimeout(() => {
      setState("settled");
    }, brandTokens.brandIntroDuration);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <svg
      viewBox="0 0 330 80"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : label}
      className={cn("brand-spatial-identity h-auto w-32 text-current", className)}
      data-brand-intro=""
      data-brand-intro-state={state}
      data-brand-spatial-identity=""
      data-brand-wordmark=""
      {...props}
    >
      {decorative ? null : <title>{label}</title>}
      <path
        d="M10 10L24 70L38 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
        data-brand-letter="V"
        data-brand-spatial-letter="V"
      />
      <g data-brand-inner-letters="">
        <path
          d="M64 10V70"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          vectorEffect="non-scaling-stroke"
          data-brand-letter="I"
        />
        <path
          d="M91 70V10L125 70V10"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          vectorEffect="non-scaling-stroke"
          data-brand-letter="N"
        />
        <path
          d="M158 10H190M158 40H184M158 70H190M158 10V70"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          vectorEffect="non-scaling-stroke"
          data-brand-letter="E"
        />
        <path
          d="M212 70V10L230 48L248 10V70"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          vectorEffect="non-scaling-stroke"
          data-brand-letter="M"
        />
      </g>
      <path
        d="M282 70L296 10L310 70"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
        data-brand-letter="A"
        data-brand-spatial-letter="A"
      />
      <g data-brand-monogram="" data-brand-spatial-final="" />
    </svg>
  );
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
