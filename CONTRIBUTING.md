# Contributing Guidelines

- **Package Manager**: Use `bun` or `npm` (`bun install` / `npm install`).
- **Development Server**: Run `bun run dev` or `npm run dev`.
- **E2E Test Verification**: Run `bun run e2e:report` or `npm run e2e:report` to verify engine tax math against all test fixtures before submitting changes.
- **Security & Privacy**: Never commit IBKR tokens, API keys, account numbers, or raw user Flex XML statements to git.
- **Section 47 Rules**: Do not alter average cost base (ACB) or superficial loss calculations in `src/engine/acbEngine.ts` without accompanying test fixture updates.
- **Type Safety**: Maintain strict TypeScript interfaces without `any` casts.
