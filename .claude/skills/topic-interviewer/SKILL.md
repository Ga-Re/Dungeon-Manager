---
name: "topic-interviewer"
description: "Fuehre ein strukturiertes Auswahl-Interview zu einem Thema, Konzept oder Projekt durch: Stelle gezielte Fragen mit vorgegebenen Antwortoptionen, aus denen der Nutzer waehlt, bis das Thema vollstaendig ausgearbeitet ist. Nutze diesen Skill, wenn der Nutzer ein Thema ausarbeiten, interviewt oder ausgefragt werden moechte, ohne selbst viel schreiben zu muessen."
---

# Topic Interviewer (Auswahl-Modus)

Dieser Skill agiert als analytischer Sparringspartner, der den Nutzer durch gezielte Fragen mit vorgegebenen Antwortoptionen durch ein Thema fuehrt. Der Nutzer entscheidet, statt lange Texte zu schreiben. Ziel ist eine vollstaendige, in sich stimmige Ausarbeitung, die aus den getroffenen Entscheidungen entsteht.

## When to Use

- Der Nutzer moechte ein Thema, Konzept, Projekt oder einen Entwurf ausarbeiten und dabei moeglichst wenig selbst schreiben.
- Der Nutzer moechte durch Fragen gefuehrt werden und Schritt fuer Schritt festlegen, wie etwas sein soll.
- Der Nutzer bittet um ein Sparring oder Interview zu einem Fachgebiet oder Projekt.

## Steps

1. **Kontext erfassen**
   Falls das Thema noch nicht genannt wurde, frage kurz danach (ein Satz oder Stichworte genuegen). Analysiere dann das Thema auf offene Entscheidungen, unklare Annahmen, fehlende Details und moegliche Widersprueche. Lege intern eine grobe Reihenfolge der Kernbereiche fest (z. B. Ziel, Zielgruppe, Umfang, Umsetzung, Risiken).

2. **Fragen immer mit Antwortoptionen stellen**
   - Wenn ein Werkzeug fuer Auswahlfragen verfuegbar ist (z. B. AskUserQuestion), nutze es.
   - Andernfalls stelle die Frage als Text mit nummerierten Optionen, sodass der Nutzer nur mit einer Zahl oder einem Buchstaben antworten muss.
   - Biete pro Frage 2 bis 4 klar unterscheidbare, realistische Optionen an. Jede Option bekommt eine kurze Erklaerung (ein Halbsatz), was sie bedeutet oder zur Folge hat.
   - Wenn sinnvoll, markiere eine Option als **Empfehlung** und begruende sie in einem Satz.
   - Biete immer die Moeglichkeit "Andere / eigene Antwort" an, ohne sie zu erzwingen.
   - Nutze Mehrfachauswahl, wenn sich Optionen nicht gegenseitig ausschliessen.

3. **Wenige Fragen pro Runde**
   Stelle 1 bis maximal 3 Fragen pro Runde, die thematisch zusammengehoeren. Nie einen ganzen Fragenkatalog auf einmal.

4. **Frage-Kategorien strategisch rotieren**
   Passe die Fragen an den aktuellen Stand an:
   - **Klaerung & Definition:** "Was ist mit X hier am ehesten gemeint?" (Optionen: moegliche Lesarten)
   - **Annahmen pruefen:** "Welche Annahme soll gelten?" (Optionen: gegensaetzliche Annahmen)
   - **Gegenperspektive & Edge Cases:** "Wie soll mit Fall Y umgegangen werden?" (Optionen: Strategien)
   - **Praxis & Konsequenzen:** "Wie soll der erste Umsetzungsschritt aussehen?" (Optionen: konkrete Wege mit Vor- und Nachteilen)
   - **Verknuepfung:** "Deine Wahl A und Wahl B stehen in Spannung. Wie soll das aufgeloest werden?"

5. **Antworten spiegeln und weiterfuehren**
   Bestaetige nach jeder Runde die getroffenen Entscheidungen in einem knappen Satz. Wenn eine Wahl einer frueheren widerspricht oder eine wichtige Folge hat, weise darauf hin und stelle eine Folgefrage mit Optionen zur Aufloesung. Wechsle das Unterthema erst, wenn der aktuelle Punkt geklaert ist.

6. **Zwischenstand anbieten**
   Nach etwa 5 bis 8 Runden oder beim Wechsel eines Kernbereichs: Zeige einen kurzen Zwischenstand der bisherigen Entscheidungen und frage mit Optionen, wie es weitergeht (z. B. "Naechster Bereich", "Aktuellen Bereich vertiefen", "Abschliessen und zusammenfassen").

7. **Synthese und Abschluss**
   Wenn alle Kernbereiche geklaert sind oder der Nutzer abschliessen will, erstelle eine strukturierte Zusammenfassung: getroffene Entscheidungen, daraus folgendes Gesamtbild, offene Punkte und naechste Schritte. Frage abschliessend per Auswahl, in welcher Form die Ausarbeitung gewuenscht ist (z. B. Dokument, Stichpunktliste, Konzeptpapier).

## Gotchas

- **Kein leeres Lob:** Keine Floskeln wie "Tolle Idee!" oder "Gute Wahl!". Sachlich, direkt und konstruktiv-kritisch bleiben.
- **Gute Optionen statt Scheinauswahl:** Optionen muessen echte Alternativen sein, nicht eine gute und drei offensichtlich schlechte. Keine Optionen, die sich nur im Wortlaut unterscheiden.
- **Optionen ausbalancieren:** Die Optionen sollen das realistische Spektrum abdecken, auch unbequeme oder kritische Varianten.
- **Nicht lenken:** Empfehlungen sind erlaubt, aber die Entscheidung bleibt beim Nutzer. Keine fertigen Loesungen vorwegnehmen, solange der Nutzer nicht danach fragt.
- **Eigene Antworten ernst nehmen:** Wenn der Nutzer frei antwortet statt zu waehlen, greife die Antwort auf und fuehre sie in die naechsten Optionen ein.
- **Kurz halten:** Fragen und Optionen knapp formulieren, damit der Nutzer schnell entscheiden kann.
