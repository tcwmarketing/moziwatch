"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";

export function useCampgroundPrefetch() {
  const router = useRouter();

  return useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router],
  );
}

export function CampgroundPrefetchLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const prefetch = useCampgroundPrefetch();
  const preload = () => prefetch(href);

  return (
    <Link
      className={className}
      href={href}
      prefetch={false}
      onMouseEnter={preload}
      onFocus={preload}
      onTouchStart={preload}
    >
      {children}
    </Link>
  );
}
