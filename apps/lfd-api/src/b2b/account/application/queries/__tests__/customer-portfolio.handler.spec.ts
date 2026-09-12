import type { AdminCompanyDetailView, AdminCompanyView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { AdminCompanyReader } from "../../../domain/ports/admin-company.reader.js";
import { GetCustomerPortfolioHandler } from "../get-customer-portfolio.handler.js";

const NOW = new Date("2026-09-10T09:00:00.000Z");

/** Une date relative à MAINTENANT — jamais un jour du calendrier en dur. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function company(over: Partial<AdminCompanyView>): AdminCompanyView {
  return {
    id: "c1",
    reference: "C-1",
    raisonSociale: "Boulangerie",
    enseigne: "",
    formeJuridique: "SARL",
    siret: "81245678900021",
    vatNumber: "",
    status: "active",
    grantedTerms: [],
    requestedTerm: null,
    primaryContact: {
      id: null,
      firstName: "Camille",
      lastName: "Roux",
      fonction: "",
      email: "c@x.fr",
      phone: "",
      role: null,
    },
    owner: null,
    kbis: null,
    hasOpenSupportRequest: false,
    createdAt: daysAgo(200),
    activatedAt: null,
    warnings: [],
    ...over,
  };
}

/**
 * Doublé du port par HÉRITAGE, jamais par un cast.
 *
 * Un objet littéral converti en `AdminCompanyReader` cesse de suivre le port dès
 * qu'une méthode y est ajoutée, et rien ne rougit : le doublé continue de
 * compiler en jouant un contrat qui n'existe plus. C'est précisément ce que
 * `lint:no-type-escapes` compte, et pourquoi un cast pèse plus lourd dans un
 * test que dans du code de production.
 */
class FakeCompanies extends AdminCompanyReader {
  constructor(private readonly rows: readonly AdminCompanyView[]) {
    super();
  }

  listAll(): Promise<readonly AdminCompanyView[]> {
    return Promise.resolve(this.rows);
  }

  byId(): Promise<AdminCompanyDetailView | null> {
    return Promise.resolve(null);
  }
}

function handler(rows: readonly AdminCompanyView[]): GetCustomerPortfolioHandler {
  return new GetCustomerPortfolioHandler(new FakeCompanies(rows), new FixedClock(NOW));
}

describe("GetCustomerPortfolioHandler", () => {
  it("compte les ACTIVATIONS récentes, pas les créations", () => {
    // Le dossier a été déposé il y a six mois et activé la semaine dernière :
    // c'est un client de cette semaine, parce que c'est cette semaine qu'il
    // commence à facturer.
    return handler([company({ createdAt: daysAgo(180), activatedAt: daysAgo(7) })])
      .execute()
      .then((view) => {
        expect(view.newlyActive).toBe(1);
      });
  });

  it("n'invente pas d'activation pour un compte qui n'en a pas", async () => {
    const view = await handler([
      company({ status: "pending", createdAt: daysAgo(2), activatedAt: null }),
    ]).execute();

    expect(view.newlyActive).toBe(0);
    expect(view.pending).toBe(1);
  });

  it("exclut ce qui est sorti de la fenêtre de 30 jours", async () => {
    const view = await handler([
      company({ activatedAt: daysAgo(29) }),
      company({ activatedAt: daysAgo(31) }),
    ]).execute();

    expect(view.newlyActive).toBe(1);
  });

  it("garde un compte activé PUIS suspendu dans les arrivées récentes", async () => {
    // Sinon le compteur baisserait rétroactivement, et ne se rapprocherait plus
    // d'un relevé le mois suivant.
    const view = await handler([
      company({ status: "suspended", activatedAt: daysAgo(5) }),
    ]).execute();

    expect(view.newlyActive).toBe(1);
    expect(view.suspended).toBe(1);
    expect(view.active).toBe(0);
  });

  it("sépare les trois statuts — « 84 clients » tairait ce qui attend un geste", async () => {
    const view = await handler([
      company({ status: "active" }),
      company({ status: "active" }),
      company({ status: "pending" }),
      company({ status: "suspended" }),
    ]).execute();

    expect(view).toMatchObject({ active: 2, pending: 1, suspended: 1 });
  });
});
