import { ResupplyArticleUnknownError } from "../../domain/resupply-receipt-errors.js";
import { ResupplySiteUnknownError } from "../../domain/resupply-site-errors.js";
import { BakehouseResupplyAfterStopError } from "../../domain/site-resupply-gate-errors.js";
import { ListSiteResuppliesQuery } from "../list-site-resupplies.query.js";
import { SendBakehouseResupplyCommand } from "../send-bakehouse-resupply.command.js";
import { ResupplySendingKeyTakenError } from "../../domain/resupply-sending-key-errors.js";
import { freshSendingKey } from "./site-resupply-doubles.js";
import {
  CATALOGUE,
  HOUR_MS,
  LABO,
  NOW,
  setup,
  TODAY,
  TOMORROW,
  VILLAGE,
} from "./site-resupply-bench.js";

describe("le fournil envoie un réassort (R1d)", () => {
  it("le compose au catalogue, l'envoie d'un geste, signé du fournil, et rend son identifiant", async () => {
    const { place, list } = setup();
    const key = freshSendingKey();

    const id = await place.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        key,
        "tomorrow",
        [{ sku: "CRO", quantity: 24, saleUnit: "piece" as const }],
        "staff_lou",
      ),
    );

    const view = await list.execute(new ListSiteResuppliesQuery(VILLAGE));
    // La clé de l'écran est l'identifiant du réassort (C-A).
    expect(id).toBe(key);
    expect(view).toMatchObject({ today: TODAY, tomorrow: TOMORROW, tomorrowOrderUntil: null });
    expect(view.resupplies).toEqual([
      {
        id,
        siteId: VILLAGE,
        serviceDay: TOMORROW,
        target: "tomorrow",
        origin: "bakehouse",
        name: null,
        status: "placed",
        lines: [{ sku: "CRO", label: "Croissant", quantity: 24, saleUnit: "piece" as const }],
        placedAt: NOW.toISOString(),
        placedBy: "Lou Martin",
        cancelledAt: null,
        cancelledBy: null,
        arrivedAt: null,
        arrivedBy: null,
        launchedAt: null,
        launchedBy: null,
        departedAt: null,
        departedBy: null,
      },
    ]);
  });

  it("oppose l'heure du réassort de SA journée à « pour demain », et n'écrit rien", async () => {
    const { place, cutoff, store } = setup(new Date(NOW.getTime() - HOUR_MS));

    const refusal = place.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "tomorrow",
        [{ sku: "CRO", quantity: 1, saleUnit: "piece" as const }],
        "s",
      ),
    );

    // Lot R3a : le message parle au fournil, et lui donne son recours.
    await expect(refusal).rejects.toThrow(BakehouseResupplyAfterStopError);
    await expect(refusal).rejects.toThrow(/hors plan/u);
    expect(cutoff.asked).toEqual([TOMORROW]);
    expect(store.saves).toBe(0);
  });

  it("« pour demain » se tient au guichet du plan, sous le verrou de SA journée (R3a)", async () => {
    const { place, desk } = setup();

    await place.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "tomorrow",
        [{ sku: "CRO", quantity: 1, saleUnit: "piece" as const }],
        "s",
      ),
    );
    await place.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "asap",
        [{ sku: "CRO", quantity: 1, saleUnit: "piece" as const }],
        "s",
      ),
    );

    // « Au plus tôt » n'entre pas au plan : aucun verrou.
    expect(desk.held).toEqual([TOMORROW]);
  });

  it("refuse « pour demain » quand le plan est déjà arrêté, même avant l'heure (R3a)", async () => {
    const { place, store } = setup(null, [TOMORROW]);

    await expect(
      place.execute(
        new SendBakehouseResupplyCommand(
          VILLAGE,
          freshSendingKey(),
          "tomorrow",
          [{ sku: "CRO", quantity: 1, saleUnit: "piece" as const }],
          "s",
        ),
      ),
    ).rejects.toThrow(BakehouseResupplyAfterStopError);
    expect(store.saves).toBe(0);
  });

  it("« au plus tôt » passe après l'heure limite, pour aujourd'hui", async () => {
    const { place, store } = setup(new Date(NOW.getTime() - HOUR_MS));

    await place.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "asap",
        [{ sku: "PAC", quantity: 6, saleUnit: "piece" as const }],
        "s",
      ),
    );

    expect(store.all().map((row) => row.serviceDay)).toEqual([TODAY]);
  });

  it("refuse un point inconnu, un article hors catalogue", async () => {
    const { place, store } = setup();
    const lines = [{ sku: "CRO", quantity: 1, saleUnit: "piece" as const }];

    await expect(
      place.execute(
        new SendBakehouseResupplyCommand("site_x", freshSendingKey(), "asap", lines, "s"),
      ),
    ).rejects.toThrow(ResupplySiteUnknownError);
    await expect(
      place.execute(
        new SendBakehouseResupplyCommand(
          VILLAGE,
          freshSendingKey(),
          "asap",
          [{ sku: "X", quantity: 1, saleUnit: "piece" as const }],
          "s",
        ),
      ),
    ).rejects.toThrow(ResupplyArticleUnknownError);
    expect(store.saves).toBe(0);
  });

  it("un article donné deux fois est demandé en une ligne, quantités additionnées (R1c)", async () => {
    const { place, store } = setup();
    const lines = [{ sku: "CRO", quantity: 2, saleUnit: "piece" as const }];

    await place.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "asap",
        [...lines, ...lines],
        "s",
      ),
    );

    expect(store.all()[0]?.lines).toEqual([
      expect.objectContaining({ sku: "CRO", quantity: 4, saleUnit: "piece" as const }),
    ]);
  });
});

describe("le fournil envoie un réassort — une clé, un envoi (C-A, C-B)", () => {
  const lines = [{ sku: "CRO", quantity: 2, saleUnit: "piece" as const }];

  /**
   * Régression C-A (audit du 2026-11-02) : l'envoi du fournil n'avait pas de
   * clé d'idempotence — deux clics sur « Envoyer » faisaient deux réassorts.
   */
  it("deux envois de la même clé ne font qu'un réassort, et rendent la même clé", async () => {
    const { place, store } = setup();
    const key = freshSendingKey();

    const first = await place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, key, "asap", lines, "s"),
    );
    const second = await place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, key, "asap", lines, "s"),
    );

    expect([first, second]).toEqual([key, key]);
    expect(store.all()).toHaveLength(1);
    expect(store.saves).toBe(1);
  });

  /** Régression (audit final, 2026-11-03) : le rejeu relisait le catalogue avant la clé. */
  it("un second envoi de la même clé, l'article retiré entre-temps, rend la clé sans relire le catalogue", async () => {
    const { place, store } = setup();
    const key = freshSendingKey();
    await place.execute(new SendBakehouseResupplyCommand(VILLAGE, key, "asap", lines, "s"));
    const restore = CATALOGUE.withdraw("CRO");
    try {
      await expect(
        place.execute(new SendBakehouseResupplyCommand(VILLAGE, key, "asap", lines, "s")),
      ).resolves.toBe(key);
    } finally {
      restore();
    }
    expect(store.saves).toBe(1);
  });

  it("refuse nommément une clé déjà prise par un réassort d'un autre point", async () => {
    const { place, store } = setup();
    const key = freshSendingKey();
    await place.execute(new SendBakehouseResupplyCommand(LABO, key, "asap", lines, "s"));

    await expect(
      place.execute(new SendBakehouseResupplyCommand(VILLAGE, key, "asap", lines, "s")),
    ).rejects.toThrow(ResupplySendingKeyTakenError);
    expect(store.all().map((row) => row.siteId)).toEqual([LABO]);
  });

  /**
   * Régression M1 (audit du 2026-11-02) : l'heure du réassort se lisait à la
   * préparation, HORS du verrou de la journée ; un réglage changé entre-temps
   * laissait partir un « pour demain » sur l'heure d'avant.
   */
  it("lit l'heure du réassort APRÈS avoir tenu la journée au guichet du plan", async () => {
    let askedBeforeHold: number | null = null;
    const { place, cutoff } = setup(null, [], () => {
      askedBeforeHold = cutoff.asked.length;
    });

    await place.execute(
      new SendBakehouseResupplyCommand(VILLAGE, freshSendingKey(), "tomorrow", lines, "s"),
    );

    expect(askedBeforeHold).toBe(0);
    expect(cutoff.asked).toEqual([TOMORROW]);
  });
});
