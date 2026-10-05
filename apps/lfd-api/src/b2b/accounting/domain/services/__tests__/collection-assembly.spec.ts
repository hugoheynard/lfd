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
    consumedMandates: new Set(),
    companyNames: new Map([
      ["c_port", "Boulangerie du Port"],
      ["c_principal", "Club Principal"],
    ]),
    liveSchemes: [],
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
    const old = order("c_port", {
      placedAt: new Date("2026-08-20T08:00:00.000Z"),
      totalCents: 500,
    });
    const recent = order("c_port", { totalCents: 700 });

    const result = assembleCollection(
      input({ orders: [old, recent], mandates: [mandate("c_port")] }),
    );

    const [line] = result.debits.get("B2B") ?? [];
    expect(line).toMatchObject({ payerId: "c_port", amountCents: 1_200, priorOrderCount: 1 });
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
