/**
 * **Le dossier staff montre les avenants** (`plan-tarif-date-sur-une-reference.md`,
 * T4) : une ligne d'avenant porte sa fenêtre, son état et son motif ; une
 * ligne de grille arrêtée porte sa fin ; une ligne inchangée garde la forme
 * d'avant les avenants. Dates comparées à `AT` de la fixture seulement.
 */
import { StaffAuthors } from "../../../../staff/directory/domain/staff-author-directory.js";
import { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { posedMercurialeView } from "../posed-mercuriale-view.js";

const NOW = new Date("2026-03-01T00:00:00.000Z");
const APRIL = new Date("2026-04-01T00:00:00.000Z");
const AT = new Date("2026-03-15T00:00:00.000Z");

const posed = (): CompanyMercuriale =>
  CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: "co_folie",
      label: "Mercuriale 2026",
      lines: [
        { sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 173_270 }] },
        { sku: "CRO-001", tiers: [{ minQuantity: 1, unitPriceMillicents: 90_000 }] },
      ],
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2026-12-31T00:00:00.000Z"),
    },
    "staff|marie",
  );

const amended = (): CompanyMercuriale =>
  posed().amend(
    "amd_1",
    {
      lines: [{ sku: "PAI-001", tiers: [{ minQuantity: 1, unitPriceMillicents: 150_000 }] }],
      endedSkus: ["CRO-001"],
      validFrom: APRIL,
      validTo: null,
      reason: "Ajout du pain, fin du croissant",
      origin: null,
    },
    "staff|paul",
    NOW,
  );

const view = (mercuriale: CompanyMercuriale) =>
  posedMercurialeView(mercuriale, AT, (sku) => sku, StaffAuthors.none());

describe("posedMercurialeView — les avenants", () => {
  it("une ligne d'avenant porte sa fenêtre, son état et son motif", () => {
    expect(view(amended()).lines.find((line) => line.sku === "PAI-001")).toEqual({
      sku: "PAI-001",
      productName: "PAI-001",
      unitPriceMillicents: 150_000,
      minQuantity: 1,
      validFrom: APRIL.toISOString(),
      validTo: "2026-12-31T00:00:00.000Z",
      status: "scheduled",
      amendmentId: "amd_1",
      amendmentReason: "Ajout du pain, fin du croissant",
    });
  });

  it("une ligne de grille arrêtée porte sa fin, sans avenant d'origine", () => {
    expect(view(amended()).lines.find((line) => line.sku === "CRO-001")).toMatchObject({
      validTo: APRIL.toISOString(),
      status: "active",
    });
  });

  it("une ligne inchangée garde la forme d'avant les avenants", () => {
    expect(view(amended()).lines.find((line) => line.sku === "VIE-012")).toEqual({
      sku: "VIE-012",
      productName: "VIE-012",
      unitPriceMillicents: 173_270,
      minQuantity: 1,
    });
  });

  it("compte les articles avenants compris, et liste les avenants", () => {
    const projected = view(amended());

    expect(projected.skuCount).toBe(3);
    expect(projected.amendments).toEqual([
      {
        id: "amd_1",
        validFrom: APRIL.toISOString(),
        validTo: null,
        reason: "Ajout du pain, fin du croissant",
        openedSkus: ["PAI-001"],
        endedSkus: ["CRO-001"],
        // Il ne touche pas la politique de promotions (`plan-la-mercuriale-decide.md`, § 8).
        promotionPolicy: null,
        createdBy: "staff|paul",
        createdByName: null,
      },
    ]);
  });
});
