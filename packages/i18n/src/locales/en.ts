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
  library: {
    heading: "Library",
    loading: "Opening the library …",
    none: "No library folder chosen yet. A folder in your cloud storage (e.g. Dropbox, iCloud Drive) works best.",
    folder: "Folder: {{path}}",
    choose: "Choose library folder …",
    campaigns: "Campaigns",
    noCampaigns: "No campaigns in this library yet.",
    campaign: {
      notAvailable: "{{slug}} (not downloaded yet)",
      invalid: "{{slug}} (cannot be read)",
    },
    errors: {
      noLibrary: "No library folder is open. Please choose a folder.",
      forbidden: "This window may not access the library.",
      invalidPath: "The app may not access this file.",
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
