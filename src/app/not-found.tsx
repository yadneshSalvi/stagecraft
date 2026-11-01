import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="route-loading">
      <p className="mono">404</p>
      <h1>This page isn’t in the script.</h1>
      <Link className="button button-primary" href="/productions">
        My productions
      </Link>
    </main>
  );
}
