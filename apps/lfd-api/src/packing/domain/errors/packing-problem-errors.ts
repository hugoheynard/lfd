import { quantityFigure, saleQuantity, type SaleUnit } from "@lfd/money";

import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * **Les refus de « Problème » et des pièces retrouvées** (plan des niveaux de
 * suivi du colisage, D5 et D6) : une commande à retirer, colisée au niveau
 * simple, dont le poste dit ce qui est vraiment là.
 */

/**
 * « Problème » sur une fiche qui n'est pas un retrait au niveau simple : une
 * livraison, un réassort ou un retrait détaillé se signalent par « Il
 * manque », contenant par contenant.
 */
export class ProblemOutsideSimplePickupError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.problem.not_simple_pickup",
      `La commande ${reference} se colise en détail (livraison, ou retrait réglé en suivi détaillé) : « Problème » ne s'y applique pas. Retirez du contenant ce qui manque, puis signalez « Il manque ».`,
    );
  }
}

/** La commande est partie avec le client : son sac ne se rouvre plus. */
export class PackingSheetHandedOverError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.sheet.handed_over",
      `La commande ${reference} a déjà été retirée par le client : son sac ne se rouvre plus. Un écart se traite depuis la commande, côté commerce.`,
    );
  }
}

/** « Problème » dirait présent ce que la commande ne demande pas. */
export class PresentBeyondDueError extends BusinessError {
  constructor(productName: string, due: number, present: number, unit: SaleUnit) {
    super(
      "packing.problem.present_beyond_due",
      `« ${productName} » : ${quantityFigure(saleQuantity(present, unit))} dits présents pour ${quantityFigure(saleQuantity(due, unit))} commandés. Indiquez au plus la quantité de la commande.`,
    );
  }
}

/**
 * Mettre de côté plus que le libre de la réserve : une pièce au bac en sort
 * d'abord, une pièce réservée n'est pas à la commande. Défense de
 * l'invariant — le geste borne avant d'appeler.
 */
export class MissingBeyondFreeError extends BusinessError {
  constructor(productName: string, free: number, requested: number, unit: SaleUnit) {
    super(
      "packing.stock.missing_beyond_free",
      `« ${productName} » : ${quantityFigure(saleQuantity(requested, unit))} à mettre de côté comme absents, mais la réserve n'en a que ${quantityFigure(saleQuantity(free, unit))} de libres. Rien n'a été écrit ; rafraîchissez le poste et recommencez.`,
    );
  }
}

/** Rendre plus de pièces retrouvées que la réserve n'en a mis de côté. */
export class RecoveredBeyondMissingError extends BusinessError {
  constructor(productName: string, missing: number, requested: number, unit: SaleUnit) {
    super(
      "packing.stock.recovered_beyond_missing",
      `« ${productName} » : ${quantityFigure(saleQuantity(requested, unit))} retrouvés, mais seulement ${quantityFigure(saleQuantity(missing, unit))} avaient été mis de côté comme absents ce jour-là. Indiquez au plus ${quantityFigure(saleQuantity(missing, unit))}.`,
    );
  }
}

/** Le superviseur a déjà décidé du départ incomplet : le manque ne se redit pas au poste. */
export class ProblemAfterDecisionError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.problem.already_decided",
      `La décision sur le manque de la commande ${reference} est déjà prise : le manque se corrige depuis la commande.`,
    );
  }
}
