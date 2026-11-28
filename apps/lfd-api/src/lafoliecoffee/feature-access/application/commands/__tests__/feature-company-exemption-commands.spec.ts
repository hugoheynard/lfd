import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  ArchivedCompanyExemptionError,
  CompanyAlreadyExemptedError,
  ExemptedCompanyNotFoundError,
  FeatureCompanyExemptionNotFoundError,
  FeatureNotExemptibleByCompanyError,
} from "../../../domain/feature-access-errors.js";
import { AddFeatureCompanyExemptionCommand } from "../add-feature-company-exemption.command.js";
import { AddFeatureCompanyExemptionHandler } from "../add-feature-company-exemption.handler.js";
import { RemoveFeatureCompanyExemptionCommand } from "../remove-feature-company-exemption.command.js";
import { RemoveFeatureCompanyExemptionHandler } from "../remove-feature-company-exemption.handler.js";
import {
  InMemoryCompanyExemptions,
  KnownCompanies,
  KnownStaff,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "./feature-access-doubles.js";

// Comparée à aucune horloge : c'est l'instant que le handler doit figer.
const NOW = new Date("2026-11-27T09:00:00.000Z");

function harness() {
  const steps = new Steps();
  const exemptions = new InMemoryCompanyExemptions(steps);
  const events = new StepPublisher(steps);
  const uow = new StepUnitOfWork(steps);
  const companies = new KnownCompanies([
    { id: "co_chalet", name: "Chalet Alpin", archived: false },
    { id: "co_closed", name: "Bistrot fermé", archived: true },
  ]);
  return {
    steps,
    exemptions,
    events,
    add: new AddFeatureCompanyExemptionHandler(
      exemptions,
      companies,
      new KnownStaff(),
      new FixedClock(NOW),
      events,
      uow,
    ),
    remove: new RemoveFeatureCompanyExemptionHandler(exemptions, events, uow),
  };
}

const add = (companyId: string, key = "orderPlanner") =>
  new AddFeatureCompanyExemptionCommand(key, companyId, "staff_admin");

describe("AddFeatureCompanyExemptionHandler", () => {
  it("écrit l'exemption puis sa trace nommant la société, DANS l'unité de travail", async () => {
    const h = harness();

    await h.add.execute(add("co_chalet"));

    expect(h.steps.log).toEqual([
      "uow:begin",
      "company-exemption:add:co_chalet",
      "journal:feature_access.company_exemption_added",
      "uow:end",
    ]);
    expect(h.exemptions.rows[0]).toMatchObject({
      companyName: "Chalet Alpin",
      at: NOW,
      author: { staffUserId: "staff_admin", name: "Camille Admin", role: "admin" },
    });
    expect(h.events.traced[0]?.journalFact()).toEqual({
      type: "feature_access.company_exemption_added",
      subjectType: "feature_access",
      subjectId: "orderPlanner",
      payload: {
        subjectLabel: "Planificateur de commandes",
        company: { id: "co_chalet", name: "Chalet Alpin" },
      },
    });
  });

  it("refuse une société déjà exemptée, sans seconde trace", async () => {
    const h = harness();
    await h.add.execute(add("co_chalet"));

    await expect(h.add.execute(add("co_chalet"))).rejects.toThrow(CompanyAlreadyExemptedError);

    expect(h.exemptions.rows).toHaveLength(1);
    expect(h.events.traced).toHaveLength(1);
  });

  it("refuse une société inconnue ou archivée, sans écriture ni trace", async () => {
    const h = harness();

    await expect(h.add.execute(add("co_ghost"))).rejects.toThrow(ExemptedCompanyNotFoundError);
    await expect(h.add.execute(add("co_closed"))).rejects.toThrow(ArchivedCompanyExemptionError);

    expect(h.steps.log).toEqual([]);
  });

  it("refuse une clé qui ne s'exempte pas par société, sans écriture ni trace", async () => {
    const h = harness();

    await expect(h.add.execute(add("co_chalet", "customerMandate"))).rejects.toThrow(
      FeatureNotExemptibleByCompanyError,
    );

    expect(h.steps.log).toEqual([]);
  });
});

describe("RemoveFeatureCompanyExemptionHandler", () => {
  it("retire la société et journalise son nom figé", async () => {
    const h = harness();
    await h.add.execute(add("co_chalet"));

    await h.remove.execute(new RemoveFeatureCompanyExemptionCommand("orderPlanner", "co_chalet"));

    expect(h.exemptions.rows).toEqual([]);
    expect(h.events.traced[1]?.journalFact()).toMatchObject({
      type: "feature_access.company_exemption_removed",
      payload: { company: { id: "co_chalet", name: "Chalet Alpin" } },
    });
  });

  it("refuse en 404 une société absente de la liste, sans trace", async () => {
    const h = harness();

    await expect(
      h.remove.execute(new RemoveFeatureCompanyExemptionCommand("orderPlanner", "co_chalet")),
    ).rejects.toThrow(FeatureCompanyExemptionNotFoundError);
    expect(h.events.traced).toEqual([]);
  });
});
