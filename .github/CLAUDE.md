# Thread-Stack MCP - Claude Configuration

## Project Overview

**thread-stack-mcp** is an MCP (Model Context Protocol) server that provides intelligent interaction with the [thread-stack](https://github.com/nlsherman-24861/thread-stack) personal knowledge management system.

**Philosophy**: Respects the gradient of thought (Scratchpad → Inbox → Notes) where friction matches permanence. See [README.md](../README.md) for full philosophy.

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript (ESM modules)
- **Framework**: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol)
- **Testing**: Jest with ts-jest
- **Build**: TypeScript compiler (tsc)

## Core Concepts

### Zones (from thread-stack philosophy)

| Zone | Permanence | Structure | When to Use |
|------|------------|-----------|-------------|
| **Scratchpad** | Fleeting | Zero | Quick capture, working through problems |
| **Inbox** | Captured | Minimal (title + content) | "This deserves to exist as a thing" |
| **Notes** | Permanent | Full (tags, links, metadata) | Fully formed thoughts |
| **Daily** | Journal | Timestamped entries | Reflections, progress logs |

### Performance Philosophy

**Measure before optimizing.** We have comprehensive benchmarking infrastructure:
- `npm run benchmark` - Standalone benchmark runner
- `npm run test:bench` - Jest benchmark suite
- Baseline measurements documented in [README-PERFORMANCE.md](../README-PERFORMANCE.md)

**Optimization phases** are documented as GitHub issues in [.github-issues/](.github-issues/)

## Development Workflow

### Running Tests

```bash
npm test              # Run all tests
npm run test:watch   # Watch mode
npm run test:bench   # Performance benchmarks only
npm run benchmark    # Standalone benchmark tool
```

### Building

```bash
npm run build   # Compile TypeScript
npm run watch   # Watch mode for development
```

### Key Files

- `src/index.ts` - MCP server entry point, tool definitions
- `src/scanner.ts` - Zone scanning and search operations
- `src/parser.ts` - Markdown/frontmatter parsing
- `src/writer.ts` - File creation and updates
- `src/zones.ts` - Zone path management
- `src/perf.ts` - Performance monitoring utilities

## Testing Guidelines

- **All new features require tests**
- Use fixtures from `src/__tests__/fixtures.ts` for consistent test data
- Performance-sensitive code should have benchmark coverage
- Integration tests verify scanner + parser work together
- Mock file I/O sparingly - prefer temp directories for real I/O testing

## Common Patterns

### Adding a New MCP Tool

1. Add tool definition to `tools` array in `src/index.ts`
2. Add handler case in `server.setRequestHandler(CallToolRequestSchema, ...)`
3. Implement business logic in scanner/parser/writer
4. Add tests in appropriate `__tests__` file
5. Update README with tool description

### Performance Optimization

1. Add benchmark in `src/__tests__/benchmark.test.ts`
2. Establish baseline measurement
3. Implement optimization
4. Verify improvement with benchmarks
5. Document in performance README

## Issue Workflow

When working on GitHub issues:

1. **Read the issue template carefully** - contains implementation approach, acceptance criteria
2. **Run relevant benchmarks** before and after changes
3. **Ensure all tests pass** including new tests for the feature
4. **Update documentation** if user-facing behavior changes
5. **Reference baseline measurements** in PR description

### Creating New Issues

When creating issues for future work, use this structure:
- Clear description of what and why
- Context and background
- Specific requirements (checklist)
- Implementation approach (technical guidance)
- **Acceptance criteria including build/test verification** (see CRITICAL section below)
- Notes for risks/considerations

Reference example templates in [.github-issues/](.github-issues/) for complex features.

## CRITICAL: Before Creating Any PR

**You MUST verify these steps before creating a pull request:**

1. ✅ **Build succeeds**: Run `npm run build` - MUST complete with zero errors
2. ✅ **Tests pass**: Run `npm test` - ALL tests MUST pass
3. ✅ **Test coverage maintained**: Overall test coverage is not reduced
4. ✅ **New code has tests**: Substantive new code/components have new or updated unit tests
5. ✅ **Include evidence**: Add build/test output to PR description or final issue comment

**If build fails or tests fail, you MUST fix the issues before creating the PR.** Never create a PR with failing tests or compilation errors.

This is non-negotiable - broken PRs waste review time and create technical debt.

## Code Style

- Use TypeScript strict mode (already configured)
- Prefer async/await over promises
- Use descriptive variable names (favor clarity over brevity)
- Comment "why" not "what" (code should be self-documenting)
- Export types from `src/types.ts` for shared interfaces

## Performance Targets

See [README-PERFORMANCE.md](../README-PERFORMANCE.md) for detailed targets, but general guidelines:

- **Metadata operations** (tags, lists): <10ms for 200-note corpus
- **Text search**: <50ms for 200-note corpus
- **Full scan (cold)**: <100ms for 200-note corpus
- **Single note load**: <1ms (warm cache)

If optimizations don't meet targets, investigate before merging.
