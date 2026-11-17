/** The last segment of a library path, for display. */
export const fileName = (path: string) => path.split("/").at(-1) ?? path;
