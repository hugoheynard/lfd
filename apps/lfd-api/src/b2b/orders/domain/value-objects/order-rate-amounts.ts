/**
 * **La part d'un taux d'une commande `exact_ht`** (plan
 * `documentation/pricing/plan-centime-particuliers.md`, colonne
 * `ttc_by_rate`) : le net du taux — lignes, moins remise et bon, plus port —,
 * sa TVA extraite, son HT. C'est la sortie `byRate` de la composition, figée
 * telle quelle pour que les documents l'impriment sans la reconstituer.
 * Σ `ttcCents` = total de la commande ; `htCents + vatCents = ttcCents`.
 */
export interface OrderRateAmounts {
  readonly rate: number;
  readonly htCents: number;
  readonly vatCents: number;
  readonly ttcCents: number;
}
