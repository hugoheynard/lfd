import { posedMercuriales, type AuthoredRule } from "../posed-mercuriales.js";
import type { PriceRule } from "../../domain/price-rule.js";

/**
 * **Recoller des mercuriales à partir de règles qui n'ont pas de lien.**
 *
 * Ce que ces cas tiennent n'est pas le regroupement — il est trivial — mais les
 * trois affirmations que l'écran fait à partir de lui, et dont chacune peut
 * mentir : combien d'ARTICLES la mercuriale couvre (et non combien de règles),
 * dans quel ÉTAT elle est à l'instant lu, et ce que le regroupement **confond**.
 *
 * Aucune date absolue : le statut se lit en comparant la fenêtre à l'horloge,
 * donc une fixture écrite au calendrier serait verte jusqu'au jour où le
 * calendrier la traverse.
 */

const NOW = new Date("2026-09-08T10:00:00.000Z");

/** Un décalage relatif à l'instant de lecture, en jours. */
function days(count: number): Date {
  return new Date(NOW.getTime() + count * 24 * 60 * 60 * 1000);
}

/**
 * Une règle de mercuriale, construite **sans cast** : la porte `no-type-escapes`
 * refuse les échappatoires, et un doublé qui caste dérive de la signature qu'il
 * prétend jouer. Les champs qu'aucun de ces cas ne regarde ont un défaut ; ceux
 * qu'ils font varier sont nommés.
 */
let seq = 0;

interface RuleFixture {
  readonly sku: string;
  readonly label?: string;
  readonly minQuantity?: number;
  readonly validFrom?: Date;
  readonly validTo?: Date | null;
  readonly suspendedFrom?: Date | null;
  readonly createdBy?: string;
}

/** Le catalogue, réduit à ce que le regroupement lui demande : un nom. */
const nameOf = (sku: string): string => `Article ${sku}`;

function rule(fixture: RuleFixture): AuthoredRule {
  seq += 1;
  return { createdBy: fixture.createdBy ?? "staff|marie", rule: ruleOf(fixture) };
}

function ruleOf(fixture: RuleFixture): PriceRule {
  return {
    // Un compteur et non `Math.random()` : la porte `clock-port` refuse l'aléa,
    // et un identifiant de fixture n'a aucune raison d'en demander.
    id: `rule_${fixture.sku}_${String(seq)}`,
    stage: "mercuriale",
    scope: { type: "product", id: fixture.sku },
    audience: { type: "company", id: "co_1" },
    minQuantity: fixture.minQuantity ?? 1,
    validFrom: fixture.validFrom ?? days(-10),
    validTo: fixture.validTo === undefined ? days(80) : fixture.validTo,
    suspendedFrom: fixture.suspendedFrom ?? null,
    label: fixture.label ?? "Mercuriale Club Med",
    stacksOverMercuriale: false,
    nature: "replace",
    amountMillicents: 80_000,
  };
}

describe("le regroupement", () => {
  it("réunit les règles qui partagent le libellé ET la fenêtre", () => {
    const posed = posedMercuriales(
      [rule({ sku: "CRO" }), rule({ sku: "PAC" }), rule({ sku: "BAG" })],
      NOW,
      nameOf,
    );

    expect(posed).toHaveLength(1);
    expect(posed[0]).toMatchObject({ label: "Mercuriale Club Med", ruleCount: 3, skuCount: 3 });
  });

  it("sépare deux fenêtres différentes sous le même libellé", () => {
    // La renégociation de l'an prochain porte souvent le même nom. Les fondre
    // ferait lire « une mercuriale de 2026 à 2028 » là où il y en a deux.
    const posed = posedMercuriales(
      [rule({ sku: "CRO" }), rule({ sku: "CRO", validFrom: days(90), validTo: days(180) })],
      NOW,
      nameOf,
    );

    expect(posed).toHaveLength(2);
  });

  it("compte les ARTICLES et non les règles quand un article en porte plusieurs", () => {
    // Une mercuriale à paliers pèse trois règles pour un article. Annoncer
    // « 3 articles » ferait passer le nombre de paliers pour l'étendue de la
    // négociation.
    const posed = posedMercuriales(
      [
        rule({ sku: "CRO", minQuantity: 1 }),
        rule({ sku: "CRO", minQuantity: 500 }),
        rule({ sku: "CRO", minQuantity: 5000 }),
      ],
      NOW,
      nameOf,
    );

    expect(posed[0]).toMatchObject({ ruleCount: 3, skuCount: 1 });
  });

  it("rend les plus récemment ouvertes en premier", () => {
    const posed = posedMercuriales(
      [
        rule({ sku: "CRO", label: "Ancienne", validFrom: days(-400), validTo: days(-200) }),
        rule({ sku: "CRO", label: "Courante" }),
      ],
      NOW,
      nameOf,
    );

    expect(posed.map((entry) => entry.label)).toEqual(["Courante", "Ancienne"]);
  });
});

describe("l'état à l'instant lu", () => {
  it("dit « en vigueur » quand la fenêtre couvre l'instant", () => {
    expect(posedMercuriales([rule({ sku: "CRO" })], NOW, nameOf)[0]?.status).toBe("active");
  });

  it("dit « à venir » pour une fenêtre qui n'a pas commencé", () => {
    // Une mercuriale signée en septembre pour janvier n'agit pas : l'annoncer
    // « en vigueur » ferait chercher un prix que la caisse n'applique pas.
    const posed = posedMercuriales(
      [rule({ sku: "CRO", validFrom: days(30), validTo: days(400) })],
      NOW,
      nameOf,
    );

    expect(posed[0]?.status).toBe("scheduled");
  });

  it("dit « terminée » dès l'instant de sa borne haute, qui est EXCLUE", () => {
    // Même convention que partout dans ce contexte. Une fenêtre qui se ferme à
    // l'instant lu est déjà terminée, sinon deux mercuriales qui se succèdent
    // seraient toutes deux en vigueur pendant une milliseconde.
    const posed = posedMercuriales(
      [rule({ sku: "CRO", validFrom: days(-100), validTo: NOW })],
      NOW,
      nameOf,
    );

    expect(posed[0]?.status).toBe("expired");
  });

  it("dit « suspendue » quand TOUTES ses règles le sont", () => {
    const posed = posedMercuriales(
      [
        rule({ sku: "CRO", suspendedFrom: days(-1) }),
        rule({ sku: "PAC", suspendedFrom: days(-1) }),
      ],
      NOW,
      nameOf,
    );

    expect(posed[0]?.status).toBe("suspended");
  });

  it("reste « en vigueur » quand une SEULE de ses règles est suspendue", () => {
    // Le client obtient encore un prix négocié sur les articles dont les règles
    // agissent. Dire « suspendue » ferait annoncer au téléphone un tarif
    // catalogue que la caisse n'applique pas.
    const posed = posedMercuriales(
      [rule({ sku: "CRO", suspendedFrom: days(-1) }), rule({ sku: "PAC" })],
      NOW,
      nameOf,
    );

    expect(posed[0]?.status).toBe("active");
  });

  it("ne tient PAS pour suspendue une règle archivée après l'instant lu", () => {
    // `suspendedFrom` confond la pause et l'archivage — le calcul n'a aucune
    // raison de les distinguer. Mais il compare à l'instant LU : une règle
    // rangée demain agissait aujourd'hui.
    const posed = posedMercuriales([rule({ sku: "CRO", suspendedFrom: days(5) })], NOW, nameOf);

    expect(posed[0]?.status).toBe("active");
  });
});

describe("ce que le regroupement confond, et qu'il faut lire en le sachant", () => {
  it("fond deux poses de même libellé sur la même fenêtre", () => {
    // Documenté plutôt que corrigé : sans identité de pose en base, rien ici ne
    // permet de les distinguer. C'est l'argument pour donner une identité à la
    // pose, et le test existe pour que ce défaut soit vu et non découvert.
    const posed = posedMercuriales([rule({ sku: "CRO" }), rule({ sku: "PAC" })], NOW, nameOf);

    expect(posed).toHaveLength(1);
    expect(posed[0]?.ruleCount).toBe(2);
  });

  it("ne laisse pas un libellé bricolé déborder sur la fenêtre voisine", () => {
    // La clé est fabriquée en mettant le libellé — seul champ libre — en
    // DERNIER. Un libellé qui imite une date ne peut donc pas faire passer deux
    // fenêtres distinctes pour une seule.
    const posed = posedMercuriales(
      [
        rule({ sku: "CRO", label: "A" }),
        rule({ sku: "CRO", label: "A", validFrom: days(200), validTo: days(300) }),
      ],
      NOW,
      nameOf,
    );

    expect(posed).toHaveLength(2);
  });
});
