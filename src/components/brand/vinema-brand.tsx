import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

type VinemaBrandAsset = "monogram" | "wordmark" | "lockup";

const BRAND_ASSETS = {
  monogram: "/brand/vinema-monogram.svg",
  wordmark: "/brand/vinema-wordmark.svg",
  lockup: "/brand/vinema-lockup.svg",
} satisfies Record<VinemaBrandAsset, string>;

export function VinemaBrandMark({
  asset,
  className,
  decorative = false,
}: {
  asset: VinemaBrandAsset;
  className?: string;
  decorative?: boolean;
}) {
  const style = {
    "--vinema-brand-src": `url("${BRAND_ASSETS[asset]}")`,
  } as CSSProperties;

  return (
    <span
      className={cn(
        "inline-block shrink-0 bg-current [mask-image:var(--vinema-brand-src)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] [-webkit-mask-image:var(--vinema-brand-src)] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain]",
        className,
      )}
      style={style}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : "Vinema"}
      title={decorative ? undefined : "Vinema"}
      data-vinema-brand={asset}
    />
  );
}
