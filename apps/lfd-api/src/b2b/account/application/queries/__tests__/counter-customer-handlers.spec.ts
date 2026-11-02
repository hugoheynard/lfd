import type {
  CompanyAddressesView,
  CounterCustomerCard,
  DeliveryAddressView,
} from "@lfd/contracts";

import { Company } from "../../../domain/entities/company.js";
import { CounterCustomerNotFoundError } from "../../../domain/errors/counter-errors.js";
import { CompanyAddressReader } from "../../../domain/ports/company-address.reader.js";
import {
  CompanyMemberReader,
  type CompanyMemberRecord,
} from "../../../domain/ports/company-member.repository.js";
import { CompanyFollowsReader } from "../../../domain/ports/company-follows.reader.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import { FollowPeriod } from "../../../domain/value-objects/follow-period.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CounterCustomerReader } from "../../../domain/ports/counter-customer.reader.js";
import type { CompanyStatus } from "../../../domain/value-objects/company-status.js";
import { DirectDebitBlock } from "../../../domain/value-objects/direct-debit-block.js";
import { GetCounterCustomerHandler } from "../get-counter-customer.handler.js";
import { GetCounterCustomerQuery } from "../get-counter-customer.query.js";
import { ListCounterCustomersHandler } from "../list-counter-customers.handler.js";

// Relu tel quel : jamais comparé à l'horloge.
const JOINED_AT = new Date("2026-01-05T09:00:00.000Z");

const CARD: CounterCustomerCard = {
  id: "c1",
  name: "PQ Marais",
  tradeName: "Le Pain Quotidien",
  reference: "CLI-0001",
  siret: "81245678900021",
};

const DELIVERY: DeliveryAddressView = {
  id: "addr_1",
  label: "Boutique",
  ligne1: "18 rue des Archives",
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "France",
  isDefault: true,
  specs: {
    signatureRequired: false,
    note: "",
    slotList: { mode: "everyday", slots: [] },
    deliveryContact: null,
    gps: null,
  },
  procedureStepCount: 0,
  depositAllowed: false,
};

function company(options: {
  readonly id?: string;
  readonly status?: CompanyStatus;
  readonly onAccount?: boolean;
  readonly blocked?: boolean;
}): Company {
  return Company.reconstitute({
    id: options.id ?? "c1",
    raisonSociale: "PQ Marais",
    enseigne: "Le Pain Quotidien",
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "",
    contact: null,
    grantedTerms: options.onAccount === true ? ["monthly"] : [],
    requestedTerm: null,
    status: options.status ?? "active",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    directDebitBlock:
      options.blocked === true
        ? DirectDebitBlock.reconstitute(JOINED_AT, "staff_1", "Rejet")
        : null,
  });
}

function member(userId: string, status: CompanyMemberRecord["status"]): CompanyMemberRecord {
  return {
    userId,
    email: `${userId}@pq.fr`,
    firstName: "Camille",
    lastName: userId,
    phone: "0600000000",
    role: "orders",
    status,
    joinedAt: JOINED_AT,
  };
}

class FixedCards extends CounterCustomerReader {
  constructor(private readonly card: CounterCustomerCard | null) {
    super();
  }
  listActive(): Promise<readonly CounterCustomerCard[]> {
    return Promise.resolve(this.card === null ? [] : [this.card]);
  }
  activeCard(): Promise<CounterCustomerCard | null> {
    return Promise.resolve(this.card);
  }
}

/** Port d'écriture doublé en lecture seule : le handler ne doit que charger. */
class StoredCompanies extends CompanyRepository {
  saved = 0;
  constructor(
    private readonly stored: Company | null,
    private readonly others: ReadonlyMap<string, Company> = new Map(),
  ) {
    super();
  }
  existsBySiret(): Promise<boolean> {
    return Promise.resolve(false);
  }
  load(companyId: string): Promise<Company | null> {
    return Promise.resolve(this.others.get(companyId) ?? this.stored);
  }
  save(): Promise<void> {
    this.saved += 1;
    return Promise.resolve();
  }
  declareOwnedBy(): Promise<string> {
    return Promise.resolve("");
  }
  declareUnowned(): Promise<string> {
    return Promise.resolve("");
  }
  kbisLocation(): Promise<null> {
    return Promise.resolve(null);
  }
}

class FixedAddresses extends CompanyAddressReader {
  read(): Promise<CompanyAddressesView> {
    return Promise.resolve({ billing: null, deliveries: [DELIVERY] });
  }
}

class FixedMembers extends CompanyMemberReader {
  constructor(private readonly records: readonly CompanyMemberRecord[]) {
    super();
  }
  listOf(): Promise<readonly CompanyMemberRecord[]> {
    return Promise.resolve(this.records);
  }
}

/** Le principal que `c1` suit en `billing` depuis hier, ou aucun. */
class FixedBillingFollow extends CompanyFollowsReader {
  constructor(private readonly parentId: string | null) {
    super();
  }
  followsAt(_companyId: string, aspect: string, at: Date): Promise<FollowPeriod | null> {
    return Promise.resolve(
      this.parentId === null || aspect !== "billing"
        ? null
        : FollowPeriod.open("billing", this.parentId, new Date(at.getTime() - DAY_MS)),
    );
  }
}

const DAY_MS = 86_400_000;

function detail(
  card: CounterCustomerCard | null,
  stored: Company | null,
  members: readonly CompanyMemberRecord[] = [],
  payer: Company | null = null,
): { handler: GetCounterCustomerHandler; companies: StoredCompanies } {
  const companies = new StoredCompanies(
    stored,
    payer === null ? new Map() : new Map([["p1", payer]]),
  );
  const handler = new GetCounterCustomerHandler(
    new FixedCards(card),
    companies,
    new FixedAddresses(),
    new FixedMembers(members),
    new FixedBillingFollow(payer === null ? null : "p1"),
    new FixedClock(JOINED_AT),
  );
  return { handler, companies };
}

describe("ListCounterCustomersHandler", () => {
  it("rend les cartes du port, telles quelles", async () => {
    const handler = new ListCounterCustomersHandler(new FixedCards(CARD));

    expect(await handler.execute()).toEqual([CARD]);
  });
});

describe("GetCounterCustomerHandler", () => {
  it("sert un client actif : carnet, acheteurs actifs seuls, et le verdict « au compte »", async () => {
    const { handler, companies } = detail(CARD, company({ onAccount: true }), [
      member("u_actif", "active"),
      member("u_invite", "invited"),
      member("u_parti", "disabled"),
    ]);

    const view = await handler.execute(new GetCounterCustomerQuery("c1"));

    expect(view).toEqual({
      id: "c1",
      name: "PQ Marais",
      tradeName: "Le Pain Quotidien",
      reference: "CLI-0001",
      status: "active",
      settlesOnAccount: true,
      deliveryAddresses: [DELIVERY],
      buyers: [
        {
          userId: "u_actif",
          firstName: "Camille",
          lastName: "u_actif",
          email: "u_actif@pq.fr",
          role: "orders",
        },
      ],
    });
    // Une lecture ne sauve rien.
    expect(companies.saved).toBe(0);
  });

  it("ne livre ni le crédit, ni le blocage, ni le téléphone d'un acheteur", async () => {
    const { handler } = detail(CARD, company({ onAccount: true }), [member("u1", "active")]);

    const view = await handler.execute(new GetCounterCustomerQuery("c1"));

    expect(Object.keys(view)).not.toContain("grantedTerms");
    expect(Object.keys(view)).not.toContain("directDebitBlocked");
    expect(Object.keys(view.buyers[0] ?? {})).not.toContain("phone");
  });

  it("dit « pas au compte » pour une société au crédit dont le prélèvement est bloqué", async () => {
    const { handler } = detail(CARD, company({ onAccount: true, blocked: true }));

    const view = await handler.execute(new GetCounterCustomerQuery("c1"));

    expect(view.settlesOnAccount).toBe(false);
  });

  it("dit « pas au compte » pour une société sans crédit accordé", async () => {
    const { handler } = detail(CARD, company({ onAccount: false }));

    expect((await handler.execute(new GetCounterCustomerQuery("c1"))).settlesOnAccount).toBe(false);
  });

  /**
   * Régression (plan du jour J, §12 sérieux, lot L6) : le verdict lisait la
   * société seule, quand la passation lit le PAYEUR — un site rattaché voyait
   * « au compte » proposé, puis refusé à la validation.
   */
  it("lit le crédit du principal qu'un site suit en facturation, pas celui du site", async () => {
    const principal = company({ id: "p1", onAccount: true });
    const { handler } = detail(CARD, company({ onAccount: false }), [], principal);

    expect((await handler.execute(new GetCounterCustomerQuery("c1"))).settlesOnAccount).toBe(true);
  });

  it("dit « pas au compte » pour un site dont le principal suivi n'a pas de crédit", async () => {
    const principal = company({ id: "p1", onAccount: false });
    const { handler } = detail(CARD, company({ onAccount: true }), [], principal);

    expect((await handler.execute(new GetCounterCustomerQuery("c1"))).settlesOnAccount).toBe(false);
  });

  it("dit « pas au compte » quand le principal suivi n'est pas actif", async () => {
    const principal = company({ id: "p1", onAccount: true, status: "suspended" });
    const { handler } = detail(CARD, company({ onAccount: true }), [], principal);

    expect((await handler.execute(new GetCounterCustomerQuery("c1"))).settlesOnAccount).toBe(false);
  });

  it("refuse une société inconnue en 404", async () => {
    const { handler } = detail(null, null);

    await expect(handler.execute(new GetCounterCustomerQuery("absente"))).rejects.toBeInstanceOf(
      CounterCustomerNotFoundError,
    );
  });

  it("refuse une société suspendue du même 404 qu'une absente", async () => {
    const { handler } = detail(null, company({ status: "suspended", onAccount: true }));

    await expect(handler.execute(new GetCounterCustomerQuery("c1"))).rejects.toBeInstanceOf(
      CounterCustomerNotFoundError,
    );
  });

  it("refuse si l'agrégat n'est plus actif, même quand la carte l'était encore", async () => {
    const { handler } = detail(CARD, company({ status: "suspended" }));

    await expect(handler.execute(new GetCounterCustomerQuery("c1"))).rejects.toBeInstanceOf(
      CounterCustomerNotFoundError,
    );
  });
});
