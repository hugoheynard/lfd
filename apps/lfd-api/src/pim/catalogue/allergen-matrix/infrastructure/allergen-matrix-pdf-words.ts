import { instantToLocal } from "@lfd/contracts";
import type { AllergenMatrixDocumentWording } from "@lfd/pim-contracts";

/**
 * Les mots du PDF qui portent une valeur — dates et repères — dans la langue
 * de la matrice (Q4 : le document est ENTIER dans sa langue ; les dates de la
 * trousse `platform/pdf` ne parlent que français).
 */

/** Remplace `{date}`, `{page}`… par leur valeur ; un repère inconnu reste tel quel. */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (whole, key: string) => values[key] ?? whole);
}

/**
 * Un instant → « 20 octobre 2026 à 21:59 », **à l'heure de Paris**, dans la
 * langue du document. Découpé à la main : `Intl` dépend de l'hôte.
 */
export function localDateTime(instant: Date, wording: AllergenMatrixDocumentWording): string {
  const local = instantToLocal(instant);
  const [year, month, day] = local.day.split("-");
  const name = wording.months[Number(month) - 1];
  const date =
    year === undefined || day === undefined || name === undefined
      ? local.day
      : `${String(Number(day))} ${name} ${year}`;
  return `${date} ${wording.timeJoiner} ${local.time}`;
}
