import type { PimContextPrice } from "./entities/catalog-item.js";

/**
 * **Qu'est-ce que cette arrivée change ?**
 *
 * Le calcul qui manquait, et il en fallait un séparé. Deux questions se
 * ressemblent au point qu'on les avait confondues, alors qu'elles n'ont ni le
 * même moment, ni la même population :
 *
 * | La question | Population | Quand |
 * | --- | --- | --- |
 * | « qu'est-ce que cette arrivée change ? » | les SKU livrés et le miroir | à la **réception** |
 * | « qui est touché ? » | les commandes ouvertes | à la **validation** |
 *
 * La seconde ne voit que ce qui a été commandé : une correction d'allergène sur
 * un article que personne n'a pris ne lui produit **aucune ligne**. C'est le cas
 * majoritaire, et c'est précisément celui où l'attente fait mal — d'où ce
 * calcul-ci, qui ne regarde pas les commandes.
 *
 * Il sert deux lectures : l'escalade à la réception (« cette arrivée touche-t-elle
 * une déclaration d'allergène ? ») et le **diff de l'arrivée** que l'écran de
 * validation doit montrer. Un seul diff, deux usages.
 *
 * **Pur** : deux listes en entrée, un constat en sortie. Aucune base, aucune
 * horloge — ce qui permet de l'éprouver par énumération.
 */

/** Un article tel que l'arrivée le porte, ou tel que le miroir le tient. */
export interface DeliveredItem {
  readonly sku: string;
  readonly name: string;
  /** Prix **reçu** du référentiel, jamais le prix négocié : celui-ci n'arrive pas. */
  readonly priceMillicents: number;
  readonly vatRatePercent: number | null;
  /** L'étiquette TTC en centimes. `null` = arrivée ou ligne d'avant le fil v9. */
  readonly publicTtcCents: number | null;
  /** Le prix public par contexte. `null` = arrivée ou ligne d'avant le fil v9. */
  readonly publicByContext: Readonly<Record<string, PimContextPrice>> | null;
  readonly weightGrams: number | null;
  readonly categoryId: string;
  /**
   * Les codes déclarés. **Trois états**, tous significatifs : `null` = aucune
   * fiche réglementaire, `[]` = fiche déclarée sans allergène, une liste = les
   * codes. Les deux premiers ne se confondent pas — l'un est un silence, l'autre
   * une affirmation qu'un client a le droit de lire.
   */
  readonly allergens: readonly string[] | null;
  /**
   * **Jusqu'à quand on prend commande de cet article**, résolue.
   *
   * Elle n'était pas comparée, et le fil ne la portait alors qu'en valeur par
   * déclinaison : passer la limite globale de 18 h à 16 h produisait donc une
   * arrivée annoncée **« 0 changement »**, qu'un humain devait valider à
   * l'aveugle. Un diff qui ignore un champ ne dit pas « rien n'a bougé », il ne
   * dit rien du tout — et c'est pire, parce qu'on le lit comme le premier.
   */
  readonly orderTimeLimit: {
    readonly daysBefore: number;
    readonly time: string;
    readonly graceMinutes: number;
  } | null;
  /**
   * **La ligne de vitrine** et le **packshot**, comparés pour la même raison que
   * la limite : sans eux ici, une description ou une photo passerait en vente
   * SANS RELECTURE, pendant que l'écran de réception continuerait d'affirmer que
   * rien ne passe sans être relu. Un diff qui ignore un champ ne dit pas « rien
   * n'a bougé », il ne dit rien du tout — et c'est pire, parce qu'on le lit
   * comme le premier.
   *
   * Ce n'est pas de la cosmétique : ce sont les deux choses qu'un client lit
   * avant d'acheter, et la seule prose que la maison publie sous son nom.
   */
  readonly note: string | null;
  readonly image: {
    readonly url: string;
    readonly alt: string;
    readonly width: number | null;
    readonly height: number | null;
  } | null;
  /**
   * La **vignette de rayon**, comparée pour exactement la même raison que le
   * packshot : c'est ce qu'un client voit d'abord, en rayon, avant même
   * d'ouvrir la fiche.
   *
   * 🔴 L'ajouter au fil SANS l'ajouter ici l'aurait fait passer en vente sans
   * relecture, pendant que l'écran de réception aurait continué d'affirmer que
   * rien ne passe sans être relu. Un diff qui ignore un champ ne dit pas
   * « rien n'a bougé » : il ne dit rien du tout, et c'est pire parce qu'on le
   * lit comme le premier.
   */
  readonly thumbnail: {
    readonly url: string;
    readonly alt: string;
    readonly width: number | null;
    readonly height: number | null;
  } | null;
  /**
   * **Vendu seulement pendant une opération** (fil v11). Comparé pour la
   * raison que la vignette donne juste au-dessus : rendre la bûche exclusive
   * change QUAND elle se vend, et un diff qui l'ignorerait l'annoncerait
   * « inchangée ».
   */
  readonly operationOnly: boolean;
}

/** Ce qu'une arrivée fait à un SKU. */
export type SkuChangeKind = "added" | "removed" | "changed";

/** Les champs comparés, nommés — jamais un booléen « a changé ». */
export type ChangedField =
  | "name"
  | "price"
  | "vatRate"
  | "weight"
  | "category"
  | "allergens"
  | "orderLimit"
  | "note"
  | "image"
  | "thumbnail"
  | "operationOnly"
  /**
   * **L'étiquette a bougé** — ce qu'un particulier paie, taxe comprise.
   *
   * Distinct de `price`, qui porte le prix PROFESSIONNEL. Les deux bougent
   * souvent ensemble — le pro se dérive de l'étiquette — mais pas toujours :
   * changer le rapport pro déplace `price` seul.
   */
  | "publicPrice"
  /**
   * 🔴 **Un taux de TVA PUBLIC a bougé**, ou un contexte de vente est apparu
   * ou disparu.
   *
   * C'est le cas que rien ne voyait. `vatRate` porte le taux du contexte
   * **`b2b`** — le seul qui traversait le fil avant la v9. Passer le taux « à
   * emporter » de 5,5 % à 10 % ne le touche pas, et ne déplace pas non plus
   * l'étiquette : **l'arrivée aurait dit « rien n'a changé »** alors que ce
   * qu'un consommateur paie venait de bouger.
   */
  | "publicVatRate";

/** Ce qui arrive à UN sku. */
export interface SkuChange {
  readonly sku: string;
  readonly kind: SkuChangeKind;
  /**
   * Les champs qui diffèrent. Vide sur `added` et `removed` : la question n'est
   * pas « lesquels ont bougé » quand l'article entier entre ou sort.
   */
  readonly fields: readonly ChangedField[];
}

/**
 * Compare deux listes d'allergènes **par contenu**, pas par ordre.
 *
 * Le PIM ne garantit pas l'ordre des codes, et un réordonnancement ne change
 * rien à ce qu'un client lit. Le signaler ferait sonner l'escalade la plus
 * grave du modèle pour rien — et une alerte qui se déclenche pour rien cesse
 * d'être lue, précisément avant celle qui comptait.
 */
function sameAllergens(left: readonly string[] | null, right: readonly string[] | null): boolean {
  if (left === null || right === null) {
    // `null` contre `[]` doit DIFFÉRER : « pas de fiche » n'est pas « aucun
    // allergène ». Les confondre transformerait un silence en affirmation.
    return left === right;
  }
  if (left.length !== right.length) {
    return false;
  }
  const sortedRight = [...right].sort();
  return [...left].sort().every((code, index) => code === sortedRight[index]);
}

/**
 * Deux limites sont-elles la même ?
 *
 * `null` contre une limite compte, et dans les deux sens : un article qui cesse
 * de fermer et un article qui se met à fermer sont l'un et l'autre une nouvelle.
 * Les trois valeurs se comparent ensemble parce qu'elles voyagent ensemble —
 * une limite n'existe qu'entière.
 */
function sameLimit(
  left: DeliveredItem["orderTimeLimit"],
  right: DeliveredItem["orderTimeLimit"],
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.daysBefore === right.daysBefore &&
    left.time === right.time &&
    left.graceMinutes === right.graceMinutes
  );
}

/**
 * Deux packshots sont-ils le même ?
 *
 * Comparés **champ par champ** et pas par leur seule URL : une alternative
 * réécrite ne change pas l'image mais change ce qu'un lecteur d'écran entend, et
 * des dimensions corrigées changent la place que la grille réserve. Trois faits
 * distincts, trois raisons de relire.
 */
function sameImage(
  left: DeliveredItem["image"] | DeliveredItem["thumbnail"],
  right: DeliveredItem["image"] | DeliveredItem["thumbnail"],
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.url === right.url &&
    left.alt === right.alt &&
    left.width === right.width &&
    left.height === right.height
  );
}

/** Les champs qui diffèrent entre ce qui arrive et ce qu'on tient. */
function changedFields(incoming: DeliveredItem, mirror: DeliveredItem): readonly ChangedField[] {
  const fields: ChangedField[] = [];
  if (incoming.name !== mirror.name) {
    fields.push("name");
  }
  if (incoming.priceMillicents !== mirror.priceMillicents) {
    fields.push("price");
  }
  if (incoming.vatRatePercent !== mirror.vatRatePercent) {
    fields.push("vatRate");
  }
  if (incoming.publicTtcCents !== mirror.publicTtcCents) {
    fields.push("publicPrice");
  }
  if (!samePublicRates(incoming.publicByContext, mirror.publicByContext)) {
    fields.push("publicVatRate");
  }
  if (incoming.weightGrams !== mirror.weightGrams) {
    fields.push("weight");
  }
  if (incoming.categoryId !== mirror.categoryId) {
    fields.push("category");
  }
  if (!sameAllergens(incoming.allergens, mirror.allergens)) {
    fields.push("allergens");
  }
  if (!sameLimit(incoming.orderTimeLimit, mirror.orderTimeLimit)) {
    fields.push("orderLimit");
  }
  // `null` et `""` ne sont pas la même chose, et le `!==` les distingue : une
  // ligne EFFACÉE se relit, une ligne jamais écrite aussi, et ce ne sont pas
  // les mêmes nouvelles.
  if (incoming.note !== mirror.note) {
    fields.push("note");
  }
  if (!sameImage(incoming.image, mirror.image)) {
    fields.push("image");
  }
  // La MÊME comparaison, sur un champ distinct : une vignette et un packshot
  // n'ont ni le même cadrage ni le même ratio, et changer l'un ne dit rien de
  // l'autre. Les replier sur une seule ligne de relecture ferait croire qu'on a
  // vu passer la photo de fiche alors qu'on a vu passer la vignette.
  if (!sameImage(incoming.thumbnail, mirror.thumbnail)) {
    fields.push("thumbnail");
  }
  if (incoming.operationOnly !== mirror.operationOnly) {
    fields.push("operationOnly");
  }
  return fields;
}

/**
 * Ce que l'arrivée change, SKU par SKU — trié, et sans les inchangés.
 *
 * Le tri par SKU n'est pas cosmétique : deux lectures du même diff doivent
 * donner la même liste, sinon un écran de validation change d'ordre entre deux
 * rafraîchissements et personne ne sait plus ce qu'il a déjà relu.
 */
export function diffDelivery(
  incoming: readonly DeliveredItem[],
  mirror: readonly DeliveredItem[],
): readonly SkuChange[] {
  const held = new Map(mirror.map((item) => [item.sku, item]));
  const arriving = new Set(incoming.map((item) => item.sku));
  const changes: SkuChange[] = [];

  for (const item of incoming) {
    const known = held.get(item.sku);
    if (known === undefined) {
      changes.push({ sku: item.sku, kind: "added", fields: [] });
      continue;
    }
    const fields = changedFields(item, known);
    if (fields.length > 0) {
      changes.push({ sku: item.sku, kind: "changed", fields });
    }
  }

  // Un retrait est une ABSENCE dans l'arrivée : il ne s'exprime pas dans une
  // liste de lignes entrantes, et c'est pour ça que la réception porte le
  // snapshot ENTIER. Sans lui, « ce qui sort » ne serait pas validable.
  for (const item of mirror) {
    if (!arriving.has(item.sku)) {
      changes.push({ sku: item.sku, kind: "removed", fields: [] });
    }
  }

  return changes.sort((left, right) => (left.sku < right.sku ? -1 : left.sku > right.sku ? 1 : 0));
}

/**
 * **Les taux publics sont-ils les mêmes ?** — contexte par contexte.
 *
 * Compare les TAUX, jamais les hors taxe : ces derniers se dérivent des
 * premiers, et les comparer aussi ferait sonner deux fois pour un seul
 * changement. Un contexte gagné ou perdu compte comme un changement de taux —
 * c'est une manière de vendre qui s'ouvre ou se ferme, et elle a son
 * traitement fiscal.
 *
 * Deux `null` sont égaux : deux lignes d'avant la v9 n'ont rien à se dire. Un
 * `null` contre une carte ne l'est pas — c'est le premier push qui apporte le
 * prix public, et il mérite d'être vu.
 */
function samePublicRates(
  incoming: Readonly<Record<string, PimContextPrice>> | null,
  mirror: Readonly<Record<string, PimContextPrice>> | null,
): boolean {
  if (incoming === null || mirror === null) {
    return incoming === mirror;
  }
  const keys = new Set([...Object.keys(incoming), ...Object.keys(mirror)]);
  for (const key of keys) {
    if (incoming[key]?.vatRatePercent !== mirror[key]?.vatRatePercent) {
      return false;
    }
  }
  return true;
}

/**
 * 🔴 **L'arrivée touche-t-elle un taux de TVA PUBLIC ?**
 *
 * Le second motif qui fait sonner la cloche à la réception, et il a la même
 * forme que le premier pour la même raison : une arrivée peut attendre
 * indéfiniment sans que rien ne casse, **sauf** quand ce qu'elle porte a un
 * effet qu'on ne veut pas laisser dormir.
 *
 * Un allergène qui dort est un risque pour quelqu'un. Un taux de TVA qui dort
 * est de l'argent facturé au mauvais taux — dans un sens ou dans l'autre, et
 * sur chaque vente publique d'ici la validation.
 *
 * ⚠️ Un article qui ENTRE ne compte PAS ici, contrairement aux allergènes. Sa
 * déclaration d'allergène est nouvelle et personne ne l'a relue ; son taux,
 * lui, ne remplace rien — il n'y a pas de vente en cours à mal facturer.
 */
export function carriesPublicVatChange(changes: readonly SkuChange[]): boolean {
  return changes.some((change) => change.fields.includes("publicVatRate"));
}

/**
 * L'arrivée touche-t-elle une **déclaration d'allergène** ?
 *
 * C'est la seule question qui fasse sonner la cloche à la réception. Le délai de
 * validation n'est pas borné — une arrivée peut attendre indéfiniment sans que
 * rien ne casse — **sauf** pour une correction d'allergène qui dormirait. On a
 * refusé de retenir une version pour ne pas bloquer une telle correction ; il
 * serait absurde de la laisser bloquer par oubli.
 *
 * Un article qui ENTRE compte aussi : sa déclaration est nouvelle, et personne
 * ne l'a encore relue.
 */
export function carriesAllergenChange(changes: readonly SkuChange[]): boolean {
  return changes.some((change) => change.kind === "added" || change.fields.includes("allergens"));
}
