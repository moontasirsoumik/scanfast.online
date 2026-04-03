# Contributing to ScanFastOnline

Thanks for your interest in contributing! ScanFastOnline is a client-side document scanner and PDF manipulator — every contribution helps make document handling more accessible.

## Prerequisites

- **Node.js** 20+
- **npm** (comes with Node)

## Contribution Workflow

### 1. Fork the repository

Click **Fork** on the GitHub page to create your own copy of the repo.

### 2. Clone your fork

```sh
git clone https://github.com/<your-username>/scanfast.online.git
cd scanfast.online
```

### 3. Install dependencies

```sh
npm install
```

### 4. Create a branch

Never commit directly to `main`. Create a descriptive branch for your change:

```sh
git checkout -b feat/rotate-animation
# or
git checkout -b fix/thumbnail-safari
# or
git checkout -b docs/update-shortcuts
```

Branch naming convention:
- `feat/` — new feature
- `fix/` — bug fix
- `docs/` — documentation only
- `refactor/` — internal code change with no user-facing effect
- `chore/` — tooling, dependencies, config

### 5. Start the dev server

```sh
npm run dev
```

Vite will print the local URL in the terminal. The port is chosen automatically.

### 6. Make your changes

Keep changes focused. One branch = one logical change. If you find an unrelated bug while working, open a separate branch for it.

### 7. Verify the build

Before committing, confirm there are no TypeScript errors and the production build succeeds:

```sh
npm run build
```

Fix any errors before proceeding.

### 8. Document your change in CHANGELOG.md

Add an entry under an `## [Unreleased]` section at the top of [CHANGELOG.md](CHANGELOG.md):

```markdown
## [Unreleased]

### Added
- Brief description of what you added

### Fixed
- Brief description of what you fixed

### Changed
- Brief description of what you changed
```

Use the categories `Added`, `Fixed`, `Changed`, or `Removed`. Keep entries short — one line each.

### 9. Commit your changes

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```sh
git add .
git commit -m "feat: add page rotation animation"
```

Examples:
```
feat: add page rotation animation
fix: correct thumbnail rendering on Safari
docs: update keyboard shortcuts table
refactor: simplify filter pipeline
chore: upgrade pdfjs-dist to 5.x
```

### 10. Push to your fork

```sh
git push origin feat/rotate-animation
```

### 11. Open a Pull Request

1. Go to the original repo on GitHub: [moontasirsoumik/scanfast.online](https://github.com/moontasirsoumik/scanfast.online)
2. Click **Compare & pull request**
3. Set the base branch to `main`
4. Fill in the PR template — describe what changed and why
5. Submit the PR

> **Note:** All PRs require approval from the maintainer before they can be merged. You cannot merge your own PR.

### 12. Respond to review feedback

The maintainer may request changes. Push additional commits to the same branch — the PR updates automatically. Once approved, the maintainer will merge it.

## Code Style

- **TypeScript strict mode** — no `any` unless absolutely necessary (with a comment explaining why)
- **IBM Carbon Design System** — use `@carbon/react` components and Carbon design tokens. Do not mix in other design systems
- **No external runtime dependencies** — all assets must be self-hosted. No CDN links, no external API calls
- **JSDoc on all exports** — concise, one-liner preferred unless the function is complex
- **Mobile-first** — every component must work at 320px+

## Project Constraints

These are hard rules — PRs that violate them will be rejected:

- **No database.** All state lives in Zustand stores (in-memory only)
- **No server-side processing.** Everything runs in the browser
- **No ads, logins, analytics, or tracking**
- **No external CDN/API dependencies at runtime**
- **Max 20 pages per session**
- **Max 20 undo/redo operations**

## Reporting Bugs

Use the [bug report template](https://github.com/moontasirsoumik/scanfast.online/issues/new?template=bug_report.md) when filing issues.

## Requesting Features

Use the [feature request template](https://github.com/moontasirsoumik/scanfast.online/issues/new?template=feature_request.md).
