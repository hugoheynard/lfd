import type { CorpusDeclaration, CorpusProduct } from "./corpus.js";

/**
 * Fiches réglementaires **synthétiques** — de la donnée inventée, et il faut le
 * dire à chaque fois qu'on en parle.
 *
 * ## Pourquoi ce fichier existe
 *
 * `Product.publish()` refuse une fiche dont une déclinaison active ne porte pas
 * de déclaration (invariant 7). C'est la bonne règle : mettre en vente sans
 * allergènes déclarés est une faute réglementaire, pas un oubli de formulaire.
 * Conséquence directe : un catalogue extrait d'une base où presque personne n'a
 * rempli la fiche réglementaire ne produit **aucun** produit publiable, donc
 * aucun article dans le miroir B2B, donc rien sur quoi développer.
 *
 * Deux sorties possibles, et une seule est honnête. Écrire le statut `published`
 * en SQL par-dessus l'agrégat donnerait un catalogue « valide » que le domaine
 * refuse — un état que la production ne verra jamais, donc un environnement de
 * développement qui ment. L'autre sortie est celle-ci : **remplir la fiche**,
 * par la commande prévue, avec des valeurs inventées et assumées comme telles.
 *
 * ## Ce qui empêche cette donnée de passer pour vraie
 *
 * Trois verrous, et aucun n'est un commentaire :
 *
 * 1. le rejeu **refuse toute cible non locale** (cf. `seed-pim.ts`) ;
 * 2. l'invention est **désactivée par défaut** — il faut poser
 *    `SEED_PIM_SYNTHETIC_SHEETS=1`, c'est-à-dire le décider ;
 * 3. la marque est **dans la donnée** : l'indice glycémique vaut
 *    {@link SYNTHETIC_MARKER}, une valeur qu'aucune fiche réelle ne porterait,
 *    et qui se retrouve donc en base, dans le corpus, et dans le miroir B2B.
 *
 * ## Comment les valeurs sont dérivées
 *
 * Par **famille**, parce que c'est le seul rattachement dont on soit sûr : une
 * viennoiserie contient du gluten, des œufs et du lait ; une pâtisserie y ajoute
 * les fruits à coque en traces. Les valeurs nutritionnelles sont fixes par
 * famille — dérivées du SKU, elles seraient plus « variées » et tout aussi
 * fausses, mais on ne saurait plus les reconnaître.
 */

/**
 * L'indice glycémique d'une fiche inventée. 0 est impossible pour un aliment
 * réel et n'est pas `null` : la colonne AFFIRME donc quelque chose de faux et
 * de reconnaissable, là où `null` se confondrait avec « pas renseigné ».
 */
export const SYNTHETIC_MARKER = 0;

/** Les codes GS1 du référentiel — cf. `src/pim/allergens/allergen-mapping.ts`. */
const GLUTEN_WHEAT = "UW";
const EGGS = "AE";
const MILK = "AM";
const SOY = "AY";
const NUTS_HAZELNUT = "SH";
const NUTS_ALMOND = "SA";
const SESAME = "AS";

interface SyntheticSheet {
  readonly allergens: readonly string[];
  readonly mayContain: readonly string[];
  readonly energyKcal: number;
  readonly fatG: number;
  readonly saturatedFatG: number;
  readonly carbsG: number;
  readonly sugarsG: number;
  readonly proteinG: number;
  readonly saltG: number;
}

function sheet(
  allergens: readonly string[],
  mayContain: readonly string[],
  energyKcal: number,
  fatG: number,
  saturatedFatG: number,
  carbsG: number,
  sugarsG: number,
  proteinG: number,
  saltG: number,
): SyntheticSheet {
  return {
    allergens,
    mayContain,
    energyKcal,
    fatG,
    saturatedFatG,
    carbsG,
    sugarsG,
    proteinG,
    saltG,
  };
}

/**
 * Ce que porte une famille, par nom source. Les noms sont ceux du catalogue La
 * Folie Coffee ; une famille inconnue retombe sur {@link FALLBACK}, jamais sur
 * une liste vide — « aucun allergène » est une affirmation positive, et
 * l'affirmer par défaut serait le pire des mensonges de ce fichier.
 */
const BY_FAMILY: ReadonlyMap<string, SyntheticSheet> = new Map([
  [
    "Viennoiseries",
    sheet([GLUTEN_WHEAT, EGGS, MILK], [NUTS_HAZELNUT, SOY], 420, 22, 13, 45, 9, 7, 0.9),
  ],
  ["Pains", sheet([GLUTEN_WHEAT], [SESAME, SOY], 265, 3.2, 0.7, 49, 2.1, 9, 1.4)],
  [
    "Pâtisseries",
    sheet(
      [GLUTEN_WHEAT, EGGS, MILK],
      [NUTS_ALMOND, NUTS_HAZELNUT, SOY],
      385,
      19,
      11,
      44,
      27,
      6,
      0.4,
    ),
  ],
  ["Salé & traiteur", sheet([GLUTEN_WHEAT, EGGS, MILK], [SESAME, SOY], 290, 16, 8, 24, 3, 11, 1.1)],
  [
    "Chocolat & confiserie",
    sheet([MILK, SOY], [NUTS_HAZELNUT, NUTS_ALMOND, GLUTEN_WHEAT], 545, 33, 20, 52, 48, 7, 0.2),
  ],
]);

/**
 * Le repli : gluten, œufs, lait, et les fruits à coque en traces. Le profil d'un
 * atelier de boulangerie-pâtisserie — **surdéclaré à dessein**. Une fiche
 * inventée qui déclare trop se corrige à la saisie ; une qui déclare trop peu
 * ressemble à une fiche valide.
 */
const FALLBACK = sheet(
  [GLUTEN_WHEAT, EGGS, MILK],
  [NUTS_HAZELNUT, NUTS_ALMOND, SOY, SESAME],
  350,
  18,
  10,
  40,
  15,
  8,
  0.8,
);

/** L'invention est un choix, jamais un défaut. */
export function syntheticSheetsEnabled(): boolean {
  return process.env["SEED_PIM_SYNTHETIC_SHEETS"] === "1";
}

/**
 * La fiche réglementaire à déclarer pour ce produit : celle du corpus si la
 * source en portait une, sinon une synthétique — et `null` si l'invention n'est
 * pas autorisée, auquel cas la fiche restera brouillon.
 */
export function declarationFor(product: CorpusProduct): CorpusDeclaration | null {
  if (product.declaration !== null) {
    return product.declaration;
  }
  if (!syntheticSheetsEnabled()) {
    return null;
  }
  const source = BY_FAMILY.get(product.categoryName) ?? FALLBACK;
  return {
    allergens: source.allergens,
    mayContain: source.mayContain,
    nutrition: {
      energyKcal: source.energyKcal,
      fatG: source.fatG,
      saturatedFatG: source.saturatedFatG,
      carbsG: source.carbsG,
      sugarsG: source.sugarsG,
      proteinG: source.proteinG,
      saltG: source.saltG,
      glycemicIndex: SYNTHETIC_MARKER,
    },
  };
}
