import { z } from "zod";

import {
  checkJournalFact,
  isJournalFactType,
  JOURNAL_FACT_FAMILIES,
  JOURNAL_FACT_TYPES,
  JOURNAL_FACTS,
  JOURNAL_UNITS,
  type JournalValueMeta,
} from "../index.js";

/**
 * Le catalogue des faits (D1 du plan des phrases du journal) : la liste des
 * types du journal d'activité, et la charge de chacun.
 */
describe("le catalogue des faits", () => {
  it("réunit ses familles sans qu'aucune n'en écrase une autre", () => {
    const perFamily = Object.values(JOURNAL_FACT_FAMILIES).flatMap((family) => Object.keys(family));

    expect(new Set(perFamily).size).toBe(perFamily.length);
    expect(perFamily.length).toBe(JOURNAL_FACT_TYPES.length);
  });

  it("nomme chaque type `sujet.verbe`, en minuscules — c'est le préfixe qui range le module", () => {
    const malformed = JOURNAL_FACT_TYPES.filter((type) => !/^[a-z_]+\.[a-z0-9_]+$/u.test(type));

    expect(malformed).toEqual([]);
  });

  it("garde au catalogue les types retirés, encore en base", () => {
    const retired = JOURNAL_FACT_TYPES.filter((type) => JOURNAL_FACTS[type].retired);

    expect(retired.sort()).toEqual([
      "company.delivery_procedure_edited_by_staff",
      "company.kbis_uploaded_by_staff",
      "staff_user.deleted",
      "variant.regulatory_aligned",
    ]);
  });

  it("porte l'unité d'un montant dans son schéma, là où le moteur de phrases la lira", () => {
    const placed = JOURNAL_FACTS["order.placed"].payload;
    const price = JOURNAL_FACTS["catalog_item.b2b_price_set"].payload;

    expect(metaOf(placed.shape.totalCents)).toEqual({ unit: "cents" });
    expect(metaOf(price.shape.after.shape.priceMillicents)).toEqual({ unit: "millicents" });
    expect(JOURNAL_UNITS).toContain("basisPoints");
  });

  it("marque un identifiant nu par ce qu'il désigne — la liste de travail du lot B", () => {
    const reclassified = JOURNAL_FACTS["product.reclassified"].payload;

    expect(metaOf(reclassified.shape.from)).toEqual({ ref: "product_category" });
  });
});

describe("checkJournalFact — la confrontation à l'écriture", () => {
  it("laisse passer un fait conforme", () => {
    expect(checkJournalFact("company.kbis_uploaded", { fileName: "kbis.pdf" })).toBeNull();
    expect(isJournalFactType("company.kbis_uploaded")).toBe(true);
  });

  it("nomme un type inconnu", () => {
    expect(checkJournalFact("company.teleported", {})).toMatchObject({
      kind: "unknown_type",
      message: expect.stringContaining("company.teleported"),
    });
    expect(isJournalFactType("company.teleported")).toBe(false);
  });

  it("refuse un type retiré — il se lit, il ne s'écrit plus", () => {
    expect(checkJournalFact("staff_user.deleted", { person: {}, roleLabel: "" })).toMatchObject({
      kind: "retired_type",
    });
  });

  it("nomme la clé fautive d'une charge", () => {
    expect(checkJournalFact("order_late_fee.cleared", { before: { fee: {} } })).toMatchObject({
      kind: "invalid_payload",
      message: expect.stringContaining("before.fee"),
    });
  });

  it("refuse une clé que le schéma ne décrit pas : une clé sans nom se perdrait à l'écran", () => {
    expect(
      checkJournalFact("company.kbis_uploaded", { fileName: "kbis.pdf", iban: "FR76" }),
    ).toMatchObject({ kind: "invalid_payload", message: expect.stringContaining("iban") });
  });

  it("n'est pas dupe d'un nom hérité de l'objet (`toString`, `constructor`)", () => {
    expect(checkJournalFact("toString", {})).toMatchObject({ kind: "unknown_type" });
    expect(checkJournalFact("constructor", {})).toMatchObject({ kind: "unknown_type" });
  });
});

function metaOf(schema: z.ZodType): JournalValueMeta | undefined {
  return schema.meta();
}
