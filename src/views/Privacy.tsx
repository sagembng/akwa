export default function Privacy() {
  return (
    <article className="wrap privacy">
      <h1>Privacy notice</h1>
      <p className="muted privacy-updated">Last updated November 8, 2026</p>

      <h2>What we collect</h2>
      <ul>
        <li>Your name, email address and mobile number when you register.</li>
        <li>Your delivery address and notes when you place an order.</li>
        <li>Your orders, their status history, and the mock payment method you picked.</li>
      </ul>

      <h2>What it does not collect</h2>
      <ul>
        <li>Full card numbers. The payment step accepts only test cards, and just the last 4 digits reach the server.</li>
        <li>Your password in readable form. Only a salted hash is stored.</li>
        <li>Your device location.</li>
      </ul>

      <h2>Why it is used</h2>
      <p>To run the service: logging you in, showing your orders, and letting admins update them. Nothing is sold or shared for marketing.</p>

      <h2>Where it is kept</h2>
      <p>Data is stored in a Postgres database. If you try a hosted version, that database runs on Neon.</p>

      <h2>Other services</h2>
      <p>Maps and directions come from Google Maps, and fonts come from Google Fonts. Your browser connects to Google to load them, and Google's own privacy policy applies.</p>

      <h2>Cookies</h2>
      <p>One cookie keeps you logged in for up to 14 days. There are no advertising or tracking cookies.</p>

      <h2>How long it is kept</h2>
      <p>The project owner may reset the database and delete all data at any time.</p>

      <h2>Your rights</h2>
      <p>The Philippine Data Privacy Act of 2012 (Republic Act No. 10173) gives people rights over their personal data, including access, correction and deletion. To ask about data you entered here, contact the owner of this portfolio project.</p>

      <p className="privacy-back">
        <a className="text-link" href="#/">
          Back to Akwa
        </a>
      </p>
    </article>
  );
}
