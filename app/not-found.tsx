import Link from "next/link";

export default function NotFound() {
  return (
    <div className="content-page narrow">
      <p className="eyebrow">Not found</p>
      <h1>That campground is not available.</h1>
      <p>It may be inactive or the address may have changed.</p>
      <Link className="button primary" href="/">
        Return to the map
      </Link>
    </div>
  );
}
