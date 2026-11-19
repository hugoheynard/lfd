import type { OrderCutoffView, OrderLimitSpec } from "@lfd/contracts";

import { OrderCutoffGraceError, PastOrderCutoffError } from "../../errors/order-errors.js";
import { judgeOrderDeadline, type DeadlineLine } from "../../../../order-cutoffs/index.js";
import { admitWithinDeadline } from "../admit-within-deadline.js";

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

function line(sku: string, limit: OrderLimitSpec | null = null): DeadlineLine {
  return { sku, limit: limit === null ? null : { ...limit, staffMayExceed: false } };
}

function admit(over: {
  lines?: readonly DeadlineLine[];
  fallback?: readonly OrderCutoffView[];
  waiver?: { id: string } | null;
  now?: string;
}): string | null {
  const verdict = judgeOrderDeadline({
    lines: over.lines ?? [line("VIE-001")],
    generalRules: over.fallback ?? [commerceRule()],
    serviceDay: FULFILLMENT_DAY,
    at: new Date(over.now ?? CUTOFF_INSTANT),
    waiver: over.waiver ?? null,
    exceedItemLimits: false,
  });
  return admitWithinDeadline(verdict, FULFILLMENT_DAY).waiverUsed;
}

describe("la règle du commerce, pour les articles qui n'ont pas la leur", () => {
  it("laisse passer avant la limite", () => {
    expect(() => admit({ now: "2026-08-11T15:59:00.000Z" })).not.toThrow();
  });

  it("laisse passer PILE à la limite — elle est incluse", () => {
    expect(() => admit({ now: CUTOFF_INSTANT })).not.toThrow();
  });

  it("refuse définitivement après, quand aucune grâce n'est réglée", () => {
    try {
      admit({ now: "2026-08-11T16:01:00.000Z" });
      throw new Error("le refus attendu n'a pas eu lieu");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(PastOrderCutoffError);
      expect((error as PastOrderCutoffError).fulfillmentDate).toBe(FULFILLMENT_DAY);
    }
  });

  it("ne refuse rien quand aucune règle n'existe", () => {
    expect(() => admit({ fallback: [], now: "2030-01-01T00:00:00.000Z" })).not.toThrow();
  });

  /**
   * Les règles par point × jour sont retirées (Hugo, 2026-10-21, schéma des
   * réglages §4 point 4) : une ligne résiduelle du point qui fermait plus tôt
   * ne refuse plus rien ; seule la générale est opposée.
   */
  it("ignore une règle résiduelle du POINT : seule la générale est opposée", () => {
    const rules = [
      commerceRule({ id: "labo", pickupAddressId: "labo", daysBefore: 2, time: "12:00" }),
      commerceRule({ id: "dimanche", weekday: "wed", daysBefore: 2, time: "12:00" }),
      commerceRule(),
    ];
    // Lundi 10 à 12 h Paris = 10:00Z : passé pour les lignes résiduelles, pas pour la générale.
    const now = "2026-08-10T10:30:00.000Z";
    expect(() => admit({ fallback: rules, now })).not.toThrow();
  });
});

describe("la limite de l'ARTICLE, quand le référentiel en déclare une", () => {
  /** Le référentiel ferme cet article deux jours avant, à midi : lundi 10, 10:00Z. */
  const STRICT: OrderLimitSpec = { daysBefore: 2, time: "12:00", graceMinutes: 0 };
  /** Et celui-là le jour même à 23 h : mercredi 12, 21:00Z — bien plus tard. */
  const LOOSE: OrderLimitSpec = { daysBefore: 0, time: "23:00", graceMinutes: 0 };

  it("l'article plus TÔT que la règle gagne", () => {
    const now = "2026-08-10T10:30:00.000Z";
    // Le commerce laisserait passer (limite mardi 18 h) ; l'article, non.
    expect(() => admit({ lines: [line("ENT-001", STRICT)], now })).toThrow(PastOrderCutoffError);
    expect(() => admit({ lines: [line("VIE-001")], now })).not.toThrow();
  });

  /**
   * 🔴 La plus stricte gagne TOUJOURS (Hugo, 2026-10-21). Jusque-là l'article
   * REMPLAÇAIT la règle, et une limite plus tardive la relâchait.
   */
  it("l'article plus TARD que la règle ne la relâche pas : la règle gagne", () => {
    // 18:30 à Paris le mardi : le commerce a fermé à 18 h, l'article non.
    const now = "2026-08-11T16:30:00.000Z";
    expect(() => admit({ lines: [line("BOI-001", LOOSE)], now })).toThrow(PastOrderCutoffError);
  });

  it("règle générale désactivée (aucune en vigueur) : l'article seul décide", () => {
    const now = "2026-08-11T16:30:00.000Z";
    expect(() => admit({ fallback: [], lines: [line("BOI-001", LOOSE)], now })).not.toThrow();
    expect(() =>
      admit({ fallback: [], lines: [line("ENT-001", STRICT)], now: "2026-08-10T10:30:00.000Z" }),
    ).toThrow(PastOrderCutoffError);
  });

  /**
   * **Le panier ferme quand sa ligne la plus urgente ferme.** Un panier ne se
   * découpe pas : accepter les lignes ouvertes et refuser les autres
   * demanderait de savoir quoi faire d'une commande amputée, et personne ne l'a
   * décidé.
   */
  it("prend la ligne la plus fermée du panier", () => {
    const now = "2026-08-10T10:30:00.000Z";
    expect(() => admit({ lines: [line("BOI-001", LOOSE), line("ENT-001", STRICT)], now })).toThrow(
      PastOrderCutoffError,
    );
  });

  it("laisse passer un panier dont toutes les lignes sont encore ouvertes", () => {
    const now = "2026-08-09T10:00:00.000Z";
    expect(() =>
      admit({ lines: [line("BOI-001", LOOSE), line("ENT-001", STRICT), line("VIE-001")], now }),
    ).not.toThrow();
  });

  /**
   * Chaque limite garde SA grâce, et c'est la décision la plus fermée — grâce
   * comprise — qui est opposée : la grâce de l'article ne rouvre pas le refus
   * sec de la règle.
   */
  it("oppose le refus sec de la règle à la grâce d'un article de même heure", () => {
    const gracieux: OrderLimitSpec = { daysBefore: 1, time: "18:00", graceMinutes: 45 };
    expect(() =>
      admit({ lines: [line("ENT-001", gracieux)], now: "2026-08-11T16:10:00.000Z" }),
    ).toThrow(PastOrderCutoffError);
  });

  it("rend la grâce de la règle quand l'article, plus tardif, est encore ouvert", () => {
    try {
      admit({
        fallback: [commerceRule({ graceMinutes: 30 })],
        lines: [line("BOI-001", LOOSE)],
        now: "2026-08-11T16:10:00.000Z",
      });
      throw new Error("le refus attendu n'a pas eu lieu");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(OrderCutoffGraceError);
      expect((error as OrderCutoffGraceError).graceEndsAt.toISOString()).toBe(
        "2026-08-11T16:30:00.000Z",
      );
    }
  });

  /**
   * Hugo, 2026-10-21 (point 2) : une limite d'article n'a JAMAIS de grâce. Une
   * grâce encore rangée sur la ligne est ignorée — passée l'heure, refus sec.
   */
  it("ignore la grâce d'un article : passée son heure, refus sec", () => {
    const article: OrderLimitSpec = { daysBefore: 1, time: "17:00", graceMinutes: 90 };
    expect(() =>
      admit({ lines: [line("ENT-001", article)], now: "2026-08-11T15:30:00.000Z" }),
    ).toThrow(PastOrderCutoffError);
  });

  it("la grâce de la règle ne rouvre pas un article plus tôt déjà fermé", () => {
    const article: OrderLimitSpec = { daysBefore: 1, time: "17:30", graceMinutes: 60 };
    expect(() =>
      admit({
        fallback: [commerceRule({ graceMinutes: 20 })],
        lines: [line("ENT-001", article)],
        now: "2026-08-11T16:10:00.000Z",
      }),
    ).toThrow(PastOrderCutoffError);
  });

  /**
   * Une ligne en grâce et une ligne fermée : c'est la fermée qui l'emporte. Dire
   * « appelez-nous » alors qu'une des lignes ne peut plus être produite ferait
   * décrocher pour rien.
   */
  it("préfère le refus définitif à la grâce quand les deux coexistent", () => {
    const gracieux: OrderLimitSpec = { daysBefore: 1, time: "18:00", graceMinutes: 45 };
    expect(() =>
      admit({
        lines: [line("ENT-001", gracieux), line("PAI-001", STRICT)],
        now: "2026-08-11T16:10:00.000Z",
      }),
    ).toThrow(PastOrderCutoffError);
  });
});

describe("la dérogation, seul chemin de sortie", () => {
  /** Le seul rattrapage est celui de la règle du commerce (2026-10-21). */
  const GRACIEUSE = [commerceRule({ graceMinutes: 45 })];
  /** 18 h 10 à Paris le mardi : la limite est passée, le rattrapage court. */
  const DANS_LA_GRACE = "2026-08-11T16:10:00.000Z";

  it("laisse passer dans la grâce, et rend l'autorisation dépensée", () => {
    const spent = admit({
      fallback: GRACIEUSE,
      waiver: { id: "w1" },
      now: DANS_LA_GRACE,
    });
    // L'identifiant remonte : c'est l'appelant qui la consommera, APRÈS avoir
    // persisté la commande.
    expect(spent).toBe("w1");
  });

  it("ne rend rien quand la commande passe sans avoir eu besoin d'elle", () => {
    expect(admit({ waiver: { id: "w1" }, now: "2026-08-11T15:59:00.000Z" })).toBeNull();
  });

  /**
   * 🔴 **Une dérogation n'ouvre QUE la grâce.** Après le rattrapage, personne ne
   * passe — et ce n'est pas vérifié ici, c'est inexprimable : la branche qui
   * consulte l'autorisation n'existe que dans l'état `grace`.
   */
  it("n'ouvre RIEN une fois le rattrapage écoulé", () => {
    expect(() =>
      admit({
        fallback: GRACIEUSE,
        waiver: { id: "w1" },
        now: "2026-08-11T16:45:01.000Z",
      }),
    ).toThrow(PastOrderCutoffError);
  });

  /**
   * **Le back-office n'est plus exempté**, et c'est le sens de ce lot. Il l'a
   * été faute de mécanisme : l'équipe passait sans motif, sans auteur et sans
   * trace, et rien ne distinguait une décision d'un oubli. Elle passe désormais
   * par une dérogation comme tout le monde.
   */
  it("refuse une saisie du back-office sans dérogation, comme n'importe qui", () => {
    expect(() => admit({ fallback: GRACIEUSE, waiver: null, now: DANS_LA_GRACE })).toThrow(
      OrderCutoffGraceError,
    );
  });
});
