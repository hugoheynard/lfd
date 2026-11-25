import { FixedDeliveryNotesBorn } from "../../../../channels/commerce/__tests__/planned-delivery-notes-doubles.js";
import { DossierAwaitsDeliveryNotesError } from "../../../domain/errors/dossier-delivery-notes-errors.js";
import { closure, PAUL, retake, retakenDay, setup } from "./send-dossier-scene.js";

/**
 * Régression : à l'arrêt, le dossier partait et s'archivait avant que le
 * commerce ait fait naître les BL ; il restait sans BL à chaque tirage
 * (dossier du 26/11/2026, ORD-20).
 */
describe("le dossier attend tous ses BL avant de partir", () => {
  it("à l'arrêt, ne part pas tant qu'une commande n'a pas son BL, et la livraison est rejouée", async () => {
    const born = new FixedDeliveryNotesBorn(["ord_1"]);
    const { closed, mailer } = setup([PAUL], undefined, { born });

    await expect(closed.handle(closure())).rejects.toBeInstanceOf(DossierAwaitsDeliveryNotesError);
    expect(mailer.sent).toEqual([]);

    born.bear();
    await closed.handle(closure());
    expect(mailer.sent.map((mail) => mail.to)).toEqual(["paul@fournil.fr"]);
  });

  it("au retirage, attend de même le BL de la commande admise", async () => {
    const born = new FixedDeliveryNotesBorn(["ord_2"]);
    const { retaken, mailer } = setup([PAUL], retakenDay(), { born });

    await expect(retaken.handle(retake())).rejects.toBeInstanceOf(DossierAwaitsDeliveryNotesError);
    expect(mailer.sent).toEqual([]);
  });

  it("sans destinataire, n'attend rien : il n'y a rien à envoyer", async () => {
    const born = new FixedDeliveryNotesBorn(["ord_1"]);
    const { closed, mailer } = setup([], undefined, { born });

    await closed.handle(closure());
    expect(mailer.sent).toEqual([]);
  });
});
