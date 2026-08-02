import type { SVGProps } from "react";
import { brandGeometry } from "@/brand/tokens/brand-tokens";
import { cn } from "@/lib/cn";

type BrandSvgProps = SVGProps<SVGSVGElement> & {
  decorative?: boolean;
  label?: string;
};

export function BrandWordmark({
  decorative = false,
  label = "Vinema",
  className,
  ...props
}: BrandSvgProps) {
  return (
    <svg
      viewBox={brandGeometry.wordmarkViewBox}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : label}
      className={cn("h-auto w-28 text-current", className)}
      data-brand-wordmark=""
      {...props}
    >
      {decorative ? null : <title>{label}</title>}
      <BrandStrokePath d={brandGeometry.vPath} data-brand-letter="V" />
      <BrandStrokePath d={brandGeometry.iPath} data-brand-letter="I" />
      <BrandStrokePath d={brandGeometry.nPath} data-brand-letter="N" />
      <BrandStrokePath d={brandGeometry.ePath} data-brand-letter="E" />
      <BrandStrokePath d={brandGeometry.mPath} data-brand-letter="M" />
      <BrandStrokePath d={brandGeometry.aPath} data-brand-letter="A" />
    </svg>
  );
}

export function BrandMonogram({
  decorative = false,
  label = "Vinema",
  className,
  ...props
}: BrandSvgProps) {
  return (
    <svg
      viewBox={brandGeometry.monogramViewBox}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : label}
      className={cn("h-auto w-7 text-current", className)}
      data-brand-monogram=""
      {...props}
    >
      {decorative ? null : <title>{label}</title>}
      <BrandStrokePath d={brandGeometry.monogramVPath} data-brand-letter="V" />
      <BrandStrokePath d={brandGeometry.monogramAPath} data-brand-letter="A" />
    </svg>
  );
}

export function BrandLockup({
  decorative = false,
  label = "Vinema",
  className,
  ...props
}: BrandSvgProps) {
  return (
    <svg
      viewBox={brandGeometry.lockupViewBox}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : label}
      className={cn("h-auto w-40 text-current", className)}
      data-brand-lockup=""
      {...props}
    >
      {decorative ? null : <title>{label}</title>}
      <g data-brand-lockup-monogram="">
        <BrandStrokePath d={brandGeometry.monogramVPath} data-brand-letter="V" />
        <BrandStrokePath d={brandGeometry.monogramAPath} data-brand-letter="A" />
      </g>
      <g transform="translate(106 0)" data-brand-lockup-wordmark="">
        <BrandStrokePath d={brandGeometry.vPath} data-brand-letter="V" />
        <BrandStrokePath d={brandGeometry.iPath} data-brand-letter="I" />
        <BrandStrokePath d={brandGeometry.nPath} data-brand-letter="N" />
        <BrandStrokePath d={brandGeometry.ePath} data-brand-letter="E" />
        <BrandStrokePath d={brandGeometry.mPath} data-brand-letter="M" />
        <BrandStrokePath d={brandGeometry.aPath} data-brand-letter="A" />
      </g>
    </svg>
  );
}

export function BrandIcon({
  decorative = false,
  label = "Vinema",
  className,
  ...props
}: BrandSvgProps) {
  return (
    <svg
      viewBox={brandGeometry.iconViewBox}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : label}
      className={cn("h-auto w-8 text-current", className)}
      data-brand-icon=""
      {...props}
    >
      {decorative ? null : <title>{label}</title>}
      <BrandStrokePath d={brandGeometry.iconVPath} data-brand-letter="V" />
      <BrandStrokePath d={brandGeometry.iconAPath} data-brand-letter="A" />
    </svg>
  );
}

function BrandStrokePath({
  d,
  ...props
}: SVGProps<SVGPathElement> & { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={brandGeometry.strokeWidth}
      strokeLinecap={brandGeometry.lineCap}
      strokeLinejoin={brandGeometry.lineJoin}
      vectorEffect="non-scaling-stroke"
      {...props}
    />
  );
}
