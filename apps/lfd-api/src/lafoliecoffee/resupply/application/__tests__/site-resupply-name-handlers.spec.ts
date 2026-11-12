import { randomUUID } from "node:crypto";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { RESUPPLY_NAME_MAX, RESUPPLY_USED_NAMES_MAX } from "@lfd/contracts";

import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { RecordingAdmissionDesk } from "../../../orders/application/commands/__tests__/plan-doubles.js";
import { ResupplySiteUnknownError } from "../../domain/resupply-site-errors.js";
import {
  ResupplyAlreadyPlacedError,
  ResupplyNameTooLongError,
} from "../../domain/site-resupply-errors.js";
import { AddSiteResupplyLineCommand } from "../add-site-resupply-line.command.js";
import { AddSiteResupplyLineHandler } from "../add-site-resupply-line.handler.js";
import { ListResupplyUsedNamesHandler } from "../list-resupply-used-names.handler.js";
import { ListResupplyUsedNamesQuery } from "../list-resupply-used-names.query.js";
import { ListSiteResuppliesHandler } from "../list-site-resupplies.handler.js";
import { ListSiteResuppliesQuery } from "../list-site-resupplies.query.js";
import { NameSiteResupplyCommand } from "../name-site-resupply.command.js";
import { NameSiteResupplyHandler } from "../name-site-resupply.handler.js";
import { ResupplyPlanGate } from "../resupply-plan-gate.js";
import { SendBakehouseResupplyCommand } from "../send-bakehouse-resupply.command.js";
import { SendBakehouseResupplyHandler } from "../send-bakehouse-resupply.handler.js";
import { SendSiteResupplyCommand } from "../send-site-resupply.command.js";
import { SendSiteResupplyHandler } from "../send-site-resupply.handler.js";
import { Catalogue, Directory, Sites } from "./resupply-doubles.js";
import {
  FixedResupplyCutoff,
  InMemoryResupplyUsedNames,
  InMemorySiteResupplies,
  InMemorySiteResupplyPlanKeys,
  InMemorySiteResupplyReader,
  FixedLaunches,
  freshSendingKey,
} from "./site-resupply-doubles.js";
import { CROISSANT } from "./resupply-articles.js";

/** 17 h à Paris le 2 janvier : les journées ne sont comparées qu'à cette horloge figée. */
const NOW = new Date("2026-01-02T16:00:00Z");
const VILLAGE = "site_village";
const LABO = "site_labo";

function setup() {
  const store = new InMemorySiteResupplies();
  const clock = new FixedClock(NOW);
  const cutoff = new FixedResupplyCutoff(null);
  const staff = new Directory({ name: "Lou Martin", role: "counter" });
  const catalogue = new Catalogue([CROISSANT]);
  const sites = new Sites([VILLAGE, LABO]);
  const ids = new FixedIdGenerator("resupply");
  const launches = new FixedLaunches();
  const gate = new ResupplyPlanGate(new RecordingAdmissionDesk([]), launches);
  const uow = new DirectUnitOfWork();
  const names = new InMemoryResupplyUsedNames(store);
  return {
    store,
    name: new NameSiteResupplyHandler(store, sites, clock, ids),
    add: new AddSiteResupplyLineHandler(
      store,
      catalogue,
      sites,
      clock,
      ids,
      new DirectUnitOfWork(),
      inMemoryIntents(),
    ),
    send: new SendSiteResupplyHandler(
      store,
      new InMemorySiteResupplyPlanKeys(store),
      cutoff,
      staff,
      clock,
      gate,
      uow,
    ),
    bakehouse: new SendBakehouseResupplyHandler(
      store,
      catalogue,
      sites,
      cutoff,
      staff,
      clock,
      gate,
      uow,
    ),
    list: new ListSiteResuppliesHandler(
      new InMemorySiteResupplyReader(store),
      cutoff,
      clock,
      names,
    ),
    usedNames: new ListResupplyUsedNamesHandler(names),
  };
}

describe("nommer la demande en cours (R1g)", () => {
  it("nomme la demande déjà ouverte de la visée, sans toucher ses lignes", async () => {
    const { add, name, list } = setup();
    const id = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", "CRO", 4, "staff_1", randomUUID()),
    );

    const named = await name.execute(
      new NameSiteResupplyCommand(VILLAGE, "tomorrow", "  Vitrine du matin "),
    );

    expect(named).toBe(id);
    const view = await list.execute(new ListSiteResuppliesQuery(VILLAGE));
    expect(view.drafts).toEqual([
      expect.objectContaining({ id, name: "Vitrine du matin", version: 2 }),
    ]);
    expect(view.drafts[0]?.lines).toEqual([
      { sku: "CRO", label: "Croissant", quantity: 4, saleUnit: "piece" as const },
    ]);
  });

  it("ouvre la demande si aucune ne l'est : on peut nommer avant le premier article", async () => {
    const { add, name, store } = setup();
    const id = await name.execute(new NameSiteResupplyCommand(VILLAGE, "asap", "Goûter"));
    const added = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 1, "staff_1", randomUUID()),
    );

    expect(added).toBe(id);
    expect(store.all()).toEqual([expect.objectContaining({ id, name: "Goûter" })]);
  });

  it("vide retire le nom ; trop long est refusé et ne touche rien", async () => {
    const { name, store } = setup();
    await name.execute(new NameSiteResupplyCommand(VILLAGE, "asap", "Goûter"));

    await expect(
      name.execute(new NameSiteResupplyCommand(VILLAGE, "asap", "x".repeat(61))),
    ).rejects.toBeInstanceOf(ResupplyNameTooLongError);
    expect(store.all()[0]?.name).toBe("Goûter");

    await name.execute(new NameSiteResupplyCommand(VILLAGE, "asap", null));
    expect(store.all()[0]?.name).toBeNull();
  });

  it("accepte un nom de soixante caractères, la borne du contrat", async () => {
    const { name, store } = setup();
    const longest = "x".repeat(RESUPPLY_NAME_MAX);

    await name.execute(new NameSiteResupplyCommand(VILLAGE, "asap", longest));

    expect(store.all()[0]?.name).toBe(longest);
  });

  /**
   * Régression (audit final, 2026-11-03) : le contrat promet « le dernier nom
   * l'emporte », mais un ajout glissé entre la lecture et l'écriture faisait
   * échouer le nom sur la version (409).
   */
  it("un ajout d'un autre poste pendant le nommage ne fait pas échouer le nom, ni ne se perd", async () => {
    const { add, name, store } = setup();
    const id = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 1, "staff_1", randomUUID()),
    );
    store.beforeNextSave = () =>
      add.execute(
        new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 2, "staff_1", randomUUID()),
      );

    await expect(
      name.execute(new NameSiteResupplyCommand(VILLAGE, "asap", "Goûter")),
    ).resolves.toBe(id);

    expect(store.all()).toEqual([expect.objectContaining({ id, name: "Goûter" })]);
    expect(store.all()[0]?.lines.map((line) => line.quantity)).toEqual([3]);
  });

  it("un point inconnu est refusé", async () => {
    const { name } = setup();
    await expect(
      name.execute(new NameSiteResupplyCommand("site_ghost", "asap", "Goûter")),
    ).rejects.toBeInstanceOf(ResupplySiteUnknownError);
  });

  it("le nom part avec l'envoi, et le prochain nom ouvre une nouvelle demande", async () => {
    const { add, name, send, list, store } = setup();
    const id = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 2, "staff_1", randomUUID()),
    );
    await name.execute(new NameSiteResupplyCommand(VILLAGE, "asap", "Vitrine du matin"));
    await send.execute(new SendSiteResupplyCommand(VILLAGE, id, 2, "staff_1"));

    const next = await name.execute(new NameSiteResupplyCommand(VILLAGE, "asap", "Goûter"));

    expect(next).not.toBe(id);
    const view = await list.execute(new ListSiteResuppliesQuery(VILLAGE));
    expect(view.resupplies).toEqual([expect.objectContaining({ id, name: "Vitrine du matin" })]);
    expect(store.all().find((row) => row.id === id)?.name).toBe("Vitrine du matin");
  });

  it("le fournil nomme le sien à l'envoi ; sans nom, il n'en a pas", async () => {
    const { bakehouse, store } = setup();
    const lines = [{ sku: "CRO", quantity: 3, saleUnit: "piece" as const }];
    const named = await bakehouse.execute(
      new SendBakehouseResupplyCommand(
        VILLAGE,
        freshSendingKey(),
        "asap",
        lines,
        "s",
        "Vitrine du soir",
      ),
    );
    const plain = await bakehouse.execute(
      new SendBakehouseResupplyCommand(VILLAGE, freshSendingKey(), "asap", lines, "s"),
    );

    expect(store.all().find((row) => row.id === named)?.name).toBe("Vitrine du soir");
    expect(store.all().find((row) => row.id === plain)?.name).toBeNull();
  });

  it("une demande envoyée ne se renomme plus par son identifiant : l'agrégat refuse", async () => {
    const { add, send, store } = setup();
    const id = await add.execute(
      new AddSiteResupplyLineCommand(VILLAGE, "asap", "CRO", 2, "staff_1", randomUUID()),
    );
    await send.execute(new SendSiteResupplyCommand(VILLAGE, id, 1, "staff_1"));
    const sent = await store.load(VILLAGE, id);

    expect(() => sent?.rename("Autre")).toThrow(ResupplyAlreadyPlacedError);
  });
});

describe("les noms déjà employés au point (R1g)", () => {
  it("distincts, les plus récents d'abord, ceux du point seulement", async () => {
    const { bakehouse, list, usedNames } = setup();
    const lines = [{ sku: "CRO", quantity: 1, saleUnit: "piece" as const }];
    for (const [site, label] of [
      [VILLAGE, "Vitrine du matin"],
      [VILLAGE, "Goûter"],
      [LABO, "Labo seul"],
      [VILLAGE, "Vitrine du matin"],
    ] as const) {
      await bakehouse.execute(
        new SendBakehouseResupplyCommand(site, freshSendingKey(), "asap", lines, "s", label),
      );
    }

    const expected = ["Vitrine du matin", "Goûter"];
    expect((await usedNames.execute(new ListResupplyUsedNamesQuery(VILLAGE))).names).toEqual(
      expected,
    );
    expect((await list.execute(new ListSiteResuppliesQuery(VILLAGE))).usedNames).toEqual(expected);
  });

  it("bornés à la limite du contrat", async () => {
    const { bakehouse, usedNames } = setup();
    for (let index = 0; index <= RESUPPLY_USED_NAMES_MAX; index += 1) {
      await bakehouse.execute(
        new SendBakehouseResupplyCommand(
          VILLAGE,
          freshSendingKey(),
          "asap",
          [{ sku: "CRO", quantity: 1, saleUnit: "piece" as const }],
          "s",
          `N${String(index)}`,
        ),
      );
    }
    const { names } = await usedNames.execute(new ListResupplyUsedNamesQuery(VILLAGE));
    expect(names).toHaveLength(RESUPPLY_USED_NAMES_MAX);
    expect(names[0]).toBe(`N${String(RESUPPLY_USED_NAMES_MAX)}`);
  });
});
