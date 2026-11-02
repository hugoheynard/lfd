import { ShelfStockShortError } from "../../errors/shelf-circuit-errors.js";
import {
  ensureShelfRevisionCovered,
  ensureShelfStockCovers,
  pickupLeftToday,
  type ShelfClaimLine,
  type TodayPickupSite,
} from "../shelf-circuit.js";

/**
 * Les règles pures du circuit du jour J à la passation (plan
 * `plan-jour-meme-sur-stock.md`, §11.1, §12 bloquant 3, lot L4).
 */

const NO_SITE_HOURS: TodayPickupSite = { proPickup: null, publicRules: [], publicClosures: [] };

const MORNING: TodayPickupSite = {
  ...NO_SITE_HOURS,
  // 08:00, 08:30, 09:00, 09:30.
  publicRules: [{ start: "08:00", end: "10:00", slotMinutes: 30 }],
};

describe("pickupLeftToday — le particulier", () => {
  it("garde le point tant qu'un créneau commence après maintenant", () => {
    expect(pickupLeftToday("public_online", MORNING, "09:15")).toBe(true);
  });

  it("le dernier créneau commencé, le point ne sert plus aujourd'hui", () => {
    expect(pickupLeftToday("public_online", MORNING, "09:30")).toBe(false);
  });

  it("une fermeture qui entame les créneaux restants les retire", () => {
    const closed = { ...MORNING, publicClosures: [{ start: "09:00", end: "10:00" }] };
    expect(pickupLeftToday("public_online", closed, "08:45")).toBe(false);
  });

  it("une fermeture de la journée entière ferme tout", () => {
    const closed = { ...MORNING, publicClosures: [{ start: null, end: null }] };
    expect(pickupLeftToday("public_online", closed, "06:00")).toBe(false);
  });

  it("sans créneau public, jamais un horaire inventé", () => {
    expect(pickupLeftToday("public_online", NO_SITE_HOURS, "06:00")).toBe(false);
    expect(pickupLeftToday("public_online", null, "06:00")).toBe(false);
  });
});

describe("pickupLeftToday — le pro et le comptoir", () => {
  const PRO: TodayPickupSite = { ...NO_SITE_HOURS, proPickup: { start: "06:00", end: "11:00" } };

  it("le pro en ligne : la fenêtre pro, tant qu'elle n'est pas finie", () => {
    expect(pickupLeftToday("pro_online", PRO, "10:59")).toBe(true);
    expect(pickupLeftToday("pro_online", PRO, "11:00")).toBe(false);
  });

  it("le pro en ligne ne lit pas les créneaux publics", () => {
    expect(pickupLeftToday("pro_online", MORNING, "08:00")).toBe(false);
  });

  it("le comptoir : aucune garde, le client est devant le vendeur", () => {
    expect(pickupLeftToday("counter", null, "23:59")).toBe(true);
  });
});

function line(quantity: number, overrides: Partial<ShelfClaimLine> = {}): ShelfClaimLine {
  return { sku: "VIE-001-1", productName: "Croissant", saleUnit: "piece", quantity, ...overrides };
}

describe("ensureShelfStockCovers", () => {
  const STOCK = [
    { sku: "VIE-001-1", saleUnit: "piece" as const, estimatedStock: 3 },
    { sku: "TER-001-1", saleUnit: "weight" as const, estimatedStock: 1_250 },
  ];

  it("laisse passer jusqu'au dernier article", () => {
    expect(() => ensureShelfStockCovers([line(3)], STOCK)).not.toThrow();
  });

  it("refuse au-delà du reste, en nommant ce qui reste", () => {
    expect(() => ensureShelfStockCovers([line(4)], STOCK)).toThrow(
      "Il ne reste que 3 « Croissant » en vitrine",
    );
  });

  it("additionne deux lignes du même article avant de juger", () => {
    expect(() => ensureShelfStockCovers([line(2), line(2)], STOCK)).toThrow(ShelfStockShortError);
  });

  it("refuse un article absent du stock du jour : le panier mixte", () => {
    expect(() =>
      ensureShelfStockCovers([line(1), line(1, { sku: "PAT-002-1", productName: "Bûche" })], STOCK),
    ).toThrow("« Bûche » n'est plus en vitrine à ce point aujourd'hui");
  });

  it("compte le poids en grammes, jamais contre des pièces", () => {
    const terrine = { sku: "TER-001-1", productName: "Terrine", saleUnit: "weight" as const };
    expect(() => ensureShelfStockCovers([line(1_250, terrine)], STOCK)).not.toThrow();
    expect(() => ensureShelfStockCovers([line(1_300, terrine)], STOCK)).toThrow("1,25 kg");
    expect(() =>
      ensureShelfStockCovers([line(1, { ...terrine, saleUnit: "piece" })], STOCK),
    ).toThrow(ShelfStockShortError);
  });
});

/**
 * Lot L5 : le reste lu compte déjà la commande révisée — seules les hausses
 * s'y jugent, une baisse rend le stock.
 */
describe("ensureShelfRevisionCovered", () => {
  const LEFT_TWO = [{ sku: "VIE-001-1", saleUnit: "piece" as const, estimatedStock: 2 }];
  const NOTHING_LEFT = [{ sku: "VIE-001-1", saleUnit: "piece" as const, estimatedStock: 0 }];

  it("laisse passer une hausse que le reste couvre", () => {
    expect(() => ensureShelfRevisionCovered([line(5)], [line(7)], LEFT_TWO)).not.toThrow();
  });

  it("refuse une hausse au-delà du reste, en nommant la quantité ajoutée", () => {
    expect(() => ensureShelfRevisionCovered([line(5)], [line(8)], LEFT_TWO)).toThrow(
      "Il ne reste que 2 « Croissant » en vitrine à ce point aujourd'hui (demandé : 3)",
    );
  });

  it("une baisse passe même quand la vitrine est vide", () => {
    expect(() => ensureShelfRevisionCovered([line(5)], [line(1)], NOTHING_LEFT)).not.toThrow();
  });

  it("retirer un article et en baisser un autre ne se refuse jamais", () => {
    const bread = line(2, { sku: "PAI-001-1", productName: "Pain" });
    expect(() => ensureShelfRevisionCovered([line(5), bread], [line(4)], [])).not.toThrow();
  });

  it("un article ajouté absent de la vitrine est refusé", () => {
    const bread = line(1, { sku: "PAI-001-1", productName: "Pain" });
    expect(() => ensureShelfRevisionCovered([line(5)], [line(5), bread], LEFT_TWO)).toThrow(
      "« Pain » n'est plus en vitrine",
    );
  });

  it("compte le poids en grammes, par unité", () => {
    const terrine = { sku: "TER-001-1", productName: "Terrine", saleUnit: "weight" as const };
    const stock = [{ sku: "TER-001-1", saleUnit: "weight" as const, estimatedStock: 250 }];
    expect(() =>
      ensureShelfRevisionCovered([line(1_000, terrine)], [line(1_250, terrine)], stock),
    ).not.toThrow();
    expect(() =>
      ensureShelfRevisionCovered([line(1_000, terrine)], [line(1_251, terrine)], stock),
    ).toThrow(ShelfStockShortError);
  });
});
