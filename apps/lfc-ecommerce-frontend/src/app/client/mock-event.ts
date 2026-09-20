/**
 * L'opération datée en cours — Pâques, Noël, ce que le fournil décide.
 *
 * ⚠️ SIMULATION. Le vrai modèle est le cas 3 du dossier, prévu en dernier
 * parce qu'il dépend du rayon et du panier. Ces valeurs viennent du prototype
 * telles quelles, pour que l'écran d'accueil montre ce qu'il montrera.
 *
 * `null` est un état de PREMIÈRE CLASSE et pas un cas dégradé : hors période,
 * il n'y a pas d'opération, le bloc n'existe pas, et « Nouvelle commande »
 * reprend la tête. La réf le dit en toutes lettres.
 */
export interface DatedEvent {
  /** Le mot court, dans la pastille sur la photo. */
  readonly badge: string;
  /** Le compte à rebours, tel qu'il s'écrit — pas un nombre de jours. */
  readonly countdown: string;
  /** Le titre. Le retour à la ligne est celui de la réf ; le bureau le déplie. */
  readonly title: string;
  /** La période. */
  readonly dates: string;
  /** Ce qu'on y trouve — au bureau seulement, à côté de la période. */
  readonly teaser: string;
  /** La photo. Visuel de banque, à remplacer par la pièce réellement moulée. */
  readonly image: string;
  /** Où mène la carte. */
  readonly route: string;
}

export const MOCK_EVENT: DatedEvent | null = {
  badge: 'Pâques',
  countdown: 'J‑9',
  title: 'Pâques prend\nde l’altitude.',
  dates: 'Du 28 mars au 6 avril',
  teaser: 'Neuf pièces coulées à la main, dont deux qu’on ne refait pas.',
  image:
    'https://images.unsplash.com/photo-1515192337774-033dac0ed561?fm=jpg&q=70&w=1100&auto=format&fit=crop',
  route: '/nouvelle-commande/boutique',
};
