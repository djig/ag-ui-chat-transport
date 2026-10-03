# Contributing to ag-ui-chat-transport

Thank you for considering contributing! This library bridges Vercel AI SDK UI to AG-UI protocol agents.

## Development Setup

1. **Clone and install**:
   ```bash
   git clone <your-fork>
   cd ag-ui-chat-transport
   npm install
   ```

2. **Build**:
   ```bash
   npm run build
   ```

3. **Run tests**:
   ```bash
   npm test
   ```

4. **Type check**:
   ```bash
   npm run typecheck
   ```

## Project Structure

```
src/
├── index.ts                      # Public exports
├── ag-ui-chat-transport.ts       # Main transport implementation
└── __tests__/
    └── ag-ui-chat-transport.test.ts  # Unit tests

examples/
└── nextjs-basic/                 # Example Next.js app
```

## Testing

- **Unit tests**: Use Vitest with mocked AG-UI event streams
- **Example app**: Run `cd examples/nextjs-basic && npm run dev` to test live

### Adding Tests

When adding features, include tests for:
1. Event mapping (AG-UI → AI SDK)
2. Error handling
3. Edge cases (empty streams, malformed events, etc.)

## Code Style

- **TypeScript**: Strict mode enabled
- **ESM**: Use ES modules
- **Formatting**: Run `npm run lint` before committing

## Pull Requests

1. **Fork** the repo and create a branch from `main`
2. **Write tests** for your changes
3. **Ensure all tests pass**: `npm test && npm run build`
4. **Open a PR** with a clear description of the change

## Event Mapping Guidelines

When mapping new AG-UI events:
1. Check the [AG-UI spec](https://github.com/ag-ui-protocol/ag-ui) for canonical field names
2. Map to the appropriate [AI SDK chunk type](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message)
3. Document the mapping in the README
4. Add tests with recorded event fixtures

## Release Process

Releases use [changesets](https://github.com/changesets/changesets):

```bash
npx changeset add     # Describe your changes
npx changeset version # Bump version
npm run build && npm test
git add . && git commit -m "chore: release"
npm publish
```

## Questions?

Open an issue or discussion on GitHub.
