import type { Buffer } from "node:buffer";

import { Injectable } from "@nestjs/common";

import { BrandLogoSource } from "../../../../platform/brand/brand-logo.source.js";
import { OrderNotFoundError } from "../../../orders/domain/errors/order-errors.js";
import { type OwnedOrder, OrderReader } from "../../../orders/domain/ports/order.reader.js";
import { clientSheetOf } from "../../../orders/domain/services/order-sheet.js";
import type { DeliveryNoteState } from "../../domain/entities/delivery-note.js";
import { DeliveryNoteNotFoundError } from "../../domain/errors/delivery-note-errors.js";
import { DeliveryNoteReader } from "../../domain/ports/delivery-note.reader.js";
import type { DeliveryNoteArt } from "../../domain/services/delivery-note-pdf-parts.js";
import type {
  DeliveryNoteOrderBilling,
  DeliveryNoteOrderHead,
} from "../../domain/services/delivery-note-sheet.js";

/** Un BL rendu, et le nom proposé au téléchargement. */
export interface DeliveryNotePdf {
  readonly bytes: Buffer;
  readonly fileName: string;
}

/** Ce que la commande donne au BL : sa tête, de quoi chiffrer, et le BL lui-même. */
export interface DeliveryNoteOnOrder {
  readonly owned: OwnedOrder;
  readonly head: DeliveryNoteOrderHead;
  readonly billing: DeliveryNoteOrderBilling;
}

/**
 * Ce que la commande dit d'un BL — **lu par le bon de commande du client**
 * (`clientSheetOf`) plutôt que recomposé : le BL nomme le client, l'adresse et
 * le contact exactement comme le bon qu'il a reçu (plan E5a, § 1).
 */
export function orderPartsOf(owned: OwnedOrder): DeliveryNoteOnOrder {
  const sheet = clientSheetOf(owned.view, owned.billedCustomer, owned.buyerPhone, owned.revision);
  return {
    owned,
    head: {
      orderId: sheet.orderId,
      reference: sheet.reference,
      placedAt: sheet.placedAt,
      requestedFor: sheet.requestedFor,
      customer: sheet.customer,
      fulfillment: sheet.fulfillment,
      note: sheet.note,
    },
    billing: { variant: sheet.variant, customerPhone: sheet.customerPhone, money: sheet.money },
  };
}

/**
 * **Les lectures communes aux routes du BL** : la commande, ses BL, le logo.
 * Le mur n'est pas ici — chaque handler applique le sien sur la commande lue.
 */
@Injectable()
export class DeliveryNoteDocuments {
  constructor(
    private readonly orders: OrderReader,
    private readonly notes: DeliveryNoteReader,
    private readonly logo: BrandLogoSource,
  ) {}

  /** @throws {OrderNotFoundError} la commande n'existe pas. */
  async order(orderId: string): Promise<DeliveryNoteOnOrder> {
    const owned = await this.orders.findById(orderId);
    if (owned === null) {
      throw new OrderNotFoundError(orderId);
    }
    return orderPartsOf(owned);
  }

  listFor(orderId: string): Promise<readonly DeliveryNoteState[]> {
    return this.notes.listForOrder(orderId);
  }

  /** @throws {DeliveryNoteNotFoundError} la commande n'a pas de BL de ce numéro. */
  async note(orderId: string, number: string): Promise<DeliveryNoteState> {
    const found = (await this.notes.listForOrder(orderId)).find((n) => n.number === number);
    if (found === undefined) {
      throw new DeliveryNoteNotFoundError(orderId, number);
    }
    return found;
  }

  async art(): Promise<DeliveryNoteArt> {
    return { logo: await this.logo.load() };
  }
}
