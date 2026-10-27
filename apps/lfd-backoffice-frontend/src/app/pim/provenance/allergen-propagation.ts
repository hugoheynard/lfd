import type {
  IngredientAllergenPropagationView,
  ProductAllergenPropagationView,
} from '@lfd/pim-contracts';

/**
 * Ce que l'enregistrement des allergènes d'un ingrédient a CHANGÉ — le diff
 * que l'aperçu de propagation demande au serveur
 * (`documentation/pim/plan-propager-allergenes-d-un-ingredient.md`, § 4).
 */
export interface IngredientAllergenChange {
  readonly key: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

/** Les codes ajoutés et retirés entre deux listes — l'ordre ne compte pas. */
export function allergenDiff(
  before: readonly string[],
  after: readonly string[],
): { readonly added: readonly string[]; readonly removed: readonly string[] } {
  const held = new Set(before);
  const next = new Set(after);
  return {
    added: after.filter((code) => !held.has(code)),
    removed: before.filter((code) => !next.has(code)),
  };
}

/** Le libellé d'un code, ou le code brut — en inventer un serait pire. */
export type AllergenLabeler = (code: string) => string;

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function published(count: number): string {
  return count === 0 ? '' : ` (dont ${String(count)} ${plural(count, 'publiée', 'publiées')})`;
}

function codeList(codes: readonly string[], labelOf: AllergenLabeler): string {
  return `« ${codes.map(labelOf).join(', ')} »`;
}

/**
 * Le message du § 2 : ce qui change, sur combien de fiches, et la partition.
 *
 * Les comptes sont une PARTITION des fiches touchées (décision 7) : chaque
 * rubrique non nulle a sa clause, dans l'ordre de priorité du serveur.
 */
export function propagationMessage(
  view: IngredientAllergenPropagationView,
  labelOf: AllergenLabeler,
): string {
  const { counts } = view;
  const subject: string[] = [];
  if (view.added.length > 0) {
    subject.push(
      `${codeList(view.added, labelOf)} ${plural(view.added.length, 'ajouté', 'ajoutés')}`,
    );
  }
  if (view.removed.length > 0) {
    subject.push(
      `${codeList(view.removed, labelOf)} ${plural(view.removed.length, 'retiré', 'retirés')}`,
    );
  }
  const preposition = view.removed.length > 0 && view.added.length === 0 ? 'de' : 'à';
  const verb = subject.length > 1 ? 'touchent' : 'touche';
  const it = view.added.length + view.removed.length > 1 ? 'les' : 'le';
  const total = counts.productsTouched;

  const clauses: string[] = [];
  if (counts.toLose > 0) {
    clauses.push(
      `${String(counts.toLose)} ${plural(counts.toLose, 'pourrait', 'pourraient')} ${it} perdre${published(counts.toLosePublished)}`,
    );
  }
  if (counts.toReceive > 0) {
    clauses.push(
      `${String(counts.toReceive)} ${plural(counts.toReceive, 'va', 'vont')} ${it} recevoir${published(counts.toReceivePublished)}`,
    );
  }
  if (counts.blocked > 0) {
    clauses.push(
      `${String(counts.blocked)} ${plural(counts.blocked, 'est bloquée', 'sont bloquées')}`,
    );
  }
  if (counts.undeclared > 0) {
    clauses.push(
      `${String(counts.undeclared)} ${plural(counts.undeclared, "n'a", "n'ont")} pas encore de déclaration`,
    );
  }
  if (counts.alreadyDeclared > 0) {
    clauses.push(
      `${String(counts.alreadyDeclared)} ${it} ${plural(counts.alreadyDeclared, 'déclare', 'déclarent')} déjà`,
    );
  }
  let sentence = clauses.join(', ');
  if (counts.keptByOtherIngredient > 0) {
    const kept = `${String(counts.keptByOtherIngredient)} ${it} ${plural(counts.keptByOtherIngredient, 'garde', 'gardent')}, un autre ingrédient en contient`;
    sentence = sentence === '' ? kept : `${sentence} ; ${kept}`;
  }
  return `${subject.join(' et ')} ${preposition} ${view.ingredientName} ${verb} ${String(total)} ${plural(total, 'fiche', 'fiches')} : ${sentence}.`;
}

/** La fiche reçoit-elle ou perd-elle quelque chose, compte tenu des cases ? */
function productChanges(
  product: ProductAllergenPropagationView,
  kept: ReadonlySet<string>,
): boolean {
  return product.variants.some(
    (variant) =>
      variant.toAdd.length > 0 || (variant.toRemove.length > 0 && !kept.has(variant.variantId)),
  );
}

/** Une fiche PUBLIÉE dont une déclinaison perdrait un code — le cas en rouge. */
export function publishedLoses(
  product: ProductAllergenPropagationView,
  kept: ReadonlySet<string>,
): boolean {
  return (
    product.status === 'published' &&
    product.variants.some((variant) => variant.toRemove.length > 0 && !kept.has(variant.variantId))
  );
}

/**
 * Le N de « Appliquer à N fiches » : les fiches qui changent vraiment, une fois
 * les retraits décochés mis de côté. Sans case décochée, c'est à recevoir + à
 * perdre (la partition du serveur).
 */
export function appliedProductCount(
  view: IngredientAllergenPropagationView,
  kept: ReadonlySet<string>,
): number {
  return view.products.filter((product) => productChanges(product, kept)).length;
}

/** Les raisons d'un blocage, en mots. */
export function blockedReason(reason: 'archived_allergen' | 'refused_by_declaration'): string {
  return reason === 'archived_allergen'
    ? 'code archivé au référentiel'
    : 'la déclaration le refuse';
}
