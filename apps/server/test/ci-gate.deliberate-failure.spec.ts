import { describe, it, expect } from 'vitest';

// TEMPORARY, AND NEVER MERGED.
//
// This test fails on purpose, to prove the Phase 0 exit criterion: "CI blocks a
// pull request with a failing test". The pull request it opens is closed and
// this branch deleted as soon as the block is shown.
describe('Phase 0 exit criterion: CI blocks a failing test', () => {
  it('fails on purpose, so the pull request cannot merge', () => {
    expect(1 + 1).toBe(3);
  });
});
