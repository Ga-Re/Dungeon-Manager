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
    rotateTv: "Rotate TV view (now {{degrees}}°)",
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
    newCampaignName: "Name of the new campaign",
    createCampaign: "Create campaign",
    campaignCreated: "Campaign “{{name}}” created.",
    campaign: {
      notAvailable: "{{slug}} (not downloaded yet)",
      invalid: "{{slug}} (cannot be read)",
    },
    errors: {
      noLibrary: "No library folder is open. Please choose a folder.",
      forbidden: "This window may not access the library.",
      unsupportedFile: "This file is not a PNG, JPG or WebP image.",
      invalidPath: "The app may not access this file.",
    },
  },
  campaign: {
    heading: "Campaign: {{name}}",
    loading: "Loading scenes …",
    scenes: "Scenes",
    noScenes: "No scenes in this campaign yet.",
    newSceneName: "Name of the new scene",
    createScene: "Create scene",
    sceneCreated: "Scene “{{name}}” created.",
    openScene: "Open scene: {{name}}",
    importMap: "Choose map …",
    mapFilter: "Maps (PNG, JPG, WebP)",
    mapForNewScene: "Map for the new scene: {{file}}",
    noMapForNewScene: "The new scene gets no map yet.",
    map: "Map: {{file}}",
    noMap: "No map",
    defaultLevel: "Ground floor",
    chooseSceneMap: "Choose a map for this scene …",
    changeMap: "Change map …",
    deleteScene: "Delete scene …",
    confirmDelete:
      "Really delete scene “{{name}}”? It will be moved to the campaign's trash.",
    deleteConfirmed: "Yes, delete",
    cancel: "Cancel",
    sceneDeleted: "Scene “{{name}}” is in the campaign's trash.",
    mapChange: {
      question:
        "New map: {{file}}. What should happen to the current setup? Anything not ticked is kept.",
      fog: "Reset fog (cover everything again)",
      grid: "Reset grid (calibrate again)",
      tokens: "Remove tokens (and their initiative entries)",
      apply: "Use this map",
    },
    closeScene: "Close scene",
    scene: {
      notAvailable: "{{id}} (not downloaded yet)",
      invalid: "{{id}} (cannot be read)",
    },
  },
  mapView: {
    label: "Map of the scene “{{name}}”",
    help: "Mouse wheel or + and − zoom, drag or arrow keys pan, R rotates, 0 fits the map.",
    loading: "Loading map …",
    error:
      "The map could not be loaded. Is the file still in the library and downloaded?",
    fit: "Fit",
    rotate: "Rotate",
  },
  companion: {
    heading: "Dungeon Manager for players",
    placeholder: "Soon you can join the game table here.",
  },
  player: {
    notShown:
      "The scene cannot be shown on the TV: the campaign file is not readable. The TV stays black.",
    windowTitle: "Player view",
  },
};
