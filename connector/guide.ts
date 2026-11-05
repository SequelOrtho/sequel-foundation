import { DEFAULT_LIFETIMES, lifetimeDays } from "./config";
import { companyAccountLabel } from "./ended-reasons";

// The plain-language "Connect Claude" guide, for users only, as one
// stand-alone HTML file a hub serves or emails: its own head, a light
// palette, print rules, nothing fetched, and one outside link (claude.ai).
// The hub fills in its names; the lifetimes come from the connector's own
// settings so the guide can't promise a limit the hub doesn't have.

export type ConnectorGuideOptions = {
  /** "Sequel Project Hub": the hub's full name, as the page and the footer say it. */
  hubName: string;
  /** The connector's name in Claude's Connectors list. Default: `hubName`. */
  connectorName?: string;
  /** The company named on the consent page's checkbox ("Sequel Ortho"). */
  company: string;
  /** Who people ask ("System Administrator"). */
  adminLabel: string;
  /** "@sequelortho.com, @fvortho.com or @orthonebraska.com". Optional. */
  workEmailDomains?: string;
  /** Example questions, as the person would type them. */
  examples?: readonly string[];
  /** Where the person sees and ends connections ("Notifications, then Claude Connections"). */
  connectionsPlace?: string;
  /** The footer's date line ("November 2026"). */
  dateLine?: string;
  refreshIdleMs?: number;
  grantMaxMs?: number;
};

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function connectorGuideHtml(o: ConnectorGuideOptions): string {
  const hub = esc(o.hubName);
  const connector = esc(o.connectorName ?? o.hubName);
  const admin = esc(o.adminLabel);
  const idle = lifetimeDays(o.refreshIdleMs ?? DEFAULT_LIFETIMES.refreshIdleMs);
  const max = lifetimeDays(o.grantMaxMs ?? DEFAULT_LIFETIMES.grantMaxMs);
  const label = esc(companyAccountLabel(o.company));
  const domains = o.workEmailDomains ? ` (${esc(o.workEmailDomains)})` : "";
  const examples = (o.examples ?? []).map((e) => `        <li>"${esc(e)}"</li>`).join("\n");
  const connections = o.connectionsPlace
    ? `\n      <tr><td>You want to see or end your connections</td><td>In the Hub, open ${esc(o.connectionsPlace)}. Click <span class="click">End Connection</span> on any you don't want.</td></tr>`
    : "";
  const footer = [hub, "Claude connector guide", o.dateLine ? esc(o.dateLine) : null].filter(Boolean).join(" · ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect Claude to ${hub}</title>
<style>
  :root {
    --navy: #1b365d;
    --blue: #006a9c;
    --ink: #1f2933;
    --muted: #52606d;
    --line: #d9e2ec;
    --soft: #f0f6fa;
    --warn: #fff7e6;
    --warn-line: #f0b429;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #ffffff;
    color: var(--ink);
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 17px;
    line-height: 1.55;
  }
  main { max-width: 760px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { color: var(--navy); font-size: 30px; line-height: 1.2; margin: 0 0 8px; }
  h2 { color: var(--navy); font-size: 22px; margin: 40px 0 12px; padding-top: 16px; border-top: 2px solid var(--line); }
  p { margin: 0 0 12px; }
  a { color: var(--blue); }
  .lead { color: var(--muted); font-size: 18px; }
  .box { background: var(--soft); border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; margin: 16px 0; }
  .warn { background: var(--warn); border-color: var(--warn-line); }
  .box p:last-child, .box ul:last-child { margin-bottom: 0; }
  ol.steps { list-style: none; counter-reset: step; padding: 0; margin: 16px 0; }
  ol.steps > li { counter-increment: step; position: relative; padding: 4px 0 18px 56px; break-inside: avoid; }
  ol.steps > li::before {
    content: counter(step);
    position: absolute; left: 0; top: 0;
    width: 38px; height: 38px; border-radius: 50%;
    background: var(--navy); color: #ffffff;
    font-weight: 700; font-size: 18px;
    display: flex; align-items: center; justify-content: center;
  }
  ol.steps > li strong.what { display: block; font-size: 18px; color: var(--navy); margin-bottom: 2px; }
  .click { display: inline-block; border: 1px solid #9fb3c8; border-radius: 6px; padding: 0 7px; background: #ffffff; font-weight: 600; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 16px; }
  th, td { text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); padding: 10px 8px; }
  th { color: var(--navy); background: var(--soft); }
  ul { padding-left: 22px; margin: 0 0 12px; }
  .small { color: var(--muted); font-size: 15px; }
  @media print {
    body { font-size: 12pt; }
    main { max-width: none; padding: 0; }
    h2 { break-after: avoid; }
    .box, table, tr { break-inside: avoid; }
  }
</style>
</head>
<body>
<main>
  <h1>Connect Claude to ${hub}</h1>
  <p class="lead">Ask Claude about what you see in the Hub, in plain English. It takes about two minutes, and you only do it once.</p>

  <div class="box">
    <p><strong>Before you start, you need:</strong></p>
    <ul>
      <li>Your <strong>company Claude account</strong>: Claude signed in with your work email${domains}. Don't use a personal Claude account.</li>
      <li>Access to ${hub}. If you can open the Hub, you're set.</li>
    </ul>
  </div>

  <h2>Connect (once)</h2>
  <ol class="steps">
    <li>
      <strong class="what">Open Claude</strong>
      Go to <a href="https://claude.ai">claude.ai</a> or open the Claude desktop app. Make sure you're signed in with your work email.
    </li>
    <li>
      <strong class="what">Open Connectors</strong>
      Click <span class="click">Customize</span>, then <span class="click">Connectors</span>.
    </li>
    <li>
      <strong class="what">Find the Hub and click Connect</strong>
      Look for <strong>${connector}</strong> in the list and click <span class="click">Connect</span>.
    </li>
    <li>
      <strong class="what">Allow it in the Hub</strong>
      A Hub page called <strong>Connect Claude to the Hub</strong> opens. Sign in with Microsoft if it asks. Then:
      <ul>
        <li>Check the page shows <strong>your</strong> email.</li>
        <li>If you have more than one Hub role, choose the one Claude should use.</li>
        <li>Tick <strong>"${label}"</strong></li>
        <li>Click <span class="click">Allow</span>.</li>
      </ul>
      <div class="box warn">
        <p><strong>Only click Allow if you clicked Connect yourself just now.</strong> If someone sent you a link to this page, click <span class="click">Don't Allow</span>. Allowing it would let their Claude read the Hub as you.</p>
      </div>
    </li>
    <li>
      <strong class="what">You're done</strong>
      You're back in Claude. The Hub sends you an email confirming Claude was connected.
    </li>
  </ol>

  <h2>Use it</h2>
  <ol class="steps">
    <li>
      <strong class="what">Turn the Hub on in a chat</strong>
      In a new chat, click <span class="click">+</span> at the lower left, choose <span class="click">Connectors</span>, and switch on <strong>${connector}</strong>.
    </li>
    <li>
      <strong class="what">Ask a question</strong>${examples ? `\n      For example:\n      <ul>\n${examples}\n      </ul>` : "\n      Ask about anything your Hub pages show you."}
    </li>
  </ol>
  <div class="box">
    <p><strong>Good to know</strong></p>
    <ul>
      <li>Claude sees only what your Hub pages show you, and it <strong>can't change anything</strong> in the Hub.</li>
      <li>Answers stay in your Claude chats. They can include text people typed into the Hub, so treat them like the Hub itself.</li>
      <li>The connection ends after ${idle} days without use, and always ${max} days after you allow it. When it ends, Claude asks you to connect again: repeat steps 2 to 4.</li>
    </ul>
  </div>

  <h2>If something goes wrong</h2>
  <table>
    <thead><tr><th>What you see</th><th>What to do</th></tr></thead>
    <tbody>
      <tr><td>You don't see <strong>${connector}</strong> under Connectors</td><td>Ask the Hub ${admin}.</td></tr>
      <tr><td>"You don't have a role in the Hub"</td><td>Ask the Hub ${admin} to give you a role, then connect again.</td></tr>
      <tr><td>"Your sign-in isn't allowed to use the Hub"</td><td>You signed in with a non-company account. Sign out of Microsoft, sign in with your work email, and connect again.</td></tr>
      <tr><td>The Hub page shows someone else's email, or you didn't click Connect</td><td>Click <span class="click">Don't Allow</span> and tell the Hub ${admin}.</td></tr>
      <tr><td>Claude says the connection ended or asks you to reconnect</td><td>Usually it just reached its ${idle}-day or ${max}-day limit: connect again (steps 2 to 4). If an administrator or a change to your Hub role ended it, the Hub emails you the reason.</td></tr>
      <tr><td>The Hub page says it can't be found</td><td>Claude connections may be switched off for now. Ask the Hub ${admin}.</td></tr>${connections}
    </tbody>
  </table>

  <p class="small">${footer}</p>
</main>
</body>
</html>
`;
}
