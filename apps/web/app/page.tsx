import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <p className="eyebrow">Private financial decision engine</p>
      <h1>सोचle.</h1>
      <p>
        A private financial decision engine for the moment before you buy. Sochle calculates; AI
        only explains.
      </p>
      <p>
        <Link className="button-link" href="/connections">
          Set up financial data
        </Link>
      </p>
    </main>
  );
}
