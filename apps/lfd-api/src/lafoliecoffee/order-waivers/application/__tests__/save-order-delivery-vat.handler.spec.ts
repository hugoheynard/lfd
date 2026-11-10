import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { SaveOrderDeliveryVatCommand } from "../save-order-delivery-vat.command.js";
import { SaveOrderDeliveryVatHandler } from "../save-order-delivery-vat.handler.js";
import { InMemoryDeliveryVat } from "./order-delivery-vat-doubles.js";

function build() {
  const settings = new InMemoryDeliveryVat();
  const events = new RecordingPublisher();
  const save = new SaveOrderDeliveryVatHandler(settings, events, new DirectUnitOfWork());
  return { settings, events, save };
}

describe("SaveOrderDeliveryVatHandler", () => {
  it("journalise la première bascule : l'avant est le repli `standard`, ce que la passation facturait", async () => {
    const { save, events } = build();

    await save.execute(new SaveOrderDeliveryVatCommand("follows_goods", "fiche-1"));

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "order_delivery_vat.mode_set",
        subjectType: "order_delivery_vat",
        subjectId: "singleton",
        payload: { before: "standard", after: "follows_goods" },
      },
    ]);
  });

  it("lit l'avant AVANT d'écrire l'après", async () => {
    const { save, settings } = build();
    settings.current = "follows_goods";

    await save.execute(new SaveOrderDeliveryVatCommand("standard", "fiche-1"));

    expect(settings.log).toEqual(["read", "save:standard:fiche-1"]);
  });

  it("écrit la ligne mais aucun fait quand le mode posé est déjà celui qui s'applique", async () => {
    const { save, settings, events } = build();

    await save.execute(new SaveOrderDeliveryVatCommand("standard", "fiche-2"));

    // Le repli devient une décision (la ligne existe), sans rien changer à ce
    // qui est facturé : pas de fait.
    expect(settings.current).toBe("standard");
    expect(events.traced).toEqual([]);
  });
});
