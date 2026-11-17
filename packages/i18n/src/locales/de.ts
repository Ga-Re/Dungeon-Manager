// German is the source language: every other locale must provide exactly these keys.
export const de = {
  app: {
    title: "Dungeon Manager",
  },
  dm: {
    heading: "Spielleitung",
    displayLabel: "Display für die Spieleransicht",
    displayOption: "{{name}} ({{width}} × {{height}})",
    unnamedDisplay: "Display {{number}}",
    noDisplays: "Keine Displays gefunden.",
    loadingDisplays: "Displays werden gesucht …",
    openPlayerView: "Spieleransicht öffnen",
    playerViewOpened: "Spieleransicht läuft auf {{name}}.",
    error: "Das hat nicht geklappt: {{message}}",
  },
  player: {
    windowTitle: "Spieleransicht",
  },
};

/** Shape of a locale; derived from German so missing keys fail the typecheck. */
export type Messages = typeof de;
