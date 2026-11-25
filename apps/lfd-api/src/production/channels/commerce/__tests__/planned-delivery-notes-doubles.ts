import {
  type DeliveryNoteDrawing,
  DeliveryNotesBornReader,
  PlannedDeliveryNotesReader,
  SpecimenDeliveryNoteReader,
} from "../planned-delivery-notes.reader.js";
import { put } from "../../../../platform/pdf/paper-pdf-kit.js";

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
    private readonly everyOrder = false,
  ) {
    super();
  }

  /** Un BL né pour chaque commande demandée, numéroté `BL-<commande>`. */
  static forEveryOrder(): FixedPlannedDeliveryNotes {
    return new FixedPlannedDeliveryNotes(new Map(), false, true);
  }

  drawingsOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, DeliveryNoteDrawing>> {
    this.asked.push([...orderIds]);
    if (this.failing) {
      return Promise.reject(new TypeError("commerce muet"));
    }
    if (this.everyOrder) {
      return Promise.resolve(
        new Map(orderIds.map((orderId) => [orderId, noteDrawing(`BL-${orderId}`)] as const)),
      );
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

/**
 * Le commerce doublé, côté BL nés : `missing` nomme les commandes encore sans
 * BL ; `bear()` les fait naître, comme l'abonné du commerce à l'arrêt.
 */
export class FixedDeliveryNotesBorn extends DeliveryNotesBornReader {
  constructor(private missing: readonly string[] = []) {
    super();
  }

  bear(): void {
    this.missing = [];
  }

  withoutNote(orderIds: readonly string[]): Promise<readonly string[]> {
    return Promise.resolve(orderIds.filter((orderId) => this.missing.includes(orderId)));
  }
}
