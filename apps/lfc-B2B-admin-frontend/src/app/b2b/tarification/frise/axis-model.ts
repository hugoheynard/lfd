/**
 * **La géométrie de l'axe du temps.**
 *
 * Des fonctions pures, à part du composant : convertir un instant en position et
 * une position en instant est de l'arithmétique, et l'arithmétique se teste sans
 * pointeur ni DOM. Le composant, lui, écoute la souris.
 *
 * Rien ici ne connaît de prix. L'axe porte des dates ; ce qu'on lit à ces dates
 * vient du serveur, résolu par la fonction qui facture.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** L'étendue couverte par l'axe. */
export interface AxisSpan {
  readonly from: number;
  readonly to: number;
}

/** Une graduation posée sur l'axe. */
export interface AxisTick {
  readonly at: number;
  readonly percent: number;
  readonly label: string;
}

/**
 * Ce que l'axe couvre : les décisions posées, **et aujourd'hui**.
 *
 * Aujourd'hui est toujours dedans, même si toutes les règles sont anciennes :
 * une frise qui s'arrêterait à la dernière décision laisserait croire que le
 * temps s'est arrêté avec elle. Et une marge de part et d'autre, sans quoi une
 * barre qui commence au premier jour serait collée au bord et illisible.
 */
export function axisSpan(
  bands: readonly { readonly validFrom: string; readonly validTo: string | null }[],
  now: number,
  paddingDays = 10,
): AxisSpan {
  const starts = bands.map((band) => Date.parse(band.validFrom));
  const ends = bands
    .map((band) => (band.validTo === null ? Number.NaN : Date.parse(band.validTo)))
    .filter((end) => !Number.isNaN(end));

  const earliest = Math.min(now, ...starts.filter((start) => !Number.isNaN(start)));
  const latest = Math.max(now, ...ends);
  const padding = paddingDays * DAY_MS;
  const span = { from: earliest - padding, to: latest + padding };
  // Un axe sans durée diviserait par zéro : on lui donne un mois.
  return span.to > span.from ? span : { from: span.from, to: span.from + 30 * DAY_MS };
}

/** Où tombe cet instant sur l'axe, en pourcentage — borné pour ne jamais déborder. */
export function percentOf(span: AxisSpan, at: number): number {
  const ratio = (at - span.from) / (span.to - span.from);
  return Math.min(100, Math.max(0, ratio * 100));
}

/** Quel instant se cache derrière cette position, en pourcentage de la largeur. */
export function instantAt(span: AxisSpan, percent: number): number {
  const ratio = Math.min(100, Math.max(0, percent)) / 100;
  return Math.round(span.from + ratio * (span.to - span.from));
}

/**
 * **Un instant se pose au jour**, jamais à la milliseconde.
 *
 * Le pointeur donne une précision que la donnée n'a pas : les fenêtres de
 * validité sont des jours, et deux lectures à trois heures d'écart rendraient le
 * même catalogue en donnant l'illusion d'avoir mesuré quelque chose.
 */
export function snapToDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** L'instant ISO du début de ce jour — la forme que l'API attend. */
export function dayStart(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toISOString();
}

/**
 * Les graduations, une par mois entamé.
 *
 * Par mois et non tous les N pixels : un axe se lit en repères connus — « début
 * septembre » —, pas en intervalles réguliers dont personne ne sait ce qu'ils
 * valent.
 */
export function monthTicks(span: AxisSpan): AxisTick[] {
  const ticks: AxisTick[] = [];
  const cursor = new Date(span.from);
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= span.to) {
    const at = cursor.getTime();
    if (at >= span.from) {
      ticks.push({
        at,
        percent: percentOf(span, at),
        label: cursor.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return ticks;
}

/**
 * **Les lundis**, en traits fins entre les mois.
 *
 * Un mois seul ne permet pas de viser : « la promo a commencé vers le 20 » se
 * pointe à trois jours près sur une bande de trente. La semaine donne le pas
 * intermédiaire — assez pour compter à l'œil, assez rare pour ne pas hachurer
 * l'axe.
 *
 * Aucune graduation en dessous du jour : le marqueur s'arrondit au jour, donc
 * une règle plus fine promettrait une précision que la lecture n'a pas.
 */
export function weekTicks(span: AxisSpan): AxisTick[] {
  const ticks: AxisTick[] = [];
  const cursor = new Date(span.from);
  cursor.setUTCHours(0, 0, 0, 0);
  // `getUTCDay()` rend 0 le dimanche : la semaine française commence lundi.
  cursor.setUTCDate(cursor.getUTCDate() + ((8 - cursor.getUTCDay()) % 7));

  while (cursor.getTime() <= span.to) {
    const at = cursor.getTime();
    ticks.push({ at, percent: percentOf(span, at), label: String(cursor.getUTCDate()) });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return ticks;
}

/** Une barre, une fois rangée dans sa voie. */
export interface LaneBand<T> {
  readonly band: T;
  readonly lane: number;
}

/**
 * **Le rangement en voies** : deux barres qui ne se croisent pas partagent leur
 * ligne.
 *
 * Une ligne par décision donnait une frise haute comme un immeuble, où l'œil
 * perdait l'axe avant d'avoir fini de descendre. Rangées, quinze décisions qui se
 * succèdent tiennent sur une seule ligne — et les rares qui se recouvrent
 * VRAIMENT se voient, puisque ce sont les seules à s'empiler.
 *
 * Un jour de marge entre deux barres voisines : coller deux périodes qui se
 * touchent les ferait lire comme une seule.
 */
export function packLanes<T extends { validFrom: string; validTo: string | null }>(
  bands: readonly T[],
  span: AxisSpan,
  gapDays = 1,
): LaneBand<T>[] {
  const gap = gapDays * DAY_MS;
  const ordered = [...bands].sort((left, right) => start(left) - start(right));
  const lastEnd: number[] = [];

  return ordered.map((band) => {
    const lane = lastEnd.findIndex((end) => end + gap <= start(band));
    const chosen = lane === -1 ? lastEnd.length : lane;
    lastEnd[chosen] = end(band, span);
    return { band, lane: chosen };
  });
}

function start(band: { validFrom: string }): number {
  return Date.parse(band.validFrom);
}

function end(band: { validTo: string | null }, span: AxisSpan): number {
  return band.validTo === null ? span.to : Date.parse(band.validTo);
}
