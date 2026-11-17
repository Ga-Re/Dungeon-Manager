import type { Messages } from "./de.js";

export const en: Messages = {
  app: {
    title: "Dungeon Manager",
  },
  dm: {
    heading: "Game master",
    displayLabel: "Display for the player view",
    displayOption: "{{name}} ({{width}} × {{height}})",
    unnamedDisplay: "Display {{number}}",
    noDisplays: "No displays found.",
    loadingDisplays: "Looking for displays …",
    openPlayerView: "Open player view",
    playerViewOpened: "Player view is running on {{name}}.",
    refreshDisplays: "Search displays again",
    error: "That did not work: {{message}}",
    errors: {
      unknownDisplay:
        "This display is no longer available. Please search displays again.",
    },
  },
  companion: {
    heading: "Dungeon Manager for players",
    placeholder: "Soon you can join the game table here.",
  },
  player: {
    windowTitle: "Player view",
  },
};
