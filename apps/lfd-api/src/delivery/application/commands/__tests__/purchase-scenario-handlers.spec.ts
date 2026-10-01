import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  PurchaseScenarioAlreadyArchivedError,
  PurchaseScenarioNameTakenError,
  PurchaseScenarioNotArchivedError,
  PurchaseScenarioNotFoundError,
  PurchaseScenarioUnreadableError,
} from "../../../domain/errors/delivery-purchase-scenario-errors.js";
import { GetPurchaseScenarioHandler } from "../../queries/get-purchase-scenario.handler.js";
import { GetPurchaseScenarioQuery } from "../../queries/get-purchase-scenario.query.js";
import { ListPurchaseScenariosHandler } from "../../queries/list-purchase-scenarios.handler.js";
import { ListPurchaseScenariosQuery } from "../../queries/list-purchase-scenarios.query.js";
import { ArchivePurchaseScenarioCommand } from "../archive-purchase-scenario.command.js";
import { ArchivePurchaseScenarioHandler } from "../archive-purchase-scenario.handler.js";
import { ReactivatePurchaseScenarioCommand } from "../reactivate-purchase-scenario.command.js";
import { ReactivatePurchaseScenarioHandler } from "../reactivate-purchase-scenario.handler.js";
import { RecordPurchaseScenarioCommand } from "../record-purchase-scenario.command.js";
import { RecordPurchaseScenarioHandler } from "../record-purchase-scenario.handler.js";
import { ReplacePurchaseScenarioCommand } from "../replace-purchase-scenario.command.js";
import { ReplacePurchaseScenarioHandler } from "../replace-purchase-scenario.handler.js";
import { FixedBinCatalog } from "./bin-doubles.js";
import {
  binCandidateView,
  FixedBinCandidates,
  FixedVehicleCandidates,
  InMemoryPurchaseScenarios,
  PURCHASE_CONTENT,
  purchaseScenarioNamed,
  vehicleCandidateView,
} from "./purchase-scenario-doubles.js";
import { FixedFleet, vehicleView } from "./routing-doubles.js";

const NOW = new Date(0);
const EPOCH = NOW.toISOString();

function world(...existing: Parameters<typeof purchaseScenarioNamed>[]) {
  const scenarios = new InMemoryPurchaseScenarios(
    ...existing.map((args) => purchaseScenarioNamed(...args)),
  );
  const events = new RecordingPublisher();
  const directory = new FixedStaffAuthorDirectory(
    authorsKnownAs(
      { firstName: "Anne", lastName: "B", staffUserId: "staff_2", role: "admin" },
      "staff_2",
    ),
  );
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  return {
    events,
    record: new RecordPurchaseScenarioHandler(
      scenarios,
      directory,
      new FixedIdGenerator("ps"),
      clock,
      events,
      uow,
    ),
    replace: new ReplacePurchaseScenarioHandler(scenarios, directory, clock, events, uow),
    archive: new ArchivePurchaseScenarioHandler(scenarios, directory, clock, events, uow),
    reactivate: new ReactivatePurchaseScenarioHandler(scenarios, directory, clock, events, uow),
    list: new ListPurchaseScenariosHandler(scenarios.reader),
    get: new GetPurchaseScenarioHandler(
      scenarios.reader,
      new FixedVehicleCandidates([vehicleCandidateView("vc1", "Kangoo", EPOCH)]),
      new FixedBinCandidates([binCandidateView("bc1", "Caisse Dupont 50")]),
      new FixedFleet([{ ...vehicleView("v1", "Camion 1"), cargo: null }]),
      new FixedBinCatalog([], []),
    ),
  };
}

const save = (name: string) => ({ name, ...PURCHASE_CONTENT });

describe("les scénarios d'achat (B-D5)", () => {
  it("enregistre un scénario, avec son auteur, et le trace", async () => {
    const w = world();

    const id = await w.record.execute(new RecordPurchaseScenarioCommand(save("Essai"), "staff_2"));

    expect((await w.list.execute(new ListPurchaseScenariosQuery(false))).scenarios).toEqual([
      {
        id,
        name: "Essai",
        vehicles: 2,
        formats: 1,
        updatedAt: EPOCH,
        updatedBy: "Anne B",
        archivedAt: null,
      },
    ]);
    expect(w.events.factTypes()).toEqual(["delivery_purchase_scenario.created"]);
  });

  it("refuse un nom déjà porté par un scénario en cours, sans rien tracer", async () => {
    const w = world(["ps0", "Essai"]);

    await expect(
      w.record.execute(new RecordPurchaseScenarioCommand(save("Essai"), "staff_2")),
    ).rejects.toThrow(PurchaseScenarioNameTakenError);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("libère le nom d'un archivé, et liste les archivés seulement sur demande", async () => {
    const w = world(["ps0", "Essai", { archivedAt: NOW }]);

    await w.record.execute(new RecordPurchaseScenarioCommand(save("Essai"), "staff_2"));

    expect((await w.list.execute(new ListPurchaseScenariosQuery(false))).scenarios).toHaveLength(1);
    expect((await w.list.execute(new ListPurchaseScenariosQuery(true))).scenarios).toHaveLength(2);
  });

  it("remplace un scénario, en disant l'ancien nom", async () => {
    const w = world(["ps0", "Essai"]);

    await w.replace.execute(new ReplacePurchaseScenarioCommand("ps0", save("Renommé"), "staff_2"));

    expect(w.events.traced[0]?.journalFact().payload).toMatchObject({
      subjectLabel: "Renommé",
      renamedFrom: "Essai",
      vehicles: 2,
      formats: 1,
    });
  });

  it("refuse de remplacer un archivé ou un inconnu", async () => {
    const w = world(["ps0", "Essai", { archivedAt: NOW }]);

    await expect(
      w.replace.execute(new ReplacePurchaseScenarioCommand("ps0", save("X"), "staff_2")),
    ).rejects.toThrow(PurchaseScenarioAlreadyArchivedError);
    await expect(
      w.replace.execute(new ReplacePurchaseScenarioCommand("nope", save("X"), "staff_2")),
    ).rejects.toThrow(PurchaseScenarioNotFoundError);
  });

  it("archive puis réactive, en traçant chaque geste", async () => {
    const w = world(["ps0", "Essai"]);

    await w.archive.execute(new ArchivePurchaseScenarioCommand("ps0", "staff_2"));
    await w.reactivate.execute(new ReactivatePurchaseScenarioCommand("ps0", "staff_2"));

    expect(w.events.factTypes()).toEqual([
      "delivery_purchase_scenario.archived",
      "delivery_purchase_scenario.reactivated",
    ]);
    await expect(
      w.reactivate.execute(new ReactivatePurchaseScenarioCommand("ps0", "staff_2")),
    ).rejects.toThrow(PurchaseScenarioNotArchivedError);
  });

  it("refuse de réactiver un scénario dont le nom a été repris entre-temps", async () => {
    const w = world(["ps0", "Essai", { archivedAt: NOW }], ["ps1", "Essai"]);

    await expect(
      w.reactivate.execute(new ReactivatePurchaseScenarioCommand("ps0", "staff_2")),
    ).rejects.toThrow(PurchaseScenarioNameTakenError);
  });

  it("archive un scénario illisible : c'est la sortie que son refus propose", async () => {
    const w = world(["ps0", "Cassé", { stored: { readable: false, reason: "gapCm : requis" } }]);

    await w.archive.execute(new ArchivePurchaseScenarioCommand("ps0", "staff_2"));

    expect(w.events.factTypes()).toEqual(["delivery_purchase_scenario.archived"]);
  });

  it("rouvre un scénario dont des éléments ne passent plus, en les nommant", async () => {
    const w = world(["ps0", "Essai"]);

    const view = await w.get.execute(new GetPurchaseScenarioQuery("ps0"));

    expect(view.selection).toEqual(PURCHASE_CONTENT.selection);
    expect(view.display).toEqual(PURCHASE_CONTENT.display);
    expect(view.issues).toEqual([
      expect.objectContaining({
        kind: "vehicle_candidate",
        source: "candidate",
        id: "vc1",
        name: "Kangoo",
        problem: "archived",
        message: "Le véhicule « Kangoo » a été archivé — retirez-le de la sélection.",
      }),
      expect.objectContaining({ kind: "fleet_vehicle", id: "v1", problem: "without_cargo" }),
    ]);
  });

  it("refuse en le nommant un scénario qui ne se relit plus, et un inconnu", async () => {
    const w = world(["ps0", "Cassé", { stored: { readable: false, reason: "gapCm : requis" } }]);

    await expect(w.get.execute(new GetPurchaseScenarioQuery("ps0"))).rejects.toThrow(
      PurchaseScenarioUnreadableError,
    );
    await expect(w.get.execute(new GetPurchaseScenarioQuery("nope"))).rejects.toThrow(
      PurchaseScenarioNotFoundError,
    );
  });
});
