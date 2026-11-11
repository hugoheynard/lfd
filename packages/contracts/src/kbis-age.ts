import { z } from "zod";

/** L'usage : un extrait KBIS de moins de 3 mois. */
export const KBIS_FRESH_MONTHS = 3;
/** Au-delà d'un an, l'équipe redemande l'extrait. */
export const KBIS_STALE_MONTHS = 12;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * `POST /admin/companies/:id/kbis/certification` — la date de délivrance lue
 * en tête de l'extrait. Obligatoire pour certifier ; un extrait ancien se
 * certifie quand même (l'âge avertit, il ne bloque pas).
 */
export const certifyKbisPayloadSchema = z.object({
  issuedOn: z.string().regex(DAY_PATTERN, "date de délivrance attendue au format AAAA-MM-JJ"),
});
export type CertifyKbisPayload = z.infer<typeof certifyKbisPayloadSchema>;

/**
 * L'âge d'un extrait certifié, d'après sa date de délivrance :
 *
 * - `fresh` : moins de {@link KBIS_FRESH_MONTHS} mois ;
 * - `aging` : entre {@link KBIS_FRESH_MONTHS} mois et {@link KBIS_STALE_MONTHS} mois ;
 * - `stale` : plus de {@link KBIS_STALE_MONTHS} mois — à redemander ;
 * - `undated` : certifié avant que la date se saisisse, âge inconnu.
 */
export type KbisAge = "fresh" | "aging" | "stale" | "undated";

/** `today` et `issuedOn` au format `AAAA-MM-JJ` : le jour de l'appelant, pas une horloge lue ici. */
export function kbisAgeOf(issuedOn: string | null, today: string): KbisAge {
  if (issuedOn === null) {
    return "undated";
  }
  if (today >= monthsAfter(issuedOn, KBIS_STALE_MONTHS)) {
    return "stale";
  }
  return today >= monthsAfter(issuedOn, KBIS_FRESH_MONTHS) ? "aging" : "fresh";
}

/** Le même quantième, `months` mois plus tard (fin de mois ramenée au dernier jour). */
function monthsAfter(day: string, months: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date, lastDay));
  return target.toISOString().slice(0, 10);
}
