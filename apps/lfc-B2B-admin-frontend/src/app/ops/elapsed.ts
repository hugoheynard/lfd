/**
 * **Depuis combien de temps**, en une expression qu'on lit sans compter.
 *
 * Une date absolue obligerait à soustraire de tête au moment précis où l'on veut
 * décider vite. « depuis 6 h » et « depuis 3 min » n'appellent pas le même
 * geste : le premier dit que personne n'a rien vu passer, le second qu'on est
 * peut-être en train de le regarder arriver.
 *
 * Sous la minute, on rend « à l'instant » plutôt que « 0 min » — un zéro se lit
 * comme une absence de mesure.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function elapsedSince(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at) || now - at < MINUTE) {
    return "à l'instant";
  }
  const span = now - at;
  if (span < HOUR) {
    return `${Math.floor(span / MINUTE)} min`;
  }
  if (span < DAY) {
    return `${Math.floor(span / HOUR)} h`;
  }
  return `${Math.floor(span / DAY)} j`;
}
