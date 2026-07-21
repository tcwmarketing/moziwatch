"use client";

import Link from "next/link";
import Image from "next/image";
import { authClient } from "@/lib/auth-client";

export function SiteHeader({ appName }: { appName: string }) {
  const { data: session } = authClient.useSession();
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label={`${appName} home`}>
        <span className="brand-logo-crop" aria-hidden="true">
          <Image
            src="/moziwatch-logo-tbg.png"
            alt=""
            width={890}
            height={890}
            sizes="48px"
            priority
            unoptimized
          />
        </span>
        <span className="brand-name">{appName}</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/">Map</Link>
        <Link href="/campgrounds">Campgrounds</Link>
        <Link href="/products">Products</Link>
        <Link
          className="nav-action"
          href={session?.user ? "/dashboard" : "/sign-in"}
        >
          {session?.user ? "Profile" : "Sign in"}
        </Link>
      </nav>
    </header>
  );
}
