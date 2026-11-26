import {
  InHouseRecapNobodyToNotifyError,
  InHouseRecapNotFoundError,
  ReplacedInHouseRecapNotSentError,
} from "../../../domain/errors/in-house-recap-errors.js";
import { documentWorld, issuedRecap } from "../../__tests__/in-house-recap-document-doubles.js";
import { ResendInHouseRecapCommand } from "../resend-in-house-recap.command.js";

/** « Renvoyer l'e-mail » (D10) : scellé par l'intention, le PDF rendu s'il manquait. */
describe("renvoyer l'e-mail d'un récapitulatif", () => {
  const resend = (world: ReturnType<typeof documentWorld>, key = "intent-1", recapId = "recap-1") =>
    world.resend.execute(new ResendInHouseRecapCommand(recapId, "staff-1", key));

  it("rend le PDF qui manquait, puis demande l'e-mail sous la clé de l'intention", async () => {
    const world = documentWorld();
    await world.recaps.save(issuedRecap());

    expect(await resend(world)).toBe("recap-1");

    expect(world.store.objects.size).toBe(1);
    expect(world.mail.queued.map((mail) => mail.idempotencyKey)).toEqual([
      "in-house-recap-resend:intent-1:contact:c_1",
    ]);
  });

  it("rejoué sous la même intention, il ne renvoie rien ; une intention neuve repart", async () => {
    const world = documentWorld();
    await world.recaps.save(issuedRecap());

    await resend(world);
    await resend(world);
    expect(world.mail.queued).toHaveLength(1);

    await resend(world, "intent-2");
    expect(world.mail.queued.map((mail) => mail.idempotencyKey)).toEqual([
      "in-house-recap-resend:intent-1:contact:c_1",
      "in-house-recap-resend:intent-2:contact:c_1",
    ]);
  });

  it("refuse un récapitulatif remplacé : seul le rectificatif part", async () => {
    const world = documentWorld();
    const old = issuedRecap();
    await world.recaps.save(old);
    const rectified = old.reissue({
      id: "recap-2",
      number: "RBL-202610-0002",
      issuedAt: new Date("2026-11-20T10:00:00.000Z"),
      notes: old.toState().notes.map((note) => ({
        ...note,
        lines: [{ sku: "CROI", productName: "Croissant", saleUnit: "piece", quantity: 3 }],
      })),
    });
    await world.recaps.saveRectification(old, rectified);

    await expect(resend(world)).rejects.toThrow(ReplacedInHouseRecapNotSentError);
    expect(world.mail.queued).toEqual([]);
  });

  it("sans destinataire, refus nommé et rien n'est scellé : une adresse ajoutée, la même intention repart", async () => {
    const world = documentWorld();
    world.recipients.recipient = null;
    await world.recaps.save(issuedRecap());

    await expect(resend(world)).rejects.toThrow(InHouseRecapNobodyToNotifyError);

    world.recipients.recipient = { id: "user:u_1", email: "patron@resto.test" };
    await resend(world);
    expect(world.mail.queued.map((mail) => mail.to)).toEqual(["patron@resto.test"]);
  });

  it("un récapitulatif inconnu est refusé par son nom", async () => {
    await expect(resend(documentWorld(), "intent-1", "absent")).rejects.toThrow(
      InHouseRecapNotFoundError,
    );
  });
});
