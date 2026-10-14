# Repository Guidelines

## Project Structure & Module Organization

This repository contains standalone Tampermonkey userscripts at the repository root:

- `그룹웨어 본문 편집.js`: groupware document links, document/body copying, and attachment numbering.
- `Nexacro 계정 행 복사 자동화.user.js`: Nexacro account-row copying and overtime drafting automation.
- `보상계약 리포트 생성.user.js`: report payload generation and transmission from selected Nexacro data.
- `README.md`: repository introduction.

There are no separate source, test, or asset directories. Each script owns its userscript metadata, helpers, and injected interface; keep changes within the relevant script.

## Build, Test, and Development Commands

No package manager, build pipeline, development server, or automated test runner is configured. Install or paste the relevant script into Tampermonkey, save it, and reload its matching internal application page.

With Node.js installed, run a syntax check on each changed file:

```powershell
node --check "그룹웨어 본문 편집.js"
node --check "Nexacro 계정 행 복사 자동화.user.js"
node --check "보상계약 리포트 생성.user.js"
git diff --check
```

Syntax checks do not exercise browser APIs, Nexacro, or the document editor.

## Coding Style & Naming Conventions

Preserve each file's indentation: four spaces in the groupware and account-copy scripts; two in the report script. Retain the strict-mode IIFE, semicolons, descriptive camelCase helpers, and uppercase configuration constants. Prefer `const`, using `let` for reassignment. No formatter or linter is configured; avoid unrelated reformatting.

Keep Korean filenames and interface labels consistent. New installable scripts should use descriptive `.user.js` names. Preserve metadata headers; increment `@version` for released behavior changes and keep update/download URLs aligned with filenames.

## Testing Guidelines

No testing framework or coverage threshold exists. Manually verify changed workflows in the matching internal application with safe test records. Check injected buttons, clipboard output, attachment numbering, affected Nexacro rows, and report output as applicable. Exercise missing selections, unavailable frames, and repeated clicks; inspect the browser console. Record steps, results, and any unavailable integration checks in the pull request.

## Commit & Pull Request Guidelines

History uses concise subjects such as `Update 그룹웨어 본문 편집.js` and `Create 그룹웨어 본문 편집.js`. Follow that style while identifying the changed behavior when useful. Keep commits focused. Pull requests should explain the problem, affected script, validation performed, and any metadata changes; link related issues and include screenshots for visible interface changes.

## Security & Configuration

Keep `@match` patterns and `@grant` permissions narrowly scoped. Never commit credentials, session tokens, employee records, or real report payloads. Sanitize screenshots and debugging examples.
