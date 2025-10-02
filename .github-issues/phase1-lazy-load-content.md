# [Performance] Phase 1: Implement Lazy Content Loading

## Priority
**High** - Highest impact optimization with minimal complexity

## Labels
`performance`, `optimization`, `phase-1`

## Milestone
Performance Optimization - Phase 1

## Description

### Problem
Currently, `scanZones()` loads the **full content** of every note file into memory, even when tools only need metadata (title, tags, dates, word count). This wastes I/O, memory, and processing time.

**Benchmark data (200-note corpus):**
- Cold scan: 81ms (loads all content)
- Warm scan: 10ms (cached)
- Tag operations: 30-35ms (need tags only, but load full content)
- Search operations: 40ms (load all content, then filter)

### Solution
Implement two-pass loading strategy:

1. **First pass**: Load only frontmatter + filesystem stats → build `NoteMetadata`
2. **Second pass**: Load full content only for notes that pass initial filters

### Implementation Approach

#### 1. Add metadata-only scan method to `scanner.ts`

```typescript
/**
 * Scan zones and return metadata only (no full content)
 */
async scanZonesMetadata(zones: Zone[]): Promise<NoteMetadata[]> {
  // Read only frontmatter + first ~500 bytes
  // Extract title, tags, dates, word count estimate
  // Skip full content parse
  // Return NoteMetadata[] instead of Note[]
}
```

#### 2. Update search operations

```typescript
async search(options: ZoneSearchOptions): Promise<SearchResult[]> {
  // Phase 1: Get metadata for all notes
  const metadata = await this.scanZonesMetadata(zones);

  // Phase 2: Filter by tags, dates (no content needed)
  let filtered = metadata.filter(/* tags, dates */);

  // Phase 3: Only NOW load full content for query matching
  if (options.query) {
    const fullNotes = await Promise.all(
      filtered.map(meta => this.loadNote(meta.path))
    );
    // text search, scoring, excerpt generation on smaller set
  }

  return results;
}
```

#### 3. Update other metadata-only operations

- `listByTags()` - already only needs metadata
- `getAllTags()` - only needs frontmatter tags
- `listInboxItems()` - only needs metadata

### Expected Impact

**Performance improvements (estimated):**

| Operation | Current | After Phase 1 | Improvement |
|-----------|---------|---------------|-------------|
| Tag-based search | 35ms | ~8ms | **4x faster** |
| getAllTags | 30ms | ~8ms | **4x faster** |
| listByTags | 35ms | ~8ms | **4x faster** |
| Text search | 40ms | ~25ms | 1.6x faster |
| Full scan (metadata) | 81ms | ~15ms | **5x faster** |

**Memory reduction:** 10-50x depending on note sizes (only metadata in memory by default)

### Files to Modify

- `src/scanner.ts` - Add `scanZonesMetadata()`, update `search()`, `listByTags()`, `getAllTags()`
- `src/types.ts` - Ensure `NoteMetadata` type is complete
- `src/__tests__/benchmark.test.ts` - Add benchmarks for metadata-only operations

### Testing Strategy

1. **Unit tests**: Verify metadata extraction is correct without full content
2. **Integration tests**: Verify search results identical to current implementation
3. **Benchmark tests**: Measure actual speedup
4. **Edge cases**:
   - Notes without frontmatter
   - Very large notes (>1MB)
   - Notes with minimal content

### Acceptance Criteria

- [ ] `scanZonesMetadata()` method implemented and tested
- [ ] Tag operations use metadata-only scan
- [ ] Text search uses two-pass approach (metadata filter → content load)
- [ ] **`npm run build` completes with zero errors**
- [ ] **`npm test` passes - ALL tests must pass**
- [ ] **Test coverage is not reduced - verify with `npm test -- --coverage`**
- [ ] **New code has unit tests - substantive components have test coverage**
- [ ] **Build/test output included in PR description or final comment**
- [ ] Benchmark shows ≥3x speedup for tag operations
- [ ] Memory usage reduced (verify via benchmark profiling)

### Dependencies

**Blocks:**
- Phase 2: Metadata Index (this lays groundwork)
- Phase 3: Actionable Optimization (similar pattern)

**Blocked by:**
- None (can start immediately)

### Notes

- Cache strategy still applies (helps both passes)
- Frontmatter parsing is fast (gray-matter is efficient)
- Can estimate word count from file size initially
- Consider streaming API for very large corpora (future enhancement)

### Performance Baseline

From `npm run benchmark -- --size=medium`:

```
scanZones-cold: 81.25ms
search-tags-only: 38.57ms
listByTags: 35.24ms
getAllTags: 30.35ms
```

Target after Phase 1:
```
scanZonesMetadata: <15ms
search-tags-only: <10ms
listByTags: <10ms
getAllTags: <10ms
```

---

**Status:** Ready for implementation
**Estimated effort:** 4-6 hours
**Risk level:** Low (additive change, existing code still works)
