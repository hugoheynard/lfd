import { randomUUID } from "node:crypto";

import {
  EmptyResupplyError,
  ResupplyAlreadyPlacedError,
} from "../../domain/site-resupply-errors.js";
import {
  ResupplyDayPassedError,
  ResupplyPastCutoffError,
  ResupplyPlanStoppedError,
} from "../../domain/site-resupply-gate-errors.js";
import { AddSiteResupplyLineCommand } from "../add-site-resupply-line.command.js";
import { CorrectSiteResupplyLineCommand } from "../correct-site-resupply-line.command.js";
import { ListSiteResuppliesQuery } from "../list-site-resupplies.query.js";
import { SendBakehouseResupplyCommand } from "../send-bakehouse-resupply.command.js";
import { SendSiteResupplyCommand } from "../send-site-resupply.command.js";
import { WithdrawSiteResupplyLineCommand } from "../withdraw-site-resupply-line.command.js";
import { freshSendingKey } from "./site-resupply-doubles.js";

import {
  DAY_MS,
  HOUR_MS,
  NOW,
  setup,
  TOMORROW,
  versionOf,
  VILLAGE,
} from "./site-resupply-draft-bench.js";

describe("la demande en cours — envoyer", () => {
  it("l'envoie au nom du poste ; le prochain ajout ouvre une nouvelle demande", async () => {
    const { add, send, list, store } = setup();
    const id = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 5, "staff_1", randomUUID()),
    );

    await send.execute(new SendSiteResupplyCommand(VILLAGE, id, versionOf(store, id), "staff_lou"));
    const next = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "asap", "PAC", 1, "staff_1", randomUUID()),
    );

    const view = await list.execute(new ListSiteResuppliesQuery(VILLAGE));
    expect(next).not.toBe(id);
    expect(view.resupplies).toEqual([
      expect.objectContaining({ id, status: "placed", placedBy: "Lou Martin" }),
    ]);
    expect(view.drafts.map((draft) => draft.id)).toEqual([next]);
  });

  it("une demande envoyée ne bouge plus et ne se renvoie pas", async () => {
    const { add, send, correct, store } = setup();
    const id = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 5, "staff_1", randomUUID()),
    );
    await send.execute(new SendSiteResupplyCommand(VILLAGE, id, versionOf(store, id), "s"));

    await expect(
      send.execute(new SendSiteResupplyCommand(VILLAGE, id, versionOf(store, id), "s")),
    ).rejects.toThrow(ResupplyAlreadyPlacedError);
    await expect(
      correct.execute(
        new CorrectSiteResupplyLineCommand(VILLAGE, id, "CRO", 1, versionOf(store, id)),
      ),
    ).rejects.toThrow(ResupplyAlreadyPlacedError);
  });

  it("une demande vidée ne s'envoie pas", async () => {
    const { add, withdraw, send, store } = setup();
    const id = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 5, "staff_1", randomUUID()),
    );
    await withdraw.execute(
      new WithdrawSiteResupplyLineCommand(VILLAGE, id, "CRO", versionOf(store, id)),
    );

    await expect(
      send.execute(new SendSiteResupplyCommand(VILLAGE, id, versionOf(store, id), "s")),
    ).rejects.toThrow(EmptyResupplyError);
  });

  it("« pour demain » envoyé après l'heure du réassort est refusé, et reste en cours", async () => {
    const { add, send, store } = setup(new Date(NOW.getTime() - HOUR_MS));
    const id = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "CRO", 5, "staff_1", randomUUID()),
    );

    const refusal = send.execute(
      new SendSiteResupplyCommand(VILLAGE, id, versionOf(store, id), "s"),
    );

    await expect(refusal).rejects.toThrow(ResupplyPastCutoffError);
    // Lot R3a : le message dit l'heure et le geste de sortie.
    await expect(refusal).rejects.toThrow(/la veille à 16:00.*Demandez au fournil/u);
    expect(store.all()[0]?.placed).toBeNull();
  });

  it("« pour demain » se tient au guichet du plan, sous le verrou de sa journée (R3a)", async () => {
    const { add, send, store, desk } = setup();
    const id = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "CRO", 5, "staff_1", randomUUID()),
    );

    await send.execute(new SendSiteResupplyCommand(VILLAGE, id, versionOf(store, id), "s"));

    expect(desk.held).toEqual([TOMORROW]);
    expect(store.all()[0]?.placed).not.toBeNull();
  });

  it("« pour demain » est refusé sur un plan déjà arrêté, même avant l'heure (R3a)", async () => {
    const { add, send, store } = setup(null, [TOMORROW]);
    const id = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "CRO", 5, "staff_1", randomUUID()),
    );

    await expect(
      send.execute(new SendSiteResupplyCommand(VILLAGE, id, versionOf(store, id), "s")),
    ).rejects.toThrow(ResupplyPlanStoppedError);
    expect(store.all()[0]?.placed).toBeNull();
  });

  it("une demande « pour demain » dont la journée est passée ne s'envoie plus, et quitte l'écran", async () => {
    const { add, send, list, store, clock } = setup();
    const id = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "CRO", 5, "staff_1", randomUUID()),
    );
    clock.set(new Date(NOW.getTime() + 2 * DAY_MS));

    await expect(
      send.execute(new SendSiteResupplyCommand(VILLAGE, id, versionOf(store, id), "s")),
    ).rejects.toThrow(ResupplyDayPassedError);
    expect((await list.execute(new ListSiteResuppliesQuery(VILLAGE))).drafts).toEqual([]);
  });
});

describe("le fournil envoie à part : la demande en cours du comptoir n'est jamais touchée (R1d)", () => {
  /**
   * Régression : le bouton du fournil ajoutait son article à la demande « au
   * plus tôt » DU COMPTOIR, puis l'envoyait entière (R1b/R1c).
   */
  it("un réassort du fournil ne s'ajoute ni n'envoie la demande « au plus tôt » du comptoir", async () => {
    const { add, bakehouse, store } = setup();
    const draftId = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "asap", "PAC", 4, "staff_1", randomUUID()),
    );
    const draftVersion = versionOf(store, draftId);

    const sentId = await bakehouse.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "asap",
        [{ sku: "CRO", quantity: 10, saleUnit: "piece" as const }],
        "s",
      ),
    );

    expect(sentId).not.toBe(draftId);
    const draft = store.all().find((row) => row.id === draftId);
    expect(draft).toMatchObject({ origin: "counter", placed: null, version: draftVersion });
    expect(draft?.lines.map((line) => [line.sku, line.quantity])).toEqual([["PAC", 4]]);
    const sent = store.all().find((row) => row.id === sentId);
    expect(sent?.origin).toBe("bakehouse");
    expect(sent?.placed).not.toBeNull();
  });

  it("après un envoi du fournil, le comptoir ajoute toujours à SA demande", async () => {
    const { add, bakehouse, list } = setup();
    await bakehouse.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "asap",
        [{ sku: "CRO", quantity: 10, saleUnit: "piece" as const }],
        "s",
      ),
    );

    const draftId = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "asap", "PAC", 2, "staff_1", randomUUID()),
    );

    const view = await list.execute(new ListSiteResuppliesQuery(VILLAGE));
    expect(view.drafts.map((draft) => draft.id)).toEqual([draftId]);
    expect(view.resupplies.map((resupply) => resupply.origin)).toEqual(["bakehouse"]);
  });

  it("un envoi du fournil sans ligne est refusé, et n'écrit rien", async () => {
    const { bakehouse, store } = setup();

    await expect(
      bakehouse.execute(
        new SendBakehouseResupplyCommand(VILLAGE, freshSendingKey(), "asap", [], "s"),
      ),
    ).rejects.toThrow(EmptyResupplyError);
    expect(store.saves).toBe(0);
  });
});
