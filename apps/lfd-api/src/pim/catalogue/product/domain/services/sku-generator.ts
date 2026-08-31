import { referenceFrom } from "../../../../../platform/id/reference.js";
import { SkuGenerationExhaustedError } from "../errors/sku-errors.js";
import { Sku, SKU_MAX_LENGTH } from "../value-objects/sku.value-object.js";

/**
 * Génération de la référence **proposée** à la création.
 *
 * Choix documenté (ADR-16, révisé) : référence **opaque** `P-XXXXXX` plutôt que
 * signifiante. La forme signifiante (`VIEN-CROISS`) dérivait la référence du slug de
 * famille et du nom du produit — deux valeurs **éditoriales et mutables** — puis la
 * figeait. Reclasser un produit laissait donc sa référence affirmer une famille qui
 * n'était plus la sienne. L'invariant « rien ne parse jamais un SKU » protège le code
 * de ce mensonge ; il ne protège pas l'humain qui le lit.
 *
 * L'argument qui avait fait pencher vers le signifiant — « il sera lu à voix haute au
 * labo » — penche en réalité dans l'autre sens : six caractères tirés d'un alphabet
 * **sans caractères ambigus** se dictent mieux qu'une chaîne longue où `O` et `0` se
 * confondent. C'est le même raisonnement, et — depuis
 * `platform/id/reference.ts` — le même alphabet que la référence société `C-XXXXXX`.
 *
 * Le besoin d'une référence à un format imposé par un tiers ne disparaît pas — il est
 * servi là où il doit l'être : la colonne `channel_reference` de la table de binding du
 * canal (ADR-13), et la saisie manuelle qui reste possible à la création.
 *
 * Ce module est **pur** : il dépend d'un port, jamais d'un dépôt. Le défaut est *proposé*,
 * pas garanti unique — seul l'index unique en base garantit (cf. doc 06 §5).
 */
export interface SkuAvailability {
  isTaken(candidate: Sku): Promise<boolean>;
}

const MAX_ATTEMPTS = 10;

/** Préfixe de la référence produit — ce que le `C-` de la société est à un client. */
const PRODUCT_PREFIX = "P";

/** `01K7M3…QT9X4B` → `P-K7M3QT`. Déterministe : même identifiant, même référence. */
export function productSkuRoot(id: string): string {
  return referenceFrom(PRODUCT_PREFIX, id);
}

/**
 * Racine d'une déclinaison : la référence du produit, **suffixée par son rang**.
 *
 * Le suffixe n'est pas décoratif. L'espace de noms des références est global (produits et
 * déclinaisons confondus) : sans lui, la déclinaison par défaut viserait exactement la
 * référence de son produit, et la création échouerait sur le registre. Le rang — `-1`,
 * `-2` — se lit comme une numérotation d'atelier, et garde visible le fait que deux
 * déclinaisons appartiennent au même produit.
 */
export function variantSkuRoot(productSku: Sku, position: number): string {
  return `${productSku.value}-${position + 1}`;
}

/** Tronque sans laisser de tiret orphelin en fin de chaîne. */
function truncateTo(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max).replace(/-+$/u, "");
}

/**
 * Cherche la première référence produit libre.
 *
 * Collision → **re-tirage** d'un identifiant frais, jamais un suffixe : `P-K7M3QT-2`
 * se lirait comme la déclinaison n° 2 de `P-K7M3QT`, ce qu'elle ne serait pas. Le
 * motif est celui de `pickFreeCompanyReference`, à ceci près qu'on échoue franchement
 * plutôt que de rendre une valeur prise — le registre a déjà son erreur pour ça.
 */
export async function proposeProductSku(
  draw: () => string,
  availability: SkuAvailability,
): Promise<Sku> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const candidate = Sku.create(productSkuRoot(draw()));

    if (!(await availability.isTaken(candidate))) {
      return candidate;
    }
  }

  throw new SkuGenerationExhaustedError(`${PRODUCT_PREFIX}-`, MAX_ATTEMPTS);
}

/**
 * Cherche la première référence libre à partir d'une racine **déjà déterminée** — celle
 * d'une déclinaison, qui doit rester préfixée par son produit.
 * Collision → suffixe **numérique lisible** (`-2`, `-3`), jamais un hash.
 */
export async function proposeSku(root: string, availability: SkuAvailability): Promise<Sku> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const suffix = attempt === 1 ? "" : `-${attempt}`;
    const candidate = Sku.create(truncateTo(root, SKU_MAX_LENGTH - suffix.length) + suffix);

    if (!(await availability.isTaken(candidate))) {
      return candidate;
    }
  }

  throw new SkuGenerationExhaustedError(root, MAX_ATTEMPTS);
}
