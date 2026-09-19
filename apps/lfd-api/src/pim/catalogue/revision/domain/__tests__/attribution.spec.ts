import { PIM_EVENTS } from "../../../../journal/pim-journal.js";
import type { PimJournalFact } from "../../../../journal/pim-journal-reader.js";
import {
  ATTRIBUTED_FACT_TYPES,
  PRODUCT_FACT_TYPES,
  attributeFields,
  fieldsTouchedBy,
} from "../attribution.js";

function fact(over: Partial<PimJournalFact> & Pick<PimJournalFact, "type">): PimJournalFact {
  return {
    subjectType: "product",
    subjectId: "prd_1",
    occurredAt: new Date("2026-08-31T10:00:00.000Z"),
    actorName: "Hugo Heynard",
    payload: {},
    ...over,
  };
}

describe("la table des faits", () => {
  /**
   * **Le test qui tient le pont.** La correspondance fait → champs est une
   * TROISIÈME déclaration du même ensemble, après le payload d'une révision et
   * celui d'un fait. Un événement de produit ajouté sans entrée n'attribuerait
   * plus rien — et « rien » se lit exactement comme « personne n'y a touché ».
   */
  it("couvre TOUS les faits de produit", () => {
    const manquants = PRODUCT_FACT_TYPES.filter((type) => !ATTRIBUTED_FACT_TYPES.includes(type));

    expect(manquants).toEqual([]);
  });
});

describe("fieldsTouchedBy", () => {
  /** Les faits de section disent EUX-MÊMES quels champs ils ont changés. */
  it("lit les champs dans le payload d'un enregistrement de section", () => {
    const touched = fieldsTouchedBy(
      fact({
        type: PIM_EVENTS.productIdentitySaved,
        payload: { changes: { name: { from: {}, to: {} }, categoryId: { from: "a", to: "b" } } },
      }),
    );

    expect(touched).toEqual(["name", "categoryId"]);
  });

  /**
   * Le payload d'un changement de taux est indexé par CONTEXTE (`eatIn`), pas
   * par champ : lire ses clés donnerait des noms qui n'existent dans aucune
   * révision, et l'attribution ne trouverait jamais rien.
   */
  it("traduit un changement de taux vers le champ de la révision", () => {
    const touched = fieldsTouchedBy(
      fact({
        type: PIM_EVENTS.productVatChanged,
        payload: { eatIn: { from: "tva_intermediaire", to: "tva_normal" } },
      }),
    );

    expect(touched).toEqual(["vatByContext"]);
  });

  /**
   * Une signature n'est pas une modification. L'attribuer à un champ ferait
   * dire à l'écran que quelqu'un a changé un prix alors qu'il a seulement
   * déclaré la fiche juste.
   */
  it("n'attribue AUCUN champ à une déclaration de publiabilité", () => {
    expect(fieldsTouchedBy(fact({ type: PIM_EVENTS.productDeclaredReady }))).toEqual([]);
  });

  it("ne prétend rien d'un fait qu'elle ne connaît pas", () => {
    expect(fieldsTouchedBy(fact({ type: "product.venu_du_futur" }))).toEqual([]);
  });
});

describe("attributeFields", () => {
  const RECENT = new Date("2026-08-31T12:00:00.000Z");
  const ANCIEN = new Date("2026-08-31T08:00:00.000Z");

  /** « Qui a fait ça » veut dire « qui l'a fait EN DERNIER ». */
  it("garde le fait le plus récent, les suivants ne réécrivent pas", () => {
    const authors = attributeFields(
      ["priceCents"],
      [
        fact({
          type: PIM_EVENTS.productPricingSaved,
          actorName: "Dernier",
          occurredAt: RECENT,
          payload: { changes: { priceCents: { from: 100, to: 200 } } },
        }),
        fact({
          type: PIM_EVENTS.productPricingSaved,
          actorName: "Premier",
          occurredAt: ANCIEN,
          payload: { changes: { priceCents: { from: 50, to: 100 } } },
        }),
      ],
    );

    expect(authors.get("priceCents")).toEqual({ by: "Dernier", at: RECENT });
  });

  /**
   * Un champ sans auteur connu est un RÉSULTAT : il vient d'un seed, d'un
   * script, ou d'un verbe qui ne trace pas encore. Lui coller l'auteur de la
   * révision accuserait quelqu'un qui a seulement appuyé sur « poser ».
   */
  it("laisse un champ sans auteur plutôt que d'en inventer un", () => {
    const authors = attributeFields(
      ["weightGrams"],
      [
        fact({
          type: PIM_EVENTS.productPricingSaved,
          payload: { changes: { priceCents: { from: 1, to: 2 } } },
        }),
      ],
    );

    expect(authors.has("weightGrams")).toBe(false);
  });

  /** Le système agit aussi, et ça se dit : `null` n'est pas « inconnu ». */
  it("garde un acteur système tel quel", () => {
    const authors = attributeFields(
      ["status"],
      [fact({ type: PIM_EVENTS.productPublished, actorName: null, occurredAt: RECENT })],
    );

    expect(authors.get("status")).toEqual({ by: null, at: RECENT });
  });

  /** Une fiche qui vient d'apparaître : tous ses champs viennent d'elle. */
  it("attribue tout à la création", () => {
    const authors = attributeFields(
      ["name", "priceCents"],
      [fact({ type: PIM_EVENTS.productCreated, actorName: "Hugo" })],
    );

    expect([...authors.keys()].sort()).toEqual(["name", "priceCents"]);
  });
});
