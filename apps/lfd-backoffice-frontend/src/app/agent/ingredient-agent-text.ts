import type {
  AppellationView,
  IngredientView,
  ProductIngredientAllergensView,
} from '@lfd/pim-contracts';

/**
 * **Les ingrédients en texte**, pour un agent — ce que Référentiel →
 * Ingrédients et la section « Ingrédients » d'une fiche montrent.
 *
 * Les codes d'allergènes sont rendus en codes GS1, tels que servis : le
 * référentiel des libellés se lit à part, et le recopier ici en ferait une
 * seconde source.
 *
 * 🔴 Deux silences ne valent RIEN, et chaque texte le dit au lieu de laisser
 * l'agent conclure : une matière sans code veut dire que personne n'en a saisi
 * (`IngredientView.allergens`), et une composition qui ne propose rien ne
 * couvre rien — la liste d'ingrédients d'une fiche est éditoriale (D5).
 */

/** Combien de lignes une liste rend au plus : une lecture, pas un export. */
export const SHOWN_INGREDIENTS = 30;

/** La phrase D5, mot pour mot dans chaque rendu qui touche aux allergènes d'une fiche. */
export const D5_NOTICE =
  'Les ingrédients PROPOSENT, la fiche DÉCIDE : la composition est éditoriale (elle peut taire la farine), ces codes ne sont qu’une aide de saisie. La déclaration réglementaire est celle de chaque déclinaison, et elle ne se reprend qu’à la main, sur la fiche.';

function cut(total: number): string {
  return total > SHOWN_INGREDIENTS
    ? `\n… liste COUPÉE à ${SHOWN_INGREDIENTS} sur ${total} : préciser la recherche.`
    : '';
}

function appellationPart(appellation: AppellationView | null): string {
  if (appellation === null) {
    return 'sans appellation';
  }
  const retired = appellation.active ? '' : ', RETIRÉE';
  return `${appellation.scheme} « ${appellation.label.fr} » (${appellation.code}${retired})`;
}

function allergensPart(codes: readonly string[]): string {
  return codes.length === 0
    ? 'aucun code saisi (ne dit pas « sans allergène »)'
    : `contient ${codes.join(', ')}`;
}

/** Une ligne par ingrédient : de quoi le reconnaître et le citer par sa clé. */
export function ingredientLine(ingredient: IngredientView): string {
  const origin = ingredient.origin.trim() === '' ? 'origine non dite' : ingredient.origin;
  return `« ${ingredient.name.fr} » — clé ${ingredient.key} — ${origin} — ${appellationPart(ingredient.appellation)} — ${allergensPart(ingredient.allergens)} — cité par ${ingredient.usedBy} fiche(s)`;
}

/** Ce que la recherche retient : le nom (toute langue), la clé, l'appellation, un code porté. */
function matches(ingredient: IngredientView, needle: string): boolean {
  if (needle === '') {
    return true;
  }
  const names = Object.values(ingredient.name).map((name) => name.toLowerCase());
  const appellation = ingredient.appellation;
  return (
    names.some((name) => name.includes(needle)) ||
    ingredient.key.includes(needle) ||
    ingredient.allergens.some((code) => code.toLowerCase() === needle) ||
    (appellation !== null &&
      (appellation.code.includes(needle) ||
        appellation.scheme.toLowerCase().includes(needle) ||
        appellation.label.fr.toLowerCase().includes(needle)))
  );
}

export function ingredientSearchText(all: readonly IngredientView[], query: string): string {
  const needle = query.trim().toLowerCase();
  const found = all.filter((ingredient) => matches(ingredient, needle));
  if (found.length === 0) {
    return `Aucun ingrédient ne correspond à « ${query} » (sur ${all.length}).`;
  }
  return (
    [
      `${found.length} ingrédient(s) sur ${all.length} :`,
      ...found.slice(0, SHOWN_INGREDIENTS).map(ingredientLine),
    ].join('\n') + cut(found.length)
  );
}

/** La fiche d'un ingrédient : la ligne, puis sa description. */
export function ingredientText(ingredient: IngredientView): string {
  const description = ingredient.description?.fr;
  return [
    ingredientLine(ingredient),
    `  · description : ${description === undefined ? 'aucune' : description}`,
    '  · où il est cité : le serveur ne sert que le NOMBRE de fiches, pas leur liste.',
  ].join('\n');
}

/**
 * Ce qu'une fiche cite, dans l'ordre affiché — numéroté, l'ordre étant
 * l'argument. Pas de coupe : le contrat borne la liste à 50.
 */
export function productIngredientsText(productId: string, rows: readonly IngredientView[]): string {
  if (rows.length === 0) {
    return `La fiche ${productId} ne cite aucun ingrédient.`;
  }
  return [
    `La fiche ${productId} cite ${rows.length} ingrédient(s), dans l’ordre affiché (éditorial, pas l’ordre réglementaire par masse ; aucune quantité n’est portée ici) :`,
    ...rows.map((row, at) => `${at + 1}. ${ingredientLine(row)}`),
  ].join('\n');
}

function declaredPart(declared: readonly string[] | null): string {
  if (declared === null) {
    return 'AUCUNE fiche réglementaire déclarée (rien à proposer tant qu’elle n’existe pas)';
  }
  return declared.length === 0 ? 'déclare « aucun allergène »' : `déclare ${declared.join(', ')}`;
}

/** Les codes que la composition propose, et l'écart par déclinaison — sans rien conclure. */
export function citedAllergensText(view: ProductIngredientAllergensView): string {
  return [
    view.citedByIngredients.length === 0
      ? `La composition de la fiche ${view.productId} ne propose aucun code — ce qui ne veut PAS dire « rien à ajouter ».`
      : `La composition de la fiche ${view.productId} propose : ${view.citedByIngredients.join(', ')}.`,
    ...view.variants.map((variant) => {
      const gap =
        variant.citedNotDeclared.length === 0
          ? 'rien à proposer'
          : `proposés et non déclarés : ${variant.citedNotDeclared.join(', ')}`;
      return `  · déclinaison ${variant.variantId} — ${declaredPart(variant.declaredAllergens)} — ${gap}`;
    }),
    D5_NOTICE,
  ].join('\n');
}

export function appellationsText(rows: readonly AppellationView[]): string {
  if (rows.length === 0) {
    return 'Aucune appellation au référentiel.';
  }
  return [
    `${rows.length} appellation(s).`,
    ...rows.map(
      (row) =>
        `${row.scheme} « ${row.label.fr} » — code ${row.code} — ${row.active ? 'ACTIVE' : 'RETIRÉE (ne se pose plus)'} — portée par ${row.usedBy} ingrédient(s)`,
    ),
  ].join('\n');
}
