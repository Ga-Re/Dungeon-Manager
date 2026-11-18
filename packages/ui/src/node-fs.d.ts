// The repo has no @types/node; tests only need this one function to read a committed file.
declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
}
