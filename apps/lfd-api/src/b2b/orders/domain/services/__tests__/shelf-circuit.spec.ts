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
 * `jour-meme-sur-stock.md` 3, lot L4).
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
const LEFT_TWO = [{ sku: "VIE-001-1", saleUnit: "piece" as const, estimatedStock: 2 }];
const NOTHING_LEFT = [{ sku: "VIE-001-1", saleUnit: "piece" as const, estimatedStock: 0 }];

describe("ensureShelfRevisionCovered", () => {
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

describe("pickupLeftToday — les frontières à la minute", () => {
  const MORNING_SLOTS: TodayPickupSite = {
    proPickup: null,
    publicRules: [{ start: "08:00", end: "10:00", slotMinutes: 30 }],
    publicClosures: [],
  };

  // Un créneau qui commence EXACTEMENT maintenant n'est plus « après » :
  // le client n'a plus le temps d'y venir (début strict).
  it("un créneau qui commence à la minute même ne compte plus ; une minute avant, si", () => {
    expect(pickupLeftToday("public_online", MORNING_SLOTS, "09:29")).toBe(true);
    expect(pickupLeftToday("public_online", MORNING_SLOTS, "09:30")).toBe(false);
  });

  // Les fermetures sont des intervalles ouverts aux extrémités : une
  // fermeture qui finit où le créneau commence (ou commence où il finit)
  // ne l'entame pas.
  it("une fermeture qui touche le dernier créneau sans le recouvrir le laisse ouvert", () => {
    const before = { ...MORNING_SLOTS, publicClosures: [{ start: "08:00", end: "09:30" }] };
    const after = { ...MORNING_SLOTS, publicClosures: [{ start: "10:00", end: "12:00" }] };
    expect(pickupLeftToday("public_online", before, "08:00")).toBe(true);
    expect(pickupLeftToday("public_online", after, "09:00")).toBe(true);
  });

  it("une fermeture qui mord d'une minute sur le dernier créneau le retire", () => {
    const bites = { ...MORNING_SLOTS, publicClosures: [{ start: "08:00", end: "09:31" }] };
    expect(pickupLeftToday("public_online", bites, "08:00")).toBe(false);
  });

  it("une fermeture sans début ferme jusqu'à sa fin, sans début ferme toute la matinée", () => {
    const untilNine = { ...MORNING_SLOTS, publicClosures: [{ start: null, end: "09:00" }] };
    expect(pickupLeftToday("public_online", untilNine, "07:00")).toBe(true);
    const fromNine = { ...MORNING_SLOTS, publicClosures: [{ start: "09:00", end: null }] };
    expect(pickupLeftToday("public_online", fromNine, "07:00")).toBe(true);
    expect(pickupLeftToday("public_online", fromNine, "08:30")).toBe(false);
  });

  it("une fermeture n'entame pas la fenêtre pro : elle ne vise que le public", () => {
    const site: TodayPickupSite = {
      proPickup: { start: "06:00", end: "11:00" },
      publicRules: [],
      publicClosures: [{ start: null, end: null }],
    };
    expect(pickupLeftToday("pro_online", site, "10:00")).toBe(true);
  });

  it("le pro sans fenêtre, ou sans site, ne sert pas aujourd'hui", () => {
    expect(pickupLeftToday("pro_online", NO_SITE_HOURS, "06:00")).toBe(false);
    expect(pickupLeftToday("pro_online", null, "06:00")).toBe(false);
  });

  it("un créneau de durée nulle vaut la plage entière, une seule fois", () => {
    const whole: TodayPickupSite = {
      proPickup: null,
      publicRules: [{ start: "08:00", end: "10:00", slotMinutes: 0 }],
      publicClosures: [],
    };
    expect(pickupLeftToday("public_online", whole, "07:59")).toBe(true);
    expect(pickupLeftToday("public_online", whole, "08:00")).toBe(false);
  });

  it("une plage plus courte qu'un créneau n'en donne aucun", () => {
    const short: TodayPickupSite = {
      proPickup: null,
      publicRules: [{ start: "08:00", end: "08:20", slotMinutes: 30 }],
      publicClosures: [],
    };
    expect(pickupLeftToday("public_online", short, "06:00")).toBe(false);
  });
});

describe("ensureShelfStockCovers — les frontières du reste", () => {
  const piece = (estimatedStock: number) => [
    { sku: "VIE-001-1", saleUnit: "piece" as const, estimatedStock },
  ];

  // Reste == demande passe ; reste + 1 demandé refuse.
  it("la demande égale au reste passe, une pièce de plus est refusée", () => {
    expect(() => ensureShelfStockCovers([line(5)], piece(5))).not.toThrow();
    expect(() => ensureShelfStockCovers([line(6)], piece(5))).toThrow(ShelfStockShortError);
  });

  it("deux lignes du même article dont la somme égale le reste passent", () => {
    expect(() => ensureShelfStockCovers([line(2), line(3)], piece(5))).not.toThrow();
  });

  // Le même SKU vendu en pièces ET au poids : deux stocks, jamais confondus.
  it("le même SKU en deux unités se juge unité par unité", () => {
    const both = [
      { sku: "VIE-001-1", saleUnit: "piece" as const, estimatedStock: 2 },
      { sku: "VIE-001-1", saleUnit: "weight" as const, estimatedStock: 500 },
    ];
    const grams = line(500, { saleUnit: "weight" });
    expect(() => ensureShelfStockCovers([line(2), grams], both)).not.toThrow();
    expect(() =>
      ensureShelfStockCovers([line(2), line(501, { saleUnit: "weight" })], both),
    ).toThrow(ShelfStockShortError);
    // Les pièces ne se somment pas avec les grammes.
    expect(() => ensureShelfStockCovers([line(2), line(1)], both)).toThrow(ShelfStockShortError);
  });

  it("un reste négatif se dit « plus en vitrine », jamais un reste négatif", () => {
    expect(() => ensureShelfStockCovers([line(1)], piece(-2))).toThrow("n'est plus en vitrine");
  });

  it("un reste de zéro refuse la première pièce", () => {
    expect(() => ensureShelfStockCovers([line(1)], piece(0))).toThrow("n'est plus en vitrine");
  });

  it("aucune ligne ne demande rien : même une vitrine vide laisse passer", () => {
    expect(() => ensureShelfStockCovers([], [])).not.toThrow();
  });

  it("le stock d'un autre article ne couvre pas celui-ci", () => {
    const other = [{ sku: "PAI-001-1", saleUnit: "piece" as const, estimatedStock: 99 }];
    expect(() => ensureShelfStockCovers([line(1)], other)).toThrow(ShelfStockShortError);
  });
});

describe("ensureShelfRevisionCovered — les frontières de la hausse", () => {
  const piece = (estimatedStock: number) => [
    { sku: "VIE-001-1", saleUnit: "piece" as const, estimatedStock },
  ];

  it("une révision à l'identique passe sur une vitrine vide", () => {
    expect(() => ensureShelfRevisionCovered([line(5)], [line(5)], piece(0))).not.toThrow();
  });

  it("une hausse égale au reste passe, d'une pièce de plus est refusée", () => {
    expect(() => ensureShelfRevisionCovered([line(5)], [line(7)], piece(2))).not.toThrow();
    expect(() => ensureShelfRevisionCovered([line(5)], [line(8)], piece(2))).toThrow(
      ShelfStockShortError,
    );
  });

  it("deux lignes du même article s'additionnent des deux côtés avant de comparer", () => {
    // Avant 2+3, après 4+4 : hausse de 3, que le reste de 3 couvre.
    expect(() =>
      ensureShelfRevisionCovered([line(2), line(3)], [line(4), line(4)], piece(3)),
    ).not.toThrow();
    expect(() =>
      ensureShelfRevisionCovered([line(2), line(3)], [line(4), line(4)], piece(2)),
    ).toThrow(ShelfStockShortError);
  });

  // Passer 500 g de terrine à 500 g + 1 pièce : la pièce est une hausse
  // d'une AUTRE unité, elle ne s'efface pas contre les grammes tenus.
  it("le même SKU ajouté dans une autre unité est une hausse, pas une compensation", () => {
    const grams = line(500, { saleUnit: "weight" });
    const stock = [{ sku: "VIE-001-1", saleUnit: "weight" as const, estimatedStock: 0 }];
    expect(() => ensureShelfRevisionCovered([grams], [grams, line(1)], stock)).toThrow(
      ShelfStockShortError,
    );
  });

  it("une baisse d'une unité ne finance pas la hausse de l'autre", () => {
    const stock = [{ sku: "VIE-001-1", saleUnit: "piece" as const, estimatedStock: 0 }];
    const before = [line(2), line(500, { saleUnit: "weight" })];
    const after = [line(3), line(100, { saleUnit: "weight" })];
    expect(() => ensureShelfRevisionCovered(before, after, stock)).toThrow(ShelfStockShortError);
  });

  it("une ligne scindée dont le total ne bouge pas passe sur une vitrine vide", () => {
    expect(() => ensureShelfRevisionCovered([line(5)], [line(3), line(2)], piece(0))).not.toThrow();
  });

  it("tout retirer rend le stock, même vitrine vide", () => {
    expect(() => ensureShelfRevisionCovered([line(5)], [], piece(0))).not.toThrow();
  });

  it("une ligne à zéro n'est pas une hausse, même sur un article absent de la vitrine", () => {
    const bread = line(0, { sku: "PAI-001-1", productName: "Pain" });
    expect(() => ensureShelfRevisionCovered([line(5)], [line(5), bread], piece(0))).not.toThrow();
  });

  it("un reste négatif (survente) refuse la hausse comme un article disparu", () => {
    expect(() => ensureShelfRevisionCovered([line(5)], [line(6)], piece(-3))).toThrow(
      "« Croissant » n'est plus en vitrine",
    );
  });
});
