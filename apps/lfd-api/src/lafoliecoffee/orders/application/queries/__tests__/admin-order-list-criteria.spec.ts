import { adminOrdersQuerySchema } from "@lfd/contracts";

import { InvalidOrderListDayError } from "../../../domain/errors/admin-order-list-errors.js";
import { adminOrderListCriteriaOf } from "../admin-order-list-criteria.js";

/**
 * Les jours de filtre → bornes. Les dates ici sont le SUJET (une conversion de
 * calendrier) et ne sont jamais comparées à l'horloge.
 */
const criteriaOf = (raw: Record<string, string>) =>
  adminOrderListCriteriaOf(adminOrdersQuerySchema.parse(raw));

describe("adminOrderListCriteriaOf", () => {
  it("borne la passation à minuit de PARIS, l'été comme l'hiver — jamais minuit UTC", () => {
    const summer = criteriaOf({ placedFrom: "2026-07-01", placedTo: "2026-07-01" });
    const winter = criteriaOf({ placedFrom: "2026-01-15", placedTo: "2026-01-15" });

    expect([summer.placedFrom?.toISOString(), summer.placedBefore?.toISOString()]).toEqual([
      "2026-06-30T22:00:00.000Z",
      "2026-07-01T22:00:00.000Z",
    ]);
    expect([winter.placedFrom?.toISOString(), winter.placedBefore?.toISOString()]).toEqual([
      "2026-01-14T23:00:00.000Z",
      "2026-01-15T23:00:00.000Z",
    ]);
  });

  it("couvre le jour du passage à l'heure d'hiver en entier (25 heures)", () => {
    const criteria = criteriaOf({ placedFrom: "2026-10-25", placedTo: "2026-10-25" });

    expect([criteria.placedFrom?.toISOString(), criteria.placedBefore?.toISOString()]).toEqual([
      "2026-10-24T22:00:00.000Z",
      "2026-10-25T23:00:00.000Z",
    ]);
  });

  it("laisse les jours de retrait en jours", () => {
    const criteria = criteriaOf({ fulfillmentFrom: "2026-10-01", fulfillmentTo: "2026-10-31" });

    expect([criteria.fulfillmentFrom, criteria.fulfillmentTo]).toEqual([
      "2026-10-01",
      "2026-10-31",
    ]);
  });

  it.each(["placedFrom", "placedTo", "fulfillmentFrom", "fulfillmentTo"])(
    "refuse un %s absent du calendrier plutôt que de glisser au jour suivant",
    (field) => {
      expect(() => criteriaOf({ [field]: "2026-02-30" })).toThrow(InvalidOrderListDayError);
    },
  );

  it("découpe la recherche en mots, sans mot vide", () => {
    expect(criteriaOf({ q: "  Léa   Martin " }).searchTerms).toEqual(["Léa", "Martin"]);
  });

  it("sans filtre, ne filtre rien", () => {
    expect(criteriaOf({})).toMatchObject({
      companyId: null,
      withSubAccounts: false,
      clientele: null,
      method: null,
      placedFrom: null,
      placedBefore: null,
      searchTerms: [],
      after: null,
      skip: 0,
      limit: 50,
    });
  });

  it("saute les pages précédentes : la page 3 de 50 commence à la 101ᵉ", () => {
    expect(criteriaOf({ page: "3" })).toMatchObject({ skip: 100, limit: 50 });
  });
});
