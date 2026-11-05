/**
 * Workspace packages export their TypeScript source under this condition and
 * their compiled build to everything else (packages/shared/package.json). Node
 * runs the build; tests, Vite and the type checker read the source, so a change
 * in shared is seen at once, with no build in between.
 */
export const SOURCE_CONDITION = '@lingualab/source';

/** Vite's default conditions with the source one first, for browser and Node. */
export const sourceResolve = {
  resolve: { conditions: [SOURCE_CONDITION, 'module', 'browser', 'development|production'] },
  ssr: { resolve: { conditions: [SOURCE_CONDITION, 'module', 'node', 'development|production'] } },
};
