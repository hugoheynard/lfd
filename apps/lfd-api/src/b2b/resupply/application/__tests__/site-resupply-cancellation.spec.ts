import { SiteResupplyNotFoundError } from "../../domain/site-resupply-errors.js";
import {
  ResupplyAlreadyReceivedNotCancellableError,
  ResupplyFrozenInPlanError,
  ResupplyNotCancellableError,
} from "../../domain/site-resupply-gate-errors.js";
import { CancelSiteResupplyCommand } from "../cancel-site-resupply.command.js";
import { ListSiteResuppliesQuery } from "../list-site-resupplies.query.js";
import { SendBakehouseResupplyCommand } from "../send-bakehouse-resupply.command.js";
import { freshSendingKey } from "./site-resupply-doubles.js";
import { LABO, NOW, setup, TODAY, TOMORROW, VILLAGE } from "./site-resupply-bench.js";

describe("annuler un réassort", () => {
  it("annule sous le point de l'URL, et pas deux fois", async () => {
    const { place, cancel, list } = setup();
    const id = await place.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "asap",
        [{ sku: "CRO", quantity: 3, saleUnit: "piece" as const }],
        "s",
      ),
    );

    await cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "staff_lou"));

    const [cancelled] = (await list.execute(new ListSiteResuppliesQuery(VILLAGE))).resupplies;
    expect(cancelled).toMatchObject({ status: "cancelled", cancelledBy: "Lou Martin" });
    await expect(cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "s"))).rejects.toThrow(
      ResupplyNotCancellableError,
    );
  });

  /** Trou laissé par R2 : un réassort arrivé et réceptionné s'annulait encore. */
  it("refuse d'annuler un réassort déjà réceptionné, en nommant qui et à quelle heure", async () => {
    const { place, cancel, receptions, store } = setup();
    const id = await place.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "asap",
        [{ sku: "CRO", quantity: 3, saleUnit: "piece" as const }],
        "s",
      ),
    );
    receptions.receive(VILLAGE, id, {
      at: NOW,
      author: { staffUserId: "staff_lea", name: "Léa Roux", role: "counter" },
    });

    const refusal = cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "s"));

    await expect(refusal).rejects.toThrow(ResupplyAlreadyReceivedNotCancellableError);
    await expect(refusal).rejects.toThrow(/réceptionné par Léa Roux à 17:00/u);
    expect(receptions.asked).toEqual([`${VILLAGE}:${id}`]);
    expect(store.all()[0]?.cancelled).toBeNull();
  });

  /** Lot R3a, Q3 : figé dans un plan arrêté, il ne s'annule plus. */
  it("refuse d'annuler un réassort « pour demain » figé dans un plan arrêté", async () => {
    const open = setup();
    const id = await open.place.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "tomorrow",
        [{ sku: "CRO", quantity: 3, saleUnit: "piece" as const }],
        "s",
      ),
    );
    const { cancel, store, desk } = setup(null, [TOMORROW]);
    for (const row of open.store.all()) {
      store.put(row);
    }

    const refusal = cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "s"));

    await expect(refusal).rejects.toThrow(ResupplyFrozenInPlanError);
    await expect(refusal).rejects.toThrow(/réceptionnez-le avec un écart/iu);
    expect(desk.held).toEqual([TOMORROW]);
    expect(store.all()[0]?.cancelled).toBeNull();
  });

  it("un réassort « au plus tôt » s'annule même quand le plan du jour est arrêté", async () => {
    const { place, cancel, store } = setup(null, [TODAY]);
    const id = await place.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "asap",
        [{ sku: "CRO", quantity: 3, saleUnit: "piece" as const }],
        "s",
      ),
    );

    await cancel.execute(new CancelSiteResupplyCommand(VILLAGE, id, "s"));

    expect(store.all()[0]?.cancelled).not.toBeNull();
  });

  it("un réassort d'un autre point est introuvable", async () => {
    const { place, cancel } = setup();
    const id = await place.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "asap",
        [{ sku: "CRO", quantity: 3, saleUnit: "piece" as const }],
        "s",
      ),
    );

    await expect(cancel.execute(new CancelSiteResupplyCommand(LABO, id, "s"))).rejects.toThrow(
      SiteResupplyNotFoundError,
    );
  });
});
