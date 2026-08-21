import { SkuGenerationExhaustedError } from "../errors/sku-errors.js";
import { Sku, SKU_MAX_LENGTH } from "../value-objects/sku.value-object.js";

/**
 * Génération de la référence **proposée** à la création.
 *
 * Choix documenté (ADR-16) : référence **signifiante** plutôt que séquentielle — elle sera
 * lue à voix haute au labo et cherchée sur un écran de caisse. Son défaut habituel
 * (l'information se périme) est neutralisé par l'invariant « rien ne parse jamais un SKU ».
 *
 * Ce module est **pur** : il dépend d'un port, jamais d'un dépôt. Le défaut est *proposé*,
 * pas garanti unique — seul l'index unique en base garantit (cf. doc 06 §5).
 */
export interface SkuAvailability {
  isTaken(candidate: Sku): Promise<boolean>;
}

const MAX_ATTEMPTS = 10;
const FAMILY_LENGTH = 4;
const PRODUCT_MAX_WORDS = 2;
const PRODUCT_WORD_LENGTH = 6;
const SINGLE_SEGMENT_LENGTH = 4;

/** Mots vides français : ils remplissent la référence sans rien lui apprendre. */
const STOP_WORDS = new Set([
  "A",
  "AU",
  "AUX",
  "D",
  "DE",
  "DES",
  "DU",
  "EN",
  "ET",
  "L",
  "LA",
  "LE",
  "LES",
  "SUR",
]);

function segments(source: string): string[] {
  const normalized = Sku.normalize(source);
  return normalized === "" ? [] : normalized.split("-");
}

function isNumeric(segment: string): boolean {
  return /^[0-9]+$/u.test(segment);
}

/** `viennoiseries` → `VIEN` */
export function familyPrefix(categorySlug: string): string {
  return segments(categorySlug).join("").slice(0, FAMILY_LENGTH);
}

/** `Tarte aux fraises` → `TARTE-FRAISE` */
export function productMnemonic(productName: string): string {
  return segments(productName)
    .filter((segment) => !STOP_WORDS.has(segment))
    .slice(0, PRODUCT_MAX_WORDS)
    .map((segment) => segment.slice(0, PRODUCT_WORD_LENGTH))
    .join("-");
}

/**
 * `{ taille: "6 pers" }` → `6P` · `{ parfum: "chocolat" }` → `CHOC`
 *
 * Un segment numérique est conservé entier (il porte l'information) ; un segment
 * alphabétique est réduit à son initiale quand il en accompagne d'autres, et gardé
 * plus long quand il est seul — sinon `chocolat` deviendrait `C`.
 */
export function optionsDiscriminator(options: ReadonlyMap<string, string>): string {
  const parts: string[] = [];

  for (const value of options.values()) {
    const parsed = segments(value);
    const compact = parsed
      .map((segment) => {
        if (isNumeric(segment)) {
          return segment;
        }
        return parsed.length === 1 ? segment.slice(0, SINGLE_SEGMENT_LENGTH) : segment.slice(0, 1);
      })
      .join("");

    if (compact !== "") {
      parts.push(compact);
    }
  }

  return parts.join("-");
}

export function productSkuRoot(categorySlug: string, productName: string): string {
  return [familyPrefix(categorySlug), productMnemonic(productName)]
    .filter((part) => part !== "")
    .join("-");
}

/**
 * Racine d'une déclinaison : la référence du produit, **suffixée**.
 *
 * Le suffixe n'est pas décoratif. L'espace de noms des références est global (produits et
 * déclinaisons confondus) : sans lui, la déclinaison par défaut d'un produit sans option
 * viserait exactement la référence de son produit, et la création échouerait sur le
 * registre. Quand aucune option ne distingue la déclinaison, on retombe donc sur son
 * **rang** — `-1`, `-2` — ce qui reste lisible et se lit comme une numérotation d'atelier.
 */
export function variantSkuRoot(
  productSku: Sku,
  options: ReadonlyMap<string, string>,
  position: number,
): string {
  const discriminator = optionsDiscriminator(options);
  const suffix = discriminator === "" ? `${position + 1}` : discriminator;
  return `${productSku.value}-${suffix}`;
}

/** Tronque sans laisser de tiret orphelin en fin de chaîne. */
function truncateTo(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max).replace(/-+$/u, "");
}

/**
 * Cherche la première référence libre à partir d'une racine.
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
