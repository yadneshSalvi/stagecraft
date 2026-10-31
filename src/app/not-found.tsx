import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="route-loading">
      <p className="eyebrow">OFF STAGE / 404</p>
      <h1>This page isn’t in the script.</h1>
      <p>Return to your production workspace to pick up the story.</p>
      <Link className="button button-primary" href="/productions">
        My productions
      </Link>
    </main>
  );
}
