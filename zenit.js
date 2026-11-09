// Zenit (time.slxt.org): zeichnet den Himmel so, wie er gerade am gewählten Ort aussieht.
// - Sonnen- und Mondstand werden im Browser berechnet (Formeln wie SunCalc, Genauigkeit reicht fürs Auge).
// - Wetter (Bewölkung, Regen, Schnee, Nebel, Gewitter, Wind) kommt von Open-Meteo (ohne Schlüssel), alle 10 Minuten.
// - Blickrichtung: Süden (auf der Südhalbkugel Norden) – Osten links, Westen rechts, wie man draußen steht.
// Testen/Vorschau per Adresse:  ?zeit=2026-06-21T21:15  ?wetter=61  ?wolken=80  ?zeitraffer=600  ?ort=Wien
// (?wetter=68/69 = Schneeregen: Regen und Schnee gleichzeitig)  ?kp=8 (Polarlicht)  ?wind=60 (km/h)
(() => {
  'use strict';

  // ---------- Einstellungen ----------
  const STANDARD = { name: 'Graz', land: 'Österreich', lat: 47.0707, lon: 15.4395 };
  const SPEICHER_ORT = 'zenit-ort', SPEICHER_WETTER = 'zenit-wetter';
  const WETTER_ALLE_MS = 10 * 60 * 1000;
  const q = new URLSearchParams(location.search);
  const ruhig = matchMedia('(prefers-reduced-motion: reduce)');
  const lesen = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const schreiben = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privat: egal */ } };

  // Vorschau-Zeit: feste Startzeit und/oder Zeitraffer (Faktor)
  const startEcht = Date.now();
  const zeitParam = q.get('zeit') ? Date.parse(q.get('zeit')) : NaN;
  const startZeit = Number.isFinite(zeitParam) ? zeitParam : startEcht;
  const raffer = Math.min(100000, Math.max(1, Number(q.get('zeitraffer')) || 1));
  const jetzt = () => new Date(startZeit + (Date.now() - startEcht) * raffer);

  // ---------- Astronomie (nach SunCalc, V. Agafonkin, BSD) ----------
  const RAD = Math.PI / 180, TAG_MS = 864e5, J1970 = 2440588, J2000 = 2451545, E = RAD * 23.4397;
  const tage = (d) => d.valueOf() / TAG_MS - 0.5 + J1970 - J2000;
  const rekt = (l, b) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
  const dekl = (l, b) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
  const azim = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const hoehe = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const sternzeit = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;
  function sonneKoord(d) {
    const M = RAD * (357.5291 + 0.98560028 * d);
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + RAD * 102.9372 + Math.PI;
    return { dec: dekl(L, 0), ra: rekt(L, 0) };
  }
  function mondKoord(d) {
    const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d);
    const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
    return { ra: rekt(l, b), dec: dekl(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }
  // Ergebnis: Höhe in Grad, Kompassrichtung in Grad (0 = Nord, 90 = Ost)
  function position(koord, datum, lat, lon) {
    const lw = RAD * -lon, phi = RAD * lat, d = tage(datum), H = sternzeit(d, lw) - koord.ra;
    return { hoehe: hoehe(H, phi, koord.dec) / RAD, richtung: ((azim(H, phi, koord.dec) / RAD) + 180 + 360) % 360 };
  }
  const sonne = (datum, lat, lon) => position(sonneKoord(tage(datum)), datum, lat, lon);
  const mond = (datum, lat, lon) => position(mondKoord(tage(datum)), datum, lat, lon);
  function mondPhase(datum) {   // 0 = Neumond, 0,5 = Vollmond
    const d = tage(datum), s = sonneKoord(d), m = mondKoord(d), sd = 149598000;
    const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
    const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI;
  }

  // ---------- Dämmerung, Sonnenzeiten, Sternschnuppen-Ströme ----------
  // Phasen nach Sonnenhöhe (steigend = Morgen): Nacht < −18° < astronomische < −12° < nautische < −6° < bürgerliche
  // Dämmerung (−6…−4° blaue Stunde, −4…+6° goldene Stunde). Auf-/Untergang bei −0,833° (Lichtbrechung + Sonnenradius).
  function tagesphase(d) {
    const h = sonne(d, ort.lat, ort.lon).hoehe, steigt = sonne(new Date(d.valueOf() + 6e5), ort.lat, ort.lon).hoehe > h;
    const M = steigt ? 'Morgen' : 'Abend';
    let name;
    if (Math.abs(h + 0.833) < 0.6) name = steigt ? 'Sonnenaufgang' : 'Sonnenuntergang';
    else if (h >= 6) name = 'Tag';
    else if (h >= -0.833) name = 'Goldene Stunde';
    else if (h >= -4) name = `${M}dämmerung · Goldene Stunde`;
    else if (h >= -6) name = `${M}dämmerung · Blaue Stunde`;
    else if (h >= -12) name = `Nautische ${M}dämmerung`;
    else if (h >= -18) name = `Astronomische ${M}dämmerung`;
    else name = 'Nacht';
    return { name, steigt, h };
  }
  // Sonnenauf-/-untergang und Beginn/Ende der bürgerlichen Dämmerung für den heutigen Tag am Ort (Zeitzone des Ortes)
  function sonnenzeiten(d, zz) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: zz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const heute = f.format(d), erg = {}, schritt = 6e5;
    const ueber = (t, g) => sonne(new Date(t), ort.lat, ort.lon).hoehe - g;
    for (const [g, auf, unter] of [[-0.833, 'auf', 'unter'], [-6, 'daemmerBeginn', 'daemmerEnde']]) {
      let t0 = d.valueOf() - 30 * 36e5, v0 = ueber(t0, g);
      for (let t = t0 + schritt; t <= d.valueOf() + 30 * 36e5; t += schritt) {
        const v = ueber(t, g);
        if ((v0 < 0) !== (v < 0)) {
          let lo = t - schritt, hi = t;
          for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if ((ueber(lo, g) < 0) === (ueber(m, g) < 0)) lo = m; else hi = m; }
          const z = new Date((lo + hi) / 2);
          if (f.format(z) === heute) erg[v > 0 ? auf : unter] = z;
        }
        t0 = t; v0 = v;
      }
    }
    return erg;
  }
  // Große Meteorströme (Maximum, ±2 Tage gilt als aktiv)
  const STROEME = [['Quadrantiden', 1, 4], ['Lyriden', 4, 22], ['Eta-Aquariiden', 5, 6], ['Perseiden', 8, 12],
    ['Orioniden', 10, 21], ['Leoniden', 11, 17], ['Geminiden', 12, 14], ['Ursiden', 12, 22]];
  function stromAktiv(d, zz) {
    const [j, m, t] = new Intl.DateTimeFormat('en-CA', { timeZone: zz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-').map(Number);
    const heute = Date.UTC(j, m - 1, t);
    for (const [name, mm, tt] of STROEME) {
      for (const jj of [j - 1, j, j + 1]) if (Math.abs(heute - Date.UTC(jj, mm - 1, tt)) <= 2 * TAG_MS) return name;
    }
    return '';
  }

  // ---------- Farben ----------
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const klemm = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const glatt = (a, b, x) => { const t = klemm((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  // Himmelsfarben je Sonnenhöhe: [Zenit, Mitte, Horizont]
  const VERLAUF = [
    [-90, '#02030a', '#05081a', '#0a0f28'],
    [-18, '#02030a', '#05081a', '#0a0f28'],
    [-12, '#040820', '#0b1636', '#18224a'],
    [-7, '#0b1640', '#212d66', '#4a3f78'],
    [-3, '#18306e', '#4a4f92', '#c0706a'],
    [0, '#284f96', '#7280b8', '#f09a5c'],
    [3, '#3468b4', '#8aa6d6', '#f6bd7e'],
    [8, '#2f74d0', '#6eaae6', '#c9e2f2'],
    [20, '#226fd6', '#5ca5ea', '#acd6f4'],
    [90, '#1660d2', '#4b98e6', '#9acdf3'],
  ].map(([h, a, b, c]) => [h, hex(a), hex(b), hex(c)]);
  function himmelsfarben(h) {
    for (let i = 1; i < VERLAUF.length; i++) {
      if (h <= VERLAUF[i][0]) {
        const [h0, ...a] = VERLAUF[i - 1], [h1, ...b] = VERLAUF[i], t = (h - h0) / (h1 - h0);
        return a.map((c, k) => mix(c, b[k], t));
      }
    }
    return VERLAUF[VERLAUF.length - 1].slice(1);
  }
  // Bedeckter Himmel: Richtung Grau mit ähnlicher Helligkeit, bei Regen dunkler
  function vergrauen(c, f, dunkel) {
    const l = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) * dunkel;
    return mix(c, [l * 0.97, l, l * 1.04], f);
  }

  // ---------- Wetter ----------
  const WMO = {
    0: 'Klar', 1: 'Überwiegend klar', 2: 'Teilweise bewölkt', 3: 'Bedeckt', 45: 'Nebel', 48: 'Nebel mit Reif',
    51: 'Leichter Nieselregen', 53: 'Nieselregen', 55: 'Starker Nieselregen', 56: 'Gefrierender Niesel', 57: 'Gefrierender Niesel',
    61: 'Leichter Regen', 63: 'Regen', 65: 'Starker Regen', 66: 'Gefrierender Regen', 67: 'Gefrierender Regen',
    68: 'Leichter Schneeregen', 69: 'Schneeregen',
    71: 'Leichter Schneefall', 73: 'Schneefall', 75: 'Starker Schneefall', 77: 'Schneegriesel',
    80: 'Leichte Regenschauer', 81: 'Regenschauer', 82: 'Heftige Regenschauer', 85: 'Schneeschauer', 86: 'Starke Schneeschauer',
    95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Schweres Gewitter mit Hagel',
  };
  // Was am Himmel passiert, abgeleitet aus Wettercode + Messwerten
  function lage(w) {
    const c = w.code;
    // Regen und Schnee getrennt: Wettercode ODER gemessene Mengen (rain/showers in mm, snowfall in cm) –
    // fällt beides, zeichnet die Seite beides (Schneeregen)
    const misch = c === 68 || c === 69;
    const regen = misch || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(c) || (w.regen || 0) > 0;
    const schnee = misch || [71, 73, 75, 77, 85, 86].includes(c) || (w.schneefall || 0) > 0;
    const stark = { 68: .45, 69: .75, 51: .25, 53: .4, 55: .6, 56: .3, 57: .5, 61: .45, 63: .7, 65: 1, 66: .5, 67: .8, 80: .5, 81: .75, 82: 1, 95: .9, 96: 1, 99: 1, 71: .35, 73: .6, 75: 1, 77: .3, 85: .55, 86: .9 }[c] || 0;
    const schauer = [80, 81, 82].includes(c);
    let wolken = klemm((w.wolken ?? ({ 0: 0, 1: 20, 2: 50, 3: 95, 80: 60, 81: 70, 82: 80 }[c] ?? 90)) / 100);
    if (regen || schnee) wolken = Math.max(wolken, schauer && !schnee ? 0.5 : 0.85);   // Schauer: Sonne kann durchkommen
    if (c === 45 || c === 48) wolken = Math.max(wolken, 0.7);
    return { wolken, regen, schnee, stark: Math.max(stark, klemm((w.niederschlag || 0) / 6)) * (regen || schnee ? 1 : 0),
      misch: regen && schnee, nebel: c === 45 || c === 48, gewitter: c >= 95, niesel: c >= 51 && c <= 57, schauer,
      hagel: c === 96 || c === 99, gefrierend: [56, 57, 66, 67].includes(c),
      wind: w.wind || 0, boeen: w.boeen || 0, windRichtung: w.windRichtung ?? 270 };
  }

  // ---------- Zustand ----------
  let ort = lesen(SPEICHER_ORT) || lesen('himmel-ort') || STANDARD;   // himmel-ort: alter Name bis 09.11.2026
  let wetter = null;          // { code, wolken, temp, niederschlag, wind, windRichtung, zone, zeit }
  let zone = 'Europe/Vienna';
  let kpWert = q.has('kp') ? klemm(Number(q.get('kp')) || 0, 0, 9) : null;   // Polarlicht: planetarer Kp-Index (NOAA)
  const besonderes = { regenbogen: false, polarlicht: 0, strom: '' };          // vom Zeichnen gesetzt, für die Textzeile
  const el = (id) => document.getElementById(id);

  // ---------- Zeichnen ----------
  const cv = el('himmel'), ctx = cv.getContext('2d');
  let B = 0, H = 0, dpr = 1;
  let sterne = [], wolkenListe = [], tropfen = [], flocken = [], koerner = [], meteore = [], wolkenStand = '';
  // kleine Hilfsleinwand: darauf grob zeichnen, beim Hochskalieren wird es weich (Venusgürtel, Polarlicht)
  const weichCv = document.createElement('canvas');
  function weich(w, h) { weichCv.width = w; weichCv.height = h; const g = weichCv.getContext('2d'); g.clearRect(0, 0, w, h); return g; }
  function zufall(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  function groesse() {
    dpr = Math.min(2, devicePixelRatio || 1); B = innerWidth; H = innerHeight;
    cv.width = Math.round(B * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = zufall(4711); sterne = [];
    for (let i = 0, n = Math.round(B * H / 2600); i < n; i++) {
      sterne.push({ x: r() * B, y: r() * H * 0.96, g: r() < 0.06 ? 1.4 : 0.35 + r() * 0.8, a: 0.35 + r() * 0.65, f: r() < 0.15, p: r() * 6.3 });
    }
    wolkenStand = ''; tropfen = []; flocken = []; koerner = [];
  }

  // Bildschirm-x (0..1) für eine Kompassrichtung: Blick nach Süden (Südhalbkugel: Norden)
  const bildX = (richtung) => ort.lat >= 0 ? (richtung - 90) / 180 : (((richtung - 270) % 360) + 360) % 360 / 180;
  const HORIZONT = () => H * 0.97;
  const bildY = (h) => HORIZONT() - (h / 70) * HORIZONT() * 0.95;

  // Eine Wolke als Bild: viele weiche Kugeln auf kleiner Leinwand (wird beim Zeichnen hochskaliert = weich),
  // danach von oben hell nach unten Schatten eingefärbt und unten flach ausgeblendet. Neu gebaut bei Licht-/Wetterwechsel.
  function wolkeBauen(r, breite, licht, schatten, flach) {
    const h = breite * (0.5 + r() * 0.15), S = 0.3, c = document.createElement('canvas');
    c.width = Math.ceil(breite * S); c.height = Math.ceil(h * S);
    const g = c.getContext('2d'); g.scale(S, S);
    const n = 18 + Math.floor(r() * 16), basis = h * 0.78;
    for (let i = 0; i < n; i++) {
      const t = r(), buckel = Math.sin(t * Math.PI) ** (flach ? 2.2 : 0.8);
      const rad = breite * (0.045 + 0.1 * buckel * (0.5 + r() * 0.7));
      const x = breite * (0.1 + 0.8 * t);
      const y = Math.min(basis - rad * 0.35, basis - buckel * h * (flach ? 0.18 : 0.42) * (0.4 + r() * 0.6) + rad * 0.2);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.62, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-atop';
    const f = g.createLinearGradient(0, h * 0.15, 0, basis);
    f.addColorStop(0, rgb(licht)); f.addColorStop(0.55, rgb(mix(licht, schatten, 0.35))); f.addColorStop(1, rgb(schatten));
    g.fillStyle = f; g.fillRect(0, 0, breite, h);
    g.globalCompositeOperation = 'destination-out';
    const unten = g.createLinearGradient(0, basis - h * 0.08, 0, h);
    unten.addColorStop(0, 'rgba(0,0,0,0)'); unten.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = unten; g.fillRect(0, 0, breite, h);
    return { bild: c, b: breite, h };
  }

  function wolkenAktualisieren(l, sh) {
    const stand = [Math.round(l.wolken * 20), Math.round(sh / 2), l.regen, l.schnee, B, H].join();
    if (stand === wolkenStand) return;
    wolkenStand = stand;
    // Wolkenfarbe: Tag weiß, tief stehende Sonne rosa-orange, Nacht dunkelblau-grau; bei Regen grauer
    const tag = glatt(-4, 10, sh), daemmer = glatt(-8, -1, sh) * (1 - glatt(2, 12, sh));
    let licht = mix(hex('#2a3150'), hex('#ffffff'), tag);
    licht = mix(licht, hex('#ffb38a'), daemmer * 0.75);
    let schatten = mix(hex('#121628'), hex('#9aa6b8'), tag);
    schatten = mix(schatten, hex('#7a5a8a'), daemmer * 0.5);
    if (l.regen || l.schnee || l.gewitter) { licht = mix(licht, schatten, 0.45); schatten = mix(schatten, [40, 44, 52], 0.4); }
    const r = zufall(1234 + Math.round(l.wolken * 100));
    const n = Math.round(l.wolken * (B > 700 ? 18 : 11));
    const alt = wolkenListe;
    wolkenListe = [];
    for (let i = 0; i < n; i++) {
      const tiefe = r();                          // 0 = fern (klein, oben am Horizont), 1 = nah (groß)
      const breite = (B > 700 ? 300 : 190) * (0.55 + tiefe * 1.2) * (1 + l.wolken * 0.7);
      const w = wolkeBauen(r, breite, licht, schatten, l.wolken > 0.75 || l.nebel);
      w.a = 0.7 + l.wolken * 0.3;
      w.x = alt[i] ? alt[i].x : r() * (B + breite) - breite;
      w.y = H * (0.05 + (1 - tiefe) * 0.62) + (r() - 0.5) * H * 0.08;
      w.v = 0.4 + tiefe * 0.9;
      wolkenListe.push(w);
    }
    wolkenListe.sort((a, b) => a.v - b.v);
  }

  function mondZeichnen(x, y, r, phase, hell, nacht) {
    const k = Math.cos(2 * Math.PI * phase), zunehmend = phase < 0.5;
    ctx.save(); ctx.translate(x, y);
    if (zunehmend === (ort.lat < 0)) ctx.scale(-1, 1);   // abnehmend bzw. Südhalbkugel: Licht links
    const glow = ctx.createRadialGradient(0, 0, r, 0, 0, r * 6);
    glow.addColorStop(0, `rgba(220,228,255,${0.22 * hell * (1 - Math.abs(phase - 0.5) * 1.4)})`); glow.addColorStop(1, 'rgba(220,228,255,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(40,46,70,${0.55 * hell * nacht})`; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(246,244,232,${hell})`;
    ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(0, 0, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
    ctx.fill(); ctx.restore();
  }

  let letzteZeit = performance.now(), blitzWert = 0, naechsterBlitz = 0;
  function zeichnen(ms) {
    const dt = Math.min(0.1, (ms - letzteZeit) / 1000); letzteZeit = ms;
    const d = jetzt(), so = sonne(d, ort.lat, ort.lon), mo = mond(d, ort.lat, ort.lon);
    const l = lage(wetter || { code: 0, wolken: 0 });
    const sh = so.hoehe;
    const regenDunkel = (l.regen || l.schnee) ? (l.schauer && !l.schnee ? 0.86 : 0.72) - l.stark * 0.2 : 1;
    const grau = l.wolken > 0.6 ? (l.wolken - 0.6) / 0.4 * 0.92 : 0;
    const steigt = sonne(new Date(d.valueOf() + 6e5), ort.lat, ort.lon).hoehe > sh;

    // 1. Himmel (Morgendämmerung etwas rosiger und kühler als die orange Abenddämmerung)
    let farben = himmelsfarben(sh);
    const morgen = steigt ? glatt(-12, -4, sh) * (1 - glatt(2, 8, sh)) : 0;
    if (morgen > 0) farben = [mix(farben[0], hex('#2a3a7a'), morgen * 0.2), mix(farben[1], hex('#8a78b8'), morgen * 0.25), mix(farben[2], hex('#f39ab0'), morgen * 0.35)];
    const [z, m, h] = farben.map((c) => vergrauen(c, grau, regenDunkel));
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(z)); g.addColorStop(0.55, rgb(m)); g.addColorStop(1, rgb(h));
    ctx.fillStyle = g; ctx.fillRect(0, 0, B, H);

    // 2. Sonnenschein am Horizont (Dämmerungsglühen) und Lichthof um die Sonne
    const sx = bildX(so.richtung) * B, sy = bildY(sh), sicht = 1 - grau * 0.85;
    const bedeckt = (l.regen && !l.schauer) || l.schnee || l.nebel ? 1 : glatt(0.7, 0.97, l.wolken) * 0.9;
    if (sh > -12) {
      const tief = 1 - glatt(4, 25, sh), st = glatt(-12, -2, sh) * sicht;
      const farbe = mix(hex('#fff6dc'), hex('#ff8a4c'), tief);
      const rg = ctx.createRadialGradient(sx, HORIZONT(), 0, sx, HORIZONT(), Math.max(B, H) * (0.5 + tief * 0.4));
      rg.addColorStop(0, rgb(farbe, 0.55 * st * (0.4 + tief * 0.6))); rg.addColorStop(1, rgb(farbe, 0));
      ctx.fillStyle = rg; ctx.fillRect(0, 0, B, H);
    }
    // 2b. Dämmerung am Gegenhorizont: Erdschatten (dunkelblaues Band, steigt mit sinkender Sonne) und darüber der
    //     rosa Venusgürtel – sichtbar etwa von +3° bis −8° Sonnenhöhe; dazu Purpurlicht hoch über der untergegangenen Sonne
    const vg = glatt(-8.5, -2, sh) * (1 - glatt(0.5, 4, sh)) * sicht * (l.nebel ? 0.3 : 1);
    if (vg > 0.01) {
      const ax = bildX((so.richtung + 180) % 360) * B, hy = HORIZONT();
      const schattenH = H * (0.03 + klemm(-sh / 8, 0, 1) * 0.13), guertelH = H * 0.17;
      const band = ctx.createLinearGradient(0, hy - schattenH - guertelH, 0, hy);
      const anteilS = schattenH / (schattenH + guertelH);
      band.addColorStop(0, 'rgba(236,150,175,0)');
      band.addColorStop(Math.max(0.05, 1 - anteilS - 0.25), `rgba(236,150,175,${0.42 * vg})`);
      band.addColorStop(1 - anteilS, `rgba(214,140,170,${0.3 * vg})`);
      band.addColorStop(Math.min(0.99, 1 - anteilS + 0.08), `rgba(52,62,112,${0.55 * vg})`);
      band.addColorStop(1, `rgba(40,48,92,${0.7 * vg})`);
      // auf kleiner Leinwand zeichnen, seitlich ausblenden (am stärksten gegenüber der Sonne), weich hochskalieren
      const hoch = schattenH + guertelH + H * 0.03, g2 = weich(64, 48);
      const vb = g2.createLinearGradient(0, 0, 0, 48 * (schattenH + guertelH) / hoch);
      [[0, 'rgba(236,150,175,0)'], [Math.max(0.05, 1 - anteilS - 0.25), `rgba(236,150,175,${0.42 * vg})`], [1 - anteilS, `rgba(214,140,170,${0.3 * vg})`],
        [Math.min(0.99, 1 - anteilS + 0.1), `rgba(52,62,112,${0.55 * vg})`], [1, `rgba(40,48,92,${0.7 * vg})`]].forEach(([o, f]) => vb.addColorStop(o, f));
      g2.fillStyle = vb; g2.fillRect(0, 0, 64, 48);
      g2.globalCompositeOperation = 'destination-in';
      const mitte = klemm(ax / B, -0.5, 1.5) * 64, seit = g2.createLinearGradient(mitte - 64, 0, mitte + 64, 0);
      seit.addColorStop(0, 'rgba(0,0,0,0.05)'); seit.addColorStop(0.5, 'rgba(0,0,0,1)'); seit.addColorStop(1, 'rgba(0,0,0,0.05)');
      g2.fillStyle = seit; g2.fillRect(0, 0, 64, 48);
      ctx.drawImage(weichCv, 0, hy - schattenH - guertelH, B, hoch);
    }
    const purpur = glatt(-1, -3.5, sh) * (1 - glatt(-5.5, -8, sh)) * sicht;
    if (purpur > 0.01) {
      const px = klemm(sx, -0.2 * B, 1.2 * B), py = HORIZONT() - H * 0.32;
      const pg = ctx.createRadialGradient(px, py, 0, px, py, Math.max(B, H) * 0.42);
      pg.addColorStop(0, `rgba(196,120,210,${0.26 * purpur})`); pg.addColorStop(1, 'rgba(196,120,210,0)');
      ctx.fillStyle = pg; ctx.fillRect(0, 0, B, H);
    }
    // 2c. Polarlicht (nur wenn der Kp-Index für diese Breite reicht, dunkel und klar): Vorhänge oben am Himmel
    const plNoetig = (66 - Math.abs(ort.lat)) / 2.6 + 1;
    const pl = kpWert == null ? 0 : klemm((kpWert - plNoetig + 1) / 2) * glatt(-9, -15, sh) * (1 - l.wolken) * (l.nebel ? 0 : 1);
    besonderes.polarlicht = pl;
    if (pl > 0.02) {   // 120 schmale Strahlen auf kleiner Leinwand, hochskaliert = weiche, wehende Vorhänge
      const t = ruhig.matches ? 0 : ms / 1000, W = 120, HH = 60, g2 = weich(W, HH);
      for (let i = 0; i < W; i++) {
        const u = i / W;
        const welle = 0.5 + 0.5 * Math.sin(u * 9 + t * 0.35) * Math.sin(u * 23 - t * 0.6 + 1.3);
        const st = pl * klemm(welle * 1.4 - 0.15);
        if (st < 0.02) continue;
        const unten = HH * (0.55 + 0.18 * Math.sin(u * 7 + t * 0.2) + 0.1 * Math.sin(u * 17 - t * 0.33));
        const vg2 = g2.createLinearGradient(0, 0, 0, unten);
        vg2.addColorStop(0, `rgba(220,70,150,${0.18 * st})`); vg2.addColorStop(0.65, `rgba(70,255,170,${0.32 * st})`);
        vg2.addColorStop(0.92, `rgba(140,255,200,${0.5 * st})`); vg2.addColorStop(1, 'rgba(70,255,170,0)');
        g2.fillStyle = vg2; g2.fillRect(i, 0, 1, unten);
      }
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.drawImage(weichCv, 0, 0, B, H * 0.62); ctx.restore();
    }
    // 3. Sterne (nur bei dunklem, klarem Himmel)
    const sternHell = glatt(-3, -14, sh) * (1 - l.wolken * 0.9) * (l.nebel ? 0.2 : 1);
    if (sternHell > 0.01) {
      const tw = ruhig.matches ? 0 : ms / 1000;
      for (const s of sterne) {
        const hor = 1 - glatt(H * 0.7, H, s.y) * 0.7;
        ctx.globalAlpha = sternHell * s.a * hor * (s.f ? 0.75 + 0.25 * Math.sin(tw * 2 + s.p) : 1);
        ctx.fillStyle = s.g > 1 && s.p > 4 ? '#d6deff' : '#ffffff';
        ctx.fillRect(s.x, s.y, s.g, s.g);
      }
      ctx.globalAlpha = 1;
    }
    // 3b. Sternschnuppen: nachts bei klarem Himmel ab und zu, während eines Meteorstroms (±2 Tage ums Maximum) oft
    besonderes.strom = sternHell > 0.3 ? stromAktiv(d, zone) : '';
    if (sternHell > 0.3 && !ruhig.matches) {
      const rate = besonderes.strom ? 1 / 5 : 1 / 40;   // im Schnitt alle 5 s bzw. 40 s
      if (Math.random() < rate * dt) {
        const dir = Math.random() < 0.5 ? 1 : -1, w = (20 + Math.random() * 30) * RAD;
        meteore.push({ x: Math.random() * B, y: Math.random() * H * 0.5, vx: Math.cos(w) * dir, vy: Math.sin(w), t: 0,
          dauer: 0.5 + Math.random() * 0.6, len: 80 + Math.random() * 140, v: 500 + Math.random() * 500 });
      }
      for (const mt of meteore) {
        mt.t += dt;
        const k = mt.t / mt.dauer, a = sternHell * Math.sin(Math.PI * klemm(k)), hx = mt.x + mt.vx * mt.v * mt.t, hy = mt.y + mt.vy * mt.v * mt.t;
        const sg = ctx.createLinearGradient(hx, hy, hx - mt.vx * mt.len, hy - mt.vy * mt.len);
        sg.addColorStop(0, `rgba(255,255,255,${0.9 * a})`); sg.addColorStop(1, 'rgba(200,215,255,0)');
        ctx.strokeStyle = sg; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - mt.vx * mt.len, hy - mt.vy * mt.len); ctx.stroke();
      }
      meteore = meteore.filter((mt) => mt.t < mt.dauer);
    } else meteore = [];
    // 4. Sonne
    const sxr = bildX(so.richtung);
    if (sh > -1.5 && sxr > -0.1 && sxr < 1.1) {
      const r = Math.min(B, H) * 0.045, tief = 1 - glatt(2, 20, sh), a = sicht * (1 - grau * 0.7) * (1 - bedeckt);
      const kern = mix(hex('#fffdf2'), hex('#ffb066'), tief);
      const hof = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 9);
      hof.addColorStop(0, rgb(kern, 0.7 * a)); hof.addColorStop(0.25, rgb(kern, 0.18 * a)); hof.addColorStop(1, rgb(kern, 0));
      ctx.fillStyle = hof; ctx.fillRect(sx - r * 9, sy - r * 9, r * 18, r * 18);
      ctx.fillStyle = rgb(kern, Math.min(1, a * 1.2)); ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    }
    // 5. Mond
    const mx = bildX(mo.richtung);
    if (mo.hoehe > -1 && mx > -0.05 && mx < 1.05) {
      const ph = mondPhase(d), anteil = (1 - Math.cos(2 * Math.PI * ph)) / 2, nacht = glatt(2, -8, sh);
      const hell = (0.35 + 0.65 * nacht) * (nacht > 0.5 ? 1 : glatt(0.08, 0.4, anteil)) * (1 - l.wolken * 0.6) * (1 - bedeckt) * (l.nebel ? 0.4 : 1);
      if (hell > 0.03) mondZeichnen(mx * B, bildY(mo.hoehe), Math.min(B, H) * 0.03, ph, hell, nacht);
    }
    // 6. Wolken (ziehen mit dem Wind; Blick nach Süden: Ostwind schiebt nach rechts)
    wolkenAktualisieren(l, sh);
    const ziel = (l.windRichtung + 180) % 360, ostAnteil = Math.sin(ziel * RAD) * (ort.lat >= 0 ? -1 : 1);
    const tempo = ruhig.matches ? 0 : (4 + l.wind * 0.9) * (ostAnteil >= 0 ? Math.max(0.35, ostAnteil) : Math.min(-0.35, ostAnteil));
    for (const w of wolkenListe) {
      w.x += tempo * w.v * dt * raffer ** 0.3;
      if (w.x > B + 20) w.x = -w.b; else if (w.x < -w.b - 20) w.x = B;
      ctx.globalAlpha = w.a; ctx.drawImage(w.bild, w.x, w.y, w.b, w.h); ctx.globalAlpha = 1;
    }
    // 6b. Regenbogen: Regen mit Sonne im Rücken (Sonne 0,5…42° hoch und nicht verdeckt) – Kreis mit 42° Radius um den
    //     Gegenpunkt der Sonne (liegt so tief unter dem Horizont, wie die Sonne darüber steht), außen rot; Nebenbogen bei 51°
    const gx = bildX((so.richtung + 180) % 360);
    besonderes.regenbogen = l.regen && !l.schnee && !l.nebel && sh > 0.5 && sh < 42 && bedeckt < 0.6 && gx > -0.6 && gx < 1.6;
    if (besonderes.regenbogen) {
      const px = HORIZONT() * 0.95 / 70, cx = gx * B, cy = bildY(-sh);
      const k = (1 - glatt(32, 42, sh)) * glatt(0.5, 3, sh) * (1 - bedeckt) * 0.5;
      const BAND = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#32ade6', '#5e5ce6', '#bf5af2'];
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, B, HORIZONT()); ctx.clip(); ctx.globalCompositeOperation = 'screen';
      ctx.lineWidth = 0.3 * px + 1;
      BAND.forEach((f, i) => {
        ctx.strokeStyle = f;
        ctx.globalAlpha = k; ctx.beginPath(); ctx.arc(cx, cy, (42.2 - i * 0.3) * px, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = k * 0.35; ctx.beginPath(); ctx.arc(cx, cy, (50.2 + i * 0.4) * px, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // 7. Nebel
    if (l.nebel) {
      const ng = ctx.createLinearGradient(0, 0, 0, H), nf = vergrauen(mix(h, [200, 205, 212], 0.5), 1, sh > 0 ? 1 : 0.35);
      ng.addColorStop(0, rgb(nf, 0.35)); ng.addColorStop(1, rgb(nf, 0.85));
      ctx.fillStyle = ng; ctx.fillRect(0, 0, B, H);
    }
    // 8. Regen / Schnee
    if (l.regen || l.schnee) niederschlag(l, dt);
    // 9. Gewitter: Blitze
    if (l.gewitter && !ruhig.matches) {
      if (ms > naechsterBlitz) { blitzWert = 0.55 + Math.random() * 0.35; naechsterBlitz = ms + 4000 + Math.random() * 9000; }
      blitzWert = Math.max(0, blitzWert - dt * (blitzWert > 0.3 ? 2.6 : 1.4));
      el('blitz').style.opacity = (blitzWert * (Math.random() < 0.85 ? 1 : 0.4)).toFixed(3);
    } else if (blitzWert) { blitzWert = 0; el('blitz').style.opacity = 0; }
  }

  function niederschlag(l, dt) {
    const flaeche = B * H / 1.2e6, anteil = l.misch ? 0.6 : 1;
    const sollRegen = l.regen ? Math.round((l.niesel ? 220 : 420) * (0.25 + l.stark) * flaeche * anteil) : 0;
    const sollSchnee = l.schnee ? Math.round(260 * (0.25 + l.stark) * flaeche * anteil) : 0;
    while (tropfen.length < sollRegen) tropfen.push(neuerTropfen(true));
    while (flocken.length < sollSchnee) flocken.push(neuerTropfen(true));
    const sollHagel = l.hagel ? Math.round(90 * flaeche) : 0;
    while (koerner.length < sollHagel) koerner.push(neuerTropfen(true));
    tropfen.length = Math.min(tropfen.length, sollRegen); flocken.length = Math.min(flocken.length, sollSchnee); koerner.length = Math.min(koerner.length, sollHagel);
    const schraeg = klemm(l.wind / 60, 0, 0.6) * (Math.sin(((l.windRichtung + 180) % 360) * RAD) > 0 ? -1 : 1) * (ort.lat >= 0 ? 1 : -1);
    const bewegt = !ruhig.matches;
    if (tropfen.length) {
      ctx.strokeStyle = l.gefrierend ? 'rgba(215,240,255,.75)' : 'rgba(205,215,235,.55)'; ctx.lineWidth = l.gefrierend ? 1.3 : 1;   // gefrierend: eisig
      ctx.beginPath();
      for (const t of tropfen) {
        const len = (l.niesel ? 7 : 16) * t.g, vy = (l.niesel ? 500 : 950) * t.v;
        if (bewegt) { t.y += vy * dt; t.x += vy * schraeg * dt; }
        if (t.y > H) Object.assign(t, neuerTropfen(false));
        ctx.moveTo(t.x, t.y); ctx.lineTo(t.x - schraeg * len, t.y - len);
      }
      ctx.stroke();
    }
    if (koerner.length) {   // Hagel: schnelle, harte weiße Körner
      ctx.fillStyle = 'rgba(245,250,255,.95)';
      for (const t of koerner) {
        if (bewegt) { t.y += 1100 * t.v * dt; t.x += 1100 * t.v * schraeg * dt; }
        if (t.y > H) Object.assign(t, neuerTropfen(false));
        ctx.beginPath(); ctx.arc(t.x, t.y, 1.2 + t.g * 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (flocken.length) {
      ctx.fillStyle = 'rgba(255,255,255,.88)';
      for (const t of flocken) {
        if (bewegt) { t.y += t.v * (l.misch ? 90 : 55) * dt; t.x += (Math.sin(t.y / 40 + t.p) * 18 + schraeg * 60) * dt; }
        if (t.y > H) Object.assign(t, neuerTropfen(false));
        ctx.globalAlpha = t.a; ctx.beginPath(); ctx.arc(t.x, t.y, t.g * (l.misch ? 1.3 : 1.6), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  const neuerTropfen = (irgendwo) => ({ x: Math.random() * (B + 200) - 100, y: irgendwo ? Math.random() * H : -20 - Math.random() * 40,
    v: 0.7 + Math.random() * 0.5, g: 0.6 + Math.random() * 0.7, a: 0.5 + Math.random() * 0.5, p: Math.random() * 6.3 });

  // ---------- Uhr, Datum, Wettertext ----------
  let uhrFmt, datFmt;
  function formate() {
    try {
      uhrFmt = new Intl.DateTimeFormat('de-AT', { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
      datFmt = new Intl.DateTimeFormat('de-AT', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { zone = 'Europe/Vienna'; formate(); }
  }
  formate();
  let letzteUhr = '';
  function uhr() {
    const d = jetzt(), teile = Object.fromEntries(uhrFmt.formatToParts(d).map((p) => [p.type, p.value]));
    const text = `${teile.hour}:${teile.minute}:${teile.second}`;
    if (text === letzteUhr) return;
    letzteUhr = text;
    el('hhmm').textContent = `${teile.hour}:${teile.minute}`;
    el('sek').textContent = teile.second;
    el('uhr').setAttribute('datetime', d.toISOString());
    el('datum').textContent = datFmt.format(d);
    el('zustand').textContent = zustandText(d);
  }
  // Zweite Zeile: Tagesphase, Sonnenzeiten und Besonderes (Regenbogen, Polarlicht, Meteorstrom, Wind, Glätte, Frost)
  let zeitenCache = { schluessel: '', z: {} };
  const hm = (dt) => dt ? new Intl.DateTimeFormat('de-AT', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(dt) : '';
  function zustandText(d) {
    const ph = tagesphase(d), teile = [ph.name];
    const schluessel = `${zone}|${ort.lat}|${ort.lon}|${Math.floor(d / 6e4)}`;
    if (zeitenCache.schluessel !== schluessel) zeitenCache = { schluessel, z: sonnenzeiten(d, zone) };
    const z = zeitenCache.z;
    if (z.auf || z.unter) teile.push(`Sonne ↑ ${hm(z.auf) || '–'} ↓ ${hm(z.unter) || '–'}`);
    else teile.push(ph.h > 0 ? 'Polartag' : 'Polarnacht');
    if (!ph.steigt && z.daemmerEnde && d < z.daemmerEnde && ph.h < 6) teile.push(`hell bis ${hm(z.daemmerEnde)}`);
    if (besonderes.regenbogen) teile.push('Regenbogen');
    if (besonderes.polarlicht > 0.02) teile.push(`Polarlicht (Kp ${Math.round(kpWert)})`);
    if (besonderes.strom) teile.push(`${besonderes.strom}: Sternschnuppen`);
    if (wetter) {
      const l = lage(wetter);
      if (l.wind >= 50 || l.boeen >= 75) teile.push(`Stürmisch${l.boeen ? ` (Böen ${Math.round(l.boeen)} km/h)` : ''}`);
      else if (l.wind >= 30 || l.boeen >= 50) teile.push('Windig');
      if (l.gefrierend) teile.push('Glättegefahr');
      else if (wetter.temp != null && wetter.temp <= 0 && !l.regen && !l.schnee) teile.push('Frost');
    }
    return teile.join(' · ');
  }
  function wetterText() {
    if (!wetter) return;
    const t = wetter.temp != null ? `${Math.round(wetter.temp).toLocaleString('de-AT')} °C · ` : '';
    const l = lage(wetter), mitGefrier = [56, 57, 66, 67].includes(wetter.code);
    const text = l.misch && !mitGefrier && !WMO[wetter.code]?.includes('Schneeregen') ? 'Schneeregen' : (WMO[wetter.code] || 'Wetter');
    el('wetter').textContent = `${ort.name} · ${t}${text}`;
    el('stand').textContent = wetter.stand ? ` · Stand ${wetter.stand}` : '';
  }

  // ---------- Daten holen ----------
  async function wetterHolen(erzwingen) {
    const merk = lesen(SPEICHER_WETTER);
    const schluessel = `${ort.lat.toFixed(3)},${ort.lon.toFixed(3)}`;
    if (!erzwingen && merk && merk.ort === schluessel && Date.now() - merk.geholt < WETTER_ALLE_MS) {
      uebernehmen(merk.daten); return;
    }
    const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
      latitude: ort.lat, longitude: ort.lon, timezone: 'auto',
      current: 'temperature_2m,weather_code,cloud_cover,precipitation,rain,showers,snowfall,wind_speed_10m,wind_gusts_10m,wind_direction_10m',
    });
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json(), c = j.current || {};
      const daten = { code: c.weather_code ?? 0, wolken: c.cloud_cover, temp: c.temperature_2m, niederschlag: c.precipitation,
        regen: (c.rain || 0) + (c.showers || 0), schneefall: c.snowfall || 0,
        wind: c.wind_speed_10m, boeen: c.wind_gusts_10m, windRichtung: c.wind_direction_10m, zone: j.timezone,
        stand: typeof c.time === 'string' ? c.time.slice(11, 16) : '' };   // Messzeit in Ortszeit
      schreiben(SPEICHER_WETTER, { ort: schluessel, geholt: Date.now(), daten });
      uebernehmen(daten);
    } catch (e) {
      if (merk && merk.ort === schluessel) uebernehmen(merk.daten);
      else { el('wetter').textContent = `${ort.name} · Wetter gerade nicht erreichbar`; }
    }
  }
  function uebernehmen(daten) {
    wetter = { ...daten };
    // Vorschau-Schalter aus der Adresse
    if (q.has('wetter')) { wetter.code = Number(q.get('wetter')) || 0; wetter.wolken = undefined; wetter.niederschlag = 0; wetter.regen = 0; wetter.schneefall = 0; }
    if (q.has('wolken')) wetter.wolken = klemm(Number(q.get('wolken')) || 0, 0, 100);
    if (q.has('wind')) { wetter.wind = klemm(Number(q.get('wind')) || 0, 0, 200); wetter.boeen = wetter.wind * 1.5; }
    if (daten.zone && daten.zone !== zone) { zone = daten.zone; formate(); letzteUhr = ''; }
    wolkenStand = ''; tropfen = []; flocken = []; koerner = [];
    wetterText(); uhr();
  }

  // Polarlicht: planetarer Kp-Index von NOAA SWPC (öffentlich, ohne Schlüssel), nur ab 40° Breite nötig, 15 min im Browser
  async function kpHolen() {
    if (q.has('kp') || Math.abs(ort.lat) < 40) return;
    const merk = lesen('zenit-kp');
    if (merk && Date.now() - merk.geholt < 15 * 60 * 1000) { kpWert = merk.kp; return; }
    try {
      const r = await fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const liste = await r.json(), letzter = liste[liste.length - 1] || {};
      const kp = Number(letzter.estimated_kp ?? letzter.kp_index);
      if (Number.isFinite(kp)) { kpWert = kp; schreiben('zenit-kp', { geholt: Date.now(), kp }); }
    } catch (e) { if (merk) kpWert = merk.kp; }
  }

  async function suchen(begriff) {
    const url = 'https://geocoding-api.open-meteo.com/v1/search?' + new URLSearchParams({ name: begriff, count: 8, language: 'de', format: 'json' });
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    return ((await r.json()).results || []).map((t) => ({
      name: t.name, land: t.country || '', region: t.admin1 || '', lat: t.latitude, lon: t.longitude, zone: t.timezone,
    }));
  }

  function ortSetzen(neu, merken = true) {
    ort = { name: String(neu.name).slice(0, 60), land: neu.land || '', lat: Number(neu.lat), lon: Number(neu.lon) };
    if (merken) schreiben(SPEICHER_ORT, ort);
    if (neu.zone) { zone = neu.zone; formate(); letzteUhr = ''; }
    el('ort-name').textContent = ort.name;
    el('wetter').textContent = `${ort.name} · Wetter wird geladen …`;
    wetter = null; wolkenStand = ''; tropfen = []; flocken = []; koerner = [];
    wetterHolen(true); kpHolen();
  }

  // ---------- Ort-Fenster ----------
  const fenster = el('ort-fenster'), knopf = el('ort-knopf'), treffer = el('ort-treffer');
  function oeffnen(auf) {
    fenster.hidden = !auf; knopf.setAttribute('aria-expanded', String(auf));
    if (auf) { el('ort-eingabe').focus(); } else { treffer.textContent = ''; knopf.focus(); }
  }
  knopf.addEventListener('click', () => oeffnen(fenster.hidden));
  el('ort-zu').addEventListener('click', () => oeffnen(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !fenster.hidden) oeffnen(false); });
  document.addEventListener('pointerdown', (e) => { if (!fenster.hidden && !fenster.contains(e.target) && !knopf.contains(e.target)) oeffnen(false); });
  function trefferZeigen(liste, meldung) {
    treffer.textContent = '';
    if (meldung) { const li = document.createElement('li'); li.className = 'leer'; li.textContent = meldung; treffer.append(li); return; }
    for (const t of liste) {
      const li = document.createElement('li'), b = document.createElement('button'), s = document.createElement('small');
      b.type = 'button'; b.textContent = t.name;
      s.textContent = [t.region, t.land].filter(Boolean).join(', ');
      b.append(s); b.addEventListener('click', () => { ortSetzen(t); oeffnen(false); });
      li.append(b); treffer.append(li);
    }
  }
  el('ort-suche').addEventListener('submit', async (e) => {
    e.preventDefault();
    const begriff = el('ort-eingabe').value.trim();
    if (begriff.length < 2) { trefferZeigen([], 'Bitte mindestens 2 Zeichen eingeben.'); return; }
    trefferZeigen([], 'Suche …');
    try {
      const liste = await suchen(begriff);
      trefferZeigen(liste, liste.length ? '' : 'Nichts gefunden.');
    } catch (err) { trefferZeigen([], 'Suche gerade nicht erreichbar.'); }
  });
  el('ort-gps').addEventListener('click', () => {
    if (!navigator.geolocation) { trefferZeigen([], 'Dein Browser kann den Standort nicht bestimmen.'); return; }
    trefferZeigen([], 'Standort wird bestimmt …');
    navigator.geolocation.getCurrentPosition(
      (p) => { ortSetzen({ name: 'Mein Standort', lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }); oeffnen(false); },
      () => trefferZeigen([], 'Standort nicht freigegeben.'), { timeout: 15000, maximumAge: 600000 });
  });
  el('ort-standard').addEventListener('click', () => { ortSetzen(STANDARD); oeffnen(false); });

  // ---------- Start ----------
  groesse();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(groesse, 150); });
  el('ort-name').textContent = ort.name;
  (async () => {
    if (q.get('ort')) {   // ?ort=Wien: erster Treffer, wird nicht gespeichert
      try { const [t] = await suchen(q.get('ort').slice(0, 80)); if (t) { ortSetzen(t, false); return; } } catch (e) { /* weiter mit gespeichertem Ort */ }
    }
    wetterHolen(false); kpHolen();
  })();
  setInterval(() => { if (!document.hidden) { wetterHolen(false); kpHolen(); } }, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { wetterHolen(false); uhr(); } });

  // Animation: flüssig mit requestAnimationFrame; bei „Bewegung reduzieren“ nur jede Sekunde neu zeichnen
  function schleife(ms) {
    uhr();
    zeichnen(ms);
    if (ruhig.matches) setTimeout(() => requestAnimationFrame(schleife), 1000);
    else requestAnimationFrame(schleife);
  }
  requestAnimationFrame(schleife);
})();
