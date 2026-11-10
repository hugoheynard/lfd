import type { PaymentMandate } from "../../domain/entities/payment-mandate.js";
import { SiteMandatesReader } from "../../domain/ports/site-mandates.reader.js";
import { SiteMandateRevoker } from "../site-mandate-revoker.js";
import {
  InMemoryMandates,
  StepPublisher,
  Steps,
  activeMandate,
  mandate,
} from "./payment-doubles.js";

/** Les mandats de site qui nomment le principal, servis tels quels. */
class FixedSiteMandates extends SiteMandatesReader {
  readonly asked: { siteId: string; debtorCompanyId: string }[] = [];

  constructor(private readonly found: readonly PaymentMandate[]) {
    super();
  }

  revocableNaming(siteId: string, debtorCompanyId: string): Promise<readonly PaymentMandate[]> {
    this.asked.push({ siteId, debtorCompanyId });
    return Promise.resolve(this.found);
  }
}

// Comparée à aucune horloge : c'est la date de révocation transmise.
const AT = new Date("2026-10-05T09:00:00.000Z");

describe("SiteMandateRevoker — détacher révoque les mandats au nom du principal (§2.1 ter)", () => {
  it("révoque chaque mandat par l'agrégat, l'écrit, et l'inscrit au journal", async () => {
    const steps = new Steps();
    const mandates = new InMemoryMandates(steps);
    const events = new StepPublisher(steps);
    const sites = new FixedSiteMandates([activeMandate(), mandate({ id: "mdt_brouillon" })]);

    await new SiteMandateRevoker(sites, mandates, events).revokeNaming("chalet", "alpes", AT);

    expect(sites.asked).toEqual([{ siteId: "chalet", debtorCompanyId: "alpes" }]);
    expect(mandates.saved.map((saved) => [saved.id, saved.status])).toEqual([
      ["mdt_actif", "revoked"],
      ["mdt_brouillon", "revoked"],
    ]);
    // Daté, et gardé en base : la révocation porte l'instant du geste.
    expect(mandates.saved[0]?.toSnapshot().revokedAt).toEqual(AT);
    expect(events.traced.map((event) => event.journalFact().type)).toEqual([
      "payment_mandate.revoked",
      "payment_mandate.revoked",
    ]);
  });

  it("n'écrit rien quand le site n'a aucun mandat au nom du principal", async () => {
    const steps = new Steps();
    const mandates = new InMemoryMandates(steps);
    const events = new StepPublisher(steps);

    await new SiteMandateRevoker(new FixedSiteMandates([]), mandates, events).revokeNaming(
      "chalet",
      "alpes",
      AT,
    );

    expect(mandates.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });
});
