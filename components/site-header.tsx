import Link from "next/link";
import { MosquitoIcon } from "./mosquito-icon";

export function SiteHeader({ appName }: { appName: string }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label={`${appName} home`}>
        <span className="brand-mark">
          <MosquitoIcon />
        </span>
        <span>{appName}</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/about">How it works</Link>
        <Link href="/dashboard">My reports</Link>
        <Link className="nav-action" href="/sign-in">
          Sign in
        </Link>
      </nav>
    </header>
  );
}
