import {
  ArchivedPriceTemplateIsSealedError,
  EmptyPriceTemplateError,
  NonDecreasingTemplateTiersError,
  DuplicateTemplateSkuError,
} from "../pricing-errors.js";
import type { PriceTemplateKind } from "@lfd/contracts";

/** Un palier : à partir de cette quantité, ce prix en centimes. */
export interface TemplateTier {
  readonly minQuantity: number;
  readonly unitPriceCents: number;
}

export interface TemplateLine {
  readonly sku: string;
  /** Triés par seuil croissant, et l'agrégat le garantit. */
  readonly tiers: readonly TemplateTier[];
  /**
   * Le volume prévu sur la saison. **Aucun effet sur le prix** : il accompagne
   * la grille comme hypothèse de négociation, et l'agrégat n'a rien à en dire.
   */
  readonly plannedVolume: number | null;
}

export interface PriceTemplateDraft {
  readonly kind: PriceTemplateKind;
  readonly label: string;
  readonly lines: readonly TemplateLine[];
}

export interface PriceTemplateState extends PriceTemplateDraft {
  readonly id: string;
  readonly createdBy: string;
  readonly archivedAt: Date | null;
}

/**
 * **Le gabarit tarifaire, en tant qu'agrégat.**
 *
 * Il ne calcule rien. Sa seule raison d'être est de refuser les grilles qu'on
 * ne veut pas voir arriver chez un client :
 *
 * - **une grille qui monte.** « 0,80 € puis 0,85 € à partir de 5 000 » est
 *   parfaitement saisissable palier par palier, et parfaitement absurde : le
 *   client qui commande plus paierait plus cher. C'est le même refus que sur le
 *   barème de volume, et pour la même raison — l'incohérence n'est exprimable
 *   qu'une fois les paliers réunis en une décision ;
 * - **deux fois le même article.** Deux lignes sur un même SKU poseraient deux
 *   grilles concurrentes, donc un prix qui dépend de l'ordre de lecture ;
 * - **une grille vide.** Elle se lirait chez le client comme un tarif sans
 *   contenu, et personne ne saurait si c'est une saisie ratée ou un choix.
 *
 * Le « prix fixe » n'est pas un cas particulier ici : c'est la grille à un seul
 * palier, à partir de 1. Rien dans cet agrégat ne le distingue, et c'est
 * exactement ce qu'on veut — deux chemins de saisie, une seule chose stockée.
 */
export class PriceTemplate {
  private constructor(private readonly state: PriceTemplateState) {}

  /**
   * @throws {EmptyPriceTemplateError} aucune ligne, ou une ligne sans palier.
   * @throws {DuplicateTemplateSkuError} deux lignes sur le même article.
   * @throws {NonDecreasingTemplateTiersError} une grille où commander plus
   *   coûte plus cher — ou deux paliers au même seuil.
   */
  static compose(id: string, draft: PriceTemplateDraft, createdBy: string): PriceTemplate {
    if (draft.lines.length === 0) {
      throw new EmptyPriceTemplateError();
    }
    assertNoDuplicateSku(draft.lines);
    return new PriceTemplate({
      ...draft,
      lines: draft.lines.map(normalizeLine),
      id,
      createdBy,
      archivedAt: null,
    });
  }

  /** Reconstruit sans revérifier : ce qui est en base y est déjà passé. */
  static reconstitute(state: PriceTemplateState): PriceTemplate {
    return new PriceTemplate(state);
  }

  get id(): string {
    return this.state.id;
  }

  get lines(): readonly TemplateLine[] {
    return this.state.lines;
  }

  get kind(): PriceTemplateKind {
    return this.state.kind;
  }

  /**
   * **Réviser.** Un gabarit se retouche, à la différence d'une règle posée.
   *
   * C'est la distinction qui justifie qu'il existe : un gabarit n'a jamais
   * facturé. Les mercuriales qu'il a produites, elles, sont des décisions closes
   * et ne bougent pas — réviser le gabarit ne les touche pas, et c'est ce qui
   * rend la retouche sans danger.
   *
   * @throws {ArchivedPriceTemplateIsSealedError} le gabarit est archivé.
   */
  revise(draft: PriceTemplateDraft): PriceTemplate {
    if (this.state.archivedAt !== null) {
      throw new ArchivedPriceTemplateIsSealedError(this.state.id);
    }
    if (draft.lines.length === 0) {
      throw new EmptyPriceTemplateError();
    }
    assertNoDuplicateSku(draft.lines);
    return new PriceTemplate({
      ...this.state,
      kind: draft.kind,
      label: draft.label,
      lines: draft.lines.map(normalizeLine),
    });
  }

  archive(at: Date): PriceTemplate {
    if (this.state.archivedAt !== null) {
      throw new ArchivedPriceTemplateIsSealedError(this.state.id);
    }
    return new PriceTemplate({ ...this.state, archivedAt: at });
  }

  toPersistence(): PriceTemplateState {
    return this.state;
  }
}

/**
 * Les paliers d'une ligne, triés et vérifiés.
 *
 * Le tri est fait **ici** plutôt que refusé : l'ordre de saisie n'est pas une
 * décision, et renvoyer une erreur pour un tableau dans le désordre ferait
 * perdre une grille entière pour une question de présentation. Ce qui est refusé
 * est ce qui reste incohérent une fois trié.
 */
function normalizeLine(line: TemplateLine): TemplateLine {
  if (line.tiers.length === 0) {
    throw new EmptyPriceTemplateError();
  }
  const tiers = [...line.tiers].sort((left, right) => left.minQuantity - right.minQuantity);
  for (const [index, tier] of tiers.entries()) {
    const previous = tiers[index - 1];
    if (previous === undefined) {
      continue;
    }
    // Seuil identique : deux paliers au même endroit ne se départagent pas.
    // Prix qui remonte : commander plus coûterait plus cher.
    if (
      previous.minQuantity === tier.minQuantity ||
      previous.unitPriceCents <= tier.unitPriceCents
    ) {
      throw new NonDecreasingTemplateTiersError(line.sku, tier.minQuantity);
    }
  }
  return { sku: line.sku, tiers, plannedVolume: line.plannedVolume };
}

function assertNoDuplicateSku(lines: readonly TemplateLine[]): void {
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.sku)) {
      throw new DuplicateTemplateSkuError(line.sku);
    }
    seen.add(line.sku);
  }
}
