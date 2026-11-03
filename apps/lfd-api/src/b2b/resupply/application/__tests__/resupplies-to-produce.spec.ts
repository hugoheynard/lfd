import { CancelSiteResupplyCommand } from "../cancel-site-resupply.command.js";
import { SendBakehouseResupplyCommand } from "../send-bakehouse-resupply.command.js";
import { freshSendingKey } from "./site-resupply-doubles.js";
import { LABO, setup, TODAY, TOMORROW, VILLAGE } from "./site-resupply-bench.js";

describe("les réassorts à produire", () => {
  it("par journée puis par point, sans les annulés, avec le cumul par article", async () => {
    const { place, cancel, toProduce } = setup();
    const order = (siteId: string, target: "asap" | "tomorrow", sku: string, quantity: number) =>
      place.execute(
        new SendBakehouseResupplyCommand(
          siteId,
          freshSendingKey(),
          target,
          [{ sku, quantity, saleUnit: "piece" as const }],
          "s",
        ),
      );
    await order(VILLAGE, "asap", "CRO", 10);
    await order(LABO, "asap", "CRO", 5);
    await order(VILLAGE, "tomorrow", "PAC", 7);
    const dropped = await order(LABO, "tomorrow", "PAC", 99);
    await cancel.execute(new CancelSiteResupplyCommand(LABO, dropped, "s"));

    const view = await toProduce.execute();

    expect(view.days.map((day) => day.serviceDay)).toEqual([TODAY, TOMORROW]);
    const [today, tomorrow] = view.days;
    expect(today?.sites.map((site) => [site.siteId, site.siteLabel])).toEqual([
      [VILLAGE, "Val Village"],
      [LABO, null],
    ]);
    expect(today?.totals).toEqual([
      { sku: "CRO", label: "Croissant", quantity: 15, saleUnit: "piece" as const },
    ]);
    expect(tomorrow?.totals).toEqual([
      { sku: "PAC", label: "Pain au chocolat", quantity: 7, saleUnit: "piece" as const },
    ]);
  });
});

describe("les réassorts à produire, une fois le plan arrêté (R3a)", () => {
  it("ne montre plus un « pour demain » figé dans un plan arrêté ; « au plus tôt » reste", async () => {
    const open = setup();
    const send = (target: "asap" | "tomorrow", quantity: number) =>
      open.place.execute(
        new SendBakehouseResupplyCommand(
          VILLAGE,
          freshSendingKey(),
          target,
          [{ sku: "CRO", quantity, saleUnit: "piece" as const }],
          "s",
        ),
      );
    await send("asap", 4);
    await send("tomorrow", 9);
    const stopped = setup(null, [TOMORROW]);
    for (const row of open.store.all()) {
      stopped.store.put(row);
    }

    const [today, tomorrow] = (await stopped.toProduce.execute()).days;

    expect(today?.totals).toEqual([
      { sku: "CRO", label: "Croissant", quantity: 4, saleUnit: "piece" as const },
    ]);
    expect(tomorrow?.sites).toEqual([]);
    expect(tomorrow?.totals).toEqual([]);
  });
});
