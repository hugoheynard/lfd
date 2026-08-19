/**
 * **Le miroir a-t-il dérivé de sa source ?**
 *
 * La plateforme ne lit pas le référentiel : elle en tient un miroir, alimenté
 * par le fil catalogue, et c'est ce miroir que la caisse facture. Un miroir qui
 * décroche facture donc un prix que personne n'a décidé — sans que rien ne le
 * signale, puisque tout continue de fonctionner.
 *
 * Cette comparaison a changé de sujet. Elle a d'abord servi de **feu vert** :
 * comparer le seed en place au catalogue reçu, une fois, pour autoriser une
 * bascule d'argent. Cette bascule est faite, et un comparateur qui garde un
 * protocole terminé devient un écran qui rassure sans rien mesurer. Elle
 * compare désormais **ce que le référentiel publierait** à **ce que la
 * plateforme vend** — une question qui, elle, ne se referme jamais.
 *
 * Deux décisions de fond, et ce sont elles qui rendent le rapport lisible :
 *
 * - **on rapproche par SKU de déclinaison.** Les deux côtés parlent la même
 *   langue depuis que le miroir stocke ce que le fil envoie ; l'ancienne
 *   version devait rapprocher un SKU produit d'un SKU déclinaison, d'où toute
 *   une gymnastique qui disparaît ici ;
 * - **on compare le prix du référentiel, pas le prix appliqué.** Le prix B2B
 *   négocié est une décision légitime de la plateforme, pas une dérive. Les
 *   confondre ferait sonner l'alarme sur chaque client à qui l'on a consenti
 *   un tarif — c'est-à-dire tout le temps, donc jamais.
 *
 * **Pure** : deux listes en entrée, un constat en sortie. Aucune base, aucune
 * horloge — ce qui permet de l'éprouver par énumération.
 */

/** Un article tel que le référentiel le publierait — la source. */
export interface ReferenceEntry {
  /** SKU de la **déclinaison** : la clé de rapprochement des deux côtés. */
  readonly sku: string;
  readonly name: string;
  /** Prix canonique HT, en centimes. Celui du référentiel, avant toute décision. */
  readonly priceCents: number;
}

/** Un article tel que la plateforme le tient — le miroir. */
export interface MirrorEntry {
  readonly sku: string;
  readonly name: string;
  /** Le prix **reçu** du référentiel, pas celui qui sera facturé. */
  readonly pimPriceCents: number;
}

/** Un écart sur une valeur, dit avec les deux versions — jamais juste « diffère ». */
export interface FieldGap<T> {
  readonly sku: string;
  readonly reference: T;
  readonly mirror: T;
}

export interface ParityReport {
  readonly referenceCount: number;
  readonly mirrorCount: number;
  /**
   * Publiés par le référentiel, absents du miroir. **Le pire cas** : la
   * boutique ne sait pas les vendre, et le client ne comprend pas pourquoi.
   */
  readonly missing: readonly string[];
  /**
   * Dans le miroir, plus publiés. Ils continuent d'être vendus alors que le
   * référentiel les a retirés — ce qui est l'autre moitié du même défaut.
   */
  readonly stale: readonly string[];
  /** Le prix canonique a bougé sans que le miroir suive. Chaque ligne est de l'argent. */
  readonly priceGaps: readonly FieldGap<number>[];
  readonly nameGaps: readonly FieldGap<string>[];
  /**
   * `true` **seulement** si rien ne diffère. Un booléen plutôt qu'un score : la
   * question est « le miroir est-il fidèle ? », et elle n'a pas de nuance.
   */
  readonly inSync: boolean;
}

export function compareToReference(
  reference: readonly ReferenceEntry[],
  mirror: readonly MirrorEntry[],
): ParityReport {
  const mirrorBySku = new Map(mirror.map((entry) => [entry.sku, entry]));
  const seen = new Set<string>();

  const missing: string[] = [];
  const priceGaps: FieldGap<number>[] = [];
  const nameGaps: FieldGap<string>[] = [];

  for (const entry of reference) {
    const match = mirrorBySku.get(entry.sku);
    if (match === undefined) {
      missing.push(entry.sku);
      continue;
    }
    seen.add(entry.sku);

    if (match.pimPriceCents !== entry.priceCents) {
      priceGaps.push({ sku: entry.sku, reference: entry.priceCents, mirror: match.pimPriceCents });
    }
    if (match.name !== entry.name) {
      nameGaps.push({ sku: entry.sku, reference: entry.name, mirror: match.name });
    }
  }

  const stale = mirror.map((entry) => entry.sku).filter((sku) => !seen.has(sku));

  return {
    referenceCount: reference.length,
    mirrorCount: mirror.length,
    missing,
    stale,
    priceGaps,
    nameGaps,
    inSync:
      missing.length === 0 && stale.length === 0 && priceGaps.length === 0 && nameGaps.length === 0,
  };
}
