import { OrderTotalChangedError } from "../../../domain/errors/order-total-changed.error.js";
import {
  PlaceOrderForCustomerCommand,
  type PlaceOrderForCustomerResult,
} from "../place-order-for-customer.command.js";
import { PlaceOrderForCustomerHandler } from "../place-order-for-customer.handler.js";
import { PlaceOrderCommand } from "../place-order.command.js";
import { PlaceOrderHandler } from "../place-order.handler.js";
import { PlaceShopOrderCommand, type PlaceShopOrderResult } from "../place-shop-order.command.js";
import { PlaceShopOrderHandler } from "../place-shop-order.handler.js";

/**
 * Le total « pas vu » des payloads par défaut de ces suites : aucune commande
 * ne l'atteint, donc la première tentative est refusée `orders.total_changed`.
 *
 * Depuis le lot T3 (`le-prix-d-un-panier.md`), le total vu est OBLIGATOIRE au
 * contrat. Les suites des trois passations éprouvent autre chose que lui
 * (mur, règlement, langue…) sur des paniers dont le total varie : elles
 * font donc ce que fait l'écran sur ce refus — confirmer le total composé et
 * renvoyer. Une suite qui donne un total EXPLICITE (celles du « total vu »)
 * n'est jamais rejouée : son refus remonte tel quel.
 */
export const UNSEEN_TOTAL_CENTS = Number.MAX_SAFE_INTEGER;

async function confirmingSeenTotal<R>(
  expected: number,
  attempt: (expectedTotalCents: number) => Promise<R>,
): Promise<R> {
  if (expected !== UNSEEN_TOTAL_CENTS) {
    return attempt(expected);
  }
  try {
    return await attempt(expected);
  } catch (error) {
    if (error instanceof OrderTotalChangedError) {
      return attempt(error.totalCents);
    }
    throw error;
  }
}

/** `PlaceOrderHandler` qui confirme le total composé d'un payload « pas vu ». */
export class SeeingPlaceOrderHandler extends PlaceOrderHandler {
  override execute(command: PlaceOrderCommand): ReturnType<PlaceOrderHandler["execute"]> {
    return confirmingSeenTotal(command.payload.expectedTotalCents, (expectedTotalCents) =>
      super.execute(
        new PlaceOrderCommand(
          command.actorUserId,
          { ...command.payload, expectedTotalCents },
          command.companyId,
        ),
      ),
    );
  }
}

/** `PlaceShopOrderHandler` qui confirme le total composé d'un payload « pas vu ». */
export class SeeingPlaceShopOrderHandler extends PlaceShopOrderHandler {
  override execute(command: PlaceShopOrderCommand): Promise<PlaceShopOrderResult> {
    return confirmingSeenTotal(command.payload.expectedTotalCents, (expectedTotalCents) =>
      super.execute(new PlaceShopOrderCommand({ ...command.payload, expectedTotalCents })),
    );
  }
}

/** `PlaceOrderForCustomerHandler` qui confirme le total composé d'un payload « pas vu ». */
export class SeeingPlaceOrderForCustomerHandler extends PlaceOrderForCustomerHandler {
  override execute(command: PlaceOrderForCustomerCommand): Promise<PlaceOrderForCustomerResult> {
    return confirmingSeenTotal(command.payload.expectedTotalCents, (expectedTotalCents) =>
      super.execute(
        new PlaceOrderForCustomerCommand(
          command.staffUserId,
          { ...command.payload, expectedTotalCents },
          command.intentKey,
        ),
      ),
    );
  }
}
