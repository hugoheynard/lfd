import { Injectable } from "@nestjs/common";

import { PackingRevisionDesk } from "../../../../packing/channels/commerce/index.js";
import { OrderRevisionDesk, ServiceDay } from "../../../../production/channels/commerce/index.js";
import type {
  OrderRevisionToSave,
  RevisableOrder,
  RevisionActor,
} from "../../domain/entities/order-revision.js";
import {
  OrderNotRevisableError,
  PackingSheetNotYetDrawnError,
  QuantitiesOnlyAfterArrestError,
} from "../../domain/errors/order-revision-errors.js";
import {
  isQuantitiesOnly,
  quantitiesAfterArrestAllowed,
  revisedQuantitiesOf,
} from "../../domain/services/revision-after-arrest.js";

/**
 * **La révision chez les ateliers** — le fournil, puis le colisage (plan
 * `plan-modifier-une-commande.md`, §9.1 ; plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 7), dans l'unité de travail de la révision, après le verrou de la ligne
 * `orders`. Même figure que `OrderWorkshopWithdrawal` (A1).
 *
 * 1. Le guichet du fournil, sous le verrou de chaque journée touchée.
 *    `staff_quantities` n'est demandé que pour l'équipe d'une commande au
 *    compte dont la révision ne change que des quantités ; sinon, « inscrite »
 *    refuse comme avant.
 * 2. Inscrite et révisée au fournil : le guichet du colisage, sous le verrou
 *    de la feuille — feuille pas encore écrite, bac fermé, bac de livraison :
 *    refus nommés, et l'appelant défait tout.
 *
 * Ordre des verrous : `orders` → journée → feuille ; le BL vient après
 * l'écriture de la commande, par l'appelant.
 */
@Injectable()
export class OrderWorkshopRevision {
  constructor(
    private readonly bakery: OrderRevisionDesk,
    private readonly packing: PackingRevisionDesk,
  ) {}

  /**
   * @returns `true` si la commande était inscrite et que ses quantités ont été
   *   révisées chez les deux ateliers — le BL prévu doit alors suivre.
   * @throws {OrderNotRevisableError} inscrite, bac fermé, bac de livraison.
   * @throws {QuantitiesOnlyAfterArrestError} inscrite, et autre chose que des quantités.
   * @throws {PackingSheetNotYetDrawnError} le colisage n'a pas encore la feuille.
   */
  async note(
    current: RevisableOrder,
    revision: OrderRevisionToSave,
    actor: RevisionActor,
  ): Promise<boolean> {
    const days = [
      ...new Set([revision.previousServiceDay, revision.serviceDay].filter((day) => day !== null)),
    ];
    // Sans jour, une commande n'est jamais producible : rien à noter.
    const [first] = days;
    if (first === undefined) {
      return false;
    }
    const eligible = quantitiesAfterArrestAllowed(
      actor.kind,
      current.paymentStatus,
      current.totalCents,
    );
    const quantities = eligible && isQuantitiesOnly(current.lines, revision);
    const outcome = await this.bakery.note(
      days.map((day) => ServiceDay.of(day)),
      revision.orderId,
      revision.toRevision,
      revisedQuantitiesOf(revision),
      quantities ? "staff_quantities" : "before_inscription",
    );
    switch (outcome) {
      case "noted":
        return false;
      case "inscribed":
        throw eligible
          ? new QuantitiesOnlyAfterArrestError(revision.orderId)
          : new OrderNotRevisableError(revision.orderId, {
              kind: "inscribed",
              day: revision.previousServiceDay,
            });
      case "raised":
      case "unchanged":
        // `staff_quantities` ne passe qu'à jour inchangé : une seule journée.
        await this.reviseAtPacking(first, revision, authorOf(actor));
        return true;
    }
  }

  private async reviseAtPacking(
    day: string,
    revision: OrderRevisionToSave,
    author: string,
  ): Promise<void> {
    const outcome = await this.packing.revise(
      day,
      revision.orderId,
      revisedQuantitiesOf(revision),
      author,
    );
    switch (outcome) {
      case "revised":
        return;
      case "sheet_missing":
        throw new PackingSheetNotYetDrawnError(revision.orderId);
      case "packed":
      case "delivery_bin":
        throw new OrderNotRevisableError(revision.orderId, { kind: outcome });
    }
  }
}

/** L'auteur recopié par le colisage sur une ligne qui devient complète. */
function authorOf(actor: RevisionActor): string {
  return actor.kind === "staff" ? actor.staffId : actor.userId;
}
