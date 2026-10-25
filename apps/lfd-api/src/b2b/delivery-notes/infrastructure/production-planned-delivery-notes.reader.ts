import { Injectable } from "@nestjs/common";

import {
  type DeliveryNoteDrawing,
  PlannedDeliveryNotesReader,
  SpecimenDeliveryNoteReader,
} from "../../../production/channels/commerce/index.js";
import { BrandLogoSource } from "../../../platform/brand/brand-logo.source.js";
import { OrderReader } from "../../orders/domain/ports/order.reader.js";
import { specimenDeliveryNote } from "../application/document-specimens/specimen-delivery-note.js";
import { orderPartsOf } from "../application/services/delivery-note-documents.js";
import type { DeliveryNoteState } from "../domain/entities/delivery-note.js";
import { DeliveryNoteReader } from "../domain/ports/delivery-note.reader.js";
import { drawCarrierNote } from "../domain/services/delivery-note-pdf.js";
import { carrierNoteOf } from "../domain/services/delivery-note-sheet.js";

/**
 * Le BL qui voyage avec la commande : le **premier vivant** par rang. C'est le
 * BL prévu à l'arrêt du plan (BL-1) tant qu'il n'est pas annulé ; préparé ou
 * remis depuis, il est imprimé tel qu'il est maintenant.
 */
function travellingNoteOf(notes: readonly DeliveryNoteState[]): DeliveryNoteState | null {
  const alive = notes.filter((note) => note.status !== "voided");
  return [...alive].sort((a, b) => a.rank - b.rank)[0] ?? null;
}

/**
 * L'adaptateur de `PlannedDeliveryNotesReader` (fournil) : le BL de transport
 * de chaque commande, dessiné par `drawCarrierNote` — le rendu même de la
 * route du BL non chiffré. Aucun mur : le dossier du jour est un papier du
 * staff, qui voit toutes les commandes de la journée.
 *
 * Une lecture de la commande et une de ses BL par commande : le dossier n'est
 * rendu qu'au premier tirage, puis relu de l'archive.
 */
@Injectable()
export class ProductionPlannedDeliveryNotesReader extends PlannedDeliveryNotesReader {
  constructor(
    private readonly orders: OrderReader,
    private readonly notes: DeliveryNoteReader,
    private readonly logo: BrandLogoSource,
  ) {
    super();
  }

  async drawingsOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, DeliveryNoteDrawing>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const art = { logo: await this.logo.load() };
    const drawings = new Map<string, DeliveryNoteDrawing>();
    for (const orderId of new Set(orderIds)) {
      const [owned, notes] = await Promise.all([
        this.orders.findById(orderId),
        this.notes.listForOrder(orderId),
      ]);
      const travelling = travellingNoteOf(notes);
      if (owned === null || travelling === null) {
        continue;
      }
      const note = carrierNoteOf(travelling, orderPartsOf(owned).head);
      drawings.set(orderId, (doc) => {
        drawCarrierNote(doc, note, art);
      });
    }
    return drawings;
  }
}

/** L'adaptateur de `SpecimenDeliveryNoteReader` : le BL de transport de la planche. */
@Injectable()
export class ProductionSpecimenDeliveryNoteReader extends SpecimenDeliveryNoteReader {
  constructor(private readonly logo: BrandLogoSource) {
    super();
  }

  async specimenDrawing(now: Date): Promise<DeliveryNoteDrawing> {
    const { note, head } = specimenDeliveryNote(now);
    const carrier = carrierNoteOf(note, head);
    const art = { logo: await this.logo.load() };
    return (doc) => {
      drawCarrierNote(doc, carrier, art);
    };
  }
}
