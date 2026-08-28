/**
 * L'identité légale de l'entreprise, telle qu'elle paraît au pied de page.
 *
 * ⚠️ **Il manque volontairement les identifiants d'immatriculation** — SIRET,
 * RCS, TVA intracommunautaire. Le dossier de design en portait un jeu
 * « plausible », et son propre README dit qu'il faut le remplacer avant toute
 * mise en ligne. Publier un numéro d'immatriculation inventé sur un site
 * marchand en production n'est pas une approximation d'interface : c'est une
 * mention légale fausse. Tant que les vrais numéros n'ont pas été fournis, la
 * barre légale porte ce qui est VRAI et tait le reste.
 *
 * Pour les ajouter : renseigner les trois champs ci-dessous et les rendre dans
 * `client-foot.html` — le gabarit les attend déjà.
 */
export const LEGAL_IDENTITY = {
  company: 'La Folie Coffee SAS',
  capital: 'capital 40 000 €',
  phone: '04 79 06 12 40',
  /** Sans espace ni séparateur : c'est ce que compose le téléphone. */
  phoneHref: 'tel:+33479061240',
  email: 'contact@lafoliecoffee.fr',
  /** Les réseaux — deux pastilles bordées, pas des logos. */
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/',
} as const;

/** L'année du copyright, figée : `new Date()` casserait l'hydratation SSR. */
export const LEGAL_YEAR = 2026;
