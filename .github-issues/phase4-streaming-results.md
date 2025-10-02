# [Performance] Phase 4: Implement Streaming Search Results (Optional)

## Priority
**Low** - Nice-to-have for UX, not critical for performance

## Labels
`performance`, `optimization`, `phase-4`, `enhancement`, `ux`

## Milestone
Performance Optimization - Phase 4 (Future)

## Description

### Problem
Current search flow:
1. Scan **all** notes in target zones
2. Filter/score **all** matches
3. Sort by score
4. Return top N results

User waits for entire process before seeing **any** results.

For large corpora or expensive queries, this creates perceptible latency (>500ms).

### Solution
Return results as they're found using generator/streaming pattern.

**Benefits:**
- First result visible faster (perceived performance)
- Can abort early if enough results found
- Better UX for large result sets

**Tradeoffs:**
- Harder to sort globally by score (only local sorting)
- MCP protocol may not support streaming (need to verify)
- More complex implementation

### Implementation Approach

#### Option A: Generator Pattern (Internal)

```typescript
async *searchStreaming(options: SearchOptions): AsyncGenerator<SearchResult> {
  const metadata = await this.scanZonesMetadata(zones);

  for (const meta of metadata) {
    if (matchesFilters(meta, options)) {
      const note = await this.loadNote(meta.path);
      if (matchesQuery(note, options)) {
        yield toSearchResult(note, options);

        // Early exit if limit reached
        if (yieldedCount >= options.limit) break;
      }
    }
  }
}
```

#### Option B: Batched Results

```typescript
async searchBatched(
  options: SearchOptions,
  batchSize = 5
): Promise<SearchResult[][]> {
  // Return array of batches
  // Client can display progressively
}
```

#### Option C: Callback Pattern

```typescript
async search(
  options: SearchOptions,
  onResult?: (result: SearchResult) => void
): Promise<SearchResult[]> {
  // Call onResult for each match as found
  // Still return full array at end
}
```

### Expected Impact

**Latency improvements:**

| Metric | Current | Streaming | Improvement |
|--------|---------|-----------|-------------|
| Time to first result | 40ms | ~5ms | **8x faster** |
| Time to 10 results | 40ms | ~15ms | 2.7x faster |
| Total time | 40ms | ~40ms | Same |

**User experience:**
- **Feels faster** even if total time unchanged
- Can abort if early results are sufficient
- Progress indication possible

### Files to Modify

- `src/scanner.ts` - Add streaming search method
- `src/index.ts` - Update MCP tool handler (if protocol supports)
- `src/__tests__/scanner.test.ts` - Test streaming behavior

### Testing Strategy

1. **Unit tests**: Verify generator yields correct results
2. **Integration tests**: Verify early abort works
3. **Performance tests**: Measure time to first result
4. **Edge cases**:
   - No results (empty generator)
   - Abort after first result
   - Very large result sets

### Acceptance Criteria

- [ ] Streaming search method implemented
- [ ] First result available in <10ms (200-note corpus)
- [ ] Early abort works correctly
- [ ] Results are correct (same as batch search)
- [ ] MCP protocol supports streaming (or fallback to batch)
- [ ] **`npm run build` completes with zero errors**
- [ ] **`npm test` passes - ALL tests must pass**
- [ ] **Test coverage is not reduced - verify with `npm test -- --coverage`**
- [ ] **New code has unit tests - substantive components have test coverage**
- [ ] **Build/test output included in PR description or final comment**

### Dependencies

**Blocks:**
- None (leaf optimization)

**Blocked by:**
- **Phase 1: Lazy Loading** (required for efficient partial scan)
- Phase 2 is helpful but not required

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| MCP protocol doesn't support streaming | Can't implement | Fall back to batch with fast first batch |
| Global sorting breaks | Wrong order | Document limitation, use approximate sorting |
| Complexity vs. benefit | Wasted effort | Measure perceived performance first |

### MCP Protocol Investigation

**TODO before implementing:**
- [ ] Check if MCP supports streaming responses
- [ ] Check if Claude can handle progressive results
- [ ] Prototype with simple example
- [ ] Measure actual UX improvement

If MCP doesn't support streaming:
- Implement batching instead (return first 10, then next 10, etc.)
- Or skip this optimization entirely

### Alternative Approaches

1. **Fast first batch** - Return top 10 immediately, continue for rest
2. **Result caching** - Cache recent searches for instant replay
3. **Predictive search** - Start searching before user finishes typing

### Performance Baseline

From `npm run benchmark`:
```
search-text-query: 40.34ms (200 notes)
  - Metadata scan: ~8ms (Phase 1)
  - Content load: ~25ms
  - Filtering/scoring: ~7ms
```

**Streaming target:**
```
First result: <10ms
First 10 results: <20ms
All results: ~40ms (same as before)
```

### Implementation Notes

- Generator pattern is most flexible
- Can combine with Phase 2 index for even faster results
- Consider exposing streaming API even if MCP doesn't support
- Useful for CLI tools, future web interface, etc.

### Decision Gate

**Before implementing, verify:**
1. MCP protocol supports streaming OR batching
2. Actual user complaint about perceived latency
3. Phase 1 + 2 don't already solve the problem

**If any of above are false, skip this phase.**

---

**Status:** Future / Optional
**Estimated effort:** 6-8 hours (including protocol investigation)
**Risk level:** Medium (protocol compatibility unknown)
**Recommendation:** Implement Phases 1-3 first, then evaluate if still needed
