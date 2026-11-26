import {
  InHouseRecapNobodyToNotifyError,
  InHouseRecapNotFoundError,
  RecapPayerMissingError,
} from "../../../domain/errors/in-house-recap-errors.js";
import {
  documentWorld,
  issuedRecap,
  PAYER,
} from "../../__tests__/in-house-recap-document-doubles.js";

/**
 * Le document d'un récapitulatif émis (D10) : le PDF rendu et rangé HORS
 * transaction, sa clé écrite par l'agrégat, puis la demande d'e-mail, le PDF
 * joint par référence, sous une clé sans adresse.
 */
describe("le document d'un récapitulatif émis", () => {
  it("range le PDF, écrit sa clé, et demande l'e-mail avec la pièce par référence", async () => {
    const world = documentWorld();
    await world.recaps.save(issuedRecap());

    await world.document.afterIssued("recap-1");

    const key = "in-house-recaps/resto/RBL-202610-0001.pdf";
    expect([...world.store.objects.keys()]).toEqual([key]);
    expect((await world.recaps.load("recap-1"))?.storageKey).toBe(key);
    expect(world.recaps.writes).toContain("document:recap-1");
    expect(world.mail.queued).toEqual([
      {
        template: "customer.in-house-recap",
        to: "compta@resto.test",
        data: {
          payerName: "Restaurant du Port",
          month: "2026-10",
          recapNumber: "RBL-202610-0001",
          replacesNumber: null,
          document: {
            fileName: "RBL-202610-0001.pdf",
            pdfStored: { store: "customer-documents", key },
          },
          locale: "fr",
        },
        subjects: [
          { type: "in_house_recap", id: "recap-1" },
          { type: "company", id: PAYER },
        ],
        idempotencyKey: "in-house-recap:recap-1:contact:c_1",
      },
    ]);
  });

  it("un PDF déjà rangé n'est ni rendu ni réécrit", async () => {
    const world = documentWorld();
    const recap = issuedRecap();
    recap.recordDocument("in-house-recaps/resto/RBL-202610-0001.pdf");
    await world.recaps.save(recap);
    world.recaps.writes.length = 0;

    await world.document.afterIssued("recap-1");

    expect(world.store.objects.size).toBe(0);
    expect(world.recaps.writes).toEqual([]);
    expect(world.mail.queued).toHaveLength(1);
  });

  it("un rectificatif nomme le récapitulatif qu'il remplace", async () => {
    const world = documentWorld();
    const old = issuedRecap();
    await world.recaps.save(old);
    const rectified = old.reissue({
      id: "recap-2",
      number: "RBL-202610-0002",
      issuedAt: new Date("2026-11-20T10:00:00.000Z"),
      notes: [
        {
          deliveryNoteId: "a",
          number: "BL-a",
          handedOverAt: new Date("2026-10-12T09:00:00.000Z"),
          contentVersion: 2,
          lines: [{ sku: "CROI", productName: "Croissant", saleUnit: "piece", quantity: 5 }],
        },
      ],
    });
    await world.recaps.saveRectification(old, rectified);

    await world.document.afterIssued("recap-2");

    expect(world.mail.queued[0]?.data).toMatchObject({
      recapNumber: "RBL-202610-0002",
      replacesNumber: "RBL-202610-0001",
    });
  });

  it("sans destinataire, le PDF est rangé et le refus est nommé ; aucune demande", async () => {
    const world = documentWorld();
    world.recipients.recipient = null;
    await world.recaps.save(issuedRecap());

    await expect(world.document.afterIssued("recap-1")).rejects.toThrow(
      InHouseRecapNobodyToNotifyError,
    );
    expect(world.store.objects.size).toBe(1);
    expect(world.mail.queued).toEqual([]);
  });

  it("un payeur introuvable ne produit rien", async () => {
    const world = documentWorld();
    world.names.names.clear();
    await world.recaps.save(issuedRecap());

    await expect(world.document.afterIssued("recap-1")).rejects.toThrow(RecapPayerMissingError);
    expect(world.store.objects.size).toBe(0);
  });

  it("un récapitulatif inconnu est refusé par son nom", async () => {
    await expect(documentWorld().document.afterIssued("absent")).rejects.toThrow(
      InHouseRecapNotFoundError,
    );
  });
});
