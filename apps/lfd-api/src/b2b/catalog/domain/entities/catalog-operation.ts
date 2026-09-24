import type { CatalogOperationAudience } from "../operation-audience.js";

/** Un texte d'annonce dans ses langues — le français toujours (D10). */
export interface OperationText {
  readonly fr: string;
  readonly en?: string;
  readonly it?: string;
}

/**
 * **Ce que le référentiel a dit d'une opération datée**, tel que reçu — sans
 * aucune décision de la plateforme.
 *
 * Déclaré ici et non importé du fil : le domaine du commerce ne dépend pas du
 * schéma de transport (même règle que `PimFacts`).
 */
export interface CatalogOperationFacts {
  readonly key: string;
  readonly name: OperationText;
  readonly lede: OperationText | null;
  readonly image: { readonly url: string; readonly alt: string } | null;
  /** Trois INSTANTS : le rayon paraît, la commande ouvre, la commande ferme. */
  readonly announceFrom: Date;
  /** `null` = on commande dès l'annonce. */
  readonly orderFrom: Date | null;
  readonly orderUntil: Date;
  /**
   * Deux JOURS `AAAA-MM-JJ`. Leur traduction en instant — minuit, heure de
   * Paris, le lendemain de `pickupUntil` — appartient au lecteur, par
   * `localToInstant` et jamais par un `T00:00Z` (`lint:business-day`).
   */
  readonly pickupFrom: string;
  readonly pickupUntil: string;
  readonly audience: CatalogOperationAudience;
  /** La sélection, dans l'ordre du rayon. */
  readonly skus: readonly string[];
  /** L'instant d'émission de l'envoi qui l'a écrite. */
  readonly receivedAt: Date;
}

/** L'état persisté : les faits, et le retrait éventuel. */
export interface CatalogOperationState {
  readonly facts: CatalogOperationFacts;
  readonly withdrawnAt: Date | null;
}

/**
 * **Une opération reçue du référentiel** — le miroir, pas l'original.
 *
 * Le commerce ne crée pas d'opération et n'y ajoute rien (D1) : il la reçoit,
 * la rafraîchit au push suivant, et la **marque retirée** quand un envoi
 * accepté ne la porte plus. Jamais supprimée : une clé ne se réemploie pas, et
 * la surcharge de la réception doit garder son parent (D9).
 *
 * Même cycle que `CatalogItem` : `receive` / `refreshFromPim` / `withdraw`,
 * puis le port. Une opération qui REVIENT dans un envoi est remise en tenue par
 * le rafraîchissement lui-même — sans quoi elle resterait retirée pour
 * toujours, et rien ne le dirait.
 */
export class CatalogOperation {
  private constructor(
    private readonly facts: CatalogOperationFacts,
    private withdrawnAt: Date | null,
  ) {}

  /** Une opération que le miroir ne connaissait pas. */
  static receive(facts: CatalogOperationFacts): CatalogOperation {
    return new CatalogOperation(facts, null);
  }

  static reconstitute(state: CatalogOperationState): CatalogOperation {
    return new CatalogOperation(state.facts, state.withdrawnAt);
  }

  /** Les faits d'un envoi plus récent — et la remise en tenue si elle était retirée. */
  refreshFromPim(facts: CatalogOperationFacts): CatalogOperation {
    return new CatalogOperation(facts, null);
  }

  /**
   * Retirée par un envoi qui ne la porte plus. Idempotent : un second retrait
   * garde la date du premier, qui est celle qu'on cherchera.
   */
  withdraw(at: Date): void {
    if (this.withdrawnAt === null) {
      this.withdrawnAt = at;
    }
  }

  get key(): string {
    return this.facts.key;
  }

  get isWithdrawn(): boolean {
    return this.withdrawnAt !== null;
  }

  /** Ce que le référentiel a dit — ce que photographie une version. */
  get received(): CatalogOperationFacts {
    return this.facts;
  }

  toPersistence(): CatalogOperationState {
    return { facts: this.facts, withdrawnAt: this.withdrawnAt };
  }
}
