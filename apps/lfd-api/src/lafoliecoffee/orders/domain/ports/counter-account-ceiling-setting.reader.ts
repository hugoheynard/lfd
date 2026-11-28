/** Le réglage tel que rangé : `null` partout tant que personne n'a rien réglé. */
export interface CounterAccountCeilingRecord {
  readonly ceilingCents: number | null;
  readonly updatedAt: Date | null;
  readonly updatedByStaffId: string | null;
}

/**
 * Port de **lecture** du réglage entier (l'écran des réglages) — distinct de
 * `CounterAccountCeilingReader`, qui ne rend que le montant à la passation.
 */
export abstract class CounterAccountCeilingSettingReader {
  abstract current(): Promise<CounterAccountCeilingRecord>;
}
