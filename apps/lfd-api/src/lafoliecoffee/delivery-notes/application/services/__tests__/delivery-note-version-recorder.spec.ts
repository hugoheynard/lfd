import { BrandLogoSource } from "../../../../../platform/brand/brand-logo.source.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  OneOrderReader,
  view,
} from "../../../../orders/application/handlers/__tests__/order-placed-mail-doubles.js";
import { OrderNotFoundError } from "../../../../orders/domain/errors/order-errors.js";
import type { OwnedOrder } from "../../../../orders/domain/ports/order.reader.js";
import { AT_PLACEMENT } from "../../../../orders/domain/services/order-sheet.js";
import { ART } from "../../../../orders/domain/services/__tests__/client-sheet.fixture.js";
import type { DeliveryNoteState } from "../../../domain/entities/delivery-note.js";
import { DeliveryNoteReader } from "../../../domain/ports/delivery-note.reader.js";
import { plannedNote } from "../../../domain/services/__tests__/delivery-note-sheet.fixture.js";
import { FixedNoteDiscountParts } from "../../__tests__/departure-doubles.js";
import { RecordingVersionWriter } from "../../__tests__/delivery-note-version-doubles.js";
import { DeliveryNoteDocuments } from "../delivery-note-documents.js";
import { DeliveryNoteVersionRecorder } from "../delivery-note-version-recorder.js";

/**
 * **Le gardien des versions** (`documentation/commandes/reliquat/reliquat.md`, § 7) : il compose le BL
 * client par le composeur de la route du PDF, et le range sous la version et
 * la cause que le dépôt lui donne. Instant fixe, jamais comparé à l'horloge.
 */
const NOW = new Date(3_600_000);

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
    entryOrigin: null,
    loyaltyVoucherId: null,
    billedCustomer: null,
    buyerPhone: null,
    revision: AT_PLACEMENT,
  };
}

function scene(order: OwnedOrder | null = owned()) {
  const note = plannedNote().toState();
  const documents = new DeliveryNoteDocuments(
    new OneOrderReader(order),
    new FixedNotes([note]),
    new FixedLogo(),
    new FixedNoteDiscountParts(),
  );
  const writer = new RecordingVersionWriter();
  const keeper = new DeliveryNoteVersionRecorder(documents, writer, new FixedClock(NOW));
  return { note, documents, writer, keeper };
}

describe("DeliveryNoteVersionRecorder", () => {
  it("range l'entrée même du PDF client, sous la version et la cause données", async () => {
    const { note, documents, writer, keeper } = scene();

    await keeper.keep({ id: note.id, orderId: "ord_1", number: note.number }, 1, "born");

    expect(writer.recorded).toEqual([
      {
        noteId: note.id,
        contentVersion: 1,
        cause: "born",
        rendered: await documents.clientNote("ord_1", note.number),
        recordedAt: NOW,
      },
    ]);
    expect(writer.recorded[0]?.rendered.note).toMatchObject({
      audience: "client",
      number: "BL-1042-1",
    });
  });

  it("un refus du composeur remonte : rien n'est rangé, l'écriture du bon tombe avec", async () => {
    const { note, writer, keeper } = scene(null);

    await expect(
      keeper.keep({ id: note.id, orderId: "ord_1", number: note.number }, 1, "born"),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(writer.recorded).toEqual([]);
  });

  // La cause vient du dépôt, jamais devinée ici : un départ décidé et une
  // replanification se rangent sous leur nom, chacun sous sa version.
  it.each(["departure_decided", "replanned"] as const)(
    "range la version 2 sous la cause « %s » sans la réécrire en « born »",
    async (cause) => {
      const { note, writer, keeper } = scene();

      await keeper.keep({ id: note.id, orderId: "ord_1", number: note.number }, 2, cause);

      expect(writer.recorded).toHaveLength(1);
      expect(writer.recorded[0]).toMatchObject({ contentVersion: 2, cause });
    },
  );

  it("compose le bon désigné par son numéro : un numéro inconnu de la commande n'est pas rangé", async () => {
    const { note, writer, keeper } = scene();

    await expect(
      keeper.keep({ id: note.id, orderId: "ord_1", number: "BL-9-9" }, 1, "born"),
    ).rejects.toThrow();
    expect(writer.recorded).toEqual([]);
  });
});
