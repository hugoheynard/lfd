import type { OrderCutoffView } from "@lfd/contracts";

import { OrderCutoffGraceError, PastOrderCutoffError } from "../../errors/order-errors.js";
import { ensureWithinOrderCutoff } from "../order-cutoff-guard.js";

/**
 * Les dates sont **absolues ici, et c'est l'exception écrite** : `now` est un
 * paramètre, jamais l'horloge. Elles ne sont donc comparées qu'entre elles, et
 * aucun jour du calendrier ne peut les faire basculer.
 *
 * Elles sont aussi choisies : le 12 août 2026 est un mercredi, en heure d'été
 * (UTC+2), et la limite du défaut tombe le mardi 11 à 18 h de Paris — soit
 * `16:00Z`. Un décalage écrit en dur au lieu d'une vraie conversion passerait
 * ici mais casserait en janvier.
 */
const FULFILLMENT_DAY = "2026-08-12";
const CUTOFF_INSTANT = "2026-08-11T16:00:00.000Z";

function rule(over: Partial<OrderCutoffView> = {}): OrderCutoffView {
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

function guard(over: {
  rules?: readonly OrderCutoffView[];
  pickupAddressId?: string | null;
  placedByStaffId?: string | null;
  now?: string;
}): void {
  ensureWithinOrderCutoff({
    rules: over.rules ?? [rule()],
    pickupAddressId: over.pickupAddressId ?? null,
    fulfillmentDate: FULFILLMENT_DAY,
    placedByStaffId: over.placedByStaffId ?? null,
    now: new Date(over.now ?? CUTOFF_INSTANT),
  });
}

describe("ensureWithinOrderCutoff", () => {
  it("laisse passer avant la limite", () => {
    expect(() => guard({ now: "2026-08-11T15:59:00.000Z" })).not.toThrow();
  });

  it("laisse passer PILE à la limite — elle est incluse", () => {
    expect(() => guard({ now: CUTOFF_INSTANT })).not.toThrow();
  });

  it("refuse définitivement après la limite quand aucune grâce n'est réglée", () => {
    try {
      guard({ now: "2026-08-11T16:01:00.000Z" });
      throw new Error("le refus attendu n'a pas eu lieu");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(PastOrderCutoffError);
      expect((error as PastOrderCutoffError).fulfillmentDate).toBe(FULFILLMENT_DAY);
    }
  });

  /**
   * Le défaut volontaire du contrat, et la garantie que brancher la règle ne
   * change **rien** pour une plateforme qui n'a rien configuré.
   */
  it("ne refuse rien quand aucune règle n'existe", () => {
    expect(() => guard({ rules: [], now: "2030-01-01T00:00:00.000Z" })).not.toThrow();
  });

  /**
   * L'exemption **datée** du back-office : tant que la dérogation n'existe pas
   * (lot 3), opposer la limite à l'équipe lui retirerait une capacité sans rien
   * lui donner. Ce test tombera avec elle — et c'est voulu : il documente une
   * décision temporaire, pas un acquis.
   */
  it("n'oppose pas la limite à une saisie du back-office", () => {
    expect(() =>
      guard({ now: "2030-01-01T00:00:00.000Z", placedByStaffId: "staff_1" }),
    ).not.toThrow();
  });

  describe("avec une grâce réglée", () => {
    const GRACIOUS = [rule({ graceMinutes: 45 })];

    /**
     * Deux erreurs et non un drapeau, parce que ce qui les distingue est **ce
     * que le lecteur doit faire** : changer de date, ou décrocher. Un code
     * unique aurait fait dire la même phrase aux deux, et le rattrapage
     * n'aurait servi à personne.
     */
    it("refuse par une AUTRE erreur dans la fenêtre de rattrapage", () => {
      try {
        guard({ rules: GRACIOUS, now: "2026-08-11T16:10:00.000Z" });
        throw new Error("le refus attendu n'a pas eu lieu");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(OrderCutoffGraceError);
        expect(error).not.toBeInstanceOf(PastOrderCutoffError);
        // L'instant est porté brut : c'est l'écran qui décide de dire
        // « jusqu'à 18 h 45 » ou « encore 12 minutes ».
        expect((error as OrderCutoffGraceError).graceEndsAt.toISOString()).toBe(
          "2026-08-11T16:45:00.000Z",
        );
      }
    });

    it("redevient un refus définitif une fois le rattrapage écoulé", () => {
      expect(() => guard({ rules: GRACIOUS, now: "2026-08-11T16:45:01.000Z" })).toThrow(
        PastOrderCutoffError,
      );
    });

    /**
     * La grâce n'ouvre RIEN au client : elle change le message, pas le verdict.
     * Tant que la dérogation n'existe pas, personne ne passe dans cette fenêtre
     * — et confondre les deux ferait croire le contraire à qui lit ce test.
     */
    it("ne laisse toujours PERSONNE passer dans la fenêtre", () => {
      expect(() => guard({ rules: GRACIOUS, now: "2026-08-11T16:10:00.000Z" })).toThrow();
    });

    it("n'oppose rien au back-office, ni la limite ni la grâce", () => {
      expect(() =>
        guard({ rules: GRACIOUS, now: "2026-08-11T16:10:00.000Z", placedByStaffId: "staff_1" }),
      ).not.toThrow();
    });
  });

  it("oppose la règle du POINT plutôt que celle du défaut", () => {
    const rules = [
      rule({ id: "labo", pickupAddressId: "labo", daysBefore: 2, time: "12:00" }),
      rule(),
    ];
    // Lundi 10 à 12 h Paris = 10:00Z. Passé pour le labo, pas pour le défaut.
    const now = "2026-08-10T10:30:00.000Z";
    expect(() => guard({ rules, pickupAddressId: "labo", now })).toThrow(PastOrderCutoffError);
    expect(() => guard({ rules, pickupAddressId: null, now })).not.toThrow();
  });

  /**
   * Le même calcul en **hiver** : la limite de 18 h vaut 17:00Z, pas 16:00Z. Un
   * décalage figé — écrit une fois pour l'été — passerait le test précédent et
   * échouerait celui-ci.
   */
  it("suit le changement d'heure : 18 h de Paris ne vaut pas le même instant en janvier", () => {
    const winter = {
      rules: [rule()],
      pickupAddressId: null,
      fulfillmentDate: "2026-01-15",
      placedByStaffId: null,
    };
    expect(() =>
      ensureWithinOrderCutoff({ ...winter, now: new Date("2026-01-14T16:59:00.000Z") }),
    ).not.toThrow();
    expect(() =>
      ensureWithinOrderCutoff({ ...winter, now: new Date("2026-01-14T17:01:00.000Z") }),
    ).toThrow(PastOrderCutoffError);
  });
});
