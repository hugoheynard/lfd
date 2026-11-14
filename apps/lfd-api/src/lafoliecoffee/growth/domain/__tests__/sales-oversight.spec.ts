import {
  ACCESS_RESENT_THRESHOLD,
  LATE_CONTACTED_DAYS,
  LATE_DIRECTORY_DAYS,
  NO_ACCESS_REQUEST,
  readSalesSheet,
  selectSalesSheets,
  type SalesSheetFacts,
} from "../sales-oversight.js";
import { NO_MILESTONE } from "../sales-today.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** L'instant de la lecture ; chaque date de fiche s'écrit relativement à lui. */
const NOW = new Date("2030-01-15T10:00:00.000Z");
const daysBefore = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

function facts(overrides: Partial<SalesSheetFacts["work"]> = {}, ageDays = 1): SalesSheetFacts {
  return {
    companyId: "c1",
    reference: "C-AAAAAA",
    name: "Boulangerie X",
    createdAt: daysBefore(ageDays),
    declaredVia: "staff",
    followedByStaffId: "staff_a",
    work: {
      interlocutor: { name: "", email: "", phone: "" },
      notedContacts: 0,
      hasBillingAddress: false,
      deliveryAddressCount: 0,
      noDeliveryAddressNeeded: false,
      holderLoggedIn: false,
      activated: false,
      hasOrder: false,
      ...overrides,
    },
    milestones: NO_MILESTONE,
  };
}

const contacted = {
  interlocutor: { name: "Jeanne", email: "", phone: "0102030405" },
  notedContacts: 1,
};

describe("readSalesSheet — l'âge et le retard", () => {
  it("compte l'âge en jours pleins depuis l'ouverture", () => {
    expect(readSalesSheet(facts({}, 3), NO_ACCESS_REQUEST, NOW).ageDays).toBe(3);
  });

  it("n'est pas en retard à Annuaire le jour du seuil, l'est le lendemain", () => {
    const atThreshold = readSalesSheet(facts({}, LATE_DIRECTORY_DAYS), NO_ACCESS_REQUEST, NOW);
    const after = readSalesSheet(facts({}, LATE_DIRECTORY_DAYS + 1), NO_ACCESS_REQUEST, NOW);

    expect(atThreshold.level).toBe("directory");
    expect(atThreshold.signals).not.toContain("late");
    expect(after.signals).toContain("late");
  });

  it("laisse deux semaines à une fiche contactée", () => {
    const within = readSalesSheet(facts(contacted, LATE_CONTACTED_DAYS), NO_ACCESS_REQUEST, NOW);
    const after = readSalesSheet(facts(contacted, LATE_CONTACTED_DAYS + 1), NO_ACCESS_REQUEST, NOW);

    expect(within.level).toBe("contacted");
    expect(within.signals).not.toContain("late");
    expect(after.signals).toContain("late");
  });

  it("ne met jamais en retard une fiche qualifiée, même ancienne", () => {
    const qualified = readSalesSheet(
      facts({ ...contacted, hasBillingAddress: true, noDeliveryAddressNeeded: true }, 90),
      NO_ACCESS_REQUEST,
      NOW,
    );

    expect(qualified.level).toBe("qualified");
    expect(qualified.signals).toEqual([]);
  });
});

describe("readSalesSheet — les relances et les adresses", () => {
  const resent = { count: ACCESS_RESENT_THRESHOLD, last: daysBefore(1) };

  it("signale un accès envoyé deux fois sans connexion du détenteur", () => {
    expect(readSalesSheet(facts(), resent, NOW).signals).toContain("access_resent");
  });

  it("ne signale pas un seul envoi", () => {
    const once = { count: ACCESS_RESENT_THRESHOLD - 1, last: daysBefore(1) };
    expect(readSalesSheet(facts(), once, NOW).signals).not.toContain("access_resent");
  });

  it("ne signale plus les relances une fois le détenteur connecté", () => {
    const sheet = readSalesSheet(facts({ holderLoggedIn: true }), resent, NOW);
    expect(sheet.signals).not.toContain("access_resent");
  });

  it("signale plus d'une adresse de livraison vivante, pas une seule", () => {
    expect(
      readSalesSheet(facts({ deliveryAddressCount: 2 }), NO_ACCESS_REQUEST, NOW).signals,
    ).toContain("multiple_addresses");
    expect(
      readSalesSheet(facts({ deliveryAddressCount: 1 }), NO_ACCESS_REQUEST, NOW).signals,
    ).not.toContain("multiple_addresses");
  });
});

describe("readSalesSheet — les inscriptions sans suiveur", () => {
  // NOW est un mardi : sept jours avant, un mardi aussi (5 jours ouvrés
  // écoulés) ; la veille, un lundi (un seul).
  const signup = (ageDays: number, followedByStaffId: string | null = null): SalesSheetFacts => ({
    ...facts({}, ageDays),
    declaredVia: "self",
    followedByStaffId,
  });

  it("signale une inscription du client que personne ne suit après le seuil", () => {
    expect(readSalesSheet(signup(7), NO_ACCESS_REQUEST, NOW).signals).toContain(
      "unassigned_signup",
    );
  });

  it("ne la signale pas avant le seuil", () => {
    expect(readSalesSheet(signup(1), NO_ACCESS_REQUEST, NOW).signals).not.toContain(
      "unassigned_signup",
    );
  });

  it("ne signale ni une inscription suivie, ni une fiche ouverte par l'équipe", () => {
    expect(readSalesSheet(signup(7, "staff_a"), NO_ACCESS_REQUEST, NOW).signals).not.toContain(
      "unassigned_signup",
    );
    const staffOpened = { ...facts({}, 7), followedByStaffId: null };
    expect(readSalesSheet(staffOpened, NO_ACCESS_REQUEST, NOW).signals).not.toContain(
      "unassigned_signup",
    );
  });
});

describe("selectSalesSheets", () => {
  const directoryLate = readSalesSheet(facts({}, 30), NO_ACCESS_REQUEST, NOW);
  const directoryFresh = readSalesSheet(facts({}, 1), NO_ACCESS_REQUEST, NOW);
  const contactedFresh = readSalesSheet(facts(contacted, 1), NO_ACCESS_REQUEST, NOW);
  const all = [directoryLate, directoryFresh, contactedFresh];

  it("compte par niveau sans tenir compte du filtre de niveau", () => {
    const page = selectSalesSheets(all, { level: "contacted", page: 1, pageSize: 50 });

    expect(page.counts).toEqual({ directory: 2, contacted: 1, qualified: 0, opened: 0, active: 0 });
    expect(page.total).toBe(1);
    expect(page.rows).toEqual([contactedFresh]);
  });

  it("fait suivre le filtre de signal aux compteurs", () => {
    const page = selectSalesSheets(all, { signal: "late", page: 1, pageSize: 50 });

    expect(page.counts.directory).toBe(1);
    expect(page.counts.contacted).toBe(0);
    expect(page.rows).toEqual([directoryLate]);
  });

  it("découpe par page, dans l'ordre reçu", () => {
    expect(selectSalesSheets(all, { page: 2, pageSize: 2 }).rows).toEqual([contactedFresh]);
    expect(selectSalesSheets(all, { page: 3, pageSize: 2 }).rows).toEqual([]);
    expect(selectSalesSheets(all, { page: 3, pageSize: 2 }).total).toBe(3);
  });
});
