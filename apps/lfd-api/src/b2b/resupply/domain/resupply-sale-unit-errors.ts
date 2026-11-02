import { BusinessError, TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus propres à l'unité d'une ligne de réassort (lot L2b-1 du plan
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §14) : une
 * ligne compte des pièces OU des grammes, figés à son ajout, et un même
 * article ne mélange jamais les deux.
 */

/** Une unité relue en base que ce code ne connaît pas : la contrainte a été élargie sans lui. */
export class UnknownResupplySaleUnitError extends TechnicalError {
  constructor(sku: string, value: string) {
    super(
      "resupply.sale_unit.unknown",
      `Une ligne de réassort de l'article ${sku} porte une unité inconnue (« ${value} ») : ` +
        "rien n'est compté plutôt que de lire des grammes en pièces. Prévenez l'équipe technique.",
    );
  }
}

/**
 * Le même article, déjà sur la liste dans une autre unité : son unité a changé
 * au catalogue entre deux ajouts. Additionner des pièces et des grammes
 * fausserait le compte.
 */
export class ResupplyLineUnitMismatchError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly label: string,
  ) {
    super(
      "resupply.sale_unit.mismatch",
      `« ${label} » est déjà sur la liste dans une autre unité (pièces ou poids) : son mode de vente a changé au catalogue. ` +
        "Retirez la ligne existante, puis ajoutez l'article de nouveau.",
    );
  }
}

/**
 * Tant que le fournil ne sait pas recevoir un réassort au poids (lot L2b-2),
 * une demande qui en porte ne part pas : il la compterait en pièces.
 */
export class WeightResupplyNotSendableError extends BusinessError {
  constructor(readonly labels: readonly string[]) {
    super(
      "resupply.sale_unit.weight_not_sendable",
      `Le fournil ne reçoit pas encore de réassort au poids, et cette demande en porte (${labels.map((l) => `« ${l} »`).join(", ")}). ` +
        "Retirez ces articles avant d'envoyer ; s'ils arrivent en boutique, saisissez-les dans « Réassort sans commande ».",
    );
  }
}

/**
 * Un brouillon garde une unité que le catalogue ne donne plus à l'article :
 * l'envoyer compterait des pièces en grammes, ou l'inverse.
 */
export class ResupplyArticleUnitChangedError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly label: string,
  ) {
    super(
      "resupply.sale_unit.changed",
      `« ${label} » a changé de mode de vente (pièces ou poids) depuis que le brouillon a été composé : ` +
        "rouvrez le brouillon, retirez l'article puis remettez-le avec sa quantité.",
    );
  }
}
