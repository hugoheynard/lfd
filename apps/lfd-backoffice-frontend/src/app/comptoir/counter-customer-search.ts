import type { CounterCustomerCard } from '@lfd/contracts';

/**
 * La **recherche d'un client au comptoir**, sur les cinq champs de sa carte :
 * raison sociale, enseigne, référence, SIRET — et l'identifiant, qu'un futur
 * QR d'identification portera.
 *
 * Pas de propriétaire de l'espace, à la différence de la liste des comptes :
 * la carte du comptoir ne le porte pas, et c'est voulu (plan
 * `plan-commande-au-comptoir.md`).
 */
export function matchesCounterSearch(card: CounterCustomerCard, query: string): boolean {
  const needle = normalise(query);
  if (needle === '') {
    return true;
  }
  // Un SIRET se dicte par groupes : on compare les chiffres seuls dès qu'il y en a.
  const digits = query.replace(/\D/g, '');
  if (digits !== '' && card.siret.replace(/\D/g, '').includes(digits)) {
    return true;
  }
  return [card.name, card.tradeName, card.reference, card.siret, card.id]
    .map(normalise)
    .some((field) => field !== '' && field.includes(needle));
}

/** Minuscules sans accents : on tape « perin » pour trouver « Périn ». */
function normalise(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
