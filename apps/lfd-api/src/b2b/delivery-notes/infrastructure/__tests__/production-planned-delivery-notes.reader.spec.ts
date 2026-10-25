import { BrandLogoSource } from "../../../../platform/brand/brand-logo.source.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { render } from "../../../../platform/pdf/paper-pdf-kit.js";
import type { DeliveryNoteDrawing } from "../../../../production/channels/commerce/index.js";
import {
  OneOrderReader,
  view,
} from "../../../orders/application/handlers/__tests__/order-placed-mail-doubles.js";
import type { OwnedOrder } from "../../../orders/domain/ports/order.reader.js";
import { AT_PLACEMENT } from "../../../orders/domain/services/order-sheet.js";
import { ART } from "../../../orders/domain/services/__tests__/client-sheet.fixture.js";
import type { DeliveryNoteState } from "../../domain/entities/delivery-note.js";
import { DeliveryNoteReader } from "../../domain/ports/delivery-note.reader.js";
import { plannedNote } from "../../domain/services/__tests__/delivery-note-sheet.fixture.js";
import {
  ProductionPlannedDeliveryNotesReader,
  ProductionSpecimenDeliveryNoteReader,
} from "../production-planned-delivery-notes.reader.js";

/**
 * **Le BL de transport derrière chaque bon du dossier du jour** (Hugo,
 * 2026-10-25) : le commerce dessine le BL vivant de chaque commande avec le
 * rendu même de la route du BL non chiffré. Instants recopiés, jamais comparés
 * à l'horloge.
 */
const AT = new Date("2026-10-07T18:00:00.000Z");

class FixedNotes extends DeliveryNoteReader {
  constructor(private readonly notes: readonly DeliveryNoteState[]) {
    super();
  }

  listForOrder(): Promise<readonly DeliveryNoteState[]> {
    return Promise.resolve(this.notes);
  }
}

class FixedLogo extends BrandLogoSource {
  load() {
    return Promise.resolve(ART.logo);
  }
}

function owned(): OwnedOrder {
  return {
    view: view({ id: "ord_1", orderNumber: "ORD-1042", companyId: "co_1" }),
    companyId: "co_1",
    placedByUserId: "user_buyer",
    stripePaymentIntentId: null,
    clientele: "pro",
    loyaltyVoucherId: null,
    billedCustomer: null,
    buyerPhone: null,
    revision: AT_PLACEMENT,
  };
}

async function textOf(drawing: DeliveryNoteDrawing | undefined): Promise<string> {
  if (drawing === undefined) {
    return "";
  }
  return pdfPages(await render(AT, "BL", drawing)).join(" ");
}

function reader(notes: readonly DeliveryNoteState[], order: OwnedOrder | null = owned()) {
  return new ProductionPlannedDeliveryNotesReader(
    new OneOrderReader(order),
    new FixedNotes(notes),
    new FixedLogo(),
  );
}

describe("ProductionPlannedDeliveryNotesReader", () => {
  it("dessine le BL prévu de la commande, sans aucun montant", async () => {
    const drawings = await reader([plannedNote().toState()]).drawingsOf(["ord_1"]);
    const text = await textOf(drawings.get("ord_1"));
    expect(text).toContain("BON DE LIVRAISON");
    expect(text).toContain("BL-1042-1");
    expect(text).not.toContain("€");
  });

  it("n'imprime aucun BL pour une commande dont le BL est annulé", async () => {
    const voided = plannedNote();
    voided.void(AT);
    const drawings = await reader([voided.toState()]).drawingsOf(["ord_1"]);
    expect(drawings.size).toBe(0);
  });

  it("n'imprime aucun BL pour une commande inconnue ou sans BL", async () => {
    expect((await reader([plannedNote().toState()], null).drawingsOf(["ord_1"])).size).toBe(0);
    expect((await reader([]).drawingsOf(["ord_1"])).size).toBe(0);
  });

  it("ne lit rien pour une journée sans commande", async () => {
    expect((await reader([]).drawingsOf([])).size).toBe(0);
  });
});

describe("ProductionSpecimenDeliveryNoteReader", () => {
  it("dessine le BL de transport de la planche", async () => {
    const drawing = await new ProductionSpecimenDeliveryNoteReader(new FixedLogo()).specimenDrawing(
      AT,
    );
    expect(await textOf(drawing)).toContain("BON DE LIVRAISON");
  });
});
