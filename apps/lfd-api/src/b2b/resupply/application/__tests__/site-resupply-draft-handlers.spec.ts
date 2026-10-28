import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  ResupplyArticleUnknownError,
  ResupplySiteUnknownError,
  WeightArticleInResupplyError,
} from "../../domain/resupply-receipt-errors.js";
import {
  EmptyResupplyError,
  ResupplyAlreadyPlacedError,
  ResupplyDayPassedError,
  ResupplyLineNotInDraftError,
  ResupplyPastCutoffError,
  ResupplyPlanStoppedError,
  SiteResupplyChangedMeanwhileError,
  SiteResupplyDraftOpenedMeanwhileError,
  SiteResupplyNotFoundError,
} from "../../domain/site-resupply-errors.js";
import { AddSiteResupplyLineCommand } from "../add-site-resupply-line.command.js";
import { AddSiteResupplyLineHandler } from "../add-site-resupply-line.handler.js";
import { CorrectSiteResupplyLineCommand } from "../correct-site-resupply-line.command.js";
import { CorrectSiteResupplyLineHandler } from "../correct-site-resupply-line.handler.js";
import { ListSiteResuppliesHandler } from "../list-site-resupplies.handler.js";
import { ListSiteResuppliesQuery } from "../list-site-resupplies.query.js";
import { ResupplyPlanGate } from "../resupply-plan-gate.js";
import { SendBakehouseResupplyCommand } from "../send-bakehouse-resupply.command.js";
import { SendBakehouseResupplyHandler } from "../send-bakehouse-resupply.handler.js";
import { SendSiteResupplyCommand } from "../send-site-resupply.command.js";
import { SendSiteResupplyHandler } from "../send-site-resupply.handler.js";
import { WithdrawSiteResupplyLineCommand } from "../withdraw-site-resupply-line.command.js";
import { WithdrawSiteResupplyLineHandler } from "../withdraw-site-resupply-line.handler.js";
import { RecordingAdmissionDesk } from "../../../orders/application/commands/__tests__/plan-doubles.js";
import { Catalogue, Directory, Sites } from "./resupply-doubles.js";
import {
  FixedResupplyCutoff,
  InMemorySiteResupplies,
  InMemorySiteResupplyReader,
  InMemoryResupplyUsedNames,
  FixedLaunches,
} from "./site-resupply-doubles.js";

/** 17 h à Paris le 2 janvier : les journées ne sont comparées qu'à cette horloge figée. */
const NOW = new Date("2026-01-02T16:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const TODAY = "2026-01-02";
const TOMORROW = "2026-01-03";
const VILLAGE = "site_village";
const LABO = "site_labo";

/** `stopped` : les journées dont le plan du fournil est arrêté (lot R3a). */
function setup(deadline: Date | null = null, stopped: readonly string[] = []) {
  const store = new InMemorySiteResupplies();
  const cutoff = new FixedResupplyCutoff(deadline);
  const clock = new FixedClock(NOW);
  const staff = new Directory({ name: "Lou Martin", role: "counter" });
  const catalogue = new Catalogue([
    {
      sku: "CRO",
      name: "Croissant",
      categoryId: "fam_morning",
      categoryName: "Viennoiseries",
      saleUnit: "piece",
    },
    {
      sku: "PAC",
      name: "Pain au chocolat",
      categoryId: "fam_morning",
      categoryName: "Viennoiseries",
      saleUnit: "piece",
    },
    // Au poids : hors du réassort (`vente-au-poids.md`, §2).
    {
      sku: "SAU",
      name: "Saumon gravlax",
      categoryId: "fam_deli",
      categoryName: "Épicerie",
      saleUnit: "weight",
    },
  ]);
  const sites = new Sites([VILLAGE, LABO]);
  const ids = new FixedIdGenerator("resupply");
  const desk = new RecordingAdmissionDesk(stopped);
  const launches = new FixedLaunches();
  const gate = new ResupplyPlanGate(desk, launches);
  const uow = new DirectUnitOfWork();
  return {
    store,
    clock,
    desk,
    add: new AddSiteResupplyLineHandler(store, catalogue, sites, clock, ids),
    correct: new CorrectSiteResupplyLineHandler(store),
    withdraw: new WithdrawSiteResupplyLineHandler(store),
    send: new SendSiteResupplyHandler(store, cutoff, staff, clock, gate, uow),
    bakehouse: new SendBakehouseResupplyHandler(
      store,
      catalogue,
      sites,
      cutoff,
      staff,
      clock,
      ids,
      gate,
      uow,
    ),
    list: new ListSiteResuppliesHandler(
      new InMemorySiteResupplyReader(store),
      cutoff,
      clock,
      new InMemoryResupplyUsedNames(store),
    ),
  };
}

function versionOf(store: InMemorySiteResupplies, id: string): number {
  return store.all().find((row) => row.id === id)?.version ?? -1;
}

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
        lines: [{ sku: "CRO", label: "Croissant", quantity: 12 }],
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
      new Catalogue([
        {
          sku: "CRO",
          name: "Croissant",
          categoryId: "fam_morning",
          categoryName: "Viennoiseries",
          saleUnit: "piece",
        },
      ]),
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

describe("la demande en cours — envoyer", () => {
  it("l'envoie au nom du poste ; le prochain ajout ouvre une nouvelle demande", async () => {
    const { add, send, list, store } = setup();
    const id = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 5));

    await send.execute(new SendSiteResupplyCommand(VILLAGE, id, versionOf(store, id), "staff_lou"));
    const next = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "PAC", 1));

    const view = await list.execute(new ListSiteResuppliesQuery(VILLAGE));
    expect(next).not.toBe(id);
    expect(view.resupplies).toEqual([
      expect.objectContaining({ id, status: "placed", placedBy: "Lou Martin" }),
    ]);
    expect(view.drafts.map((draft) => draft.id)).toEqual([next]);
  });

  it("une demande envoyée ne bouge plus et ne se renvoie pas", async () => {
    const { add, send, correct, store } = setup();
    const id = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 5));
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
    const id = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 5));
    await withdraw.execute(
      new WithdrawSiteResupplyLineCommand(VILLAGE, id, "CRO", versionOf(store, id)),
    );

    await expect(
      send.execute(new SendSiteResupplyCommand(VILLAGE, id, versionOf(store, id), "s")),
    ).rejects.toThrow(EmptyResupplyError);
  });

  it("« pour demain » envoyé après l'heure du réassort est refusé, et reste en cours", async () => {
    const { add, send, store } = setup(new Date(NOW.getTime() - HOUR_MS));
    const id = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "CRO", 5));

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
    const id = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "CRO", 5));

    await send.execute(new SendSiteResupplyCommand(VILLAGE, id, versionOf(store, id), "s"));

    expect(desk.held).toEqual([TOMORROW]);
    expect(store.all()[0]?.placed).not.toBeNull();
  });

  it("« pour demain » est refusé sur un plan déjà arrêté, même avant l'heure (R3a)", async () => {
    const { add, send, store } = setup(null, [TOMORROW]);
    const id = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "CRO", 5));

    await expect(
      send.execute(new SendSiteResupplyCommand(VILLAGE, id, versionOf(store, id), "s")),
    ).rejects.toThrow(ResupplyPlanStoppedError);
    expect(store.all()[0]?.placed).toBeNull();
  });

  it("une demande « pour demain » dont la journée est passée ne s'envoie plus, et quitte l'écran", async () => {
    const { add, send, list, store, clock } = setup();
    const id = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "CRO", 5));
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
    const draftId = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "PAC", 4));
    const draftVersion = versionOf(store, draftId);

    const sentId = await bakehouse.execute(
      new SendBakehouseResupplyCommand(VILLAGE, "asap", [{ sku: "CRO", quantity: 10 }], "s"),
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
      new SendBakehouseResupplyCommand(VILLAGE, "asap", [{ sku: "CRO", quantity: 10 }], "s"),
    );

    const draftId = await add.execute(new AddSiteResupplyLineCommand(VILLAGE, "asap", "PAC", 2));

    const view = await list.execute(new ListSiteResuppliesQuery(VILLAGE));
    expect(view.drafts.map((draft) => draft.id)).toEqual([draftId]);
    expect(view.resupplies.map((resupply) => resupply.origin)).toEqual(["bakehouse"]);
  });

  it("un envoi du fournil sans ligne est refusé, et n'écrit rien", async () => {
    const { bakehouse, store } = setup();

    await expect(
      bakehouse.execute(new SendBakehouseResupplyCommand(VILLAGE, "asap", [], "s")),
    ).rejects.toThrow(EmptyResupplyError);
    expect(store.saves).toBe(0);
  });
});

describe("la demande en cours — un article au poids", () => {
  it("est refusé : un réassort ne compte que des pièces", async () => {
    const { add, store } = setup();

    await expect(
      add.execute(new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "SAU", 500)),
    ).rejects.toThrow(WeightArticleInResupplyError);
    expect(store.all()).toEqual([]);
  });
});
