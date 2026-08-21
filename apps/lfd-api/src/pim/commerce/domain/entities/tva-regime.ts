import { EmptyTvaRegimeNameError } from "../errors/commerce-errors.js";
import { TvaRate } from "../value-objects/tva-rate.js";

/**
 * **Le régime de TVA — l'agrégat.**
 *
 * Référence commerciale partagée : les familles pointent dessus
 * (`emporterTvaId` / `surPlaceTvaId`) et Shopify le projette en collection.
 *
 * Ce qu'il garantit : le **taux est valide** (VO `TvaRate`), le **tag en
 * découle** toujours, et le **nom n'est jamais vide**. Ce qu'il ne peut pas
 * voir, et qui reste au handler : qu'aucun AUTRE régime ne porte déjà ce tag,
 * et qu'aucune famille ne le vise au moment de le supprimer.
 */
export interface TvaRegimeSnapshot {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly percent: number;
  readonly tag: string;
}

export interface NewTvaRegimeInput {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly percent: number;
}

export class TvaRegime {
  private constructor(
    private readonly identity: string,
    private nameValue: string,
    private descriptionValue: string,
    private rateValue: TvaRate,
  ) {}

  static open(input: NewTvaRegimeInput): TvaRegime {
    return new TvaRegime(
      input.id,
      requireName(input.name),
      input.description.trim(),
      TvaRate.create(input.percent),
    );
  }

  /**
   * Reconstitue depuis la base. Le taux **repasse par son VO** : une ligne
   * écrite avant que la règle existe se signale ici plutôt que de ressortir
   * telle quelle vers Shopify.
   */
  static reconstitute(snapshot: TvaRegimeSnapshot): TvaRegime {
    return new TvaRegime(
      snapshot.id,
      snapshot.name,
      snapshot.description,
      TvaRate.create(snapshot.percent),
    );
  }

  get id(): string {
    return this.identity;
  }

  get tag(): string {
    return this.rateValue.tag;
  }

  get percent(): number {
    return this.rateValue.percent;
  }

  /** Révise le régime d'un geste — c'est ainsi que le back-office l'édite. */
  revise(name: string, description: string, percent: number): void {
    this.nameValue = requireName(name);
    this.descriptionValue = description.trim();
    this.rateValue = TvaRate.create(percent);
  }

  snapshot(): TvaRegimeSnapshot {
    return {
      id: this.identity,
      name: this.nameValue,
      description: this.descriptionValue,
      percent: this.rateValue.percent,
      tag: this.rateValue.tag,
    };
  }
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new EmptyTvaRegimeNameError();
  }
  return trimmed;
}
