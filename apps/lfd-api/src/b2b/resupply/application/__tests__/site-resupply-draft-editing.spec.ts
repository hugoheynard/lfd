import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ResupplyArticleUnknownError } from "../../domain/resupply-receipt-errors.js";
import { ResupplySiteUnknownError } from "../../domain/resupply-site-errors.js";
import {
  ResupplyLineNotInDraftError,
  SiteResupplyChangedMeanwhileError,
  SiteResupplyDraftOpenedMeanwhileError,
  SiteResupplyNotFoundError,
} from "../../domain/site-resupply-errors.js";
import { AddSiteResupplyLineCommand } from "../add-site-resupply-line.command.js";
import { AddSiteResupplyLineHandler } from "../add-site-resupply-line.handler.js";
import { CorrectSiteResupplyLineCommand } from "../correct-site-resupply-line.command.js";
import { ListSiteResuppliesQuery } from "../list-site-resupplies.query.js";
import { WithdrawSiteResupplyLineCommand } from "../withdraw-site-resupply-line.command.js";
import { Catalogue, Sites } from "./resupply-doubles.js";
import { InMemorySiteResupplies } from "./site-resupply-doubles.js";
import { CROISSANT } from "./resupply-articles.js";

import {
  LABO,
  NOW,
  setup,
  TODAY,
  TOMORROW,
  versionOf,
  VILLAGE,
} from "./site-resupply-draft-bench.js";

describe("la demande en cours — ajouter", () => {
  it("ouvre la demande de la visée au premier ajout, et la sert au comptoir", async () => {
    const { add, list } = setup();

    const id = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "CRO", 12));

    const view = await list.execute(new ListSiteResuppliesQuery(VILLAGE));
    expect(view.drafts).toEqual([
      {
        id,
        target: "tomorrow",
        serviceDay: TOMORROW,
        version: 1,
        name: null,
        lines: [{ sku: "CRO", label: "Croissant", quantity: 12, saleUnit: "piece" as const }],
      },
    ]);
    expect(view.resupplies).toEqual([]);
  });

  it("un article déjà présent voit sa quantité S'ADDITIONNER, dans la même demande", async () => {
    const { add, store } = setup();

    const first = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 5));
    await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "PAC", 2));
    const second = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 3));

    expect(second).toBe(first);
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0]?.lines.map((line) => [line.sku, line.quantity])).toEqual([
      ["CRO", 8],
      ["PAC", 2],
    ]);
  });

  it("une demande par visée : « pour demain » et « au plus tôt » ne se mêlent pas", async () => {
    const { add, list } = setup();

    await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "CRO", 1));
    await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 1));

    const { drafts } = await list.execute(new ListSiteResuppliesQuery(VILLAGE));
    expect(drafts.map((draft) => [draft.target, draft.serviceDay]).sort()).toEqual([
      ["asap", TODAY],
      ["tomorrow", TOMORROW],
    ]);
  });

  it("refuse un point inconnu et un article hors catalogue, sans rien écrire", async () => {
    const { add, store } = setup();

    await expect(
      add.execute(new AddSiteResupplyLineCommand("site_x", "asap", "CRO", 1)),
    ).rejects.toThrow(ResupplySiteUnknownError);
    await expect(
      add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "X", 1)),
    ).rejects.toThrow(ResupplyArticleUnknownError);
    expect(store.saves).toBe(0);
  });

  it("deux postes qui ouvrent la même demande en même temps : le second est refusé", async () => {
    // L'autre poste a ouvert la demande entre la lecture et l'écriture : ce
    // dépôt ne la voit pas à la lecture, mais la tient à l'écriture.
    class OpenedMeanwhile extends InMemorySiteResupplies {
      override openDraft(): Promise<null> {
        return Promise.resolve(null);
      }
    }
    const store = new OpenedMeanwhile();
    store.put({
      id: "other",
      siteId: VILLAGE,
      target: "asap",
      serviceDay: TODAY,
      version: 1,
      origin: "counter",
      name: null,
      lines: [],
      placed: null,
      cancelled: null,
      arrived: null,
    });
    const add = new AddSiteResupplyLineHandler(
      store,
      new Catalogue([CROISSANT]),
      new Sites([VILLAGE]),
      new FixedClock(NOW),
      new FixedIdGenerator("resupply"),
    );

    await expect(
      add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 1)),
    ).rejects.toThrow(SiteResupplyDraftOpenedMeanwhileError);
  });
});

describe("la demande en cours — corriger, retirer, sous la version vue", () => {
  it("corrige une quantité et retire une ligne", async () => {
    const { add, correct, withdraw, store } = setup();
    const id = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 5));
    await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "PAC", 2));

    await correct.execute(
      new CorrectSiteResupplyLineCommand(VILLAGE, id, "CRO", 9, versionOf(store, id)),
    );
    await withdraw.execute(
      new WithdrawSiteResupplyLineCommand(VILLAGE, id, "PAC", versionOf(store, id)),
    );

    expect(store.all()[0]?.lines.map((line) => [line.sku, line.quantity])).toEqual([["CRO", 9]]);
  });

  it("un poste qui n'a plus la dernière version est refusé, sans rien écraser", async () => {
    const { add, correct, withdraw, store } = setup();
    const id = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 5));
    const seen = versionOf(store, id);
    // Un autre poste ajoute entre-temps.
    await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 1));

    await expect(
      correct.execute(new CorrectSiteResupplyLineCommand(VILLAGE, id, "CRO", 2, seen)),
    ).rejects.toThrow(SiteResupplyChangedMeanwhileError);
    await expect(
      withdraw.execute(new WithdrawSiteResupplyLineCommand(VILLAGE, id, "CRO", seen)),
    ).rejects.toThrow(SiteResupplyChangedMeanwhileError);
    expect(store.all()[0]?.lines[0]?.quantity).toBe(6);
  });

  it("refuse une ligne absente, et la demande d'un autre point", async () => {
    const { add, correct, store } = setup();
    const id = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 5));

    await expect(
      correct.execute(
        new CorrectSiteResupplyLineCommand(VILLAGE, id, "PAC", 1, versionOf(store, id)),
      ),
    ).rejects.toThrow(ResupplyLineNotInDraftError);
    await expect(
      correct.execute(new CorrectSiteResupplyLineCommand(LABO, id, "CRO", 1, versionOf(store, id))),
    ).rejects.toThrow(SiteResupplyNotFoundError);
  });
});
