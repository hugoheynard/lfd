import type { B2bExclusionReason } from './b2b-channel-api';

/**
 * 🔴 **Un BROUILLON part quand même à la boutique professionnelle.**
 *
 * Ce n'est pas un motif d'exclusion — c'est l'inverse : la projection B2B ne
 * consulte JAMAIS le statut de la fiche. Elle part de l'appartenance au canal
 * (`publishedProductIds()` rend toutes les liaisons, quel que soit le statut),
 * charge les produits par identifiant (`byIds` ne filtre que sur l'id), et ne
 * regarde ensuite que la matrice, le tarif et le taux. Un brouillon dont le
 * canal est ouvert est donc VENDU aux professionnels (vérifié le 2026-09-13 ;
 * l'écart est déjà nommé dans `ecrans-du-cycle-catalogue.md`).
 *
 * Aucun aperçu ne peut le dire, puisque rien ne l'écarte. C'est l'écran qui doit
 * le voir — et c'est pour ça que ce motif est fabriqué ICI plutôt que reçu du
 * serveur.
 */
const BROUILLON_VENDU = 'brouillon_vendu_aux_pros';

/**
 * Le motif d'exclusion, dit en français plutôt qu'en clé technique.
 *
 * 🔴 **Une seule table pour tous les écrans qui la lisent.** Elle vivait dans
 * `publication-b2b.ts`, et la liste des produits a désormais besoin des mêmes
 * mots : deux tables auraient dit la même chose de deux façons, et se seraient
 * séparées au premier motif ajouté — exactement la dérive que
 * `B2bExclusionReason` raconte dans son propre JSDoc, un cran plus haut.
 *
 * Le `Record` est exhaustif par construction : un motif ajouté au contrat ne
 * compile pas tant qu'il n'est pas traduit ici.
 */
export const REASON_LABELS: Readonly<Record<B2bExclusionReason, string>> = {
  variant_sans_prix: 'pas de tarif',
  variant_arretee: 'déclinaison arrêtée',
  produit_sans_variante_vendable: 'aucune déclinaison vendable',
  famille_inconnue: 'famille absente du référentiel',
  canal_ferme: 'non vendue aux professionnels',
  // « le prix existe, le taux manque » : c'est l'écran des taux qu'il faut
  // ouvrir, pas celui du tarif. Le dire évite d'aller corriger au mauvais
  // endroit.
  variant_sans_taux: 'prix sans taux B2B',
};

/**
 * Le seul motif que l'ÉCRAN fabrique, faute que le serveur puisse le dire.
 *
 * Séparé de la table du contrat, et volontairement : celle-ci traduit une union
 * fermée que le référentiel produit. Y glisser une clé qu'il n'émet jamais
 * ferait croire qu'il peut l'émettre — et le prochain qui cherchera d'où elle
 * vient ouvrira `projection.ts` pour rien.
 */
const LABELS_ECRAN: Readonly<Record<string, string>> = {
  [BROUILLON_VENDU]: 'brouillon, et pourtant vendu aux pros',
};

/**
 * « On ne la vend pas aux professionnels » — le refus qui n'en est pas un.
 *
 * Écrit une fois, et typé sur l'union pour qu'un renommage du motif casse ici
 * plutôt que de rendre une comparaison silencieusement fausse. Tous les autres
 * motifs décrivent une fiche incomplète ; celui-ci décrit une **décision**, et
 * c'est ce qui lui vaut son propre état de badge.
 */
export const CHANNEL_CLOSED: B2bExclusionReason = 'canal_ferme';

/**
 * Le motif en français, ou tel quel s'il est inconnu.
 *
 * Le motif voyage en **chaîne** dans `B2bPushPreviewView` et non en union
 * fermée : son vocabulaire appartient au référentiel, et `@lfd/contracts` ne
 * l'importe pas. Le back-office connaît les deux langages, donc c'est lui qui
 * traduit — et un motif qu'il ne connaît pas encore s'affiche plutôt que de
 * disparaître.
 */
export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason as B2bExclusionReason] ?? LABELS_ECRAN[reason] ?? reason;
}

/** Une fiche minimale — tout ce que ces fonctions ont besoin de savoir d'un produit. */
export interface ExcludableProduct {
  readonly sku: string;
  readonly status: string;
  readonly variants: readonly { readonly sku: string }[];
}

/** Ce qui empêche une ligne de partir, prêt à être lu. */
export interface Blocker {
  readonly sku: string;
  /** La clé brute — pour décider, pas pour afficher. */
  readonly reason: string;
  readonly label: string;
  /** Le refus porte-t-il sur la fiche entière, ou sur une seule déclinaison ? */
  readonly wholeProduct: boolean;
}

/**
 * L'aperçu, indexé par SKU — la forme dans laquelle une table le consulte.
 *
 * L'aperçu rend une liste plate où produits et déclinaisons se côtoient, sans
 * dire lesquels sont lesquels : c'est le SKU seul qui les relie. L'index est
 * donc fait une fois par chargement, pas une fois par ligne — une table de cent
 * fiches à quatre déclinaisons chercherait sinon dans un tableau cinq cents
 * fois.
 */
export function exclusionIndex(
  excluded: readonly { readonly sku: string; readonly reason: string }[],
): ReadonlyMap<string, string> {
  return new Map(excluded.map((exclusion) => [exclusion.sku, exclusion.reason]));
}

/**
 * Ce qui empêche CETTE fiche de partir — la sienne d'abord, ses déclinaisons
 * ensuite.
 *
 * L'ordre n'est pas cosmétique : « aucune déclinaison vendable » est la
 * conséquence, « pas de tarif » sur `P-8EMFGZ-1` est la cause, et on lit une
 * conséquence avant d'aller chercher pourquoi. Les déclinaisons gardent l'ordre
 * de la fiche, qui est celui de l'écran d'édition — c'est là qu'on va corriger.
 *
 * Une fiche absente de l'index rend `[]`, et ce n'est pas la même chose qu'une
 * fiche sans reproche : l'aperçu ne couvre que les produits dont le canal est
 * ouvert (`publishedProductIds`), donc une fiche jamais mise en vente aux pros
 * n'y figure pas. Ne rien dire est juste — elle n'a pas de refus, elle n'a pas
 * de candidature.
 */
export function blockersOf(
  product: ExcludableProduct,
  index: ReadonlyMap<string, string>,
  /** La fiche est-elle ouverte sur le canal professionnel ? */
  surLeCanalB2b = false,
): readonly Blocker[] {
  const blockers: Blocker[] = [];
  // En PREMIER, et ce n'est pas un ordre d'affichage : un brouillon qui part en
  // vente est une anomalie d'une autre nature que « il manque un tarif ». Les
  // autres motifs disent pourquoi une fiche ne partira PAS ; celui-ci dit
  // qu'elle part alors qu'elle ne devrait pas.
  if (surLeCanalB2b && product.status === 'draft') {
    blockers.push({
      sku: product.sku,
      reason: BROUILLON_VENDU,
      label: reasonLabel(BROUILLON_VENDU),
      wholeProduct: true,
    });
  }
  const own = index.get(product.sku);
  if (own !== undefined) {
    blockers.push({ sku: product.sku, reason: own, label: reasonLabel(own), wholeProduct: true });
  }
  for (const variant of product.variants) {
    const reason = index.get(variant.sku);
    if (reason !== undefined) {
      blockers.push({ sku: variant.sku, reason, label: reasonLabel(reason), wholeProduct: false });
    }
  }
  return blockers;
}

/**
 * La fiche est-elle écartée parce qu'on a **décidé** de ne pas la vendre aux
 * pros ?
 *
 * Ce motif n'est pas un manque, et il ne se lit donc pas au même endroit que
 * les autres : c'est le badge de la colonne B2B qui le porte, pas la note sous
 * la ligne. Les confondre ferait écrire deux fois la même phrase sur une même
 * ligne — une en pastille, une en avertissement.
 */
export function isChannelClosed(blockers: readonly Blocker[]): boolean {
  return blockers.some((blocker) => blocker.reason === CHANNEL_CLOSED);
}

/**
 * Ce qui **manque** à la fiche — les refus qu'on peut aller corriger.
 *
 * C'est-à-dire tout sauf {@link CHANNEL_CLOSED}, qui est une décision et non un
 * oubli. En pratique la liste est alors vide de toute façon : la projection
 * `continue` dès qu'elle voit le canal fermé, donc elle n'examine même pas les
 * déclinaisons de cette fiche (vérifié le 2026-09-13, `projection.ts:292`). Le
 * filtre existe pour que l'écran ne dépende pas de ce raccourci — si la
 * projection se mettait un jour à tout inspecter, la note dirait toujours la
 * bonne chose.
 */
export function faultsOf(blockers: readonly Blocker[]): readonly Blocker[] {
  return blockers.filter((blocker) => blocker.reason !== CHANNEL_CLOSED);
}
