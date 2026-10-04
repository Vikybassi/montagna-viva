/**
 * L'orario della corriera (servizio semplificato del gioco, non un orario vero): una corsa ogni mezz'ora dalle 7:00
 * alle 19:00, a 30 km/h di media sulla strada di valle. Funzioni pure: si provano da sole.
 * Le ore sono ore di gioco di tutta la partita (24 = mezzanotte del secondo giorno).
 */
export const FIRST = 7;
export const LAST = 19;
const SPEED_KMH = 30;

/** la prossima partenza (ora di gioco) da `hours`, o null se oggi non ce ne sono più (allora `tomorrow` è la prima) */
export function nextDeparture(hours: number): { depart: number | null; tomorrow: number } {
  const day = Math.floor(hours / 24), hod = hours - day * 24;
  const tomorrow = (day + 1) * 24 + FIRST;
  if (hod < FIRST) return { depart: day * 24 + FIRST, tomorrow: day * 24 + FIRST };
  const next = Math.ceil(hod * 2 - 1e-9) / 2;
  return next <= LAST ? { depart: day * 24 + next, tomorrow } : { depart: null, tomorrow };
}

/** i minuti di viaggio per una distanza in linea d'aria (metri): la strada gira, quindi si conta il 40% in più */
export function rideMinutes(distanceM: number) {
  return Math.max(5, Math.round(((distanceM * 1.4) / 1000 / SPEED_KMH) * 60));
}
