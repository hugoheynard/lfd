import { BrandLogoSource } from "../../../../../platform/brand/brand-logo.source.js";
import { ART } from "../../../../orders/domain/services/__tests__/client-sheet.fixture.js";
import {
  OneOrderReader,
  view,
} from "../../../../orders/application/handlers/__tests__/order-placed-mail-doubles.js";
import { OrderAccessReader } from "../../../../orders/domain/ports/order-access.reader.js";
import type { OrderRole } from "../../../../orders/domain/ports/order-guard.reader.js";
import { OrderNotFoundError } from "../../../../orders/domain/errors/order-errors.js";
import type { OwnedOrder } from "../../../../orders/domain/ports/order.reader.js";
import { AT_PLACEMENT } from "../../../../orders/domain/services/order-sheet.js";
import type { DeliveryNoteState } from "../../../domain/entities/delivery-note.js";
import { DeliveryNoteNotFoundError } from "../../../domain/errors/delivery-note-errors.js";
import { DeliveryNoteReader } from "../../../domain/ports/delivery-note.reader.js";
import {
  handedOverNote,
  plannedNote,
} from "../../../domain/services/__tests__/delivery-note-sheet.fixture.js";
import { DeliveryNoteDocuments } from "../../services/delivery-note-documents.js";
import { GetCarrierNotePdfHandler } from "../get-carrier-note-pdf.handler.js";
import { GetCarrierNotePdfQuery } from "../get-carrier-note-pdf.query.js";
import { GetClientNotePdfHandler } from "../get-client-note-pdf.handler.js";
import { GetClientNotePdfQuery } from "../get-client-note-pdf.query.js";
import { ListOrderDeliveryNotesHandler } from "../list-order-delivery-notes.handler.js";
import { ListOrderDeliveryNotesQuery } from "../list-order-delivery-notes.query.js";

const COMPANY = "co_1";
const BUYER = "user_buyer";

class FixedNotes extends DeliveryNoteReader {
  readonly asked: string[] = [];

  constructor(private readonly notes: readonly DeliveryNoteState[]) {
    super();
  }

  listForOrder(orderId: string): Promise<readonly DeliveryNoteState[]> {
    this.asked.push(orderId);
    return Promise.resolve(this.notes);
  }
}

class FixedLogo extends BrandLogoSource {
  load() {
    return Promise.resolve(ART.logo);
  }
}

class OneRole extends OrderAccessReader {
  constructor(private readonly role: OrderRole | null) {
    super();
  }

  accessToOrder(): Promise<OrderRole | null> {
    return Promise.resolve(this.role);
  }
}

function owned(): OwnedOrder {
  return {
    view: view({ id: "ord_1", orderNumber: "ORD-1042", companyId: COMPANY }),
    companyId: COMPANY,
    placedByUserId: BUYER,
    stripePaymentIntentId: null,
    clientele: "pro",
    loyaltyVoucherId: null,
    billedCustomer: null,
    buyerPhone: null,
    revision: AT_PLACEMENT,
  };
}

function documents(notes: readonly DeliveryNoteState[], order: OwnedOrder | null = owned()) {
  return new DeliveryNoteDocuments(
    new OneOrderReader(order),
    new FixedNotes(notes),
    new FixedLogo(),
  );
}

describe("GetClientNotePdfHandler — le BL dans l'espace client", () => {
  it("sert le BL remis à un membre de la société", async () => {
    const handler = new GetClientNotePdfHandler(
      new OneRole("orders"),
      documents([handedOverNote()]),
    );

    const pdf = await handler.execute(new GetClientNotePdfQuery("user_member", "ord_1"));

    expect(pdf.fileName).toBe("bon-de-livraison-BL-1042-1.pdf");
    expect(pdf.bytes.length).toBeGreaterThan(0);
  });

  it("rend le 404 de la commande à qui n'est pas de la société — le mur", async () => {
    const handler = new GetClientNotePdfHandler(new OneRole(null), documents([handedOverNote()]));

    await expect(
      handler.execute(new GetClientNotePdfQuery("user_other", "ord_1")),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("ne sert pas un BL encore prévu : le client n'a rien reçu", async () => {
    const handler = new GetClientNotePdfHandler(
      new OneRole("orders"),
      documents([plannedNote().toState()]),
    );

    await expect(
      handler.execute(new GetClientNotePdfQuery("user_member", "ord_1")),
    ).rejects.toBeInstanceOf(DeliveryNoteNotFoundError);
  });
});

describe("GetCarrierNotePdfHandler — le BL de transport pour l'équipe", () => {
  it("rend le BL demandé, sous son nom de transport", async () => {
    const handler = new GetCarrierNotePdfHandler(documents([handedOverNote()]));

    const pdf = await handler.execute(new GetCarrierNotePdfQuery("ord_1", "BL-1042-1"));

    expect(pdf.fileName).toBe("bon-de-livraison-BL-1042-1-transport.pdf");
  });

  it("refuse un numéro que la commande ne porte pas", async () => {
    const handler = new GetCarrierNotePdfHandler(documents([handedOverNote()]));

    await expect(
      handler.execute(new GetCarrierNotePdfQuery("ord_1", "BL-9999-1")),
    ).rejects.toBeInstanceOf(DeliveryNoteNotFoundError);
  });

  it("refuse une commande inconnue avant de lire ses BL", async () => {
    const notes = new FixedNotes([handedOverNote()]);
    const handler = new GetCarrierNotePdfHandler(
      new DeliveryNoteDocuments(new OneOrderReader(null), notes, new FixedLogo()),
    );

    await expect(
      handler.execute(new GetCarrierNotePdfQuery("ord_x", "BL-1042-1")),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(notes.asked).toEqual([]);
  });
});

describe("ListOrderDeliveryNotesHandler — la liste de la fiche commande", () => {
  it("rend chaque BL avec son état", async () => {
    const handler = new ListOrderDeliveryNotesHandler(documents([handedOverNote()]));

    const notes = await handler.execute(new ListOrderDeliveryNotesQuery("ord_1"));

    expect(notes.map((n) => [n.number, n.status])).toEqual([["BL-1042-1", "handed_over"]]);
  });
});
