import type { Buffer } from "node:buffer";

import { BrandLogoSource } from "../../../platform/brand/brand-logo.source.js";
import {
  type DeliveryNoteDrawing,
  PlannedDeliveryNotesReader,
  SpecimenDeliveryNoteReader,
} from "../../channels/commerce/planned-delivery-notes.reader.js";
import { PAPER_LOGO } from "../../domain/services/__tests__/paper-logo.fixture.js";
import { put } from "../../../platform/pdf/paper-pdf-kit.js";

/** Le logo du dépôt, servi sans disque. */
export class FixedPaperLogo extends BrandLogoSource {
  load(): Promise<Buffer> {
    return Promise.resolve(PAPER_LOGO);
  }
}

/** Un BL doublé : une page qui dit son numéro, pour qu'on la retrouve dans le dossier. */
export function noteDrawing(number: string): DeliveryNoteDrawing {
  return (doc) => {
    put(doc, `BON DE LIVRAISON ${number}`, 40, 60, { size: 16, bold: true });
  };
}

/**
 * Le commerce doublé, côté BL : un BL par commande connue, ou aucun ; `failing`
 * simule un commerce muet. Compte les commandes demandées.
 */
export class FixedPlannedDeliveryNotes extends PlannedDeliveryNotesReader {
  readonly asked: string[][] = [];

  constructor(
    private readonly numbers: ReadonlyMap<string, string> = new Map(),
    private readonly failing = false,
  ) {
    super();
  }

  drawingsOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, DeliveryNoteDrawing>> {
    this.asked.push([...orderIds]);
    if (this.failing) {
      return Promise.reject(new TypeError("commerce muet"));
    }
    return Promise.resolve(
      new Map(
        [...this.numbers]
          .filter(([orderId]) => orderIds.includes(orderId))
          .map(([orderId, number]) => [orderId, noteDrawing(number)] as const),
      ),
    );
  }
}

/** Le BL d'exemple doublé. */
export class FixedSpecimenDeliveryNote extends SpecimenDeliveryNoteReader {
  specimenDrawing(): Promise<DeliveryNoteDrawing> {
    return Promise.resolve(noteDrawing("BL-EXEMPLE"));
  }
}
