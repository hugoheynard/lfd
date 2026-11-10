import { ReadOrderDeliveryVatHandler } from "../read-order-delivery-vat.handler.js";
import { InMemoryDeliveryVat } from "./order-delivery-vat-doubles.js";

describe("ReadOrderDeliveryVatHandler", () => {
  it("rend le repli `standard`, non choisi, quand aucun réglage n'est posé", async () => {
    const view = await new ReadOrderDeliveryVatHandler(new InMemoryDeliveryVat()).execute();

    expect(view).toEqual({ mode: "standard", configured: false });
  });

  it("rend le mode posé, et dit qu'il a été choisi", async () => {
    const settings = new InMemoryDeliveryVat();
    settings.current = "follows_goods";

    const view = await new ReadOrderDeliveryVatHandler(settings).execute();

    expect(view).toEqual({ mode: "follows_goods", configured: true });
  });
});
