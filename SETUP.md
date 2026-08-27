# Axis setup

How to run Axis on your machine from this repo.

## Requirements

- Node.js 18 or newer
- npm (comes with Node.js)

Check:

```bash
node --version
npm --version
```

## Install

From the project folder:

```bash
npm install
```

## Run

```bash
npm start
```

For a developer launch (DevTools available):

```bash
npm run dev
```

## Useful commands

| Command | What it does |
|---------|----------------|
| `npm start` | Start Axis |
| `npm run dev` | Start Axis with developer flags |
| `npm run i18n:sync` | Fill missing UI translations offline |
| `npm run build` | Build the app with electron-builder |
| `npm run dist` | Build installers (no publish) |

## Build installers

```bash
npm run dist
```

Output goes in `dist/`. What you get depends on your OS (for example `.dmg` on macOS, `.exe` on Windows, `.AppImage` on Linux).

## If something fails

**`npm install` fails**

```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

On macOS or Linux you may need to fix folder permissions instead of using `sudo` for npm.

**Axis will not start**

1. Confirm Node.js is 18+.
2. Reinstall dependencies with the steps above.
3. Try `npm run dev` and check the terminal for errors.

## Project layout (short)

- `src/main.js` - Electron main process
- `src/renderer.js` - Browser UI
- `src/index.html` / `src/styles.css` - Shell layout and styles
- `src/settings.html` / `src/settings-app.js` - Settings
- `scripts/` - Launch, i18n sync, and build helpers

## Notes

- Fully quit Axis before testing main-process or preload changes.
- Do not commit secrets or API keys into the repo.
- UI language and New Tab widgets are per profile unless Universal language is on.
