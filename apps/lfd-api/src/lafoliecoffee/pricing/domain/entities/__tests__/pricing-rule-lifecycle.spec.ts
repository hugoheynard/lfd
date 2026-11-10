import { PricingRule, type PricingRuleDraft } from "../pricing-rule.js";
import {
  ArchivedPriceRuleIsSealedError,
  ClosedPriceRuleWindowError,
  PriceRuleAlreadyPausedError,
  PriceRuleNotPausedError,
} from "../../pricing-errors.js";

/**
 * **Le cycle de vie de la règle**, éprouvé sans base ni horloge : l'instant est
 * toujours un argument. Chaque refus ci-dessous protège d'un geste qui aurait eu
 * l'apparence d'un effet — c'est le fil de tout le fichier.
 */

const FROM = new Date("2026-08-01T00:00:00.000Z");
const PENDANT = new Date("2026-08-10T09:00:00.000Z");
const PLUS_TARD = new Date("2026-08-11T09:00:00.000Z");
const FIN = new Date("2026-08-31T00:00:00.000Z");
const APRES = new Date("2026-09-05T09:00:00.000Z");

function draft(overrides: Partial<PricingRuleDraft> = {}): PricingRuleDraft {
  return {
    stage: "promotion",
    stacksOverMercuriale: false,
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    effect: { nature: "alter", alteration: { direction: "decrease", mode: "percent", bp: 1000 } },
    label: "Promo d'août",
    validFrom: FROM,
    validTo: FIN,
    ...overrides,
  };
}

const create = (overrides: Partial<PricingRuleDraft> = {}): PricingRule =>
  PricingRule.create("rule_1", draft(overrides), "auth0|cecile");

describe("une règle qu'on vient de poser", () => {
  it("est en vigueur, et rien ne l'a interrompue", () => {
    const rule = create();

    expect(rule.status).toBe("active");
    expect(rule.asPriceRule.suspendedFrom).toBeNull();
  });
});

describe("suspendre", () => {
  it("retient qui a suspendu, et quand", () => {
    const paused = create().pause("auth0|marc", PENDANT);

    expect(paused.status).toBe("paused");
    expect(paused.toPersistence().lifecycle).toMatchObject({
      pausedAt: PENDANT,
      pausedBy: "auth0|marc",
    });
  });

  /**
   * La transition rend une NOUVELLE instance. L'appelant tient alors l'avant et
   * l'après — ce dont le journal a besoin pour dire ce qui a changé.
   */
  it("laisse l'instance d'origine intacte", () => {
    const rule = create();
    rule.pause("auth0|marc", PENDANT);

    expect(rule.status).toBe("active");
  });

  /**
   * **La fenêtre n'est pas touchée.** Une promotion « du 1er au 31 août »
   * suspendue trois jours ne se prolonge pas jusqu'au 3 septembre : elle a perdu
   * trois jours, ce qui est ce qui s'est passé. Repousser la fin en douce
   * réécrirait une décision commerciale pour compenser un incident.
   */
  it("ne repousse pas la fin de la promotion pour compenser", () => {
    const paused = create().pause("auth0|marc", PENDANT);

    expect(paused.asPriceRule.validTo).toBe(FIN);
  });

  /**
   * Un refus, et pas un silence complaisant : deux personnes peuvent avoir le
   * même écran ouvert, et la seconde croirait que c'est SON geste qui a arrêté
   * la promotion — quand le journal, lui, nommerait l'autre.
   */
  it("refuse une règle déjà suspendue", () => {
    const paused = create().pause("auth0|marc", PENDANT);

    expect(() => paused.pause("auth0|cecile", PLUS_TARD)).toThrow(PriceRuleAlreadyPausedError);
  });

  /**
   * Le geste n'aurait aucun effet — la règle est finie — mais il en aurait
   * l'apparence : l'écran afficherait « en pause » et quelqu'un croirait avoir
   * arrêté quelque chose.
   */
  it("refuse une règle dont la fenêtre est close", () => {
    expect(() => create().pause("auth0|marc", APRES)).toThrow(ClosedPriceRuleWindowError);
  });

  /** Borne haute EXCLUE : à l'instant exact de la fin, la règle est déjà finie. */
  it("refuse à l'instant EXACT de la fin — la borne haute est exclue", () => {
    expect(() => create().pause("auth0|marc", FIN)).toThrow(ClosedPriceRuleWindowError);
  });

  /** Le cas le plus utile : désamorcer une promotion programmée avant qu'elle ne parte. */
  it("accepte une règle qui n'a PAS ENCORE commencé", () => {
    const avant = new Date("2026-07-20T09:00:00.000Z");

    expect(create().pause("auth0|marc", avant).status).toBe("paused");
  });

  it("accepte une règle à fenêtre ouverte, qui ne finit jamais", () => {
    expect(create({ validTo: null }).pause("auth0|marc", APRES).status).toBe("paused");
  });

  it("refuse une règle archivée", () => {
    const archived = create().archive("auth0|marc", PENDANT, null);

    expect(() => archived.pause("auth0|cecile", PLUS_TARD)).toThrow(ArchivedPriceRuleIsSealedError);
  });
});

describe("reprendre", () => {
  it("efface la suspension", () => {
    const resumed = create().pause("auth0|marc", PENDANT).resume(PLUS_TARD);

    expect(resumed.status).toBe("active");
    expect(resumed.asPriceRule.suspendedFrom).toBeNull();
  });

  it("refuse une règle qui n'était pas suspendue", () => {
    expect(() => create().resume(PENDANT)).toThrow(PriceRuleNotPausedError);
  });

  /**
   * La reprise d'une règle terminée entre-temps ne rallumerait rien. Le dire
   * vaut mieux que d'afficher « en vigueur » sur une promotion morte.
   */
  it("refuse une règle dont la fenêtre s'est close pendant la pause", () => {
    const paused = create().pause("auth0|marc", PENDANT);

    expect(() => paused.resume(APRES)).toThrow(ClosedPriceRuleWindowError);
  });

  it("refuse une règle archivée pendant sa pause", () => {
    const sealed = create().pause("auth0|marc", PENDANT).archive("auth0|cecile", PLUS_TARD, null);

    expect(() => sealed.resume(PLUS_TARD)).toThrow(ArchivedPriceRuleIsSealedError);
  });
});

describe("archiver", () => {
  it("retient qui a archivé, quand, et pourquoi", () => {
    const archived = create().archive("auth0|marc", PENDANT, "Doublon de la promo rentrée");

    expect(archived.status).toBe("archived");
    expect(archived.toPersistence().lifecycle).toMatchObject({
      archivedAt: PENDANT,
      archivedBy: "auth0|marc",
      archiveReason: "Doublon de la promo rentrée",
    });
  });

  /** Le cas le plus courant de tous : c'est le rangement, pas une intervention. */
  it("accepte une règle terminée depuis longtemps", () => {
    expect(create().archive("auth0|marc", APRES, null).status).toBe("archived");
  });

  it("accepte une règle en pause — la pause n'est pas un état protégé", () => {
    const archived = create().pause("auth0|marc", PENDANT).archive("auth0|cecile", PLUS_TARD, null);

    expect(archived.status).toBe("archived");
  });

  /**
   * Terminal, et c'est ce qui lui donne sa valeur : une décision archivée est
   * close, et l'écran comme le journal en disent la même chose pour toujours.
   */
  it("refuse une règle déjà archivée", () => {
    const archived = create().archive("auth0|marc", PENDANT, null);

    expect(() => archived.archive("auth0|cecile", PLUS_TARD, null)).toThrow(
      ArchivedPriceRuleIsSealedError,
    );
  });

  /** Une règle archivée le 12 a cessé d'agir le 12, pas depuis toujours. */
  it("fait cesser la règle À PARTIR de l'archivage, pas rétroactivement", () => {
    const archived = create().archive("auth0|marc", PLUS_TARD, null);

    expect(archived.asPriceRule.suspendedFrom).toBe(PLUS_TARD);
  });
});

/**
 * **Ranger BORNE la fenêtre.** Ajouté le 2026-09-09 avec R17.
 *
 * `archived_at` disait deux choses : « rangée de l'écran » et « elle n'agit
 * plus ». La clause `archived_at IS NULL` des lecteurs transformait la seconde
 * en **disparition** — une règle en vigueur le 3 mars, rangée en avril, devenait
 * introuvable pour une lecture datée du 3 mars.
 *
 * Ranger écrit donc la fin dans la fenêtre, qui est l'endroit où le domaine la
 * lit déjà. Les trois cas où l'on ne borne PAS comptent autant que celui où l'on
 * borne : la fenêtre y dit déjà la vérité, et l'écrire la falsifierait.
 */
describe("🔴 ranger borne la fenêtre", () => {
  it("borne à l'instant du rangement une règle qui courait", () => {
    const rangee = create().archive("auth0|marc", PENDANT, "rangée");

    expect(rangee.toPersistence().validTo).toEqual(PENDANT);
    expect(rangee.status).toBe("archived");
  });

  /**
   * Elle s'est arrêtée à la PAUSE, pas au rangement. Borner au rangement
   * occuperait `[pause, rangement[` avec une décision qui ne s'y appliquait
   * pas — et le staff se verrait refuser une remplaçante sur une période où,
   * de l'aveu du système, rien ne courait.
   */
  it("borne à la SUSPENSION une règle mise en pause avant d'être rangée", () => {
    const rangee = create().pause("auth0|marc", PENDANT).archive("auth0|marc", PLUS_TARD, null);

    expect(rangee.toPersistence().validTo).toEqual(PENDANT);
  });

  /**
   * 🔴 Le cas qui produirait un **500**. Borner donnerait `validTo <= validFrom`,
   * que `tstzrange` refuse en SQLSTATE 22000 — et `isExclusionViolation` guette
   * un NOM de contrainte, donc ne l'attrape pas. Le staff verrait une erreur
   * technique sur un geste ordinaire.
   */
  it("ne borne RIEN sur une règle qui n'a jamais agi", () => {
    const future = create({ validFrom: APRES, validTo: null });

    const rangee = future.archive("auth0|marc", PENDANT, null);

    expect(rangee.toPersistence().validTo).toBeNull();
  });

  /**
   * Sa fenêtre porte déjà sa fin. La repousser au rangement la **ressusciterait**
   * sur l'intervalle écoulé — et c'est le cas le plus courant, puisqu'on range
   * généralement ce qui est fini.
   */
  it("ne borne RIEN sur une règle déjà terminée, et ne la ressuscite pas", () => {
    const rangee = create().archive("auth0|marc", APRES, null);

    expect(rangee.toPersistence().validTo).toEqual(FIN);
  });

  it("ne borne RIEN sur une règle suspendue avant même d'avoir agi", () => {
    const future = create({ validFrom: APRES, validTo: null });

    const rangee = future.pause("auth0|marc", PENDANT).archive("auth0|marc", PLUS_TARD, null);

    expect(rangee.toPersistence().validTo).toBeNull();
  });

  /** Le rangement reste terminal, et la garde qui le dit n'a pas bougé. */
  it("refuse toujours de ranger deux fois", () => {
    const rangee = create().archive("auth0|marc", PENDANT, null);

    expect(() => rangee.archive("auth0|marc", PLUS_TARD, null)).toThrow(
      ArchivedPriceRuleIsSealedError,
    );
  });
});
