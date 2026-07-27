"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function LegacyRouteRedirect({
  heading,
  message,
}: {
  heading: string;
  message: string;
}) {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full rounded-lg border border-zinc-200 bg-white p-6">
        <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
          {heading}
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">{message}</p>
        <Button asChild className="mt-5">
          <Link href="/">Ir a Inicio</Link>
        </Button>
      </div>
    </section>
  );
}
