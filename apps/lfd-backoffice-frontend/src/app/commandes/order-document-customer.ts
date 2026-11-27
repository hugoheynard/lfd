import type { AdminOrderView } from '@lfd/contracts';

/**
 * **Le client qu'un document de la commande imprime en tête**, pour nommer le
 * fichier téléchargé comme l'API le nomme : l'enseigne de la société, sinon sa
 * raison sociale, ou la personne pour une commande personnelle.
 */
export function orderDocumentCustomer(order: AdminOrderView): string {
  const company = order.placedBy.company;
  if (company === null) {
    const { firstName, lastName } = order.placedBy.customer;
    return `${firstName} ${lastName}`.trim();
  }
  const enseigne = company.enseigne?.trim() ?? '';
  return enseigne === '' ? company.raisonSociale : enseigne;
}
