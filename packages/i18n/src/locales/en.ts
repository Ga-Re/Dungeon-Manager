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
    error: "That did not work: {{message}}",
  },
  player: {
    windowTitle: "Player view",
  },
};
