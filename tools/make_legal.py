#!/usr/bin/env python3
"""Generate the legal pages and keep every footer pointing at them.

These are written as one script rather than four hand-maintained HTML files so
the shell (head, nav, footer, "last updated") can never drift between them —
a privacy policy that disagrees with the terms page about who the controller is
is worse than having neither.

    python3 tools/make_legal.py
"""

import os
import re
import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))

SITE = "https://viridite.aaronworld.uk"
UPDATED = datetime.date(2026, 8, 4).strftime("%-d %B %Y")

NAV = [
    ("/", "Home"),
    ("compatibility", "Compatibility"),
    ("roadmap", "Roadmap"),
    ("credits", "Credits"),
    ("docs", "Docs"),
]


def shell(slug, title, description, body):
    nav = "\n".join(
        f'      <a href="{href}">{label}</a>' for href, label in NAV
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<title>{title} — Viridite</title>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{description}">
<meta property="og:title" content="Viridite — {title}">
<meta property="og:description" content="{description}">
<meta property="og:type" content="website">
<link rel="canonical" href="{SITE}/{slug}">
<link rel="icon" type="image/png" sizes="32x32" href="assets/img/favicon-32.png">
<link rel="icon" type="image/svg+xml" href="assets/img/logo.svg">
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">
<link rel="stylesheet" href="assets/style.css?v=10">
<style>
  .legal h2 {{ margin-top: 2.2rem; }}
  .legal h3 {{ margin-top: 1.4rem; font-size: var(--fs-lg); }}
  .legal li {{ margin: .35rem 0; }}
  .legal .updated {{ color: var(--muted); font-size: var(--fs-sm); }}
  .legal .callout {{
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    border-radius: var(--radius-md);
    background: var(--surface);
    padding: 1rem 1.1rem;
    margin: 1.4rem 0;
  }}
  .legal dt {{ font-weight: 600; margin-top: .9rem; }}
  .legal dd {{ margin: .2rem 0 0 0; color: var(--muted); }}
</style>
</head>
<body>
<header class="site">
  <div class="wrap bar">
    <img class="logo" src="assets/img/logo-64.png" alt="" width="32" height="32">
    <span class="brand">Virid<span>ite</span></span>
    <button type="button" class="nav-toggle" id="nav-toggle" aria-controls="nav-menu" aria-label="Toggle navigation" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
    </button>
    <nav class="site" id="nav-menu" aria-label="Main">
{nav}
      <a href="https://github.com/Viridite">GitHub</a>
      <a class="cta" href="download">Download</a>
    </nav>
  </div>
</header>

<main>
  <div class="wrap legal">
{body}
  </div>
</main>

{FOOTER}

<script>
(function () {{
  var toggle = document.getElementById("nav-toggle");
  var menu = document.getElementById("nav-menu");
  if (!toggle || !menu) return;
  toggle.addEventListener("click", function () {{
    var open = menu.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }});
}})();
</script>
</body>
</html>
"""


FOOTER = """<footer class="site">
  <div class="wrap">
    Made by <a href="https://aaronworld.uk">aaronworld.uk</a>, mostly written by Claude AI
    <span class="dot">·</span><a href="https://discord.gg/EXpgrAJh">Discord<span id="discord-count"></span></a>
    <span class="dot">·</span><a href="https://github.com/Viridite">GitHub org</a>
    <span class="dot">·</span><a href="https://github.com/Viridite/Viridite/blob/main/LICENSE">License</a>
    <span class="dot">·</span><a href="legal">Legal</a>
    <span class="dot">·</span><a href="privacy">Privacy</a>
    <span class="dot">·</span><a href="terms">Terms</a>
  </div>
</footer>"""


# ── page bodies ─────────────────────────────────────────────────────────────

LEGAL = f"""
    <div class="hero compact">
      <h1 style="font-size:var(--fs-3xl)">Legal</h1>
      <p class="tagline">What Viridite is, what it is not, and where you stand.</p>
      <p class="updated">Last updated {UPDATED}</p>
    </div>

    <section>
      <div class="callout">
        <strong>The short version.</strong> Viridite is free, open-source software that runs
        Android games you already have on a Nintendo Switch you already own. It ships no games,
        no game assets, and no Nintendo code. It collects nothing about you unless you choose
        to send a compatibility report, and those reports are published in public.
      </div>

      <h2>Documents</h2>
      <ul>
        <li><a href="privacy">Privacy Policy</a> — what is collected, what is published, and your rights under GDPR, UK GDPR, CCPA/CPRA and other regimes.</li>
        <li><a href="terms">Terms of Use</a> — the licence, the warranty position, and the risks of running homebrew.</li>
        <li><a href="dmca">Copyright &amp; Takedown</a> — how to report infringing material, and how to counter a report.</li>
        <li><a href="https://github.com/Viridite/Viridite/blob/main/LICENSE">Software licence</a> — the licence the code itself is released under.</li>
      </ul>

      <h2>No affiliation</h2>
      <p>
        Viridite is an independent project. It is not affiliated with, endorsed by, sponsored by
        or connected to Nintendo Co., Ltd., Google LLC, or any game developer or publisher whose
        software may run on it.
      </p>
      <p>
        <em>Nintendo</em>, <em>Nintendo Switch</em>, <em>Joy-Con</em> and <em>HOME</em> are
        trademarks of Nintendo. <em>Android</em>, <em>Google Play</em> and related marks are
        trademarks of Google LLC. All other trademarks, product names, game titles, logos and
        icons are the property of their respective owners and are used here only to identify the
        software concerned — nominative fair use. No trademark owner has endorsed this project.
      </p>

      <h2>What Viridite does not distribute</h2>
      <p>
        Viridite contains no game code, no game assets and no copyrighted material belonging to
        any third party. It does not download, host, mirror, index or link to pirated software.
        The compatibility list is a record of whether a given game <em>works</em>, not an offer to
        supply it.
      </p>
      <p>
        To play a game with Viridite you supply the APK yourself, from a copy you have lawfully
        obtained. See <a href="docs#adding-a-game">adding a game</a>. Whether a particular game's
        licence permits you to run it this way is between you and that game's publisher; Viridite
        cannot and does not grant you any rights in someone else's software.
      </p>

      <h2>Console modification</h2>
      <p>
        Running homebrew requires a modified console. Doing so can void your warranty, can result
        in Nintendo restricting or banning your console or account from online services, and can
        in some circumstances render a console unusable. Those consequences are yours. See the
        <a href="terms">Terms of Use</a>.
      </p>
      <p>
        The legality of modifying hardware you own varies by country, as does the scope of any
        exception for interoperability or personal backups. Nothing here is legal advice. If you
        are unsure whether what you intend to do is lawful where you live, take advice before
        doing it.
      </p>

      <h2>Contact</h2>
      <p>
        For anything legal — privacy requests, takedown notices, or questions about this page —
        open an issue at <a href="https://github.com/Viridite/Viridite/issues">github.com/Viridite/Viridite/issues</a>,
        or email <a href="mailto:legal@aaronworld.uk">legal@aaronworld.uk</a>. Requests are handled
        by the project maintainers; there is no legal department.
      </p>
    </section>
"""

PRIVACY = f"""
    <div class="hero compact">
      <h1 style="font-size:var(--fs-3xl)">Privacy Policy</h1>
      <p class="tagline">Short, because there is very little to say.</p>
      <p class="updated">Last updated {UPDATED}</p>
    </div>

    <section>
      <div class="callout">
        <strong>In one paragraph.</strong> This website sets no cookies, runs no analytics, and
        loads no third-party scripts. The Viridite software on your console sends nothing
        anywhere. The only personal data the project ever receives is what you deliberately type
        into the compatibility report form — and everything submitted through that form is
        <strong>published publicly</strong> on GitHub. Do not put anything in it you would not
        post in public.
      </div>

      <h2>Who is responsible</h2>
      <p>
        The data controller is the Viridite project, an open-source project maintained by
        volunteers and operated from the United Kingdom. Contact:
        <a href="mailto:legal@aaronworld.uk">legal@aaronworld.uk</a>, or
        <a href="https://github.com/Viridite/Viridite/issues">an issue on GitHub</a>. The project
        is below the threshold at which a statutory Data Protection Officer is required, and has
        not appointed one.
      </p>

      <h2>The website</h2>
      <p>
        No cookies are set. No local storage or session storage is used to track you. There is no
        analytics package, no tag manager, no advertising, no social embeds, and no fonts or
        scripts fetched from third-party servers.
      </p>
      <p>
        The site is served by a hosting provider (Vercel) and some requests pass through
        Cloudflare. Like any web host, these process your IP address and request metadata in order
        to deliver the page and to protect against abuse. That processing is theirs, under their
        own policies; the project does not receive, store or have access to those server logs.
      </p>

      <h2>The software</h2>
      <p>
        Viridite running on your console does not phone home. It has no telemetry, no crash
        reporting, no update check that identifies you, and no account system. Logs it writes
        (<code>compat_log.txt</code>, <code>launcher_log.txt</code>) stay on your SD card until
        you choose to do something with them.
      </p>
      <p>
        Games run through Viridite are a separate matter. A game may contain its own analytics,
        advertising or network code, and if your console is online that code may run. Viridite
        does not add that, cannot fully prevent it, and has no visibility into what a given game
        sends. Its network activity is logged locally so you can see it.
      </p>

      <h2>Compatibility reports</h2>
      <p>If you submit a report through <a href="submit">the form</a>, it collects:</p>
      <ul>
        <li>the game you tested and the source you obtained it from;</li>
        <li>your description of what happened and any notes you add;</li>
        <li>the log files you choose to attach;</li>
        <li>your GitHub username, if you supply one — this is optional and used only for credit.</li>
      </ul>
      <p>
        The logs contain the Viridite version, your console's firmware and Atmosphère versions,
        the game's package name, file paths on your SD card, performance measurements and a trace
        of the calls the game made. They do not contain your Nintendo account, your console's
        serial number, your network details or your profile name. They may contain in-game values
        such as save-file keys. <strong>Read a log before you attach it.</strong>
      </p>

      <h3>Where it goes</h3>
      <p>
        Submissions are written to the public
        <a href="https://github.com/Viridite/compat-reports">compat-reports</a> repository on
        GitHub. They are public from the moment they are accepted, are indexed by search engines,
        and are copied by GitHub's own forking and archiving. Publication is the entire purpose of
        the form: the compatibility list is built from it.
      </p>

      <h3>Legal basis and retention</h3>
      <p>
        Where UK/EU data protection law applies, the basis for processing a report is your
        consent (Article 6(1)(a)), given by submitting the form, together with the project's
        legitimate interest in maintaining a public compatibility record (Article 6(1)(f)). No
        special-category data is sought and none should be submitted.
      </p>
      <p>
        Reports are kept indefinitely, because a compatibility record is only useful as a history.
        You can ask for yours to be removed — see below — though note that anything already
        public may persist in forks, caches and archives outside the project's control.
      </p>

      <h3>Who else sees it</h3>
      <p>
        GitHub, Inc. (a Microsoft company) hosts the repository. Cloudflare operates the worker
        that relays submissions. Both are processors for this purpose and both are located in, or
        transfer data to, the United States. Transfers rely on the UK International Data Transfer
        Addendum and the EU Standard Contractual Clauses as incorporated into those providers'
        terms, and on the EU-US and UK-US Data Privacy Framework where the provider participates.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live you may have some or all of the following rights. The project
        applies them to everyone, regardless of jurisdiction, because maintaining two standards
        for a form this small would be absurd.
      </p>
      <dl>
        <dt>Access</dt><dd>Ask what the project holds about you. In practice: everything is already public.</dd>
        <dt>Rectification</dt><dd>Ask for inaccurate data to be corrected.</dd>
        <dt>Erasure</dt><dd>Ask for a report to be deleted. Granted on request for your own submissions.</dd>
        <dt>Restriction and objection</dt><dd>Ask that processing stop while a dispute is resolved, or object to processing based on legitimate interests.</dd>
        <dt>Portability</dt><dd>Receive your data in a machine-readable form. Reports are already JSON and plain text in a public git repository.</dd>
        <dt>Withdraw consent</dt><dd>At any time, without affecting processing already carried out.</dd>
        <dt>Complain</dt><dd>To your supervisory authority. In the UK that is the <a href="https://ico.org.uk/">Information Commissioner's Office</a>; in the EU, your national authority.</dd>
      </dl>
      <p>
        For California residents under the CCPA/CPRA: the categories above are the only personal
        information collected. It is <strong>not sold and not shared</strong> for cross-context
        behavioural advertising, and never has been. You have the right to know, delete, correct
        and opt out, and you will not be treated differently for exercising any of them. There is
        no financial incentive programme.
      </p>
      <p>
        Equivalent rights under other regimes — PIPEDA in Canada, the LGPD in Brazil, the APPI in
        Japan, POPIA in South Africa, the Australian Privacy Principles, and comparable US state
        laws — are honoured on the same terms. Write to the contact address above and say what you
        want done.
      </p>

      <h2>Children</h2>
      <p>
        Viridite is not directed at children and the project does not knowingly collect personal
        data from anyone under 16. If you believe a child has submitted a report, tell us and it
        will be removed.
      </p>

      <h2>Automated decision-making</h2>
      <p>
        Submitted APK metadata is parsed automatically to fill in the compatibility list. That
        produces no legal or similarly significant effect on any person, and no profiling of
        individuals is performed.
      </p>

      <h2>Changes</h2>
      <p>
        Changes to this policy are made in public, in the website's git history. The date at the
        top is the date of the last change.
      </p>
    </section>
"""

TERMS = f"""
    <div class="hero compact">
      <h1 style="font-size:var(--fs-3xl)">Terms of Use</h1>
      <p class="tagline">Free software, no warranty, and a console you are choosing to modify.</p>
      <p class="updated">Last updated {UPDATED}</p>
    </div>

    <section>
      <div class="callout">
        <strong>Read this part if you read nothing else.</strong> Viridite is experimental
        software that runs on a modified console. It can crash, corrupt save data, and it may
        contribute to your console or account being banned from Nintendo's online services.
        Nobody is liable to you if it does. If that is not acceptable, do not install it.
      </div>

      <h2>1. Agreement</h2>
      <p>
        By downloading, installing or using Viridite, or by using this website, you agree to these
        terms. If you do not agree, do not use them. If you are under the age of majority where
        you live, you may only use Viridite with the consent of a parent or guardian.
      </p>

      <h2>2. Licence</h2>
      <p>
        Viridite's source code is released under the licence in the
        <a href="https://github.com/Viridite/Viridite/blob/main/LICENSE">repository</a>, and that
        licence governs the code. These terms cover your use of the compiled software and this
        website; where the two conflict on a question about the code, the software licence wins.
      </p>
      <p>
        Nothing here grants you rights in any third-party software, including any game you run
        through Viridite.
      </p>

      <h2>3. Your games are your responsibility</h2>
      <p>
        Viridite ships no games. You supply the APK. By using it you confirm that you have
        lawfully obtained every application you run through it and that doing so does not breach
        that application's own licence terms.
      </p>
      <p>
        You must not use Viridite to infringe copyright, to circumvent technical protection
        measures where doing so is unlawful where you are, or to distribute software you have no
        right to distribute. Requests to add pirated sources to the compatibility list or the
        download flow are refused.
      </p>

      <h2>4. Console modification and bans</h2>
      <p>
        Viridite requires custom firmware. You accept that:
      </p>
      <ul>
        <li>modifying your console will normally void its manufacturer warranty;</li>
        <li>Nintendo may detect modification and may suspend or permanently ban the console, the account, or both, from online services;</li>
        <li>a failed modification can render a console unusable;</li>
        <li>save data can be lost or corrupted, and you are responsible for your own backups.</li>
      </ul>
      <p>
        These outcomes are foreseeable consequences of what you are choosing to do, and you accept
        that risk in full.
      </p>

      <h2>5. No warranty</h2>
      <p>
        Viridite and this website are provided <strong>"as is" and "as available"</strong>, without
        warranty of any kind, express or implied, including the implied warranties of
        merchantability, fitness for a particular purpose, title and non-infringement. No advice
        or information, whether oral or written, creates any warranty.
      </p>
      <p>
        Compatibility information is a record of what testers observed on their hardware. It is
        not a promise that any game will work on yours.
      </p>

      <h2>6. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, the project, its maintainers and its contributors
        are not liable for any indirect, incidental, special, consequential or exemplary damages,
        nor for loss of data, loss of profits, loss of use, or damage to hardware, arising from or
        connected with Viridite or this website — whether in contract, tort (including
        negligence) or otherwise, and even if advised of the possibility.
      </p>
      <p>
        Where liability cannot lawfully be excluded, it is limited to the greater of the amount
        you paid for the software (which is nothing) or GBP 1.
      </p>
      <p>
        Nothing in these terms excludes or limits liability for death or personal injury caused by
        negligence, for fraud or fraudulent misrepresentation, or for anything else that cannot
        lawfully be excluded. If you are a consumer, your statutory rights are unaffected.
      </p>

      <h2>7. The website</h2>
      <p>
        Do not attempt to disrupt the site, submit malicious content, or use the submission form
        to publish anything unlawful, defamatory, or personal to someone else. Submissions may be
        edited or removed at the maintainers' discretion. Links to third-party sites are provided
        for convenience and imply no endorsement or responsibility for their content.
      </p>

      <h2>8. Contributions</h2>
      <p>
        Code contributed to the project is licensed under the project's licence. Compatibility
        reports and other content you submit are published publicly, and you grant the project a
        perpetual, worldwide, royalty-free licence to publish, reproduce and adapt them for that
        purpose. Only submit material you have the right to submit.
      </p>

      <h2>9. Changes and termination</h2>
      <p>
        These terms may change; the current version is always the one on this page, with its date.
        Continued use after a change is acceptance of it. The project may discontinue the software
        or the website at any time, without notice or liability.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of England and Wales, and the courts of England and
        Wales have non-exclusive jurisdiction. If you are a consumer resident elsewhere, you keep
        the benefit of any mandatory consumer-protection rules of your country of residence, and
        may bring proceedings there.
      </p>
      <p>
        If any provision is held unenforceable, the rest stands.
      </p>
    </section>
"""

DMCA = f"""
    <div class="hero compact">
      <h1 style="font-size:var(--fs-3xl)">Copyright &amp; Takedown</h1>
      <p class="tagline">How to report material you own the rights to, and how to dispute a report.</p>
      <p class="updated">Last updated {UPDATED}</p>
    </div>

    <section>
      <div class="callout">
        Viridite hosts no games and no game assets. If you believe something on this website, or
        in one of the project's repositories, infringes your copyright, send a notice to
        <a href="mailto:legal@aaronworld.uk">legal@aaronworld.uk</a> and it will be dealt with
        promptly.
      </div>

      <h2>What is here to take down</h2>
      <p>
        The project publishes source code, documentation, screenshots of its own interface, and
        compatibility reports submitted by users. Game names, icons and version numbers appear in
        the compatibility list to identify the software being described.
      </p>
      <p>
        No game binaries, ROMs, APKs or extracted assets are hosted, mirrored or linked. If you
        have found something that looks like an exception, that is exactly what this page is for.
      </p>

      <h2>Sending a notice</h2>
      <p>
        A notice under 17 U.S.C. § 512(c)(3) should include all of the following. The same
        information is what is needed to act under the EU Digital Services Act or the UK's
        equivalent regime, so one notice covers all of them.
      </p>
      <ol>
        <li>Your physical or electronic signature.</li>
        <li>Identification of the copyrighted work you say is infringed.</li>
        <li>Identification of the material you say is infringing, with enough detail to locate it — a URL or a file path in a named repository.</li>
        <li>Your name, address, telephone number and email address.</li>
        <li>A statement that you have a good-faith belief the use is not authorised by the rights holder, its agent, or the law.</li>
        <li>A statement, under penalty of perjury, that the information is accurate and that you are the rights holder or authorised to act on their behalf.</li>
      </ol>
      <p>
        Send it to <a href="mailto:legal@aaronworld.uk">legal@aaronworld.uk</a>. Material that is
        plainly infringing is removed on receipt, without waiting for a lawyer.
      </p>

      <h2>Counter-notice</h2>
      <p>
        If your material was removed and you believe that was a mistake or a misidentification,
        send a counter-notice to the same address containing your signature, identification of the
        material and where it was, a statement under penalty of perjury that you have a good-faith
        belief it was removed by mistake, your contact details, and your consent to the
        jurisdiction of an appropriate court.
      </p>

      <h2>Misuse</h2>
      <p>
        Knowingly misrepresenting that material is infringing carries liability for damages under
        17 U.S.C. § 512(f). Notices are read, not rubber-stamped: a notice aimed at compatibility
        information, at the project's own source code, or at nominative use of a product name will
        be declined, with reasons.
      </p>

      <h2>Repeat infringers</h2>
      <p>
        Accounts or contributors who repeatedly submit infringing material are barred from
        contributing further.
      </p>

      <h2>Trademarks</h2>
      <p>
        Product names, game titles, logos and icons are used to identify the software they belong
        to. That is nominative fair use and is not a claim of ownership, affiliation or
        endorsement. If you own a mark and want its use here changed, write to the address above
        and say what you would like instead.
      </p>
    </section>
"""

PAGES = [
    ("legal",   "Legal",                  "Licensing, trademarks, affiliation and the project's legal position.", LEGAL),
    ("privacy", "Privacy Policy",         "What Viridite collects (almost nothing), what it publishes, and your rights.", PRIVACY),
    ("terms",   "Terms of Use",           "The licence, the warranty position, and the risks of running homebrew.", TERMS),
    ("dmca",    "Copyright & Takedown",   "How to report infringing material and how to dispute a report.", DMCA),
]


def main():
    for slug, title, desc, body in PAGES:
        path = os.path.join(ROOT, f"{slug}.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(shell(slug, title, desc, body))
        print("wrote", os.path.relpath(path, ROOT))

    # Every existing page gets the same footer links, so the legal pages are
    # reachable from anywhere rather than only from each other.
    for name in os.listdir(ROOT):
        if not name.endswith(".html"):
            continue
        if name[:-5] in {s for s, _, _, _ in PAGES}:
            continue
        path = os.path.join(ROOT, name)
        html = open(path, encoding="utf-8").read()
        if 'href="legal"' in html:
            continue
        new = html.replace(
            '<span class="dot">·</span><a href="https://github.com/Viridite/Viridite/blob/main/LICENSE">License</a>',
            '<span class="dot">·</span><a href="https://github.com/Viridite/Viridite/blob/main/LICENSE">License</a>\n'
            '    <span class="dot">·</span><a href="legal">Legal</a>\n'
            '    <span class="dot">·</span><a href="privacy">Privacy</a>\n'
            '    <span class="dot">·</span><a href="terms">Terms</a>',
        )
        if new != html:
            open(path, "w", encoding="utf-8").write(new)
            print("footer  ", name)
        else:
            print("SKIP    ", name, "(footer pattern not found)")

    # And into the sitemap, so they are indexed like everything else.
    sm = os.path.join(ROOT, "sitemap.xml")
    if os.path.exists(sm):
        xml = open(sm, encoding="utf-8").read()
        add = ""
        for slug, _, _, _ in PAGES:
            if f"{SITE}/{slug}" in xml:
                continue
            add += f"  <url><loc>{SITE}/{slug}</loc></url>\n"
        if add:
            xml = xml.replace("</urlset>", add + "</urlset>")
            open(sm, "w", encoding="utf-8").write(xml)
            print("sitemap  +", add.count("<url>"), "entries")


if __name__ == "__main__":
    main()
