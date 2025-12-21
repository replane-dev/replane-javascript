# Contributing to Replane JavaScript SDKs

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites

- **Node.js**: Version 18.0.0 or greater
- **pnpm**: Version 10.25.0 or greater (check with `pnpm --version`)

### Clone the Repository

```sh
git clone https://github.com/replane-dev/replane-javascript.git
cd replane-javascript
```

### Install Dependencies

```sh
pnpm install
```

## Development

This is a monorepo managed with [pnpm workspaces](https://pnpm.io/workspaces). The packages are located in the `packages/` directory:

- `packages/sdk` - Core SDK for Node.js, Deno, Bun, and browsers
- `packages/react` - React bindings with hooks and context
- `packages/next` - Next.js SDK with SSR/SSG support
- `packages/svelte` - Svelte bindings with stores

### Build All Packages

```sh
pnpm build
```

### Run Tests

```sh
pnpm test
```

### Type Check

```sh
pnpm typecheck
```

### Lint

```sh
pnpm lint

# Auto-fix lint issues
pnpm lint:fix
```

### Format

```sh
pnpm format

# Check formatting
pnpm format:check
```

## Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Ensure tests pass: `pnpm test`
5. Ensure linting passes: `pnpm lint`
6. Ensure type checking passes: `pnpm typecheck`
7. Commit your changes with a descriptive message
8. Push to your fork and submit a pull request

## Reporting Issues

Found a bug or have a feature request? Please [open an issue](https://github.com/replane-dev/replane-javascript/issues) on GitHub.

## Community

Have questions or want to discuss Replane? Join the conversation in [GitHub Discussions](https://github.com/orgs/replane-dev/discussions).

## License

By contributing to Replane JavaScript SDKs, you agree that your contributions will be licensed under the MIT License.
