/** file:// URL of a self-made page in `packages/test-fixtures/pages/`. */
export function fixturePage(name: string): string {
  return new URL(`../pages/${name}`, import.meta.url).href;
}
