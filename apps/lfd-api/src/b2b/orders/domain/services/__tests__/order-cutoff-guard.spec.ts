import type { OrderCutoffView, OrderLimitSpec } from "@lfd/contracts";

import { OrderCutoffGraceError, PastOrderCutoffError } from "../../errors/order-errors.js";
import { ensureWithinOrderCutoff, type LineOrderLimit } from "../order-cutoff-guard.js";

/**
 * Les dates sont **absolues ici, et c'est l'exception écrite** : `now` est un
 * paramètre, jamais l'horloge. Elles ne sont donc comparées qu'entre elles, et
 * aucun jour du calendrier ne peut les faire basculer.
 *
 * Elles sont aussi choisies : le 12 août 2026 est un mercredi, en heure d'été
 * (UTC+2), et une limite « la veille à 18 h » tombe le mardi 11 à `16:00Z`. Un
 * décalage écrit en dur au lieu d'une vraie conversion passerait ici mais
 * casserait en janvier.
 */
const FULFILLMENT_DAY = "2026-08-12";
const CUTOFF_INSTANT = "2026-08-11T16:00:00.000Z";

function commerceRule(over: Partial<OrderCutoffView> = {}): OrderCutoffView {
  return {
    id: "def",
    pickupAddressId: null,
    pickupLabel: null,
    weekday: null,
    daysBefore: 1,
    time: "18:00",
    graceMinutes: 0,
    ...over,
  };
}

function line(sku: string, limit: OrderLimitSpec | null = null): LineOrderLimit {
  return { sku, limit };
}

function guard(over: {
  lines?: readonly LineOrderLimit[];
  fallback?: readonly OrderCutoffView[];
  pickupAddressId?: string | null;
  placedByStaffId?: string | null;
  now?: string;
}): void {
  ensureWithinOrderCutoff({
    lines: over.lines ?? [line("VIE-001")],
    fallback: over.fallback ?? [commerceRule()],
    pickupAddressId: over.pickupAddressId ?? null,
    fulfillmentDate: FULFILLMENT_DAY,
    placedByStaffId: over.placedByStaffId ?? null,
    now: new Date(over.now ?? CUTOFF_INSTANT),
  });
}

describe("la règle du commerce, pour les articles qui n'ont pas la leur", () => {
  it("laisse passer avant la limite", () => {
    expect(() => guard({ now: "2026-08-11T15:59:00.000Z" })).not.toThrow();
  });

  it("laisse passer PILE à la limite — elle est incluse", () => {
    expect(() => guard({ now: CUTOFF_INSTANT })).not.toThrow();
  });

  it("refuse définitivement après, quand aucune grâce n'est réglée", () => {
    try {
      guard({ now: "2026-08-11T16:01:00.000Z" });
      throw new Error("le refus attendu n'a pas eu lieu");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(PastOrderCutoffError);
      expect((error as PastOrderCutoffError).fulfillmentDate).toBe(FULFILLMENT_DAY);
    }
  });

  it("ne refuse rien quand aucune règle n'existe", () => {
    expect(() => guard({ fallback: [], now: "2030-01-01T00:00:00.000Z" })).not.toThrow();
  });

  it("oppose la règle du POINT plutôt que celle du défaut", () => {
    const rules = [
      commerceRule({ id: "labo", pickupAddressId: "labo", daysBefore: 2, time: "12:00" }),
      commerceRule(),
    ];
    // Lundi 10 à 12 h Paris = 10:00Z. Passé pour le labo, pas pour le défaut.
    const now = "2026-08-10T10:30:00.000Z";
    expect(() => guard({ fallback: rules, pickupAddressId: "labo", now })).toThrow(
      PastOrderCutoffError,
    );
    expect(() => guard({ fallback: rules, pickupAddressId: null, now })).not.toThrow();
  });
});

describe("la limite de l'ARTICLE, quand le référentiel en déclare une", () => {
  /** Le référentiel ferme cet article deux jours avant, à midi : lundi 10, 10:00Z. */
  const STRICT: OrderLimitSpec = { daysBefore: 2, time: "12:00", graceMinutes: 0 };
  /** Et celui-là le jour même à 23 h : mercredi 12, 21:00Z — bien plus tard. */
  const LOOSE: OrderLimitSpec = { daysBefore: 0, time: "23:00", graceMinutes: 0 };

  it("remplace la règle du commerce quand l'article en porte une", () => {
    const now = "2026-08-10T10:30:00.000Z";
    // Le commerce laisserait passer (limite mardi 18 h) ; l'article, non.
    expect(() => guard({ lines: [line("ENT-001", STRICT)], now })).toThrow(PastOrderCutoffError);
    expect(() => guard({ lines: [line("VIE-001")], now })).not.toThrow();
  });

  /**
   * 🔴 L'article ne se contente pas de resserrer : il **remplace**. Sans ça, le
   * rang `produit` ne pourrait jamais déclarer un article commandable plus tard
   * que le reste — c'est-à-dire l'usage même pour lequel il existe.
   */
  it("peut RELÂCHER par rapport à la règle du commerce", () => {
    // 18:30 à Paris le mardi : le commerce a fermé à 18 h, l'article non.
    const now = "2026-08-11T16:30:00.000Z";
    expect(() => guard({ lines: [line("VIE-001")], now })).toThrow(PastOrderCutoffError);
    expect(() => guard({ lines: [line("BOI-001", LOOSE)], now })).not.toThrow();
  });

  /**
   * **Le panier ferme quand sa ligne la plus urgente ferme.** Un panier ne se
   * découpe pas : accepter les lignes ouvertes et refuser les autres
   * demanderait de savoir quoi faire d'une commande amputée, et personne ne l'a
   * décidé.
   */
  it("prend la ligne la plus fermée du panier", () => {
    const now = "2026-08-10T10:30:00.000Z";
    expect(() => guard({ lines: [line("BOI-001", LOOSE), line("ENT-001", STRICT)], now })).toThrow(
      PastOrderCutoffError,
    );
  });

  it("laisse passer un panier dont toutes les lignes sont encore ouvertes", () => {
    const now = "2026-08-09T10:00:00.000Z";
    expect(() =>
      guard({ lines: [line("BOI-001", LOOSE), line("ENT-001", STRICT), line("VIE-001")], now }),
    ).not.toThrow();
  });

  /**
   * La grâce d'un article l'emporte sur un refus définitif du commerce — c'est
   * la conséquence directe du remplacement, et elle vaut d'être écrite : le
   * client reçoit « appelez-nous » là où il aurait eu « trop tard ».
   */
  it("rend la grâce de l'article, pas le refus sec du commerce", () => {
    const gracieux: OrderLimitSpec = { daysBefore: 1, time: "18:00", graceMinutes: 45 };
    try {
      guard({ lines: [line("ENT-001", gracieux)], now: "2026-08-11T16:10:00.000Z" });
      throw new Error("le refus attendu n'a pas eu lieu");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(OrderCutoffGraceError);
      expect((error as OrderCutoffGraceError).graceEndsAt.toISOString()).toBe(
        "2026-08-11T16:45:00.000Z",
      );
    }
  });

  /**
   * Une ligne en grâce et une ligne fermée : c'est la fermée qui l'emporte. Dire
   * « appelez-nous » alors qu'une des lignes ne peut plus être produite ferait
   * décrocher pour rien.
   */
  it("préfère le refus définitif à la grâce quand les deux coexistent", () => {
    const gracieux: OrderLimitSpec = { daysBefore: 1, time: "18:00", graceMinutes: 45 };
    expect(() =>
      guard({
        lines: [line("ENT-001", gracieux), line("PAI-001", STRICT)],
        now: "2026-08-11T16:10:00.000Z",
      }),
    ).toThrow(PastOrderCutoffError);
  });
});

describe("l'exemption du back-office", () => {
  /**
   * Exemption **datée** : elle tombe avec la dérogation (lot 6), qui deviendra
   * le seul chemin de sortie. Ce test changera alors de sens — et c'est voulu :
   * il documente une décision temporaire, pas un acquis.
   */
  it("n'oppose ni la règle du commerce ni celle de l'article", () => {
    const strict: OrderLimitSpec = { daysBefore: 9, time: "00:01", graceMinutes: 0 };
    expect(() =>
      guard({
        lines: [line("ENT-001", strict)],
        now: "2030-01-01T00:00:00.000Z",
        placedByStaffId: "staff_1",
      }),
    ).not.toThrow();
  });
});
