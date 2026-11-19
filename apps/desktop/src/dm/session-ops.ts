import type { Session } from "@dungeon-manager/schema";

// Changes to a session's scene list (T-160b). Pure: the caller saves the result.

/** Appends a scene; a scene already in the session stays where it is. */
export function addScene(session: Session, sceneId: string): Session {
  if (session.sceneIds.includes(sceneId)) return session;
  return { ...session, sceneIds: [...session.sceneIds, sceneId] };
}

export function removeScene(session: Session, sceneId: string): Session {
  return {
    ...session,
    sceneIds: session.sceneIds.filter((id) => id !== sceneId),
  };
}

/** Moves a scene one place up (-1) or down (+1); at either end nothing changes. */
export function moveScene(
  session: Session,
  sceneId: string,
  step: -1 | 1,
): Session {
  const ids = [...session.sceneIds];
  const from = ids.indexOf(sceneId);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return session;
  [ids[from], ids[to]] = [ids[to] as string, ids[from] as string];
  return { ...session, sceneIds: ids };
}
