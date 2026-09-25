import { InvalidOperationOverrideError } from "../errors/catalog-operation-errors.js";
import type { CatalogOperationAudience } from "../operation-audience.js";

/**
 * **Ce que la réception décide d'une opération reçue** — restreindre, jamais
 * étendre (D9 de `documentation/order/architecture-operations-datees.md`).
 *
 * `null` sur un champ = on garde ce que le référentiel a dit.
 */
export interface OperationRestriction {
  /** Ne pas tenir l'opération du tout. */
  readonly isHidden: boolean;
  /** Fermer la commande plus tôt. Appliquée en `min(référentiel, ceci)`. */
  readonly orderUntil: Date | null;
  /** Restreindre la clientèle. Appliquée en intersection. */
  readonly audience: CatalogOperationAudience | null;
  /** Les articles retirés de la sélection, ici seulement. */
  readonly hiddenSkus: readonly string[];
}

/** L'état persisté : la décision, sa clé, qui l'a prise et quand. */
export interface CatalogOperationOverrideState {
  readonly operationKey: string;
  readonly restriction: OperationRestriction;
  readonly decidedBy: string | null;
  readonly decidedAt: Date;
}

/**
 * **La surcharge d'une opération reçue.**
 *
 * 🔴 Elle ne se vérifie PAS contre le référentiel à l'écriture — seulement sa
 * forme. Elle se COMBINE à la lecture (`effective-operation.ts`) : la clôture
 * appliquée est le plus tôt des deux, la clientèle l'intersection. Un envoi qui
 * avance la date du référentiel ne rend donc jamais la surcharge « plus
 * tardive », et une surcharge posée avant ce déplacement ne devient pas fausse.
 * La vérifier à l'écriture aurait refusé aujourd'hui ce que l'envoi de demain
 * rendrait juste.
 *
 * Une ligne reste posée quand plus rien n'est restreint : « lever la
 * restriction » est une décision qui a un auteur et une date, pas l'absence
 * d'une ligne.
 */
export class CatalogOperationOverride {
  private constructor(private state: CatalogOperationOverrideState) {}

  /**
   * Pose la première décision sur cette opération.
   *
   * @throws {InvalidOperationOverrideError} la forme est fausse.
   */
  static decide(
    operationKey: string,
    restriction: OperationRestriction,
    decidedBy: string | null,
    decidedAt: Date,
  ): CatalogOperationOverride {
    return new CatalogOperationOverride({
      operationKey,
      restriction: wellFormed(restriction),
      decidedBy,
      decidedAt,
    });
  }

  static reconstitute(state: CatalogOperationOverrideState): CatalogOperationOverride {
    return new CatalogOperationOverride(state);
  }

  /**
   * Remplace la décision ENTIÈRE — l'écran envoie ce qu'il affiche.
   *
   * @returns `false` quand rien n'a bougé : il n'y a alors rien à journaliser,
   * et l'auteur de la décision précédente reste celui qu'on lit.
   * @throws {InvalidOperationOverrideError} la forme est fausse.
   */
  redecide(restriction: OperationRestriction, decidedBy: string | null, decidedAt: Date): boolean {
    const next = wellFormed(restriction);
    if (sameRestriction(this.state.restriction, next)) {
      return false;
    }
    this.state = { ...this.state, restriction: next, decidedBy, decidedAt };
    return true;
  }

  get operationKey(): string {
    return this.state.operationKey;
  }

  get restriction(): OperationRestriction {
    return this.state.restriction;
  }

  toPersistence(): CatalogOperationOverrideState {
    return this.state;
  }
}

/**
 * La forme, et elle seule : une clôture lisible, des SKU non vides et
 * distincts. Un SKU inconnu du miroir n'est PAS refusé — il ne retire rien
 * aujourd'hui, et retirera l'article le jour où un envoi l'ajoutera, ce qui
 * est exactement ce qu'on a demandé.
 */
function wellFormed(restriction: OperationRestriction): OperationRestriction {
  if (restriction.orderUntil !== null && Number.isNaN(restriction.orderUntil.getTime())) {
    throw new InvalidOperationOverrideError("la clôture des commandes n’est pas une date lisible");
  }
  const skus = restriction.hiddenSkus.map((sku) => sku.trim());
  if (skus.some((sku) => sku === "")) {
    throw new InvalidOperationOverrideError("un article retiré de la sélection n’a pas de SKU");
  }
  const twice = skus.find((sku, index) => skus.indexOf(sku) !== index);
  if (twice !== undefined) {
    throw new InvalidOperationOverrideError(`l’article ${twice} est retiré deux fois`);
  }
  return { ...restriction, hiddenSkus: skus };
}

function sameRestriction(left: OperationRestriction, right: OperationRestriction): boolean {
  return (
    left.isHidden === right.isHidden &&
    (left.orderUntil?.getTime() ?? null) === (right.orderUntil?.getTime() ?? null) &&
    left.audience === right.audience &&
    left.hiddenSkus.length === right.hiddenSkus.length &&
    left.hiddenSkus.every((sku, index) => right.hiddenSkus[index] === sku)
  );
}
