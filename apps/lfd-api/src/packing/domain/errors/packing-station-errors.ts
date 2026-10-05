import { BusinessError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/**
 * **Les refus du poste de colisage**, déménagés du fournil avec la bascule
 * (plan `documentation/colisage/colisage.md`, K2, §12.2).
 *
 * 🔴 Les CODES et les messages sont ceux du poste d'avant
 * (`production/domain/errors/production-errors.ts`) : le contrat des routes ne
 * change pas, et l'écran qui lit un code le retrouve à l'identique. Seul le
 * propriétaire de la règle a changé. Les originaux du fournil sont retirés
 * avec l'ancien poste (K3c).
 */

/** Le bac est fermé : son contenu a été annoncé au client et ne bouge plus. */
export class PackedOrderSealedError extends BusinessError {
  constructor(reference: string) {
    super(
      "production.packing.order_sealed",
      `Le bac de ${reference} est fermé : son contenu a été annoncé au client et ne se modifie plus. Signalez l'écart au commerce plutôt que de le corriger ici.`,
    );
  }
}

/** Ce SKU n'est pas sur ce bon — une ligne de commande, pas un article du four. */
export class PackingLineNotFoundError extends ResourceNotFoundError {
  constructor(sku: string, reference: string) {
    super("production.packing.line_not_found", `Aucune ligne « ${sku} » sur le bon ${reference}.`);
  }
}

/**
 * L'article n'est pas encore remis au colisage en quantité suffisante : la
 * réserve — reçu − rendu − déjà au bac — ne couvre pas la ligne. Même mot que
 * l'ancien poste (« sortis du four ») : la remise EST la sortie du four (§11.2).
 */
export class LineNotProducedYetError extends BusinessError {
  constructor(productName: string, missing: number) {
    super(
      "production.packing.not_produced_yet",
      `Il manque ${String(missing)} « ${productName} » sortis du four pour remplir cette ligne. Déclarez la fournée sur la fiche d'atelier avant de la mettre au bac.`,
    );
  }
}

/** La commande est au plafond de containers. */
export class ContainerCeilingReachedError extends BusinessError {
  constructor(reference: string, ceiling: number) {
    super(
      "production.packing.container_ceiling",
      `La commande ${reference} compte déjà ${String(ceiling)} containers, le maximum. Vérifiez le compte avant d'en ajouter : une commande n'en occupe jamais autant.`,
    );
  }
}

/**
 * La commande n'est **pas encore arrivée au colisage** — nouveau refus, propre
 * au découpage : la liste à coliser part du fournil par la boîte d'envoi
 * (`production.packing_list_drawn`), et n'est pas encore livrée. Rien n'est
 * perdu : le relais la livre, le geste se refait dans un instant. Si elle
 * n'arrive pas, la carte de santé montre un message en souffrance.
 */
export class PackingOrderNotDrawnYetError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.order.not_drawn_yet",
      `Le bon ${reference} n'est pas encore arrivé au poste de colisage : la liste du fournil est en route. Réessayez dans un instant ; s'il n'arrive pas, regardez les messages en souffrance de la carte de santé.`,
    );
  }
}
