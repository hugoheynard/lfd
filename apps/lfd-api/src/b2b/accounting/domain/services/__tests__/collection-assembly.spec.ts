import type { CollectionMandate } from "../../ports/collection-mandates.reader.js";
import type { BillingFollow } from "../../ports/statement-billing.reader.js";
import { assembleCollection, type AssemblyInput } from "../collection-assembly.js";
import { ENTITY_ID, SEPTEMBER, mandate, order } from "./collection-fixtures.js";

const AT = new Date("2026-10-02T09:00:00.000Z");

function input(overrides: Partial<AssemblyInput>): AssemblyInput {
  return {
    legalEntityId: ENTITY_ID,
    at: AT,
    cycleStartsAt: SEPTEMBER.startsAt,
    orders: [],
    follows: [],
    mandates: [],
    collectionForms: new Map(),
    consumedMandates: new Set(),
    companyNames: new Map([
      ["c_port", "Boulangerie du Port"],
      ["c_principal", "Club Principal"],
    ]),
    liveSchemes: [],
    invoices: new Map(),
    invoicingFloor: null,
    ...overrides,
  };
}

/** Le chalet suit le principal en `billing` depuis août ; `validTo` le détache. */
function follow(validTo: Date | null): BillingFollow {
  return {
    companyId: "c_chalet",
    payerId: "c_principal",
    payerName: "Club Principal",
    validFrom: new Date("2026-08-01T00:00:00.000Z"),
    validTo,
  };
}

describe("assembleCollection — qui paie quoi, sous quel mandat", () => {
  it("groupe les commandes d'un payeur en UNE ligne, et compte les reprises", () => {
    // Deux bons de 1 000 c (948 HT à 5,5 %) : la facture recalculée tombe
    // aussi à 2 000 c — l'écart est éprouvé dans `collection-assembly-invoice.spec.ts`.
    const old = order("c_port", { placedAt: new Date("2026-08-20T08:00:00.000Z") });
    const recent = order("c_port");

    const result = assembleCollection(
      input({ orders: [old, recent], mandates: [mandate("c_port")] }),
    );

    const [line] = result.debits.get("B2B") ?? [];
    expect(line).toMatchObject({
      payerId: "c_port",
      amountCents: 2_000,
      ordersTotalCents: 2_000,
      priorOrderCount: 1,
    });
    expect(result.exclusions).toEqual([]);
  });

  it("écarte `no_mandate` et NOMME la société — le lot ne se déposera pas (Q2)", () => {
    const result = assembleCollection(input({ orders: [order("c_port")] }));

    expect(result.exclusions.map((e) => e.reason)).toEqual(["no_mandate"]);
    expect(result.unmandatedCompanies).toEqual(["Boulangerie du Port"]);
  });

  it("débite le principal pour un site qui le suit encore", () => {
    const result = assembleCollection(
      input({
        orders: [order("c_chalet")],
        follows: [follow(null)],
        mandates: [mandate("c_principal")],
      }),
    );

    expect(result.debits.get("B2B")?.[0]?.payerId).toBe("c_principal");
  });

  it("écarte `payer_detached` un site détaché depuis — jamais débité d'office au principal", () => {
    const detached = follow(new Date("2026-10-01T08:00:00.000Z"));

    const result = assembleCollection(
      input({
        orders: [order("c_chalet")],
        follows: [detached],
        mandates: [mandate("c_principal")],
      }),
    );

    expect(result.exclusions.map((e) => e.reason)).toEqual(["payer_detached"]);
    expect(result.debits.size).toBe(0);
  });

  it("refuse l'ambiguïté : deux mandats actifs chez deux entités", () => {
    const result = assembleCollection(
      input({
        orders: [order("c_port")],
        mandates: [mandate("c_port"), mandate("c_port", { mandateId: "m_2", creditorId: "le_2" })],
      }),
    );

    expect(result.exclusions.map((e) => e.reason)).toEqual(["ambiguous_creditor"]);
  });

  it("laisse intacte une commande dont le mandat est chez une autre entité", () => {
    const result = assembleCollection(
      input({ orders: [order("c_port")], mandates: [mandate("c_port", { creditorId: "le_2" })] }),
    );

    expect(result.debits.size).toBe(0);
    expect(result.exclusions).toEqual([]);
  });

  it("compte comme absent un mandat sans créancier (RUM reprise)", () => {
    const result = assembleCollection(
      input({ orders: [order("c_port")], mandates: [mandate("c_port", { creditorId: null })] }),
    );

    expect(result.exclusions.map((e) => e.reason)).toEqual(["no_mandate"]);
  });

  it("écarte `one_off_consumed` un mandat ponctuel déjà prélevé", () => {
    const oneOff = mandate("c_port", { paymentType: "one_off" });

    const result = assembleCollection(
      input({
        orders: [order("c_port")],
        mandates: [oneOff],
        consumedMandates: new Set([oneOff.mandateId]),
      }),
    );

    expect(result.exclusions.map((e) => e.reason)).toEqual(["one_off_consumed"]);
  });

  it("laisse au lot suivant un schéma dont le lot de cette clôture vit déjà", () => {
    const result = assembleCollection(
      input({ orders: [order("c_port")], mandates: [mandate("c_port")], liveSchemes: ["B2B"] }),
    );

    expect(result.debits.size).toBe(0);
    expect(result.exclusions).toEqual([]);
  });

  it("range RCUR avant OOFF, puis par nom", () => {
    const result = assembleCollection(
      input({
        orders: [order("c_port"), order("c_principal")],
        mandates: [mandate("c_port", { paymentType: "one_off" }), mandate("c_principal")],
      }),
    );

    expect(result.debits.get("B2B")?.map((d) => d.payerId)).toEqual(["c_principal", "c_port"]);
  });
});

/**
 * S4 (`plan-sous-comptes.md` §2.1 ter) : le payeur COPIÉ à la passation, et le
 * mandat effectif choisi selon la forme de prélèvement du site à la clôture.
 */
describe("assembleCollection — les sites d'un principal (S4)", () => {
  const SITE_IBAN = "FR7630004000039876543210943";

  /** Un mandat porté par un site, qui nomme le principal débiteur. */
  function siteMandate(
    site: string,
    overrides: Partial<CollectionMandate> = {},
  ): CollectionMandate {
    return mandate(site, { debtorCompanyId: "c_principal", ...overrides });
  }

  it("lit le payeur copié, même sans période qui le couvre", () => {
    const copied = order("c_chalet", { billedCompanyId: "c_principal" });

    const result = assembleCollection(
      input({ orders: [copied], follows: [follow(null)], mandates: [mandate("c_principal")] }),
    );

    expect(result.debits.get("B2B")?.[0]?.payerId).toBe("c_principal");
  });

  it("forme 1 (mandat du principal) : les sites tombent sur UNE ligne du principal", () => {
    const result = assembleCollection(
      input({
        orders: [
          order("c_chalet", { billedCompanyId: "c_principal" }),
          order("c_chalet_2", { billedCompanyId: "c_principal" }),
        ],
        follows: [follow(null), { ...follow(null), companyId: "c_chalet_2" }],
        mandates: [mandate("c_principal"), siteMandate("c_chalet")],
      }),
    );

    const lines = result.debits.get("B2B") ?? [];
    expect(lines).toHaveLength(1);
    expect(lines[0]?.mandate.mandateId).toBe("m_c_principal");
  });

  it("forme 2 (mandat du site, RIB du principal) : une ligne PAR SITE, au nom du principal", () => {
    const result = assembleCollection(
      input({
        orders: [
          order("c_chalet", { billedCompanyId: "c_principal", totalCents: 300 }),
          order("c_chalet_2", { billedCompanyId: "c_principal", totalCents: 500 }),
        ],
        // Les deux sites suivent encore : un site détaché sortirait `payer_detached`.
        follows: [follow(null), { ...follow(null), companyId: "c_chalet_2" }],
        mandates: [mandate("c_principal"), siteMandate("c_chalet"), siteMandate("c_chalet_2")],
        collectionForms: new Map([
          ["c_chalet", "own_mandate_principal_iban"],
          ["c_chalet_2", "own_mandate_principal_iban"],
        ]),
      }),
    );

    const lines = result.debits.get("B2B") ?? [];
    expect(lines.map((line) => line.mandate.mandateId).sort()).toEqual([
      "m_c_chalet",
      "m_c_chalet_2",
    ]);
    expect(lines.every((line) => line.payerId === "c_principal")).toBe(true);
    expect(lines.every((line) => line.debtorName === "Club Principal")).toBe(true);
  });

  it("forme 3 (RIB propre) : le site est débité sur SON compte", () => {
    const result = assembleCollection(
      input({
        orders: [order("c_chalet", { billedCompanyId: "c_principal" })],
        follows: [follow(null)],
        mandates: [mandate("c_principal"), siteMandate("c_chalet", { iban: SITE_IBAN })],
        collectionForms: new Map([["c_chalet", "own_iban"]]),
      }),
    );

    expect(result.debits.get("B2B")?.[0]?.mandate.iban).toBe(SITE_IBAN);
  });

  it.each(["own_mandate_principal_iban", "own_iban"] as const)(
    "forme %s sans mandat de site : `no_mandate` nomme le SITE, jamais de repli sur le principal",
    (form) => {
      const result = assembleCollection(
        input({
          orders: [order("c_chalet", { billedCompanyId: "c_principal" })],
          follows: [follow(null)],
          mandates: [mandate("c_principal")],
          collectionForms: new Map([["c_chalet", form]]),
          companyNames: new Map([
            ["c_chalet", "Chalet"],
            ["c_principal", "Club Principal"],
          ]),
        }),
      );

      expect(result.debits.size).toBe(0);
      expect(result.exclusions.map((e) => e.reason)).toEqual(["no_mandate"]);
      expect(result.unmandatedCompanies).toEqual(["Chalet"]);
    },
  );

  it("n'emprunte jamais le mandat d'un site qui nomme un AUTRE débiteur", () => {
    const result = assembleCollection(
      input({
        orders: [order("c_chalet", { billedCompanyId: "c_principal" })],
        follows: [follow(null)],
        mandates: [mandate("c_principal"), siteMandate("c_chalet", { debtorCompanyId: "c_autre" })],
        collectionForms: new Map([["c_chalet", "own_iban"]]),
      }),
    );

    expect(result.debits.size).toBe(0);
    expect(result.exclusions.map((e) => e.reason)).toEqual(["no_mandate"]);
  });

  it("ne prend pas le mandat de site d'une société qui paie seule pour le sien", () => {
    // Le principal paie ses propres commandes : un mandat de site porté par
    // lui-même au nom d'un autre ne compte pas.
    const result = assembleCollection(
      input({
        orders: [order("c_port", { billedCompanyId: "c_port" })],
        mandates: [mandate("c_port", { debtorCompanyId: "c_principal" })],
      }),
    );

    expect(result.exclusions.map((e) => e.reason)).toEqual(["no_mandate"]);
  });
});
