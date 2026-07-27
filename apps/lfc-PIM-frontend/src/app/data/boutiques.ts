/**
 * Les deux points de vente, nommés une seule fois. Le modèle garde les clés
 * neutres `b1`/`b2` (stables) ; l'affichage passe par ces libellés.
 */
export const BOUTIQUE_LABEL = { b1: 'Village', b2: 'Ardroit' } as const;

export const BOUTIQUES = [
  { key: 'b1', label: BOUTIQUE_LABEL.b1 },
  { key: 'b2', label: BOUTIQUE_LABEL.b2 },
] as const;
