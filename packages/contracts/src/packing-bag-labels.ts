/**
 * **Les étiquettes des sacs d'une commande** (2026-10-25, demande de Hugo :
 * « je ne peux pas faire d'étiquette pour les sacs »).
 *
 * Route : `GET admin/packing/:date/orders/:orderId/bag-labels` (droit
 * `production_packing:read`) → {@link PackingBagLabelsView}. Une LECTURE :
 * imprimer ne crée rien, réimprimer non plus.
 *
 * Tout ce qui s'imprime est composé au serveur : le libellé et le créneau par
 * le fournil (les mêmes fonctions que ses papiers), la couleur et le QR par le
 * commerce (la règle du bon de commande, la fabrique des courriels). L'écran
 * met en page, il ne compose rien.
 */
export interface PackingBagLabelsView {
  readonly orderId: string;
  /** Le numéro de commande, « ORD-… », imprimé en gros. */
  readonly reference: string;
  readonly customerLabel: string;
  /** « Retrait Village · pro » — le libellé des papiers du fournil. */
  readonly fulfillmentLabel: string;
  /** « 8 h 00 – 10 h 00 », ou « Sans heure convenue ». */
  readonly when: string;
  /** `#rrggbb` ; `null` : pas de carré. */
  readonly color: string | null;
  /** L'URL du QR de retrait de la COMMANDE ; vide : pas de QR. */
  readonly handoverUrl: string;
  /** Les sacs vivants, dans l'ordre de création. */
  readonly bags: readonly PackingBagLabelView[];
}

/** Un sac à étiqueter. */
export interface PackingBagLabelView {
  /** Le contenant, celui du poste. */
  readonly containerId: string;
  /** « Sac 2 » — le libellé du poste. */
  readonly label: string;
  /** Son rang parmi les sacs VIVANTS, à partir de 1. */
  readonly rank: number;
  /** Le nombre de sacs vivants de la commande. */
  readonly of: number;
}
