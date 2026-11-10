import { ResupplyArticleUnitChangedError } from "../../domain/resupply-sale-unit-errors.js";
import { AddSiteResupplyLineCommand } from "../add-site-resupply-line.command.js";
import { ListSiteResuppliesQuery } from "../list-site-resupplies.query.js";
import { SendBakehouseResupplyCommand } from "../send-bakehouse-resupply.command.js";
import { SendSiteResupplyCommand } from "../send-site-resupply.command.js";
import { freshSendingKey } from "./site-resupply-doubles.js";

import { setup, versionOf, VILLAGE } from "./site-resupply-draft-bench.js";

describe("la demande en cours — un article au poids (lot L2b-1)", () => {
  it("s'ajoute en grammes, son unité figée sur la ligne", async () => {
    const { add, list } = setup();

    await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "SAU", 1250));
    await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "SAU", 250));

    const view = await list.execute(new ListSiteResuppliesQuery(VILLAGE));
    expect(view.drafts[0]?.lines).toEqual([
      { sku: "SAU", label: "Saumon gravlax", quantity: 1500, saleUnit: "weight" },
    ]);
  });

  it("part au fournil avec sa ligne en grammes (L2b-3 : la garde d'envoi est retirée)", async () => {
    const { add, send, store } = setup();
    const id = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "SAU", 500));
    await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "CRO", 12));

    await send.execute(new SendSiteResupplyCommand(VILLAGE, id, versionOf(store, id), "s"));

    const sent = store.all().find((row) => row.id === id);
    expect(sent?.placed).not.toBeNull();
    expect(sent?.lines.map((line) => [line.sku, line.quantity, line.saleUnit])).toEqual([
      ["SAU", 500, "weight"],
      ["CRO", 12, "piece"],
    ]);
  });

  it("l'envoi du fournil qui en porte part aussi, en grammes", async () => {
    const { bakehouse, store } = setup();

    const id = await bakehouse.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "asap",
        [{ sku: "SAU", quantity: 500 }],
        "s",
      ),
    );

    const sent = store.all().find((row) => row.id === id);
    expect(sent?.placed).not.toBeNull();
    expect(sent?.lines.map((line) => [line.sku, line.quantity, line.saleUnit])).toEqual([
      ["SAU", 500, "weight"],
    ]);
  });

  it("une unité gardée qui n'est plus celle du catalogue est refusée à l'envoi", async () => {
    const { bakehouse, store } = setup();

    await expect(
      bakehouse.execute(
        new SendBakehouseResupplyCommand(
          VILLAGE,
          freshSendingKey(),
          "asap",
          [{ sku: "SAU", quantity: 3, saleUnit: "piece" }],
          "s",
        ),
      ),
    ).rejects.toThrow(ResupplyArticleUnitChangedError);
    expect(store.saves).toBe(0);
  });
});
