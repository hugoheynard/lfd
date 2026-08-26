import { EmptyVatRateNameError } from "../errors/vat-rate-errors.js";
import { VatPercent } from "../value-objects/vat-percent.js";

/**
 * **Le taux de TVA — l'agrégat.**
 *
 * Référence commerciale partagée : les familles pointent dessus
 * (`emporterTvaId` / `surPlaceTvaId`), et les canaux en dérivent ce dont ils
 * ont besoin — une collection pour Shopify, un nombre pour la boutique B2B.
 *
 * Ce qu'il garantit : le **taux est valide** (VO `VatPercent`) et le **nom n'est
 * jamais vide**. Ce qu'il ne peut pas voir, et qui reste au handler : qu'aucun
 * AUTRE taux ne porte déjà ce taux, et qu'aucune famille ne le vise au moment
 * de le supprimer.
 */
export interface VatRateSnapshot {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly percent: number;
}

/** Ce qu'une révision remplace — tout, d'un bloc. */
export interface VatRateRevision {
  readonly name: string;
  readonly description: string;
  readonly percent: number;
}

export interface NewVatRateInput {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly percent: number;
}

export class VatRate {
  private constructor(
    private readonly identity: string,
    private nameValue: string,
    private descriptionValue: string,
    private rateValue: VatPercent,
  ) {}

  static open(input: NewVatRateInput): VatRate {
    return new VatRate(
      input.id,
      requireName(input.name),
      input.description.trim(),
      VatPercent.create(input.percent),
    );
  }

  /**
   * Reconstitue depuis la base. Le taux **repasse par son VO** : une ligne
   * écrite avant que la règle existe se signale ici plutôt que de ressortir
   * telle quelle vers un canal.
   */
  static reconstitute(snapshot: VatRateSnapshot): VatRate {
    return new VatRate(
      snapshot.id,
      snapshot.name,
      snapshot.description,
      VatPercent.create(snapshot.percent),
    );
  }

  get id(): string {
    return this.identity;
  }

  get percent(): number {
    return this.rateValue.percent;
  }

  /**
   * Révise le taux d'un geste — c'est ainsi que le back-office l'édite.
   *
   * Un record plutôt que trois arguments positionnels : `name` et `description`
   * sont deux `string` voisins, et les intervertir ne se voit ni au compilateur
   * ni à la lecture — le taux s'appellerait « Appliqué aux viennoiseries » et
   * sa description « Réduit ». La même raison a fait passer `Category.setVat`
   * au record.
   */
  revise(input: VatRateRevision): void {
    this.nameValue = requireName(input.name);
    this.descriptionValue = input.description.trim();
    this.rateValue = VatPercent.create(input.percent);
  }

  snapshot(): VatRateSnapshot {
    return {
      id: this.identity,
      name: this.nameValue,
      description: this.descriptionValue,
      percent: this.rateValue.percent,
    };
  }
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new EmptyVatRateNameError();
  }
  return trimmed;
}
