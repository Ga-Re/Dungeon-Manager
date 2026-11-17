import { useEffect, useRef } from "react";
import type { LibraryService } from "../platform/library.js";

/** Sync clients write in bursts; wait for a quiet moment before re-reading. */
export const RELOAD_DELAY_MS = 300;

/**
 * Calls `onChange` (debounced) when files under `prefix` change on disk. Temporary files of
 * atomic writes are ignored: the final rename reports the real file anyway.
 */
export function useLibraryChanges(
  service: LibraryService,
  prefix: string,
  onChange: () => void,
): void {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = service.onChange((paths) => {
      if (
        !paths.some((path) => path.startsWith(prefix) && !path.endsWith(".tmp"))
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
  }, [service, prefix]);
}
