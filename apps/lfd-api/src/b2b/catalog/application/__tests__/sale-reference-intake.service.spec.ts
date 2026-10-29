import {
  P_X_ALIASED,
  TableSaleSkuAliasReader,
} from "../../domain/__tests__/sale-sku-alias.doubles.js";
import { SaleReferenceIntake } from "../sale-reference-intake.service.js";
import { intakeOver, RecordingAliasResolutions } from "./sale-reference-intake.doubles.js";

/**
 * La porte d'entrée des références de vente
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 5).
 */
describe("SaleReferenceIntake", () => {
  it("une ancienne référence entre sous l'article qu'elle désigne, le reste de la ligne intact", async () => {
    const intake = intakeOver(P_X_ALIASED);

    const lines = await intake.normalized(
      [{ sku: "P-X", quantity: 3, saleUnit: "piece" as const }],
      "order",
    );

    expect(lines).toEqual([{ sku: "P-X-1", quantity: 3, saleUnit: "piece" }]);
  });

  it("vers la cible de la TABLE, jamais vers un autre article de la fiche", async () => {
    const intake = intakeOver(P_X_ALIASED);

    const lines = await intake.normalized(
      [
        { sku: "P-X-2", quantity: 1 },
        { sku: "P-Y", quantity: 1 },
      ],
      "shop_quote",
    );

    expect(lines.map((line) => line.sku)).toEqual(["P-X-2", "P-Y"]);
  });

  it("deux graphies d'un même article sortent sous la même référence (la tarification fusionne)", async () => {
    const intake = intakeOver(P_X_ALIASED);

    const lines = await intake.normalized(
      [
        { sku: "P-X", quantity: 2 },
        { sku: "P-X-1", quantity: 5 },
      ],
      "order",
    );

    expect(lines.map((line) => line.sku)).toEqual(["P-X-1", "P-X-1"]);
  });

  it("chaque résolution est comptée, une fois par référence, avec sa porte", async () => {
    const resolutions = new RecordingAliasResolutions();
    const intake = intakeOver(P_X_ALIASED, resolutions);

    await intake.normalized(
      [
        { sku: "P-X", quantity: 1 },
        { sku: "P-X", quantity: 1 },
        { sku: "P-Y", quantity: 1 },
      ],
      "shop_cart",
    );

    expect(resolutions.recorded).toEqual([
      { entry: "shop_cart", resolved: [{ aliasSku: "P-X", targetSku: "P-X-1" }] },
    ]);
  });

  it("sans alias (aujourd'hui) : les lignes rendues telles quelles, rien de compté", async () => {
    const resolutions = new RecordingAliasResolutions();
    const intake = intakeOver([], resolutions);
    const received = [{ sku: "P-X", quantity: 1 }];

    const lines = await intake.normalized(received, "order_draft");

    expect(lines).toBe(received);
    expect(resolutions.recorded).toEqual([]);
  });

  it("un panier vide ne lit rien", async () => {
    const reader = new TableSaleSkuAliasReader(P_X_ALIASED);
    const intake = new SaleReferenceIntake(reader, new RecordingAliasResolutions());

    expect(await intake.normalized([], "quote")).toEqual([]);
    expect(reader.asked).toEqual([]);
  });
});
