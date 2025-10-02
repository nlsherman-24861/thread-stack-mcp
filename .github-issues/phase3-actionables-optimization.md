# [Performance] Phase 3: Optimize Actionable Item Extraction

## Priority
**Medium** - Targeted optimization for specific operation

## Labels
`performance`, `optimization`, `phase-3`, `actionables`

## Milestone
Performance Optimization - Phase 3

## Description

### Problem
`get_actionable_items` currently:
1. Loads **all notes** from target zones (uses cache, but still I/O heavy)
2. Parses **every line** of **every note** with regex matching
3. Extracts context, priority, linked issues for each actionable
4. Has **no early exit** even if 90%+ of notes have zero actionables

**Benchmark data (200-note corpus):**
- extractActionables: 34.51ms
- ~60 notes with actionables (30% density in fixtures)
- ~140 notes parsed unnecessarily

**Extrapolated to 1000 notes:**
- ~150ms just to find 50-100 actionable items
- Wastes time parsing 900+ notes with no actionables

### Solution

**Phase 3a:** Use metadata index `hasActionables` flag to skip notes
**Phase 3b:** Pre-extract actionables during index build (optional)

### Implementation Approach

#### Phase 3a: Smart Filtering (Quick Win)

```typescript
async extractActionables(zones?: Zone[]): Promise<ActionableItem[]> {
  // Get metadata from index
  const metadata = await this.scanner.scanZonesMetadata(zones);

  // SKIP notes without actionables flag
  const candidates = metadata.filter(m => m.hasActionables);

  // Only parse content for candidates
  const notes = await Promise.all(
    candidates.map(m => this.scanner.loadNote(m.path))
  );

  // Extract actionables from smaller set
  return notes.flatMap(n => this.parser.extractActionables(n));
}
```

**Impact:** 3-10x faster (depending on actionable density)

#### Phase 3b: Pre-extracted Index (Advanced)

Add to metadata index:
```json
{
  "path": "notes/project.md",
  "actionables": [
    {
      "line": 42,
      "content": "Fix auth bug",
      "status": "open",
      "priority": "high",
      "tags": ["bug", "auth"]
    }
  ]
}
```

```typescript
async extractActionables(zones?: Zone[]): Promise<ActionableItem[]> {
  // Just query index - no file I/O at all
  return await this.indexManager.getActionables({ zones, status: 'open' });
}
```

**Impact:** 10-50x faster (instant query from in-memory index)

### Expected Impact

**Phase 3a (metadata filtering):**

| Corpus Size | Current | Phase 3a | Improvement |
|-------------|---------|----------|-------------|
| 200 notes | 34ms | ~10ms | 3x faster |
| 1000 notes | ~150ms | ~30ms | 5x faster |

**Phase 3b (pre-extracted):**

| Corpus Size | Current | Phase 3b | Improvement |
|-------------|---------|----------|-------------|
| 200 notes | 34ms | <2ms | **17x faster** |
| 1000 notes | ~150ms | <5ms | **30x faster** |

### Files to Modify

**Phase 3a:**
- `src/index.ts` - Update `get_actionable_items` handler
- `src/scanner.ts` - Add filtered actionable extraction
- `src/__tests__/benchmark.test.ts` - Add filtered benchmark

**Phase 3b (if implemented):**
- `src/index-manager.ts` - Store actionables in index
- `src/parser.ts` - Extract during index build
- `src/types.ts` - Extend index schema

### Testing Strategy

1. **Correctness**: Verify filtered results match full scan
2. **Performance**: Benchmark with varying actionable densities
3. **Edge cases**:
   - No actionables in corpus
   - Every note has actionables
   - Actionables added after index build (staleness)
4. **Regression**: Ensure existing actionable extraction still works

### Acceptance Criteria

**Phase 3a:**
- [ ] Metadata index includes `hasActionables` flag
- [ ] Actionable extraction skips notes without flag
- [ ] Benchmark shows ≥3x speedup
- [ ] All existing actionable tests pass
- [ ] **`npm run build` completes with zero errors**
- [ ] **`npm test` passes - ALL tests must pass**
- [ ] **Test coverage is not reduced - verify with `npm test -- --coverage`**
- [ ] **New code has unit tests - substantive components have test coverage**
- [ ] **Build/test output included in PR description or final comment**

**Phase 3b (optional):**
- [ ] Index stores pre-extracted actionables
- [ ] Query returns actionables without file I/O
- [ ] Index invalidation updates actionables
- [ ] Benchmark shows ≥10x speedup
- [ ] **`npm run build` completes with zero errors**
- [ ] **`npm test` passes - ALL tests must pass**
- [ ] **Test coverage is not reduced - verify with `npm test -- --coverage`**
- [ ] **New code has unit tests - substantive components have test coverage**
- [ ] **Build/test output included in PR description or final comment**

### Dependencies

**Blocks:**
- None (end of optimization chain for now)

**Blocked by:**
- **Phase 2: Metadata Index** (required for metadata filtering)
- Phase 1 is helpful but not strictly required

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| False negatives (`hasActionables` wrong) | Missing actionables | Rebuild index on schema changes |
| Stale pre-extracted actionables | Outdated results | Update index on file changes |
| Index bloat (many actionables) | Large index file | Consider compression or limits |

### Alternative Approaches Considered

1. **Real-time parsing with early exit** - Still O(n), doesn't solve scaling
2. **Separate actionables index file** - More complex, marginal benefit
3. **Git grep for actionable markers** - Fast but less flexible
4. **Full-text search engine** - Overkill for this use case

### Performance Baseline

From `npm run benchmark -- --size=medium`:
```
getActionableItems: 34.51ms (200 notes, ~60 with actionables)
```

**Phase 3a target:**
```
getActionableItems: <10ms (only parse notes with actionables flag)
```

**Phase 3b target:**
```
getActionableItems: <2ms (query pre-extracted from index)
```

### Implementation Notes

- Phase 3a can be done immediately after Phase 2
- Phase 3b is optional - depends on actionable query frequency
- Consider adding actionable stats to index metadata
- Future: Watch for `- [ ]` pattern during file writes to update live

### Phased Rollout

**Recommended approach:**

1. Implement Phase 3a first (low risk, good improvement)
2. Monitor actionable query frequency in production
3. If queries are frequent (>10% of operations), implement Phase 3b
4. If queries are rare, Phase 3a may be sufficient

---

**Status:** Blocked by Phase 2
**Estimated effort:**
- Phase 3a: 2-3 hours
- Phase 3b: 4-6 hours
**Risk level:** Low (Phase 3a), Medium (Phase 3b - index complexity)
