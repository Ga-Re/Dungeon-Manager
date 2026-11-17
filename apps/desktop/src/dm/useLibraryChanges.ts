import { useEffect, useRef } from "react";
import type { LibraryService } from "../platform/library.js";

/** Sync clients write in bursts; wait for a quiet moment before re-reading. */
export const RELOAD_DELAY_MS = 300;

/**
 * Calls `onChange` (debounced) when a changed path satisfies `matches`. Temporary files of
 * atomic writes are ignored: the final rename reports the real file anyway.
 */
export function useLibraryChanges(
  service: LibraryService,
  matches: (path: string) => boolean,
  onChange: () => void,
): void {
  const callback = useRef(onChange);
  const matcher = useRef(matches);
  useEffect(() => {
    callback.current = onChange;
    matcher.current = matches;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = service.onChange((paths) => {
      if (
        !paths.some((path) => !path.endsWith(".tmp") && matcher.current(path))
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        callback.current();
      }, RELOAD_DELAY_MS);
    });
    return () => {
      clearTimeout(timer);
      void unsubscribe.then((stop) => {
        stop();
      });
    };
  }, [service]);
}
