/** Une remise et un article : ce qu'une correction du fournil vise. */
export interface CorrectedReceipt {
  readonly serviceDay: string;
  readonly handoffId: string;
  readonly sku: string;
}

/**
 * **Ce que les corrections du fournil ont réellement baissé**, par remise et
 * par article (D9 de `colisage/plan-niveaux-de-suivi-colisage.md`).
 *
 * Le fournil publie un CUMUL par fournée ; le colisage n'applique que la
 * différence avec ce registre, qui ne garde que les pièces vraiment retirées
 * de la réserve. Un reste non couvert n'y entre pas : il est retenté au fait
 * suivant. Lu et écrit sous le verrou de la réserve `(jour, SKU)`, dans
 * l'unité de travail de l'appelant.
 */
export abstract class AppliedCorrectionLedger {
  /** Les pièces déjà retirées pour cette remise ; `0` si rien encore. */
  abstract appliedOf(receipt: CorrectedReceipt): Promise<number>;

  /** Pose le nouveau total retiré — jamais plus bas que l'ancien. */
  abstract record(receipt: CorrectedReceipt, applied: number): Promise<void>;
}

/**
 * **« Cette remise est-elle reçue ? »** — une correction qui arrive avant sa
 * remise attend : c'est la réception qui l'appliquera.
 */
export abstract class HandoffReceipts {
  abstract isReceived(handoffId: string): Promise<boolean>;
}

/**
 * **Les journées à rattraper** : celles, à partir d'un jour, où le colisage a
 * reçu au moins une remise du fournil.
 */
export abstract class CorrectionCatchUpDays {
  abstract daysWithHandoffsFrom(firstDay: string): Promise<readonly string[]>;
}
