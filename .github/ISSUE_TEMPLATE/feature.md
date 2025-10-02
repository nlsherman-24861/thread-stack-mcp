---
name: Feature / Enhancement
about: Propose a new feature or enhancement
title: ''
labels: enhancement
assignees: ''
---

## Problem
Brief description of the problem this solves or the need it addresses.

## Proposed Solution
What you want to implement and how it should work.

## Implementation Approach
High-level technical approach or specific guidance for implementation.

## Acceptance Criteria

**Before creating PR - RUN IN THIS ORDER:**

```bash
# Step 1: Clean build
rm -rf dist/ && npm run build    # Must show 0 errors

# Step 2: Run tests (after build)
npm test                          # Must show 0 failures
```

**Checklist for PR:**
- [ ] Clean build completed (0 errors)
- [ ] All tests pass (0 failures - paste summary below)
- [ ] New code has tests
- [ ] Coverage not reduced
- [ ] Lockfile updated if dependencies changed

**Test Results:**
```
[paste "Test Suites: X passed, X total" here]
```

## Additional Context
Any other context, screenshots, or examples.
