import { requireOwnerPage } from "../../../lib/server/auth";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  await requireOwnerPage();

  return (
    <main className="page-stack">
      <div>
        <p className="eyebrow">Your information, your call</p>
        <h1>Privacy and data</h1>
        <p>Download a copy of your Sochle information or remove it permanently.</p>
      </div>

      <section className="privacy-section">
        <div>
          <h2>Download your information</h2>
          <p>Get your settings, purchase checks, decisions, and audit history as JSON.</p>
        </div>
        <a className="button-link" download href="/api/export">
          Download my data
        </a>
      </section>

      <section className="privacy-section danger-zone">
        <div>
          <h2>Delete everything</h2>
          <p>This permanently removes your local Sochle data and signs you out.</p>
        </div>
        <form action="/api/delete" className="stack" method="post">
          <label>
            Type DELETE to confirm
            <input autoComplete="off" name="confirmation" required />
          </label>
          <button className="danger" type="submit">
            Delete my Sochle data
          </button>
        </form>
      </section>
    </main>
  );
}
