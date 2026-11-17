import { projectForViewer } from "@dungeon-manager/core";
import type { Scene } from "@dungeon-manager/schema";
import { loadCampaign } from "@dungeon-manager/storage";
import { useContext, useEffect, useState } from "react";
import type { LibraryService } from "../platform/library.js";
import { PlayerFeedContext } from "./player-feed-context.js";

/**
 * Shows `scene` on the table TV while it is open, as `projectForViewer` leaves it for the table
 * (hidden data never leaves the DM window). Fails closed: if the campaign cannot be read or the
 * projection fails, the TV shows nothing. @returns whether the TV could not show the scene
 */
export function usePlayerView(
  service: LibraryService,
  slug: string,
  scene: Scene,
): boolean {
  const feed = useContext(PlayerFeedContext);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!feed) return;
    let active = true;
    // The campaign holds the visibility defaults the projection needs.
    void loadCampaign(service.fs, slug).then((campaign) => {
      if (!active) return;
      try {
        if (campaign.status !== "ok")
          throw new Error(`campaign ${campaign.status}`);
        feed.show(
          projectForViewer(
            { campaign: campaign.value, scene },
            { kind: "table" },
          ),
        );
        setFailed(false);
      } catch {
        feed.show(null);
        setFailed(true);
      }
    });
    return () => {
      active = false;
      feed.show(null);
    };
  }, [feed, service, slug, scene]);

  return failed;
}
