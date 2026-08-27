# Axis Browser

Axis is a fast, private, Chromium-based browser built with Electron. It is meant to feel calm and deliberate: a clean shell, strong defaults, and real control over how you browse, without treating you like a product.

## Privacy

Axis is not an ad company in a browser costume.

- **We do not steal your data.** Your browsing stays on your device unless you choose to export or back it up yourself.
- **We do not build advertising profiles on you.** There is no Axis ad network, no “interest graph,” and no selling of your history to marketers.
- **We do not track you across the web for Axis.** The product is not designed to follow you from site to site to score you, retarget you, or feed a recommendation engine about your life.
- **We do not run shady telemetry theater.** Axis is not here to quietly harvest keystrokes, form contents, or wallet details for “product improvement” dashboards you never asked for.
- **Passwords, cards, and addresses stay local.** Vault data lives on your machine and is protected with device authentication (such as Touch ID, Windows Hello, or your device password) when you view or change secrets.
- **Blocking is on your side.** Built-in tracker and ad blocking is there to cut noise and cut tracking scripts, not to replace them with Axis’s own trackers.
- **Profiles are yours.** Each profile keeps its own tabs, favorites, history, extensions, and vault. Incognito stays separate. You decide what is shared and what is not.

If a browser needs your attention span, your inbox, and a dossier of who you are in order to “feel free,” that is not freedom. Axis aims for the opposite: useful software that stays out of your business.

## Why people use Axis

- A minimal interface that stays out of the way
- Smooth tab management, favorites, New Tab greeting, and widgets when you want them
- Per-profile appearance, data, and vault, with optional **Universal language** for the whole app
- AI chat when you bring your own keys, without Axis inventing a cloud identity for you

## Language

In **Settings > Appearance**, pick the language for Axis menus, Settings, and setup. Websites keep their own language. The browser layout does not flip for right-to-left languages; greetings and text still render correctly.

Turn on **Universal language** to use that same Axis language for **every profile and Incognito**. When it is off, each profile can keep its own language. This setting is for the Axis app, not for forcing website translations.

You will also see this choice during first-run setup.

## Security basics

- Site permissions are asked, not silently approved forever by default
- Shell UI treats untrusted strings carefully so a page cannot casually reach vault or settings power
- Guest pages stay sandboxed; Axis does not turn website tabs into Node-powered shells
- Updates can be checked and installed without a circus of mystery installers when you choose Restart to update

## Project overview

Axis wraps Chromium in a custom shell so the product can stay small, readable, and secure.

- **Electron** for the native app shell
- **Chromium** for page rendering
- **HTML, CSS, and JavaScript** for the Axis UI

The goal is a balance of design, privacy, and performance without stuffing the browser full of engagement bait.

## Documentation

- [Setup Guide](./SETUP.md)
- [License](./LICENSE.md)
- [Contributing Guidelines](./CONTRIBUTING.md) (coming soon)

## Contributing

Forks and pull requests are welcome. Changes are reviewed for behavior, design consistency, and security before merge.

Official releases and branding are maintained by **Abdelrahman Berchan**.

## License

Licensed under the **Axis Browser Public License (ABPL)**. See [LICENSE](./LICENSE.md) for the full terms.

You may view, study, use, and modify Axis privately, and you may contribute back to the official project. Publishing modified versions, independent forks, rebrands, or competing browsers based on Axis requires written permission from the author.
