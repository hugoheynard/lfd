import { createHash } from "node:crypto";

import {
  readLocalized,
  SOURCE_LOCALE,
  type LocalizedText,
} from "../../../catalogue/shared/domain/value-objects/localized-text.js";
import type { ProductEditorialView } from "../../../catalogue/product/domain/ports/editorial-reader.js";
import type { ProductRecord } from "../../../catalogue/product/domain/ports/product.repository.js";

/**
 * Projection canonique → vocabulaire Shopify. **Pure et testable** : aucun appel réseau,
 * aucune dépendance Nest.
 *
 * C'est la pièce qui a de la valeur. Le transport (quelle mutation, quelle version d'API)
 * changera ; ce que *signifie* « ce produit chez Shopify » ne changera pas.
 */
export interface ShopifyVariantPayload {
  readonly sku: string;
  readonly title: string;
  readonly options: Readonly<Record<string, string>>;
  /** Prix décimal en chaîne (`"1.30"`), comme Shopify le sérialise ; `null` = non tarifé. */
  readonly price: string | null;
}

/** Référencement. Vide = Shopify retombe sur le titre / la description du produit. */
export interface ShopifySeoPayload {
  readonly title: string;
  readonly description: string;
}

export interface ShopifyProductPayload {
  readonly title: string;
  readonly handle: string;
  readonly status: "DRAFT" | "ACTIVE";
  /**
   * La description, en HTML. `""` n'est PAS une absence : c'est le référentiel qui
   * affirme qu'il n'y a pas de description, et cette affirmation doit partir — sinon
   * vider le champ ici laisserait l'ancien texte en ligne pour toujours.
   */
  readonly descriptionHtml: string;
  /**
   * La marque, ou `null` si le référentiel n'en déclare pas.
   *
   * Le seul champ qui s'omet au lieu de s'effacer, et la raison n'est pas la même que
   * ci-dessus : Shopify **assigne lui-même** un `vendor` (le nom de la boutique) à la
   * création. Ne rien déclarer n'est pas affirmer « aucune marque » — ce serait écraser
   * une valeur qui ne nous appartient pas.
   */
  readonly vendor: string | null;
  readonly seo: ShopifySeoPayload;
  readonly variants: readonly ShopifyVariantPayload[];
}

/**
 * Projette un produit **et sa couche éditoriale**.
 *
 * L'éditorial est un satellite optionnel du produit, pas un de ses champs : il a sa
 * propre table et son propre rythme de vie (l'identité ne bouge jamais, les textes
 * changent chaque saison). Il arrive donc en second paramètre, `null` quand personne
 * n'a rien écrit — et le produit part quand même.
 *
 * `story` et `pairing` ne sont PAS projetés : Shopify n'a qu'un champ de description,
 * et décider s'ils s'y concatènent ou vivent en metafields est un arbitrage éditorial,
 * pas une évidence technique. Les inventer ici les rendrait invisibles à qui les écrit.
 */
/**
 * La langue que la vitrine Shopify sert.
 *
 * Elle était implicite — la vue rendait le français à plat, donc la projection
 * poussait du français sans jamais le dire. Elle le dit maintenant, et c'est ici
 * que se pose la question le jour où une seconde vitrine ouvre : `readLocalized`
 * prendra une autre locale, et rien d'autre ne bougera.
 */
const STOREFRONT_LOCALE = SOURCE_LOCALE;

/** La vitrine ne parle qu'une langue à la fois ; `""` quand rien n'est écrit. */
function forStorefront(text: LocalizedText | null | undefined): string {
  return text === null || text === undefined ? "" : readLocalized(text, STOREFRONT_LOCALE);
}

export function projectProduct(
  product: ProductRecord,
  editorial: ProductEditorialView | null,
): ShopifyProductPayload {
  return {
    title: product.name.fr,
    handle: product.slug.fr,
    // Un brouillon reste un brouillon : on ne met jamais en ligne par inadvertance.
    status: product.status === "published" ? "ACTIVE" : "DRAFT",
    // La longue l'emporte : Shopify n'a qu'un champ, et le résumé sert ailleurs
    // (listes, cartes, caisse). À défaut de longue, le résumé vaut mieux que rien.
    descriptionHtml: toHtml(
      forStorefront(editorial?.descriptionLong ?? editorial?.descriptionShort),
    ),
    vendor: emptyToNull(editorial?.brand ?? null),
    seo: {
      title: forStorefront(editorial?.seoTitle),
      description: forStorefront(editorial?.seoDescription),
    },
    variants: product.variants
      .filter((variant) => !variant.isDiscontinued)
      .map((variant) => ({
        sku: variant.sku,
        title: variant.name.fr,
        options: variant.options,
        // Centimes canoniques → décimal texte que l'API Admin attend ("130" → "1.30").
        price: variant.priceCents === null ? null : (variant.priceCents / 100).toFixed(2),
      })),
  };
}

/** Une chaîne blanche ne déclare rien de plus qu'une colonne absente. */
function emptyToNull(value: string | null): string | null {
  return value === null || value.trim() === "" ? null : value;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Texte saisi → HTML de fiche.
 *
 * **Le markdown n'est pas interprété.** Le modèle annonce `description_long` en
 * markdown, mais rien n'en a jamais rendu : ni le champ de saisie (un `textarea` nu),
 * ni un quelconque lecteur. Le faire ici inventerait une convention que personne n'a
 * apprise, et une astérisque tapée pour elle-même deviendrait de l'italique.
 *
 * Ce qui est fait, en revanche, l'est intégralement : le texte est **échappé** — une
 * balise saisie dans le back-office ne devient jamais du balisage sur la boutique — et
 * les lignes blanches deviennent des paragraphes, les simples retours des `<br>`,
 * parce que c'est ce qu'un rédacteur croit faire en appuyant sur Entrée.
 */
function toHtml(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") {
    return "";
  }
  return trimmed
    .split(/\n\s*\n/u)
    .map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/gu, "<br>")}</p>`)
    .join("");
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Empreinte de ce qui a été poussé.
 *
 * Elle permet deux choses : **ne pas repousser** ce qui n'a pas bougé (le canal a des
 * quotas d'appels), et **détecter une dérive** — si l'empreinte du catalogue diffère de
 * la dernière poussée, quelque chose a changé d'un côté ou de l'autre.
 *
 * Les clés sont triées : deux objets équivalents doivent produire la **même** empreinte,
 * sans quoi tout paraîtrait modifié en permanence.
 */
export function fingerprint(payload: ShopifyProductPayload): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
