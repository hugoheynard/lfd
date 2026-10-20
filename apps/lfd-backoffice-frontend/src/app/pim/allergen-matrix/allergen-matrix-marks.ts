import type {
  AllergenMatrixOtherAllergen,
  AllergenMatrixPresence,
  AllergenMatrixRow,
} from '@lfd/pim-contracts';

/** Ce qu'une marque dit : contient, ou peut contenir des traces. */
export type MarkKind = 'contains' | 'traces';

/** Le signe de chaque marque — le même que le PDF dessine (plan §1). */
export const MARK_SIGNS: Readonly<Record<MarkKind, string>> = {
  contains: '●',
  traces: '◐',
};

/** Une ligne de case : le signe, et ce que l'annexe II impose de nommer. */
export interface MarkLine {
  readonly kind: MarkKind;
  readonly names: string;
}

/**
 * Les lignes d'une case, dans l'ordre du PDF : ce qui est contenu, puis ce qui
 * est en traces.
 *
 * C'est la règle de `markLines` du rendu PDF (`allergen-matrix-pdf-grid.ts`,
 * relu le 2026-10-20) : une case peut dire « contient » ET porter des traces
 * nommées — du blé dedans, de l'orge en traces, sous la même catégorie.
 */
export function markLines(
  presence: AllergenMatrixPresence,
  contains: readonly string[],
  traces: readonly string[],
): readonly MarkLine[] {
  const lines: MarkLine[] = [];
  if (presence === 'contains') {
    lines.push({ kind: 'contains', names: contains.join(', ') });
  }
  if (traces.length > 0 || presence === 'traces') {
    lines.push({ kind: 'traces', names: traces.join(', ') });
  }
  return lines;
}

/**
 * Le nom d'un allergène de la colonne « Autres » — le code GS1 à côté du
 * libellé quand l'entrée est officielle (AM0 : `official && incoCategory ===
 * null`, une entrée de la colonne est toujours hors annexe). Une entrée maison
 * n'est jamais officielle : son code libre ne s'affiche pas. Même règle que le
 * PDF (`other-allergen-name.ts`).
 */
export function otherAllergenName(other: AllergenMatrixOtherAllergen): string {
  return other.official ? `${other.label} (${other.code})` : other.label;
}

/** Les lignes de la case d'une catégorie ; aucune pour une ligne non renseignée. */
export function categoryMarks(row: AllergenMatrixRow, category: string): readonly MarkLine[] {
  const cell = row.cells.find((candidate) => candidate.category === category);
  return cell === undefined ? [] : markLines(cell.presence, cell.contains, cell.traces);
}

/** Les lignes de la colonne « Autres ». */
export function otherMarks(row: AllergenMatrixRow): readonly MarkLine[] {
  const others = row.others;
  return others === null
    ? []
    : markLines(
        others.presence,
        others.contains.map(otherAllergenName),
        others.traces.map(otherAllergenName),
      );
}

/** « contient » → « Contient » : un mot de légende ouvre par une capitale. */
export function capitalized(word: string): string {
  return word.charAt(0).toLocaleUpperCase('fr-FR') + word.slice(1);
}

const PARIS_DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/** Un instant ISO, lu à l'heure de Paris : « 20 octobre 2026 à 21:59 ». */
export function parisDateTime(iso: string): string {
  return PARIS_DATE_TIME.format(new Date(iso));
}
