/** La marge avant la première fermeture (Q1, Hugo, 2026-11-27) : quinze minutes. */
export const CONVERSION_MARGIN_MS = 15 * 60_000;

/** Ce qui décide de l'instant de conversion d'une colonne. */
export interface ConversionFacts {
  /** L'heure de fermeture de chaque ligne, sans dérogation ; `null` : rien à opposer. */
  readonly closures: readonly (Date | null)[];
  /** La veille du jour servi à 23 h 45, quand aucune ligne n'a de fermeture à venir (Q9). */
  readonly fallback: Date;
  readonly now: Date;
}

/**
 * **L'instant où une colonne se gèle et se commande** (plan du planificateur,
 * § 4, Q1 et Q9) : quinze minutes avant la PREMIÈRE fermeture à venir parmi
 * ses lignes — un article peut fermer plus tôt que les autres —, à défaut la
 * veille du jour servi à 23 h 45.
 *
 * Une fermeture déjà passée n'entre pas dans le calcul : la ligne qui la
 * porte est déjà bloquante, l'écran l'affiche en avertissement et le client
 * doit pouvoir la retirer (§ 4 bis). La compter gèlerait la colonne sur
 * l'instant, et la conversion la refuserait sans que personne ait pu la
 * corriger.
 *
 * Jamais avant `now` : un instant déjà passé veut dire « maintenant ».
 */
export function conversionInstant(facts: ConversionFacts): Date {
  const now = facts.now.getTime();
  const upcoming = facts.closures
    .filter((closure): closure is Date => closure !== null)
    .map((closure) => closure.getTime())
    .filter((closure) => closure > now);
  const instant =
    upcoming.length > 0 ? Math.min(...upcoming) - CONVERSION_MARGIN_MS : facts.fallback.getTime();
  return new Date(Math.max(instant, now));
}

/**
 * **La fermeture est-elle passée sans conversion ?** (§ 4) — l'instant de
 * conversion rangé, plus la marge, est franchi : le balayage n'a pas tourné
 * à temps (panne du cron). La colonne n'est pas rattrapée, elle est manquée ;
 * une machine ne dépense jamais de dérogation.
 */
export function conversionMissed(convertsAt: Date | null, now: Date): boolean {
  return convertsAt !== null && now.getTime() >= convertsAt.getTime() + CONVERSION_MARGIN_MS;
}
