import type { WorkLevelInput } from "../../../account/domain/services/work-level.js";
import {
  nextStepActorOf,
  nextStepOf,
  sheetStepsOf,
  type NextStep,
  type SheetStepFacts,
  type SheetSteps,
} from "../sheet-steps.js";
import { BARE_STEP_FACTS } from "./sheet-step-facts.fixture.js";

const INSTANT = new Date("2030-01-15T10:00:00.000Z");
/** Le jour de la lecture ; les jours de contact s'écrivent relativement à lui. */
const TODAY = "2030-01-15";

const BARE_WORK: WorkLevelInput = {
  interlocutor: { name: "", email: "", phone: "" },
  notedContacts: 0,
  hasBillingAddress: false,
  deliveryAddressCount: 0,
  noDeliveryAddressNeeded: false,
  holderLoggedIn: false,
  activated: false,
  hasOrder: false,
};

/** Une SAS complète : identité, TVA, téléphone. */
const FULL_LEGAL: SheetStepFacts["legal"] = {
  raisonSociale: "Boulangerie X",
  formeJuridique: "SAS",
  siret: "12345678900011",
  vatNumber: "FR00123456789",
  primaryPhone: "0102030405",
  otherPhones: [],
};

function steps(
  facts: Partial<SheetStepFacts> = {},
  work: Partial<WorkLevelInput> = {},
): SheetSteps {
  return sheetStepsOf({ ...BARE_WORK, ...work }, { ...BARE_STEP_FACTS, ...facts }, TODAY);
}

const ON_ACCOUNT: Partial<SheetStepFacts> = { terms: { granted: ["monthly"], requested: null } };

describe("sheetStepsOf — fiche remplie", () => {
  it("dit « nom seul » d'une fiche sans aucune pièce ni SIRET", () => {
    expect(steps().legal).toEqual({
      done: 0,
      of: 4,
      missing: ["legal_identity", "vat", "phone", "billing_address"],
      nameOnly: true,
    });
  });

  it("n'est plus « nom seul » dès qu'un SIRET est saisi, même sans pièce complète", () => {
    const legal = { ...BARE_STEP_FACTS.legal, siret: "12345678900011" };
    expect(steps({ legal }).legal).toMatchObject({ done: 0, nameOnly: false });
  });

  it("compte quatre sur quatre une SAS complète avec adresse de facturation", () => {
    expect(steps({ legal: FULL_LEGAL }, { hasBillingAddress: true }).legal).toEqual({
      done: 4,
      of: 4,
      missing: [],
      nameOnly: false,
    });
  });

  it("ne réclame pas de TVA à une micro-entreprise", () => {
    const legal = { ...FULL_LEGAL, formeJuridique: "Micro-entreprise", vatNumber: "" };
    expect(steps({ legal }).legal.missing).not.toContain("vat");
  });

  it("réclame la TVA d'une SAS qui n'en a pas", () => {
    const legal = { ...FULL_LEGAL, vatNumber: "" };
    expect(steps({ legal }, { hasBillingAddress: true }).legal).toMatchObject({
      done: 3,
      missing: ["vat"],
    });
  });

  it("tient un autre interlocuteur joignable pour le téléphone", () => {
    const legal = { ...FULL_LEGAL, primaryPhone: "", otherPhones: ["0611223344"] };
    expect(steps({ legal }).legal.missing).not.toContain("phone");
  });
});

describe("sheetStepsOf — KBIS", () => {
  it("dit manquant, à vérifier, certifié", () => {
    expect(steps().kbis).toBe("missing");
    expect(steps({ kbis: { uploadedAt: INSTANT, certifiedAt: null } }).kbis).toBe("to_verify");
    expect(steps({ kbis: { uploadedAt: INSTANT, certifiedAt: INSTANT } }).kbis).toBe("certified");
  });
});

describe("sheetStepsOf — paiement", () => {
  it("à la commande : ni rythme ni moyen, prélèvement sans objet", () => {
    const read = steps();
    expect(read.payment).toEqual({
      terms: "on_order",
      requested: false,
      rhythm: null,
      means: null,
    });
    expect(read.debitReady).toBe("not_applicable");
  });

  it("dit une demande de crédit non accordée", () => {
    expect(steps({ terms: { granted: [], requested: "monthly" } }).payment.requested).toBe(true);
    expect(steps({ terms: { granted: ["monthly"], requested: "monthly" } }).payment.requested).toBe(
      false,
    );
  });

  it("au compte deux fois par mois, au prélèvement", () => {
    const read = steps({
      ...ON_ACCOUNT,
      collection: { rhythm: "semimonthly", means: "sepa_debit" },
    });
    expect(read.payment).toEqual({
      terms: "on_account",
      requested: false,
      rhythm: "semimonthly",
      means: "sepa_debit",
    });
  });

  it("au compte par virement : prélèvement sans objet, même sans RIB", () => {
    const read = steps({ ...ON_ACCOUNT, collection: { rhythm: "weekly", means: "bank_transfer" } });
    expect(read.payment.means).toBe("bank_transfer");
    expect(read.debitReady).toBe("not_applicable");
  });
});

describe("sheetStepsOf — prêt à prélever", () => {
  it.each<[Partial<SheetStepFacts>, SheetSteps["debitReady"]]>([
    [{}, "bank_account_missing"],
    [{ hasBankAccount: true }, "mandate_missing"],
    [{ hasBankAccount: true, hasActiveMandate: true }, "ready"],
    [{ hasBankAccount: true, hasActiveMandate: true, directDebitBlocked: true }, "blocked"],
    [{ directDebitBlocked: true }, "blocked"],
  ])("au compte au prélèvement %j → %s", (facts, expected) => {
    expect(steps({ ...ON_ACCOUNT, ...facts }).debitReady).toBe(expected);
  });
});

describe("sheetStepsOf — livraison, connexion, activation, commandes", () => {
  it("dit adresse, retrait, ou manquante", () => {
    expect(steps({}, { deliveryAddressCount: 1 }).delivery).toBe("address");
    expect(steps({}, { noDeliveryAddressNeeded: true }).delivery).toBe("pickup");
    expect(steps().delivery).toBe("missing");
  });

  it("recopie contact, connexion, activation et nombre de commandes", () => {
    const read = steps(
      { orderCount: 3, lastContactDay: "2030-01-12" },
      { notedContacts: 2, holderLoggedIn: true, activated: true },
    );
    expect(read).toMatchObject({
      contact: { last: "2030-01-12", daysAgo: 3 },
      login: true,
      activated: true,
      orders: 3,
    });
  });
});

describe("nextStepOf — l'ordre du plan", () => {
  /** Une fiche où tout est fait, que chaque cas défait d'une étape. */
  const done: SheetSteps = steps(
    { legal: FULL_LEGAL, lastContactDay: "2030-01-10" },
    { notedContacts: 1, hasBillingAddress: true, holderLoggedIn: true, activated: true },
  );
  const onAccount = (debitReady: SheetSteps["debitReady"]): SheetSteps => ({
    ...done,
    debitReady,
  });

  it.each<[string, boolean, SheetSteps, NextStep]>([
    ["sans suiveur, même tout fait", false, done, "assign"],
    ["sans contact", true, { ...done, contact: { last: null, daysAgo: null } }, "contact"],
    [
      "dernier contact il y a 31 jours, pas active",
      true,
      { ...done, activated: false, contact: { last: "2029-12-15", daysAgo: 31 } },
      "contact",
    ],
    [
      "dernier contact il y a 31 jours, active",
      true,
      { ...done, contact: { last: "2029-12-15", daysAgo: 31 } },
      "none",
    ],
    [
      "fiche incomplète",
      true,
      { ...done, legal: { ...done.legal, done: 3, missing: ["vat"] } },
      "complete_sheet",
    ],
    ["RIB manquant", true, onAccount("bank_account_missing"), "bank_account"],
    ["mandat à signer", true, onAccount("mandate_missing"), "mandate"],
    ["prélèvement bloqué : on passe à la suite", true, onAccount("blocked"), "none"],
    ["jamais connecté", true, { ...done, login: false }, "login"],
    ["pas activé", true, { ...done, activated: false }, "activate"],
    ["tout fait", true, done, "none"],
  ])("%s → %s", (_case, followed, read, expected) => {
    expect(nextStepOf(followed, read)).toBe(expected);
  });

  it("prend la PREMIÈRE étape manquante quand plusieurs manquent", () => {
    const bare = steps();
    expect(nextStepOf(false, bare)).toBe("assign");
    expect(nextStepOf(true, bare)).toBe("contact");
    expect(nextStepOf(true, { ...bare, contact: { last: TODAY, daysAgo: 0 } })).toBe(
      "complete_sheet",
    );
    expect(nextStepOf(true, { ...done, debitReady: "bank_account_missing", login: false })).toBe(
      "bank_account",
    );
    expect(nextStepOf(true, { ...done, login: false, activated: false })).toBe("login");
  });
});

describe("nextStepActorOf — qui doit agir", () => {
  const bare = steps();
  it.each([
    ["assign", "commercial"],
    ["contact", "commercial"],
    ["complete_sheet", "commercial"],
    ["bank_account", "commercial"],
    ["mandate", "client"],
    ["login", "client"],
    ["activate", "commercial"],
    ["none", "none"],
  ] as const)("%s → %s", (step, actor) => {
    expect(nextStepActorOf(step, bare)).toBe(actor);
  });

  it("rend la main à la comptabilité quand il ne reste qu'un prélèvement bloqué", () => {
    expect(nextStepActorOf("none", { ...bare, debitReady: "blocked" })).toBe("accounting");
    expect(nextStepActorOf("login", { ...bare, debitReady: "blocked" })).toBe("client");
  });
});
