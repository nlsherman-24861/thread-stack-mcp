---
name: Bug Report
about: Report a bug or issue
title: ''
labels: bug
assignees: ''
---

## Description
Clear description of the bug.

## Steps to Reproduce
1. Step one
2. Step two
3. Bug occurs

## Expected Behavior
What should happen.

## Actual Behavior
What actually happens.

## Acceptance Criteria (for fix)

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
- [ ] Test added reproducing the bug
- [ ] Test passes with fix applied
- [ ] Coverage not reduced

**Test Results:**
```
[paste "Test Suites: X passed, X total" here]
```

## Environment
- Node version:
- OS:
- Other relevant details:
