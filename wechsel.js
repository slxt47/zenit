// Uhr ⇄ Wetter: Zenit (time.slxt.org) und Nimbus (weather.slxt.org) wirken wie eine App.
// Der Umschalter oben hängt Ort und Hell/Dunkel an den Link (?lat=&lon=&name=&zone=&modus=). Diese Datei lädt gleich
// nach modus.js (ohne defer), übernimmt den Modus vor dem ersten Zeichnen und merkt sich den Ort für die Seite.
// Gleiche Datei in ~/zenit und ~/nimbus – bei Änderungen beide anpassen.
(() => {
  'use strict';
  const q = new URLSearchParams(location.search);
  const m = q.get('modus');
  if ((m === 'hell' || m === 'dunkel') && window.slxtModus && window.slxtModus.get() !== m) window.slxtModus.setzen(m);
  const lat = Number(q.get('lat')), lon = Number(q.get('lon'));
  window.slxtWechsel = {
    // Ort aus dem Umschalter-Link (oder null); die Seite übernimmt und speichert ihn selbst
    ort: q.has('lat') && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      ? { name: (q.get('name') || 'Ort').slice(0, 60), lat, lon, zone: (q.get('zone') || '').slice(0, 60) } : null,
    // Link zur anderen Ansicht mit aktuellem Ort und Modus
    link(ziel, ort) {
      const p = new URLSearchParams();
      if (ort && Number.isFinite(+ort.lat)) { p.set('lat', (+ort.lat).toFixed(4)); p.set('lon', (+ort.lon).toFixed(4)); p.set('name', ort.name || ''); if (ort.zone) p.set('zone', ort.zone); }
      if (window.slxtModus) p.set('modus', window.slxtModus.get());
      return `${ziel}?${p}`;
    },
    // Parameter aus der Adresse nehmen, damit Neuladen/Teilen die normale Adresse zeigt
    aufraeumen() {
      if (!['lat', 'lon', 'name', 'zone', 'modus'].some((k) => q.has(k))) return;
      ['lat', 'lon', 'name', 'zone', 'modus'].forEach((k) => q.delete(k));
      const rest = q.toString();
      history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
    },
  };
})();
