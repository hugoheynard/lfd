import { fingerprint, toJsonObject, type JsonObject } from "./fingerprint.js";

/**
 * **La construction d'une révision — pure et testable.**
 *
 * Aucun appel réseau, aucune base, aucune horloge : l'instant de capture est
 * PASSÉ, jamais lu ici. C'est la pièce qui a de la valeur — le transport et le
 * stockage changeront, « ce que le catalogue était ce jour-là » ne changera pas.
 *
 * ## Ce qu'une révision contient
 *
 * La fiche entière, moins les octets des visuels — ils vivent dans le bucket et
 * voyagent par leur URL, et `MediaAsset` étant un agrégat à cycle propre, un
 * visuel remplacé crée un nouvel asset au lieu de s'écraser : l'URL ne ment pas.
 *
 * Le critère n'est pas « ce qui change une facture » — ce serait celui d'une
 * ancre de TARIF. C'est **ce qu'un canal doit recevoir pour être autosuffisant**,
 * parce que la boutique B2B sert ses propres pages et ne rappelle pas le PIM.
 *
 * ## Les héritages sont RÉSOLUS
 *
 * Taux et canaux entrent résolus, jamais sous la forme « ce produit hérite de sa
 * famille ». Garder l'héritage obligerait un diff à rejouer la résolution — avec
 * le code d'aujourd'hui, sur des données d'hier. Une ancre doit être lisible
 * sans son moteur.
 */

/** Ce qui change tout sans qu'aucune ligne d'article ne bouge. */
export interface RevisionHeader {
  /**
   * Le rapport prix pro / prix public, en points de base.
   *
   * Il est ICI et pas dans les articles parce qu'il est GLOBAL : le jour où il
   * passe de 9 000 à 8 800, aucune ligne de produit ne change et toutes les
   * factures professionnelles changent. Un diff qui ne le verrait pas dirait
   * « rien n'a bougé ». `null` = jamais réglé.
   */
  readonly proRatioBp: number | null;
}

/** Un visuel, tel qu'une révision le garde : son adresse, pas ses octets. */
export interface RevisionMedia {
  readonly role: string;
  readonly url: string;
  readonly alt: Readonly<Record<string, string>>;
}

/** Ce qu'une déclinaison est, ce jour-là. */
export interface RevisionItemInput {
  readonly sku: string;
  readonly productId: string;
  readonly productSku: string;
  readonly name: Readonly<Record<string, string>>;
  readonly kind: string;
  readonly status: string;
  readonly categoryId: string;
  /**
   * Le nom de la famille, **localisé** et recopié.
   *
   * Recopié et non déduit de `categoryId` : une famille renommée ne doit pas
   * réécrire le passé. Une ancre lue dans deux ans doit montrer le rayon tel
   * qu'il s'appelait, pas tel qu'il s'appelle.
   */
  readonly categoryName: Readonly<Record<string, string>>;
  /** Prix public TTC en centimes ; `null` = pas tarifé. */
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
  readonly isDefault: boolean;
  readonly isDiscontinued: boolean;
  /** `null` = aucune fiche réglementaire ; `[]` = fiche déclarée, sans allergène. */
  readonly allergens: readonly string[] | null;
  /** Le taux EFFECTIF par clé de contexte, héritage appliqué. */
  readonly vatByContext: Readonly<Record<string, number>>;
  /** Où la déclinaison se vend RÉELLEMENT, matrice résolue. */
  readonly soldContexts: readonly string[];
  readonly editorial: Readonly<Record<string, unknown>> | null;
  readonly media: readonly RevisionMedia[];
}

/** Un article figé, avec son empreinte. */
export interface RevisionItem {
  readonly sku: string;
  readonly hash: string;
  /** Du JSON **vérifié** : ce qui est stocké est exactement ce qui a été haché. */
  readonly payload: JsonObject;
}

export interface Revision {
  readonly header: RevisionHeader;
  readonly items: readonly RevisionItem[];
  /**
   * L'empreinte de la révision ENTIÈRE — en-tête et liste d'articles.
   *
   * Elle répond à « rien n'a changé depuis la dernière ? » en une comparaison,
   * sans lire un seul payload. Elle couvre l'en-tête : sinon deux révisions
   * séparées par un changement de rapport auraient la même, et l'ancre
   * mentirait sur ce qu'elle a figé.
   */
  readonly hash: string;
}

/**
 * Les articles, **triés par SKU**.
 *
 * L'ordre de lecture de la base n'est pas garanti stable ; sans ce tri, deux
 * captures d'un catalogue identique donneraient deux empreintes de révision.
 * L'ordre DANS un article (visuels, contextes) est conservé — il porte du sens.
 */
export function buildRevision(
  header: RevisionHeader,
  inputs: readonly RevisionItemInput[],
): Revision {
  const items = [...inputs]
    .sort((a, b) => (a.sku < b.sku ? -1 : 1))
    .map((input) => {
      const payload = toJsonObject({ ...input });
      return { sku: input.sku, hash: fingerprint(payload), payload };
    });
  return {
    header,
    items,
    hash: fingerprint({
      header,
      items: items.map((item) => [item.sku, item.hash]),
    }),
  };
}
