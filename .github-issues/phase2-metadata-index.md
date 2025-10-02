# [Performance] Phase 2: Build Metadata Index

## Priority
**Medium** - High impact but more complex than Phase 1

## Labels
`performance`, `optimization`, `phase-2`, `breaking-change`

## Milestone
Performance Optimization - Phase 2

## Description

### Problem
Even with lazy content loading (Phase 1), metadata-only operations still require:
- `stat()`-ing hundreds of files
- Reading frontmatter from hundreds of files
- Parsing YAML frontmatter hundreds of times

For large repositories (1000+ notes), this adds up to significant latency.

**Benchmark data (extrapolated to 1000 notes):**
- Metadata scan: ~75ms (5x the 200-note baseline)
- Tag operations: ~50ms
- Full scan: ~400ms

### Solution
Maintain a `.thread-stack-index.json` file with pre-computed metadata for all notes.

**Index structure:**
```json
{
  "version": 1,
  "lastUpdated": "2025-10-01T12:00:00Z",
  "notes": [
    {
      "path": "notes/2025-10-01-auth.md",
      "title": "Auth Design",
      "tags": ["auth", "security"],
      "created": "2025-10-01T10:00:00Z",
      "modified": "2025-10-01T11:30:00Z",
      "wordCount": 1234,
      "hasActionables": false,
      "mtime": 1727800000000
    }
  ],
  "tags": {
    "auth": 15,
    "security": 23,
    "performance": 8
  }
}
```

### Implementation Approach

#### 1. Create index manager

```typescript
// src/index-manager.ts
export class IndexManager {
  private indexPath: string;
  private index: MetadataIndex | null = null;

  async load(): Promise<MetadataIndex>
  async rebuild(): Promise<void>
  async update(notePath: string): Promise<void>
  async isStale(): Promise<boolean>
  async get(path: string): Promise<NoteMetadata | null>
  async query(options: QueryOptions): Promise<NoteMetadata[]>
  async invalidate(paths: string[]): Promise<void>
}
```

#### 2. Rebuild triggers

- **On MCP server startup** (if index is stale or missing)
- **After write operations** (create_note, append_to_note, promote, etc.)
- **Manual command** (`npm run rebuild-index`)
- **Background watcher** (optional, Phase 3 enhancement)

#### 3. Staleness detection

```typescript
async isStale(): Promise<boolean> {
  // Compare index mtime vs. individual note mtimes
  // If ANY note is newer than index, rebuild needed
  // Or: incremental update just that note
}
```

#### 4. Integration with scanner

```typescript
async scanZonesMetadata(zones: Zone[]): Promise<NoteMetadata[]> {
  if (await this.indexManager.isStale()) {
    console.error('[index] Rebuilding stale index...');
    await this.indexManager.rebuild();
  }

  return await this.indexManager.query({ zones });
}
```

### Expected Impact

**Performance improvements (estimated):**

| Operation | Phase 1 | After Phase 2 | Improvement |
|-----------|---------|---------------|-------------|
| Tag operations | 8ms | **<2ms** | 4x faster |
| getAllTags | 8ms | **<1ms** | 8x faster |
| Metadata scan | 15ms | **<3ms** | 5x faster |
| Text search (filter only) | 10ms | **<2ms** | 5x faster |

**Scaling:**
- Phase 1: O(n) - linear with file count
- Phase 2: **O(1)** - constant time for metadata queries

### Files to Create/Modify

**New files:**
- `src/index-manager.ts` - Index CRUD operations
- `src/__tests__/index-manager.test.ts` - Unit tests

**Modified files:**
- `src/scanner.ts` - Use index when available
- `src/writer.ts` - Update index after write operations
- `src/index.ts` - Initialize index manager
- `package.json` - Add `rebuild-index` script

### Testing Strategy

1. **Unit tests**: Index CRUD operations
2. **Integration tests**: Index invalidation on external edits
3. **Stress tests**: Index rebuild with 5000+ notes
4. **Benchmark tests**: Verify O(1) query performance
5. **Edge cases**:
   - Index corruption (fall back to file scan)
   - External edits (detect staleness)
   - Concurrent writes
   - Very large index files (>10MB)

### Acceptance Criteria

- [ ] Index manager implemented and tested
- [ ] Index rebuilds automatically when stale
- [ ] Write operations update index incrementally
- [ ] Metadata queries use index when available
- [ ] Fallback to file scan if index unavailable/corrupt
- [ ] **`npm run build` completes with zero errors**
- [ ] **`npm test` passes - ALL tests must pass**
- [ ] **Test coverage is not reduced - verify with `npm test -- --coverage`**
- [ ] **New code has unit tests - substantive components have test coverage**
- [ ] **Build/test output included in PR description or final comment**
- [ ] Benchmark shows <5ms for tag operations on 1000-note corpus
- [ ] Index size is reasonable (<1MB for 1000 notes)

### Dependencies

**Blocks:**
- Phase 3: Actionable Optimization (can pre-compute actionables in index)
- Future: Semantic Search (index structure supports it)

**Blocked by:**
- **Phase 1: Lazy Content Loading** (establishes metadata extraction patterns)

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Index goes stale (external edits) | Stale results | Detect via mtime comparison, auto-rebuild |
| Index corruption | Tool failure | Validate on load, fall back to file scan |
| Large index file (10K+ notes) | Slow load | Compress, or use SQLite (future) |
| Concurrent write conflicts | Data loss | Atomic writes, lock file (future) |

### Alternative Approaches Considered

1. **SQLite database** - Overkill for initial implementation, but natural evolution
2. **Per-zone indexes** - More complex, marginal benefit
3. **Git as source of truth** - Too slow for frequent queries
4. **No index, optimize file I/O** - Doesn't solve O(n) problem

### Performance Baseline

From `npm run benchmark -- --size=large` (projected):
```
scanZonesMetadata: ~75ms (1000 notes)
getAllTags: ~50ms
listByTags: ~50ms
```

Target after Phase 2:
```
scanZonesMetadata: <3ms (from index)
getAllTags: <1ms (pre-computed)
listByTags: <2ms (index query)
```

### Implementation Notes

- Index should be gitignored (generated artifact)
- Consider adding index stats to MCP metadata
- Document index format for potential external tools
- Plan for migration if index schema changes (version field)

---

**Status:** Blocked by Phase 1
**Estimated effort:** 8-12 hours
**Risk level:** Medium (staleness detection is tricky)
