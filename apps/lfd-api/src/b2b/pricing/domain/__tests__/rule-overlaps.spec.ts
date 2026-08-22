import type { PriceRule, PriceScope, PriceStage } from "../price-rule.js";
import { overlapSegments } from "../rule-overlaps.js";

/**
 * **Deux décisions qui se recouvrent dans le temps.**
 *
 * Le fil de ce fichier : tout recouvrement n'est pas un cumul. Dans un même
 * étage, la plus spécifique évince l'autre ; entre étages différents, elles se
 * composent — et la composition n'est PAS une somme.
 */

const day = (iso: string): Date => new Date(`2026-08-${iso}T00:00:00.000Z`);

function rule(
  id: string,
  from: string,
  to: string | null,
  over: { stage?: PriceStage; bp?: number; scope?: PriceScope } = {},
): PriceRule {
  return {
    stacksOverMercuriale: false,
    id,
    stage: over.stage ?? "promotion",
    scope: over.scope ?? { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    validFrom: day(from),
    validTo: to === null ? null : day(to),
    suspendedFrom: null,
    label: id,
    nature: "alter",
    alteration: { direction: "decrease", mode: "percent", bp: over.bp ?? 1_000 },
  };
}

describe("les recouvrements", () => {
  it("ne voit rien quand les fenêtres se succèdent sans se toucher", () => {
    expect(overlapSegments([rule("a", "01", "10"), rule("b", "10", "20")])).toEqual([]);
  });

  /** Borne haute EXCLUE : le 10, « a » est déjà finie. C'est la même convention partout. */
  it("ne compte pas la borne partagée comme un recouvrement", () => {
    const segments = overlapSegments([rule("a", "01", "11"), rule("b", "10", "20")]);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.from).toEqual(day("10"));
    expect(segments[0]?.to).toEqual(day("11"));
  });

  it("rend la période exacte du recouvrement", () => {
    const [segment] = overlapSegments([rule("a", "01", "20"), rule("b", "15", "30")]);

    expect(segment?.from).toEqual(day("15"));
    expect(segment?.to).toEqual(day("20"));
    expect(segment?.ruleIds).toEqual(["a", "b"]);
  });

  it("laisse la fin ouverte quand aucune des deux ne se referme", () => {
    const [segment] = overlapSegments([rule("a", "01", null), rule("b", "15", null)]);

    expect(segment?.from).toEqual(day("15"));
    expect(segment?.to).toBeNull();
  });
});

describe("le cumul", () => {
  /**
   * **−20 % puis −10 % font −28 %**, pas −30 % : la seconde s'applique au prix
   * sortant de la première. C'est la loi du pipeline, et l'écran doit annoncer
   * le chiffre que la caisse facture.
   */
  it("compose au lieu d'additionner", () => {
    const [segment] = overlapSegments([
      rule("a", "01", "20", { stage: "promotion", bp: 2_000 }),
      rule("b", "15", "30", { stage: "geste", bp: 1_000 }),
    ]);

    expect(segment?.kind).toBe("compose");
    expect(segment?.composedBp).toBe(2_800);
  });

  /** L'ordre des étages ne change pas le produit — mais le résultat doit le prouver. */
  it("donne le même cumul quel que soit l'ordre de saisie", () => {
    const first = overlapSegments([
      rule("a", "01", "20", { stage: "geste", bp: 1_000 }),
      rule("b", "15", "30", { stage: "promotion", bp: 2_000 }),
    ]);

    expect(first[0]?.composedBp).toBe(2_800);
  });

  /**
   * Dans un MÊME étage, la plus spécifique gagne : elles ne s'additionnent pas.
   * Annoncer un cumul ici ferait crier au danger là où il n'y a qu'une relève.
   */
  it("n'est pas un cumul quand les deux règles partagent leur étage", () => {
    const [segment] = overlapSegments([
      rule("a", "01", "20", { stage: "promotion" }),
      rule("b", "15", "30", { stage: "promotion" }),
    ]);

    expect(segment?.kind).toBe("supersede");
    // Une seule agit : le chiffre annoncé est le SIEN, pas la somme des deux.
    expect(segment?.composedBp).toBe(1_000);
  });

  /**
   * Un montant en euros ne se cumule pas en fraction sans connaître l'article,
   * et cette vue n'en connaît aucun : mieux vaut ne rien annoncer qu'un chiffre
   * inventé.
   */
  it("se tait quand une des règles n'est pas un pourcentage", () => {
    const posed: PriceRule = {
      ...rule("b", "15", "30", { stage: "geste" }),
      nature: "replace",
      amountCents: 180,
    };

    const [segment] = overlapSegments([rule("a", "01", "20"), posed]);

    expect(segment?.kind).toBe("compose");
    expect(segment?.composedBp).toBeNull();
  });

  it("compose aussi une hausse avec une baisse", () => {
    const rise: PriceRule = {
      ...rule("b", "15", "30", { stage: "geste" }),
      nature: "alter",
      alteration: { direction: "increase", mode: "percent", bp: 1_000 },
    };

    // −20 % puis +10 % = ×0,8 × 1,1 = ×0,88, soit −12 %.
    expect(overlapSegments([rule("a", "01", "20", { bp: 2_000 }), rise])[0]?.composedBp).toBe(
      1_200,
    );
  });
});

describe("trois règles", () => {
  /**
   * Une borne partagée couperait un recouvrement continu en deux segments
   * identiques : l'écran afficherait deux fois la même chose à la suite.
   */
  it("fusionne les tranches voisines qui portent le même jeu de règles", () => {
    const segments = overlapSegments([
      rule("a", "01", "30", { stage: "promotion" }),
      rule("b", "10", "20", { stage: "geste" }),
    ]);

    expect(segments).toHaveLength(1);
  });

  it("découpe quand une troisième entre en jeu au milieu", () => {
    const segments = overlapSegments([
      rule("a", "01", "30", { stage: "promotion", bp: 1_000 }),
      rule("b", "05", "30", { stage: "geste", bp: 1_000 }),
      rule("c", "10", "20", { stage: "volume", bp: 1_000 }),
    ]);

    expect(segments.map((segment) => segment.ruleIds)).toEqual([
      ["a", "b"],
      ["a", "b", "c"],
      ["a", "b"],
    ]);
    // ×0,9³ = 0,729 → −27,1 %.
    expect(segments[1]?.composedBp).toBe(2_710);
  });
});

/**
 * **La lignée** — c'est là que le recouvrement arrive vraiment.
 *
 * Deux règles de même étage ET de même portée ne peuvent pas se recouvrir : la
 * contrainte d'exclusion l'interdit en base. Mais une promotion de FAMILLE
 * recouvre en permanence une promotion de CATALOGUE, et la famille gagne — c'est
 * le cas que l'écran n'a jamais su montrer autrement que par une règle barrée,
 * sans dire à partir de quand.
 */
describe("une lignée catalogue → famille", () => {
  const famille: PriceScope = { type: "category", id: "viennoiserie" };

  it("évince la règle du catalogue pendant que celle de la famille court", () => {
    const [segment] = overlapSegments([
      rule("catalogue", "01", "30", { stage: "promotion", bp: 2_000 }),
      rule("famille", "10", "20", { stage: "promotion", bp: 1_000, scope: famille }),
    ]);

    expect(segment?.kind).toBe("supersede");
    expect(segment?.evictedIds).toEqual(["catalogue"]);
    // Ce que le client paie sur la tranche : les −10 % de la famille, seuls.
    expect(segment?.composedBp).toBe(1_000);
  });

  /** L'éviction est DATÉE : hors de la fenêtre famille, le catalogue reprend. */
  it("ne déborde pas de la fenêtre de celle qui évince", () => {
    const segments = overlapSegments([
      rule("catalogue", "01", "30", { stage: "promotion" }),
      rule("famille", "10", "20", { stage: "promotion", scope: famille }),
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.from).toEqual(day("10"));
    expect(segments[0]?.to).toEqual(day("20"));
  });

  /**
   * Éviction **et** cumul sur la même tranche : la famille évince le catalogue
   * dans leur étage, puis compose avec le geste. Le cumul ne compte QUE les
   * gagnantes — sans quoi il annoncerait un prix que la caisse ne facture pas.
   */
  it("ne compte pas l’évincée dans le cumul", () => {
    const [segment] = overlapSegments([
      rule("catalogue", "01", "30", { stage: "promotion", bp: 5_000 }),
      rule("famille", "01", "30", { stage: "promotion", bp: 2_000, scope: famille }),
      rule("geste", "01", "30", { stage: "geste", bp: 1_000 }),
    ]);

    expect(segment?.kind).toBe("compose");
    expect(segment?.evictedIds).toEqual(["catalogue"]);
    // ×0,8 × 0,9 = ×0,72 → −28 %. Les −50 % évincés n'y entrent pas.
    expect(segment?.composedBp).toBe(2_800);
  });
});
