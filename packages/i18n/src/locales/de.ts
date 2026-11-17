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
    refreshDisplays: "Displays neu suchen",
    error: "Das hat nicht geklappt: {{message}}",
    errors: {
      unknownDisplay:
        "Dieses Display ist nicht mehr verfügbar. Bitte Displays neu suchen.",
    },
  },
  library: {
    heading: "Bibliothek",
    loading: "Bibliothek wird geöffnet …",
    none: "Noch kein Bibliotheksordner gewählt. Am besten einen Ordner in deinem Cloud-Speicher (z. B. Dropbox, iCloud Drive).",
    folder: "Ordner: {{path}}",
    choose: "Bibliotheksordner wählen …",
    campaigns: "Kampagnen",
    noCampaigns: "Noch keine Kampagnen in dieser Bibliothek.",
    campaign: {
      notAvailable: "{{slug}} (noch nicht heruntergeladen)",
      invalid: "{{slug}} (kann nicht gelesen werden)",
    },
    errors: {
      noLibrary:
        "Es ist kein Bibliotheksordner geöffnet. Bitte einen Ordner wählen.",
      invalidPath: "Auf diese Datei darf die App nicht zugreifen.",
    },
  },
  companion: {
    heading: "Dungeon Manager für Spieler",
    placeholder: "Hier kannst du bald dem Spieltisch beitreten.",
  },
  player: {
    windowTitle: "Spieleransicht",
  },
};

/** Shape of a locale; derived from German so missing keys fail the typecheck. */
export type Messages = typeof de;
