import type { Metadata } from "next";

import { Brand } from "@/components/Brand";

export const metadata: Metadata = {
  title: "Vintage Fork Tea Mobile App",
  description:
    "The official Vintage Fork Tea mobile home for Tea Lab, Tea Cellar, tasting notes, brewing tools and Gold Leaves.",
};

export default function MobileAppPage() {
  return (
    <main className="guest-shell" id="main-content">
      <div className="guest-pane">
        <Brand href="https://vintagefork.ca/" />
        <div style={{ margin: "2rem 0", textAlign: "center" }}>
          <p className="eyebrow">Official Vintage Fork Tea application</p>
          <h1 className="page-title">Vintage Fork Tea</h1>
          <p className="page-lede">
            Vintage Fork Tea is the official Vintage Fork Tea Company mobile
            application. It connects customers with Tea Lab tasting sessions,
            their private Tea Cellar and Journal, brewing tools, live events,
            the tea shop and one shared Gold Leaves balance.
          </p>
        </div>

        <section className="card stack" aria-labelledby="app-purpose">
          <h2 className="card-title" id="app-purpose">What Vintage Fork Tea does</h2>
          <p>
            Record tasting notes, save teas, revisit your tasting history,
            explore tea origins, run brewing timers and move securely between
            Vintage Fork&apos;s mobile and web experiences.
          </p>
          <p>
            Existing vintagefork.ca customers keep their current website
            account. The app also supports secure Apple, Google and email-link
            sign-in while keeping one customer profile.
          </p>
        </section>

        <section className="card stack" aria-labelledby="account-privacy">
          <h2 className="card-title" id="account-privacy">Account and privacy</h2>
          <p>
            Tasting notes and Tea Cellar information are private to the signed-in
            customer. Vintage Fork never asks customers to send their password
            outside the protected vintagefork.ca sign-in page.
          </p>
          <div className="guest-actions">
            <a className="btn btn-primary" href="https://vintagefork.ca/">
              Visit Vintage Fork Tea
            </a>
            <a className="btn btn-secondary" href="https://vintagefork.ca/privacy-policy/">
              Privacy policy
            </a>
            <a className="btn btn-secondary" href="https://vintagefork.ca/terms-conditions/">
              Terms of service
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
