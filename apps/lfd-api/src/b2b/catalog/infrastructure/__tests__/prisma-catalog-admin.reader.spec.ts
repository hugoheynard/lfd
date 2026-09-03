import { allergensOf } from "../prisma-catalog-admin.reader.js";

/**
 * **Ce que l'écran catalogue dit d'une fiche réglementaire.**
 *
 * La plateforme n'a pas le référentiel (D6) : elle SUBIT les mentions que le PIM
 * a projetées à l'émission du fil. Ce fichier vérifie donc une relecture, plus
 * un calcul — la projection INCO elle-même (filtre, dédup n:1, localisation,
 * `incomplete`) est éprouvée là où elle vit, dans
 * `pim/allergens/domain/services/__tests__/inco-projector.spec.ts`.
 *
 * Ce que la couverture a changé de côté le 2026-09-03, et pourquoi : les cas
 * « sept céréales ne font qu'une mention » et « un code hors obligation UE est
 * écarté » étaient testés ICI, contre une table figée de 30 codes. Ils sont
 * restés vrais et sont devenus faux à la fois — vrais de la règle, faux de
 * l'endroit : le back-office ne l'applique plus, il lit son résultat.
 */

/** Ce que le fil porte pour une fiche déclarée sans aucun allergène. */
const DECLARED_EMPTY = { labels: [], incomplete: false };

/** Une mention projetée, telle que le PIM l'a écrite. */
const GLUTEN = { category: "gluten", label: "Céréales contenant du gluten" };

describe("allergensOf — les quatre états d'une fiche", () => {
  it("rend null quand aucune fiche n'est déclarée", () => {
    expect(allergensOf(null, null)).toEqual({ allergens: null, allergensIncomplete: false });
    expect(allergensOf(undefined, undefined)).toEqual({
      allergens: null,
      allergensIncomplete: false,
    });
  });

  /** `null` et `[]` ne se confondent pas : un silence n'est pas une promesse. */
  it("rend une liste vide COMPLÈTE pour une fiche déclarée sans allergène", () => {
    expect(allergensOf([], DECLARED_EMPTY)).toEqual({
      allergens: [],
      allergensIncomplete: false,
    });
  });

  it("rend les mentions telles que le PIM les a projetées", () => {
    expect(allergensOf(["UW", "NR"], { labels: [GLUTEN], incomplete: false })).toEqual({
      allergens: [GLUTEN],
      allergensIncomplete: false,
    });
  });

  it("reporte l'aveu d'amputation sans le recalculer", () => {
    expect(allergensOf(["SO"], { labels: [], incomplete: true })).toEqual({
      allergens: [],
      allergensIncomplete: true,
    });
  });
});

describe("allergensOf — ce qu'il subit et ne recalcule plus", () => {
  /**
   * **Le cas qui a motivé la bascule.**
   *
   * Le référentiel est administrable, et le runbook recommande de créer des
   * **entrées maison** (`official = false`) pour ce que les 30 codes GS1 figés
   * ne couvrent pas. La table que ce lecteur consultait ne les connaîtra jamais :
   * elle déclarait le code inconnu, l'écartait en silence et affichait « fiche
   * incomplète » en rouge sur une fiche complète — l'écran accusait d'un oubli
   * causé par une table que le staff n'a pas le droit de modifier.
   *
   * Le code ci-dessous est délibérément **quelconque** : ce qui est éprouvé,
   * c'est qu'aucun code n'est plus consulté nulle part.
   */
  it("rend une mention d'entrée MAISON, que la table figée n'aurait jamais connue", () => {
    expect(allergensOf(["XX-MAISON"], { labels: [GLUTEN], incomplete: false })).toEqual({
      allergens: [GLUTEN],
      allergensIncomplete: false,
    });
  });

  /** Le libellé vient du référentiel : le renommer là-bas le change ici. */
  it("recopie le libellé du référentiel, sans le refabriquer", () => {
    const renamed = { category: "gluten", label: "Gluten (céréales)" };

    expect(allergensOf(["UW"], { labels: [renamed], incomplete: false })).toEqual({
      allergens: [renamed],
      allergensIncomplete: false,
    });
  });
});

describe("allergensOf — la fiche qu'on ne sait pas rendre", () => {
  /**
   * **L'article reçu avant la v5 du fil** : il porte des codes, pas de mentions.
   *
   * `[]` dit « une fiche existe » et le drapeau dit « ce que tu vois est
   * amputé ». Ensemble, ils interdisent au gabarit d'écrire « Sans allergène » —
   * la branche est gardée par `!allergensIncomplete`. C'est le seul mensonge
   * possible ici, et c'est celui qui a déjà été commis une fois, sur une surface
   * en service (fix 2026-08-31).
   */
  it("n'affirme JAMAIS « sans allergène » sur des codes sans mentions projetées", () => {
    expect(allergensOf(["UW"], null)).toEqual({ allergens: [], allergensIncomplete: true });
  });

  it.each([
    ["une valeur qui n'est pas un objet", "peu importe"],
    ["un objet sans `labels`", { incomplete: false }],
    ["un objet sans `incomplete`", { labels: [] }],
    ["un `incomplete` qui n'est pas booléen", { labels: [], incomplete: "non" }],
    ["des `labels` qui ne sont pas un tableau", { labels: {}, incomplete: false }],
  ])("traite %s comme des mentions absentes, jamais comme une fiche vide", (_cas, raw) => {
    expect(allergensOf(["UW"], raw)).toEqual({ allergens: [], allergensIncomplete: true });
  });

  /**
   * **Une mention illisible fait tomber la fiche entière.**
   *
   * Le parseur filtrait, et rendait donc « Céréales contenant du gluten » sur
   * une charge dont une seconde mention était corrompue : une liste amputée qui
   * se tait, exactement ce que `allergensIncomplete` existe pour empêcher. Elle
   * bascule maintenant vers « je ne sais pas », qui est vrai.
   */
  it("refuse la fiche entière quand une seule mention est illisible", () => {
    expect(
      allergensOf(["UW", "SH"], { labels: [GLUTEN, { category: 42 }], incomplete: false }),
    ).toEqual({ allergens: [], allergensIncomplete: true });
  });
});
