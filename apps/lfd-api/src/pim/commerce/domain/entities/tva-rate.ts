import { EmptyTvaRateNameError } from "../errors/commerce-errors.js";
import { TvaPercent } from "../value-objects/tva-percent.js";

/**
 * **Le taux de TVA — l'agrégat.**
 *
 * Référence commerciale partagée : les familles pointent dessus
 * (`emporterTvaId` / `surPlaceTvaId`), et les canaux en dérivent ce dont ils
 * ont besoin — une collection pour Shopify, un nombre pour la boutique B2B.
 *
 * Ce qu'il garantit : le **taux est valide** (VO `TvaPercent`) et le **nom n'est
 * jamais vide**. Ce qu'il ne peut pas voir, et qui reste au handler : qu'aucun
 * AUTRE taux ne porte déjà ce taux, et qu'aucune famille ne le vise au moment
 * de le supprimer.
 */
export interface TvaRateSnapshot {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly percent: number;
}

export interface NewTvaRateInput {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly percent: number;
}

export class TvaRate {
  private constructor(
    private readonly identity: string,
    private nameValue: string,
    private descriptionValue: string,
    private rateValue: TvaPercent,
  ) {}

  static open(input: NewTvaRateInput): TvaRate {
    return new TvaRate(
      input.id,
      requireName(input.name),
      input.description.trim(),
      TvaPercent.create(input.percent),
    );
  }

  /**
   * Reconstitue depuis la base. Le taux **repasse par son VO** : une ligne
   * écrite avant que la règle existe se signale ici plutôt que de ressortir
   * telle quelle vers un canal.
   */
  static reconstitute(snapshot: TvaRateSnapshot): TvaRate {
    return new TvaRate(
      snapshot.id,
      snapshot.name,
      snapshot.description,
      TvaPercent.create(snapshot.percent),
    );
  }

  get id(): string {
    return this.identity;
  }

  get percent(): number {
    return this.rateValue.percent;
  }

  /** Révise le taux d'un geste — c'est ainsi que le back-office l'édite. */
  revise(name: string, description: string, percent: number): void {
    this.nameValue = requireName(name);
    this.descriptionValue = description.trim();
    this.rateValue = TvaPercent.create(percent);
  }

  snapshot(): TvaRateSnapshot {
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
    throw new EmptyTvaRateNameError();
  }
  return trimmed;
}
