import { BrandLogoSource } from "../../../../../platform/brand/brand-logo.source.js";
import { pdfPages } from "../../../../../platform/pdf/__tests__/pdf-text.js";
import {
  OneOrderReader,
  view,
} from "../../../../orders/application/handlers/__tests__/order-placed-mail-doubles.js";
import type { OwnedOrder } from "../../../../orders/domain/ports/order.reader.js";
import { AT_PLACEMENT } from "../../../../orders/domain/services/order-sheet.js";
import { ART } from "../../../../orders/domain/services/__tests__/client-sheet.fixture.js";
import type { DeliveryNoteState } from "../../../domain/entities/delivery-note.js";
import {
  DeliveryNoteNotFoundError,
  DeliveryNoteVersionNotKeptError,
} from "../../../domain/errors/delivery-note-errors.js";
import { DeliveryNoteReader } from "../../../domain/ports/delivery-note.reader.js";
import { plannedNote } from "../../../domain/services/__tests__/delivery-note-sheet.fixture.js";
import type { RenderedClientNote } from "../../../domain/services/rendered-client-note.js";
import { FixedNoteDiscountParts } from "../../__tests__/departure-doubles.js";
import { FixedRendered, FixedVersions } from "../../__tests__/delivery-note-version-doubles.js";
import { DeliveryNoteDocuments } from "../../services/delivery-note-documents.js";
import { GetDeliveryNoteVersionPdfHandler } from "../get-delivery-note-version-pdf.handler.js";
import { GetDeliveryNoteVersionPdfQuery } from "../get-delivery-note-version-pdf.query.js";
import { ListOrderDeliveryNotesHandler } from "../list-order-delivery-notes.handler.js";
import { ListOrderDeliveryNotesQuery } from "../list-order-delivery-notes.query.js";

/**
 * **L'historique des documents** (plan du reliquat, § 5 ter, B4b.2) : la
 * liste dit les versions de chaque bon, et le PDF d'une version se rend de
 * la version figée SEULE. Instants recopiés, jamais comparés à l'horloge.
 */
const BORN_AT = new Date(1_000);
const DECIDED_AT = new Date(2_000);

class CountingNotes extends DeliveryNoteReader {
  reads = 0;

  constructor(private readonly notes: readonly DeliveryNoteState[]) {
    super();
  }

  listForOrder(): Promise<readonly DeliveryNoteState[]> {
    this.reads += 1;
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
    entryOrigin: null,
    loyaltyVoucherId: null,
    billedCustomer: null,
    buyerPhone: null,
    revision: AT_PLACEMENT,
  };
}

const NOTE = plannedNote().toState();

function documents(orderReader = new OneOrderReader(owned())) {
  return new DeliveryNoteDocuments(
    orderReader,
    new CountingNotes([NOTE]),
    new FixedLogo(),
    new FixedNoteDiscountParts(),
  );
}

describe("ListOrderDeliveryNotesHandler — les versions de chaque bon", () => {
  it("rend les versions dans l'ordre, et dit la version d'origine conservée", async () => {
    const handler = new ListOrderDeliveryNotesHandler(
      documents(),
      new FixedVersions(
        new Map([
          [
            NOTE.id,
            [
              { contentVersion: 2, cause: "departure_decided" as const, recordedAt: DECIDED_AT },
              { contentVersion: 1, cause: "born" as const, recordedAt: BORN_AT },
            ],
          ],
        ]),
      ),
    );

    const [note] = await handler.execute(new ListOrderDeliveryNotesQuery("ord_1"));

    expect(note?.versions).toEqual([
      { version: 1, cause: "born", recordedAt: BORN_AT.toISOString() },
      { version: 2, cause: "departure_decided", recordedAt: DECIDED_AT.toISOString() },
    ]);
    expect(note?.originKept).toBe(true);
  });

  it("un bon antérieur aux versions dit sa version d'origine non conservée", async () => {
    const handler = new ListOrderDeliveryNotesHandler(
      documents(),
      new FixedVersions(
        new Map([
          [NOTE.id, [{ contentVersion: 3, cause: "replanned" as const, recordedAt: DECIDED_AT }]],
        ]),
      ),
    );

    const [note] = await handler.execute(new ListOrderDeliveryNotesQuery("ord_1"));

    expect(note?.originKept).toBe(false);
    expect(note?.versions.map((v) => v.version)).toEqual([3]);
  });

  it("un bon sans aucune version : liste vide, origine non conservée", async () => {
    const handler = new ListOrderDeliveryNotesHandler(documents(), new FixedVersions());

    const [note] = await handler.execute(new ListOrderDeliveryNotesQuery("ord_1"));

    expect(note).toMatchObject({ versions: [], originKept: false });
  });
});

describe("GetDeliveryNoteVersionPdfHandler — le PDF d'une version figée", () => {
  async function frozen(): Promise<RenderedClientNote> {
    const rendered = await documents().clientNote("ord_1", NOTE.number);
    // La version figée dit autre chose que le bon courant : c'est elle qu'on lit.
    return {
      note: { ...rendered.note, lines: rendered.note.lines.slice(0, 1) },
      undelivered: [{ productName: "Croissant", quantity: 4, saleUnit: "piece" }],
    };
  }

  it("rend la version de l'entrée figée seule, sans relire la commande", async () => {
    const orders = new OneOrderReader(null);
    const kept = new FixedRendered(new Map([[`${NOTE.id}:1`, await frozen()]]));
    const handler = new GetDeliveryNoteVersionPdfHandler(documents(orders), kept);

    const pdf = await handler.execute(new GetDeliveryNoteVersionPdfQuery("ord_1", NOTE.number, 1));

    expect(pdf.fileName).toBe("bon-de-livraison-BL-1042-1-v1.pdf");
    const text = pdfPages(pdf.bytes).join("\n");
    expect(text).toContain("Non livré");
    expect(text).toContain("Croissant");
    expect(kept.asked).toEqual([`${NOTE.id}:1`]);
  });

  it("une version non conservée répond « non conservée »", async () => {
    const handler = new GetDeliveryNoteVersionPdfHandler(documents(), new FixedRendered());

    await expect(
      handler.execute(new GetDeliveryNoteVersionPdfQuery("ord_1", NOTE.number, 1)),
    ).rejects.toBeInstanceOf(DeliveryNoteVersionNotKeptError);
  });

  it("un numéro d'une autre commande répond 404, sans lire de version", async () => {
    const kept = new FixedRendered();
    const handler = new GetDeliveryNoteVersionPdfHandler(documents(), kept);

    await expect(
      handler.execute(new GetDeliveryNoteVersionPdfQuery("ord_1", "BL-9-1", 1)),
    ).rejects.toBeInstanceOf(DeliveryNoteNotFoundError);
    expect(kept.asked).toEqual([]);
  });
});
