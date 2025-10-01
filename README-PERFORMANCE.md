# Performance Testing & Benchmarking

This document describes the performance testing infrastructure for thread-stack-mcp.

## Quick Start

### Run Benchmarks

```bash
# Run all benchmarks with medium corpus (200 notes)
npm run benchmark

# Run with different corpus sizes
npm run benchmark -- --size=small   # 50 notes
npm run benchmark -- --size=medium  # 200 notes
npm run benchmark -- --size=large   # 1000 notes
npm run benchmark -- --size=xlarge  # 5000 notes

# Run specific operations
npm run benchmark -- --operation=search
npm run benchmark -- --operation=tags
npm run benchmark -- --operation=actionables
npm run benchmark -- --operation=scan

# Run multiple iterations for statistical significance
npm run benchmark -- --iterations=5 --size=medium
```

### Run Jest Benchmarks

```bash
# Run benchmark tests via Jest
npm run test:bench
```

## Performance Monitoring

### Built-in Performance Tracking

The MCP server includes performance monitoring that can be enabled/disabled:

```bash
# Enable (default)
export THREAD_STACK_PERF=true

# Disable
export THREAD_STACK_PERF=false
```

When enabled, all operations log timing information to stderr:

```
[perf] scanZones: 245.32ms {"zones":["notes","daily"]}
[perf] search-text: 89.45ms {"query":"implementation"}
```

### Using PerfMonitor in Code

```typescript
import { PerfMonitor } from './perf.js';

const perf = new PerfMonitor();

// Time synchronous operations
const result = perf.time('myOperation', () => {
  // ... do work
  return result;
});

// Time async operations
const result = await perf.timeAsync('myAsyncOp', async () => {
  // ... do async work
  return result;
});

// Manual timing
const stop = perf.startTimer('complexOperation');
// ... do work
stop({ metadata: 'here' });

// Get reports
console.log(perf.report());
console.log(perf.toJSON());
```

## Test Fixtures

The benchmark suite uses realistic test fixtures:

### Fixture Sizes

| Size | Notes | Inbox Items | Tags/Note | Links/Note | Actionables |
|------|-------|-------------|-----------|------------|-------------|
| Small | 50 | 5 | 3 | 2 | 30% |
| Medium | 200 | 20 | 4 | 3 | 25% |
| Large | 1000 | 100 | 5 | 4 | 20% |
| XLarge | 5000 | 500 | 5 | 5 | 15% |

### Fixture Generation

```typescript
import { generateFixtures, FIXTURE_CONFIGS } from './src/__tests__/fixtures.js';

await generateFixtures({
  basePath: '/tmp/my-test-stack',
  ...FIXTURE_CONFIGS.medium
});
```

## Benchmarked Operations

### Core Operations

1. **scanZones** - Full zone scan (cold/warm cache)
2. **search** - Text search with query
3. **listByTags** - Tag-based filtering
4. **getAllTags** - Tag aggregation
5. **extractActionables** - Actionable item extraction
6. **findRelated** - Related note discovery
7. **loadNote** - Single note loading

### Metrics Tracked

- **Duration** (ms) - Wall-clock time
- **Mean/Median** - Central tendency
- **Min/Max** - Range
- **P95/P99** - Tail latency
- **Metadata** - Operation-specific context

## Performance Targets

### Acceptable Latency (Medium Corpus - 200 notes)

| Operation | Target | Acceptable |
|-----------|--------|------------|
| scanZones (cold) | <500ms | <1000ms |
| scanZones (warm) | <100ms | <250ms |
| search (text) | <300ms | <750ms |
| search (tags) | <150ms | <400ms |
| getAllTags | <200ms | <500ms |
| extractActionables | <400ms | <1000ms |
| loadNote (single) | <10ms | <50ms |

### Scaling Expectations

Performance should scale approximately linearly with corpus size:

- **Small (50)** → **Medium (200)**: ~4x slower
- **Medium (200)** → **Large (1000)**: ~5x slower
- **Large (1000)** → **XLarge (5000)**: ~5x slower

If scaling is worse than linear (e.g., 10x or 100x), investigate:
- Cache effectiveness
- I/O bottlenecks
- Algorithmic complexity issues

## Interpreting Results

### Good Signs ✅

- Cold cache scan <1s for medium corpus
- Warm cache scan <250ms for medium corpus
- Tag operations faster than text search
- Single note load <50ms

### Warning Signs ⚠️

- Any operation >5s on medium corpus
- Warm cache same speed as cold cache (cache not working)
- Text search slower than full scan (inefficient filtering)
- Linear operations showing O(n²) scaling

### Critical Issues 🚨

- Any operation timing out (>30s)
- Memory errors with large corpus
- Exponential scaling behavior
- Cache hit rate <50%

## Optimization Strategy

Based on benchmark results, prioritize optimizations:

1. **Lazy content loading** - Biggest impact for metadata-only queries
2. **Metadata index** - Eliminates full scan for tag/date filtering
3. **Actionable extraction** - Pre-compute during index build
4. **Search optimization** - Early exit, streaming results

See main README for detailed optimization plans.

## CI/CD Integration

To prevent performance regressions:

```yaml
# .github/workflows/performance.yml
- name: Run benchmarks
  run: npm run benchmark -- --size=medium --iterations=3

- name: Check performance thresholds
  run: |
    # Parse JSON output and fail if p95 > threshold
```

## Troubleshooting

### Benchmarks timing out

Increase Jest timeout in benchmark.test.ts or use standalone runner:

```bash
npm run benchmark  # No Jest timeout limits
```

### Out of memory errors

Reduce fixture size or disable cache:

```bash
npm run benchmark -- --size=small
```

### Inconsistent results

Run multiple iterations for statistical significance:

```bash
npm run benchmark -- --iterations=10
```
