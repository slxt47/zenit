# Zenit

Der Himmel, wie er gerade draußen ist – mit Uhrzeit und Datum in der Mitte.
Live: **https://time.slxt.org**

![Zenit bei Sonnenuntergang](https://doc.slxt.dev/bilder/zenit/sonnenuntergang-pc.png)

## Was die Seite zeigt

- **Sonnenstand:** Nacht, astronomische/nautische/bürgerliche Dämmerung, blaue und goldene Stunde, Tag – die Himmelsfarben folgen der Sonnenhöhe, morgens rosiger als abends.
- **Dämmerung sichtbar:** Erdschatten und rosa Venusgürtel am Gegenhorizont, Purpurlicht über der untergegangenen Sonne.
- **Zweite Zeile:** aktuelle Tagesphase, Sonnenauf- und -untergang, wie lange es noch hell ist.
- **Mond und Sterne:** Mond an der richtigen Stelle mit seiner Phase, Sterne nur bei dunklem, klarem Himmel.
- **Wetter:** Wolken (ziehen mit dem Wind), Regen, Niesel, Schnee, **Schneeregen** (beides gleichzeitig), Hagel, gefrierender Regen (Glättegefahr), Nebel, Gewitter mit Blitzen, Wind/Sturm mit Böen, Frost.
- **Besonderes:** Regenbogen (Schauer mit Sonne im Rücken, 42° um den Gegenpunkt), Polarlicht (echter Kp-Index, abhängig von der Breite), Sternschnuppen – während Perseiden, Geminiden & Co. deutlich mehr.
- **Uhr und Datum** in der Zeitzone des gewählten Ortes, auf Deutsch.
- **Ort wählbar:** Standard Graz; Suche nach Städten oder „Mein Standort“. Die Wahl bleibt nur im Browser.
- Hell/Dunkel-Schalter für Knöpfe und Fenster, „Bewegung reduzieren“ wird beachtet.

## Woher die Daten kommen

| Was | Quelle |
|---|---|
| Sonne, Mond, Mondphase | im Browser berechnet (Formeln wie [SunCalc](https://github.com/mourner/suncalc), BSD) |
| Wetter | [Open-Meteo](https://open-meteo.com/) `forecast` → `current` (Temperatur, Wettercode, Bewölkung, Regen, Schauer, Schneefall, Wind) – frei, ohne Schlüssel. Open-Meteo rechnet mit Modellen nationaler Wetterdienste (u. a. DWD, ECMWF) und wählt automatisch das passende für den Ort |
| Ortssuche | [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) (GeoNames) |
| Polarlicht | planetarer Kp-Index von [NOAA SWPC](https://www.swpc.noaa.gov/) (nur ab 40° Breite, 15 min im Browser gespeichert) |
| Meteorströme | feste Liste der großen Ströme (Maximum ±2 Tage) |

Die Anfragen an Open-Meteo und NOAA stellt der Browser selbst – der Server sieht keine Wetterdaten und braucht keinen Schlüssel.

## Aktualisierung und Cache

- Das Wetter wird **alle 10 Minuten** neu geholt (Open-Meteo aktualisiert `current` alle 15 Minuten), außerdem sofort, wenn der Tab wieder sichtbar wird. Unten steht „Stand hh:mm“.
- Beim **Neuladen** kommt das Wetter aus dem Browser-Speicher (`localStorage`, 10 Minuten gültig) – keine neue Anfrage.
- Skript und Stylesheet tragen eine Version (`?v=`) und werden 1 Jahr gecacht, die HTML-Seite wird immer frisch geprüft.

## Ausprobieren

| Parameter | Wirkung |
|---|---|
| `?ort=Wien` | anderer Ort (wird nicht gespeichert) |
| `?zeit=2026-06-21T20:50:00%2B02:00` | andere Startzeit |
| `?zeitraffer=600` | Zeit läuft 600× schneller |
| `?wetter=95` | WMO-Wettercode erzwingen (0 klar, 3 bedeckt, 45 Nebel, 63 Regen, 68 Schneeregen, 73 Schnee, 95 Gewitter) |
| `?wolken=80` | Bewölkung in % |
| `?kp=8` | Kp-Index für Polarlicht erzwingen |
| `?wind=60` | Wind in km/h (Böen ×1,5) |

## Aufbau

Keine Bibliotheken, kein Build – alles im `<canvas>`:

| Datei | Inhalt |
|---|---|
| `index.html` | Seite, Uhr in der Mitte, Ort-Fenster |
| `zenit.js` | Astronomie, Himmelsfarben, Wolken, Niederschlag, Wetter, Uhr, Ortssuche |
| `zenit.css` | Aussehen (Glas-Knöpfe, hell/dunkel) |
| `modus.js` | Hell/Dunkel-Schalter (gemeinsam mit den anderen slxt-Seiten) |
| `logo.svg`, `logo-180.png` | Logo |

Ausgeliefert als statische Dateien von nginx (schreibgeschützter Container, Rate-Limit pro Besucher, strenge CSP).

## Hinweise

Astronomie-Formeln nach SunCalc (BSD-2-Clause, © Vladimir Agafonkin). Wetterdaten © Open-Meteo.com (CC BY 4.0).
