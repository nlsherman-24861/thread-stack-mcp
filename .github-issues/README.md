# Performance Optimization Issues

This directory contains detailed GitHub issue templates for performance optimization work.

## Overview

These issues document a phased approach to optimizing thread-stack-mcp performance, based on benchmarking data and analysis.

## Phase Dependency Graph

```
Phase 1: Lazy Content Loading
  ↓ (blocks)
Phase 2: Metadata Index
  ↓ (blocks)
Phase 3: Actionable Optimization
  ↓ (optional)
Phase 4: Streaming Results
```

## Issues Summary

| Phase | Priority | Est. Hours | Impact | Risk | Status |
|-------|----------|------------|--------|------|--------|
| [Phase 1: Lazy Loading](phase1-lazy-load-content.md) | **High** | 4-6h | 4x faster tag ops | Low | ✅ Ready |
| [Phase 2: Metadata Index](phase2-metadata-index.md) | **Medium** | 8-12h | O(1) queries | Medium | ⏸️ Blocked |
| [Phase 3: Actionables](phase3-actionables-optimization.md) | **Medium** | 2-6h | 3-30x faster | Low-Med | ⏸️ Blocked |
| [Phase 4: Streaming](phase4-streaming-results.md) | **Low** | 6-8h | Better UX | Medium | 🤔 Optional |

## How to Use These Templates

### Creating GitHub Issues

1. Copy the content of each `.md` file
2. Create a new issue in your repository
3. Paste the content
4. Add the suggested labels
5. Set the milestone if applicable
6. Link blocking/blocked issues

### GitHub CLI Method

If you initialize a git repo and have `gh` CLI:

```bash
# Create Phase 1 issue
gh issue create \
  --title "[Performance] Phase 1: Implement Lazy Content Loading" \
  --body-file .github-issues/phase1-lazy-load-content.md \
  --label "performance,optimization,phase-1"

# Create Phase 2 issue
gh issue create \
  --title "[Performance] Phase 2: Build Metadata Index" \
  --body-file .github-issues/phase2-metadata-index.md \
  --label "performance,optimization,phase-2"

# etc.
```

### Linking Dependencies

After creating all issues, link them:

```bash
# Get issue numbers
PHASE1=$(gh issue list --label phase-1 --json number -q '.[0].number')
PHASE2=$(gh issue list --label phase-2 --json number -q '.[0].number')
PHASE3=$(gh issue list --label phase-3 --json number -q '.[0].number')

# Add blocking relationships via comments
gh issue comment $PHASE2 --body "Blocked by #$PHASE1"
gh issue comment $PHASE3 --body "Blocked by #$PHASE2"
```

## Performance Baselines

From `npm run benchmark -- --size=medium` (200 notes):

```
scanZones-cold: 81.25ms
scanZones-warm: 10.49ms
search-text-query: 40.34ms
search-tags-only: 38.57ms
listByTags: 35.24ms
getAllTags: 30.35ms
getActionableItems: 34.51ms
loadNote-single-cold: 0.28ms
loadNote-single-warm: 0.07ms
```

## Expected Improvements

After all phases complete:

```
scanZones-metadata: <3ms (27x faster)
search-tags-only: <2ms (19x faster)
listByTags: <2ms (17x faster)
getAllTags: <1ms (30x faster)
getActionableItems: <5ms (7x faster)
```

## Recommended Implementation Order

1. ✅ **Phase 1** - Start here (biggest bang for buck)
2. ⏭️ **Phase 2** - After Phase 1 complete
3. ⏭️ **Phase 3a** - Quick win after Phase 2
4. 🤔 **Phase 3b** - Only if actionable queries are frequent
5. 🤔 **Phase 4** - Only if UX demands it

## Benchmark-Driven Development

Before implementing any phase:
```bash
npm run benchmark -- --size=medium
```

After implementing:
```bash
npm run benchmark -- --size=medium
```

Compare results, verify improvements match estimates.

## Notes

- All issues marked as **NOT ready for agent** initially
- Review and refine before assigning to automated development
- Each phase includes acceptance criteria for clear completion
- Benchmark targets are estimates based on analysis
- Actual results may vary - measure to verify!

## Future Considerations

Beyond Phase 4:
- SQLite backend for very large repositories (10K+ notes)
- Incremental index updates (watch file changes)
- Semantic search with embeddings
- Query result caching
- Parallel file scanning

These can be separate issues created as needed.
