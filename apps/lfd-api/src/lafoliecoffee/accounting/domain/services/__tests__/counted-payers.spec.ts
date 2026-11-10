import type { PayerStanding } from "../../ports/payer-standing.reader.js";
import type { CollectionMandate } from "../../ports/collection-mandates.reader.js";
import type { CollectionFormName } from "../../value-objects/collection-form.js";
import { countedPayerIdsAt, type CountingLotInputs } from "../counted-payers.js";
import { mandate } from "./collection-fixtures.js";

const AT = new Date("2026-10-08T09:00:00.000Z");
const ENTITY = "le1";

function lot(
  mandates: readonly CollectionMandate[],
  forms: ReadonlyMap<string, CollectionFormName> = new Map(),
  consumed: ReadonlySet<string> = new Set(),
): CountingLotInputs {
  return { mandates, collectionForms: forms, consumedMandates: consumed };
}

function standing(companyId: string, overrides: Partial<PayerStanding> = {}): PayerStanding {
  return { companyId, name: companyId, active: true, follows: [], ...overrides };
}

describe("countedPayerIdsAt — qui compte comme client d'une entité", () => {
  it("compte un payeur actif dont le mandat signé actif est chez l'entité", () => {
    const ids = countedPayerIdsAt(
      ENTITY,
      [standing("a")],
      lot([mandate("a", { creditorId: ENTITY })]),
      AT,
    );
    expect([...ids]).toEqual(["a"]);
  });

  /** Régression : un compte suspendu ou résilié comptait (2026-10-23). */
  it("une société désactivée comptait comme client", () => {
    const ids = countedPayerIdsAt(
      ENTITY,
      [standing("a", { active: false })],
      lot([mandate("a", { creditorId: ENTITY })]),
      AT,
    );
    expect(ids.size).toBe(0);
  });

  /** Régression : un payeur sans mandat comptait au mensuel (2026-10-23). */
  it("un client sans mandat signé comptait au mensuel", () => {
    expect(countedPayerIdsAt(ENTITY, [standing("a")], lot([]), AT).size).toBe(0);
  });

  it("un mandat chez une autre entité, ou sans créancier, ne compte pas", () => {
    const mandates = [mandate("a", { creditorId: "le2" }), mandate("b", { creditorId: null })];
    expect(countedPayerIdsAt(ENTITY, [standing("a"), standing("b")], lot(mandates), AT).size).toBe(
      0,
    );
  });

  it("deux mandats chez deux créanciers : ambigu, le lot l'écarterait — ne compte pas", () => {
    const mandates = [
      mandate("a", { creditorId: ENTITY }),
      mandate("a", { mandateId: "m2", creditorId: "le2" }),
    ];
    expect(countedPayerIdsAt(ENTITY, [standing("a")], lot(mandates), AT).size).toBe(0);
  });

  it("un site facturé chez un principal ne compte pas, même avec un mandat", () => {
    const site = standing("s", {
      follows: [
        { companyId: "s", payerId: "p", payerName: "p", validFrom: new Date(0), validTo: null },
      ],
    });
    expect(
      countedPayerIdsAt(ENTITY, [site], lot([mandate("s", { creditorId: ENTITY })]), AT).size,
    ).toBe(0);
  });

  it("un mandat de site (débiteur = principal) ne fait pas compter le site comme payeur", () => {
    const mandates = [mandate("a", { creditorId: ENTITY, debtorCompanyId: "p" })];
    expect(countedPayerIdsAt(ENTITY, [standing("a")], lot(mandates), AT).size).toBe(0);
  });

  it("un mandat ponctuel déjà déposé dans un lot ne compte plus — le lot l'écarterait", () => {
    const mandates = [mandate("a", { creditorId: ENTITY, paymentType: "one_off" })];
    const consumed = new Set(["m_a"]);
    expect(
      countedPayerIdsAt(ENTITY, [standing("a")], lot(mandates, new Map(), consumed), AT).size,
    ).toBe(0);
    expect([...countedPayerIdsAt(ENTITY, [standing("a")], lot(mandates), AT)]).toEqual(["a"]);
  });

  it("un site détaché de son principal règle seul : il compte sur son propre mandat", () => {
    const site = standing("s", {
      follows: [
        {
          companyId: "s",
          payerId: "p",
          payerName: "p",
          validFrom: new Date(0),
          validTo: new Date(AT.getTime() - 1),
        },
      ],
    });
    const ids = countedPayerIdsAt(ENTITY, [site], lot([mandate("s", { creditorId: ENTITY })]), AT);
    expect([...ids]).toEqual(["s"]);
  });

  it.each<CollectionFormName>(["own_mandate_principal_iban", "own_iban"])(
    "forme %s : le site ne compte pas, le principal seulement sur SON mandat",
    (form) => {
      const site = standing("s", {
        follows: [
          { companyId: "s", payerId: "p", payerName: "p", validFrom: new Date(0), validTo: null },
        ],
      });
      const siteMandate = mandate("s", { creditorId: ENTITY, debtorCompanyId: "p" });
      const forms = new Map([["s", form]]);
      expect(
        countedPayerIdsAt(ENTITY, [site, standing("p")], lot([siteMandate], forms), AT).size,
      ).toBe(0);
      const withPrincipal = lot([siteMandate, mandate("p", { creditorId: ENTITY })], forms);
      expect([...countedPayerIdsAt(ENTITY, [site, standing("p")], withPrincipal, AT)]).toEqual([
        "p",
      ]);
    },
  );
});
