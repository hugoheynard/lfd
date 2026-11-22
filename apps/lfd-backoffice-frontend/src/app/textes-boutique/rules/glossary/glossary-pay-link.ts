/**
 * Les segments des textes de la page de paiement par lien (`/payer/:jeton`,
 * espace `payLink`). Placé AVANT les autres dans le glossaire : un segment
 * déjà connu ailleurs garde son libellé.
 */
export const GLOSSARY_PAY_LINK: Readonly<Record<string, string>> = {
  payLink: 'Payer par lien',
  notFoundTitle: 'Lien introuvable — titre',
  notFoundSubtitle: 'Lien introuvable — sous-titre',
  settledTitle: 'Déjà réglé — titre',
  settledSubtitle: 'Déjà réglé — sous-titre',
  cancelledTitle: 'Annulé — titre',
  cancelledSubtitle: 'Annulé — sous-titre',
  renewTitle: 'Lien à renouveler — titre',
  renewSubtitle: 'Lien à renouveler — sous-titre',
  unavailableTitle: 'Paiement indisponible — titre',
  unavailableSubtitle: 'Paiement indisponible — sous-titre',
  payee: 'Bénéficiaire',
  payer: 'Payeur',
  reference: 'Référence',
  unfinished: 'Paiement inachevé',
  paidTitle: 'Payé — titre',
  paidSubtitle: 'Payé — sous-titre',
};
