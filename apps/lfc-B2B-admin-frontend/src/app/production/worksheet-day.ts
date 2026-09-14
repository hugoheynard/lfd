import type { WorkshopLine } from '@lfd/contracts';

/**
 * Les petites conversions de la fiche d'atelier : un jour, une heure, et la
 * superposition des coches locales sur ce que le serveur a rendu.
 *
 * Hors du composant parce qu'aucune ne dépend de l'écran : ce sont des fonctions
 * pures, elles s'éprouvent sans monter quoi que ce soit, et la page reste sous
 * les 300 lignes que le dépôt s'impose.
 */

const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** `AAAA-MM-JJ` d'un instant, en heure **locale** — le jour tel que l'équipe le dit. */
export function isoDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** « samedi 16 août » — l'en-tête de la fiche. */
export function dayLabelOf(isoDate: string): string {
  return DAY_LABEL.format(new Date(`${isoDate}T00:00:00`));
}

/**
 * « 4 h 05 » — l'heure d'un instant ISO, telle que le fournil la dit.
 *
 * Écrite à la main plutôt que par `Intl` : `fr-FR` rend « 04:05 », qui est
 * l'heure d'un horaire de train, pas celle d'un tirage.
 */
export function hourLabel(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return null;
  }
  return `${at.getHours()} h ${`${at.getMinutes()}`.padStart(2, '0')}`;
}

/** L'état de coche posé par la personne, avant que le serveur le confirme. */
export interface LocalMark {
  readonly done: boolean;
  readonly initials: string;
}

/** La clé d'une coche locale : une ligne d'une journée, et rien de plus fin. */
export function markKey(date: string, sku: string): string {
  return `${date} ${sku}`;
}

/**
 * Recouvre les lignes du serveur par ce qui a été coché **ici**.
 *
 * Les coches locales l'emportent, et c'est tout l'objet du sous-sol : elles ont
 * pu être posées alors que le réseau était absent, et la relecture suivante
 * remonterait sinon des cases vides sous les doigts de qui vient de les cocher.
 *
 * `doneAt` reste celui du serveur : l'écran ne sait pas quelle heure le serveur
 * inscrira, et l'inventer ferait une heure fausse le temps d'un rechargement.
 */
export function withLocalMarks(
  lines: readonly WorkshopLine[],
  date: string,
  marks: ReadonlyMap<string, LocalMark>,
): readonly WorkshopLine[] {
  return lines.map((line) => {
    const mark = marks.get(markKey(date, line.sku));
    if (mark === undefined) {
      return line;
    }
    return { ...line, done: mark.done, initials: mark.done ? mark.initials : null };
  });
}

/**
 * Les coches locales **moins celles que le serveur a refusées pour de bon**.
 *
 * 🔴 Sans ce filtre, une coche écartée de la file resterait affichée : l'écran
 * montrerait comme faite une ligne que le serveur n'a jamais acceptée, et plus
 * rien ne le dirait — exactement ce que la file existe pour empêcher. La case
 * revient donc à l'état que le serveur connaît, pendant que l'écran dit le refus.
 */
export function withoutRefused(
  marks: ReadonlyMap<string, LocalMark>,
  refused: readonly { readonly mark: { readonly date: string; readonly sku: string } }[],
): ReadonlyMap<string, LocalMark> {
  if (refused.length === 0) {
    return marks;
  }
  const next = new Map(marks);
  for (const { mark } of refused) {
    next.delete(markKey(mark.date, mark.sku));
  }
  return next;
}

/**
 * Le lendemain d'un instant.
 *
 * Par `setDate`, qui absorbe les fins de mois, les années bissextiles et les
 * changements d'heure — un `+ 86_400_000` se trompe deux fois par an, et
 * toujours la nuit, c'est-à-dire pendant la fournée.
 */
export function nextDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}
