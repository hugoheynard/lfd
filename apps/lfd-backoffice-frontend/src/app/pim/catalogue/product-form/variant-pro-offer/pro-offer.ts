import type { PublishedEntryView } from '@lfd/contracts';

/**
 * **Pourquoi une déclinaison n'est pas proposée aux pros** — une clé par cause
 * réelle (`plan-pro-voit-les-declinaisons.md`, L6). Des clés, pas des libellés.
 */
export type ProOfferCause =
  | 'not_received'
  | 'inactive'
  | 'public_only'
  | 'incomplete'
  | 'no_pro_price'
  | 'no_vat_rate'
  | 'review_pending'
  | 'hidden';

const SENTENCES: Readonly<Record<ProOfferCause, string>> = {
  not_received: 'absente du catalogue du commerce : pas encore reçue, ou retirée de la vente',
  inactive: 'la fiche n’est pas active',
  public_only: 'réservée aux particuliers (audience de la fiche)',
  incomplete: 'incomplète : il lui manque ce que l’activation demande',
  no_pro_price: 'pas de prix pro',
  no_vat_rate: 'pas de taux de TVA pour les pros',
  review_pending: 'validation pro en attente',
  hidden: 'masquée pour les pros',
};

/** Les causes qui se lèvent au « Catalogue publié » du commerce, et non dans la fiche. */
const SETTLED_AT_COMMERCE: ReadonlySet<ProOfferCause> = new Set(['review_pending', 'hidden']);

export function proOfferSentence(cause: ProOfferCause): string {
  return SENTENCES[cause];
}

/** La cause se lève-t-elle à l’écran « Catalogue publié » (valider, démasquer) ? */
export function settledAtCommerce(cause: ProOfferCause): boolean {
  return SETTLED_AT_COMMERCE.has(cause);
}

/**
 * **La cause, lue dans la vue « Catalogue publié »** — sans rien recalculer de
 * ce que le commerce décide : l’état de la cellule pro vient de lui
 * (`publishedCellOf`). On ne fait que départager `incomplet` et `pas_vendu`
 * avec ce que la même vue porte (manques, prix pro, audience de la fiche).
 *
 * `null` : la déclinaison est en vente aux pros.
 */
export function proOfferCauseOf(
  entry: PublishedEntryView | undefined,
  sku: string,
): ProOfferCause | null {
  const variant = entry?.variants.find((candidate) => candidate.sku === sku);
  if (entry === undefined || variant === undefined) {
    return 'not_received';
  }
  switch (variant.pro.state) {
    case 'en_vente':
      return null;
    case 'inactif':
      return 'inactive';
    case 'en_attente_validation':
      return 'review_pending';
    case 'masque':
      return 'hidden';
    case 'pas_vendu':
      return entry.audience === 'public' ? 'public_only' : 'not_received';
    case 'incomplet':
      if (variant.gaps.length > 0) {
        return 'incomplete';
      }
      return variant.pro.htMillicents === null ? 'no_pro_price' : 'no_vat_rate';
  }
}

/** Un onglet de la barre, tel que le magasin le rend. */
export interface ProOfferTab {
  readonly id: string;
  readonly label: string;
  readonly sku: string;
  readonly isDefault: boolean;
}

/** Une mention : la déclinaison, et ce qui l’écarte du canal pro. */
export interface ProOfferNote {
  readonly id: string;
  readonly label: string;
  readonly sku: string;
  readonly cause: ProOfferCause;
}

/**
 * Les mentions de la fiche : une par déclinaison MONTRÉE (le défaut, et les
 * autres quand la fiche les met en vignette) que le canal pro ne sert pas.
 */
export function proOfferNotesOf(
  entry: PublishedEntryView | undefined,
  tabs: readonly ProOfferTab[],
  variantsAsTiles: boolean,
): readonly ProOfferNote[] {
  return tabs
    .filter((tab) => tab.isDefault || variantsAsTiles)
    .flatMap((tab) => {
      const cause = proOfferCauseOf(entry, tab.sku);
      return cause === null ? [] : [{ id: tab.id, label: tab.label, sku: tab.sku, cause }];
    });
}
