import type { LeadScoreView, LeadView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { LeadEvent } from "../../../domain/lead-score.js";
import { LeadEventSource } from "../../../domain/ports/lead-event-source.js";
import { LeadReader } from "../../../domain/ports/lead.reader.js";
import { LeadScoreStore } from "../../../domain/ports/lead-score.store.js";
import { CompanyNamer, type CompanyIdentity } from "../../../domain/ports/company-namer.js";
import { CustomerEmailReader } from "../../../domain/ports/customer-email.reader.js";
import { RecomputeLeadScoresHandler } from "../recompute-lead-scores.handler.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");

/** Source de journal doublée par EXTENSION (aucun cast interdit). */
class FakeEventSource extends LeadEventSource {
  constructor(private readonly events: LeadEvent[]) {
    super();
  }
  all(): Promise<LeadEvent[]> {
    return Promise.resolve(this.events);
  }
}

/** Reader de leads cold doublé. */
class FakeLeadReader extends LeadReader {
  constructor(private readonly leads: LeadView[] = []) {
    super();
  }
  list(): Promise<LeadView[]> {
    return Promise.resolve(this.leads);
  }
}

/** Store doublé : capture ce que le handler écrit. */
class CapturingStore extends LeadScoreStore {
  written: readonly LeadScoreView[] | null = null;
  replaceAll(rows: readonly LeadScoreView[]): Promise<void> {
    this.written = rows;
    return Promise.resolve();
  }
}

/** Annuaire doublé : capture les LOTS demandés, pour compter les allers-retours. */
class FakeCompanies extends CompanyNamer {
  readonly batches: string[][] = [];
  constructor(private readonly known: ReadonlyMap<string, CompanyIdentity> = new Map()) {
    super();
  }
  nameOf(companyId: string): Promise<CompanyIdentity | null> {
    return Promise.resolve(this.known.get(companyId) ?? null);
  }
  namesOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, CompanyIdentity>> {
    this.batches.push([...companyIds]);
    return Promise.resolve(new Map([...this.known].filter(([id]) => companyIds.includes(id))));
  }
}

/** Les fiches des personnes doublées : l'adresse vit ici, plus dans le journal. */
class FakeEmails extends CustomerEmailReader {
  readonly batches: string[][] = [];
  constructor(private readonly known: ReadonlyMap<string, string> = new Map()) {
    super();
  }
  emailsOf(userIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    this.batches.push([...userIds]);
    return Promise.resolve(new Map([...this.known].filter(([id]) => userIds.includes(id))));
  }
}

/** Déclaration d'une société restée en plan — le dossier que `rescue` vise. */
function declared(companyId: string, at: string): LeadEvent {
  return {
    type: "company.declared",
    subjectType: "company",
    subjectId: companyId,
    occurredAt: new Date(at),
    actorType: "customer",
    payload: { via: "self", ownerUserId: "u_owner" },
  };
}

function ordered(subjectId: string, at: string, totalCents: number): LeadEvent {
  return {
    type: "order.placed",
    subjectType: "user",
    subjectId,
    occurredAt: new Date(at),
    actorType: "customer",
    payload: { totalCents, companyId: null },
  };
}

describe("RecomputeLeadScoresHandler", () => {
  it("dérive la queue au temps du Clock puis remplace le read-model, et rend le compte", async () => {
    const store = new CapturingStore();
    const handler = new RecomputeLeadScoresHandler(
      new FakeEventSource([ordered("u1", "2026-08-18T09:00:00.000Z", 5000)]),
      new FakeLeadReader(),
      store,
      new FixedClock(NOW),
      new FakeCompanies(),
      new FakeEmails(),
    );

    const count = await handler.execute();

    expect(count).toBe(1);
    expect(store.written).toHaveLength(1);
    expect(store.written?.[0]).toMatchObject({
      subjectId: "u1",
      play: "lock_in",
      computedAt: NOW.toISOString(),
    });
  });

  it("remplace par une queue vide quand le journal ne porte aucun lead actionnable", async () => {
    const store = new CapturingStore();
    const handler = new RecomputeLeadScoresHandler(
      new FakeEventSource([]),
      new FakeLeadReader(),
      store,
      new FixedClock(NOW),
      new FakeCompanies(),
      new FakeEmails(),
    );

    const count = await handler.execute();

    expect(count).toBe(0);
    expect(store.written).toEqual([]);
  });

  /**
   * Régression : le libellé est PERSISTÉ dans `lead_score.label` et relu tel
   * quel. Le résoudre à l'affichage aurait laissé l'identifiant en base, et le
   * lecteur suivant l'aurait réaffiché (fix 2026-09-12).
   */
  it("écrit l'enseigne dans le libellé persisté du coup rescue", async () => {
    const store = new CapturingStore();
    const companies = new FakeCompanies(
      new Map([["c_stalled", { enseigne: "Boulangerie Martin", raisonSociale: "SARL MARTIN" }]]),
    );
    const handler = new RecomputeLeadScoresHandler(
      new FakeEventSource([declared("c_stalled", "2026-08-05T09:00:00.000Z")]),
      new FakeLeadReader(),
      store,
      new FixedClock(NOW),
      companies,
      new FakeEmails(),
    );

    await handler.execute();

    expect(store.written?.[0]).toMatchObject({ play: "rescue", label: "Boulangerie Martin" });
  });

  it("demande les enseignes en UN lot, et ne demande pas les sujets qui ne sont pas des sociétés", async () => {
    const companies = new FakeCompanies();
    const handler = new RecomputeLeadScoresHandler(
      new FakeEventSource([
        declared("c_a", "2026-08-05T09:00:00.000Z"),
        declared("c_b", "2026-08-06T09:00:00.000Z"),
        ordered("u1", "2026-08-18T09:00:00.000Z", 5000),
      ]),
      new FakeLeadReader(),
      new CapturingStore(),
      new FixedClock(NOW),
      companies,
      new FakeEmails(),
    );

    await handler.execute();

    expect(companies.batches).toEqual([["c_a", "c_b"]]);
  });

  /**
   * Lot B du plan des phrases (2026-09-19) : `user.registered` ne porte plus
   * l'e-mail. Le libellé d'un prospect sans nom se lit sur sa fiche — le
   * read-model n'est pas le journal, et l'écran s'en sert pour rappeler.
   */
  it("nomme un prospect par l'adresse de sa fiche, demandée en UN lot", async () => {
    const store = new CapturingStore();
    const emails = new FakeEmails(new Map([["u1", "chef@resto.fr"]]));
    const handler = new RecomputeLeadScoresHandler(
      new FakeEventSource([
        ordered("u1", "2026-08-18T09:00:00.000Z", 5000),
        declared("c_a", "2026-08-05T09:00:00.000Z"),
      ]),
      new FakeLeadReader(),
      store,
      new FixedClock(NOW),
      new FakeCompanies(),
      emails,
    );

    await handler.execute();

    expect(emails.batches).toEqual([["u1"]]);
    expect(store.written?.find((row) => row.subjectId === "u1")).toMatchObject({
      label: "chef@resto.fr",
    });
  });
});
