import { instantToLocal, weekdaySchema, type Weekday } from "@lfd/contracts";

/**
 * Les conversions **ligne ↔ domaine** de l'horaire public, partagées par les
 * deux adaptateurs (le port d'écriture et le port de lecture).
 *
 * Ici plutôt que dupliquées dans chacun : c'est la même colonne relue des deux
 * côtés, et deux copies divergeraient d'abord sur le fuseau — l'écart ne se
 * verrait qu'un dimanche par an.
 */

/** Le jour local `AAAA-MM-JJ` vers la colonne `DATE` : midi UTC, hors de portée de tout décalage. */
export function dayToDate(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

/** L'inverse : une colonne `DATE` relue en jour local. */
export function dateToDay(date: Date): string {
  return instantToLocal(date).day;
}

/**
 * La colonne `weekday` vers la clé du contrat.
 *
 * **Validée plutôt que castée** : la colonne est un `TEXT`, et rien en base
 * n'empêche `lundi` d'y arriver un jour par une main humaine. Une valeur
 * inconnue est ramenée à `null`, c'est-à-dire « tous les jours » — le sens le
 * plus ouvert, assumé ici parce que la règle reste **visible** dans l'écran de
 * saisie, qui la réécrira. L'alternative, lever, ferait disparaître la grille
 * entière d'un point pour une ligne aberrante.
 */
export function weekdayOfColumn(value: string | null): Weekday | null {
  if (value === null) {
    return null;
  }
  const parsed = weekdaySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
