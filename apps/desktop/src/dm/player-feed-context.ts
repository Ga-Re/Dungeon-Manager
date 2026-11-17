import { createContext } from "react";
import type { PlayerFeedSender } from "../platform/player-feed.js";

/** Provided once in `main.tsx`: what the table TV shows. Absent in tests that do not need it. */
export const PlayerFeedContext = createContext<PlayerFeedSender | null>(null);
