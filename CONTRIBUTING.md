# Contributing to dot-ai

Thanks for your interest in improving `dot-ai`. This project is small and dependency-light by
design — contributions that keep it that way are especially welcome.

## Getting started

```sh
git clone https://github.com/AJMarquez99/dot-ai.git
cd dot-ai
npm install
```

`dot-ai` targets **Node.js >= 14** and ships as a plain CLI — there is no build step.

## Running the tests

```sh
npm test        # end-to-end install test
npm run unit    # the unit suite (structure, dates, sync, archive, prune, doctor, cascade, …)
npm run smoke   # quick smoke check
```

Please add or update tests for any behavior you change, and make sure `npm run unit` passes
before opening a pull request.

## Making changes

- Keep changes **small and focused** — one logical change per pull request.
- Match the existing style; avoid adding dependencies unless there's a clear need.
- If you change the `.ai/` convention itself, update the README and the scaffold templates
  together so they stay in sync.
- Conventions and coding standards for the project live under `.ai/guidelines/` — skim them
  before larger changes.

## Submitting a pull request

1. Fork the repo and create a branch from `main`.
2. Make your change with accompanying tests.
3. Run the test suite and confirm it's green.
4. Open a pull request describing **what** changed and **why**.

## Reporting bugs and requesting features

Use the issue templates — they prompt for the details that make a report actionable. For
anything security-sensitive, see [SECURITY.md](./SECURITY.md) instead of opening a public issue.

By contributing, you agree that your contributions are licensed under the project's
[MIT License](./LICENSE) and that you'll follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
