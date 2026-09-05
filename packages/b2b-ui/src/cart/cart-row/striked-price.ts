import { formatMillicents } from '../../order/order-format';

/**
 * Le **tarif d'entrée barré**, ou `null` quand il n'y a rien à barrer.
 *
 * Une fonction et non deux lignes dans le composant : c'est ici qu'un bug
 * d'unité s'est logé, et la lib ne teste que le pur — son environnement de
 * test n'a pas de DOM, par choix (cf. `jest.config.cjs`). Sortir la décision
 * la rend éprouvable.
 *
 * 🔴 **Les deux montants sont en MILLICENTIMES.** L'entrée du composant
 * s'appelait `canonicalPriceCents` et se formatait en centimes, alors que son
 * unique appelant y passait des millicentimes : un tarif d'entrée de 2,10 €
 * s'affichait barré à « 2 100,00 € », et précisément sur les lignes d'un client
 * à mercuriale — là où un commercial lit le chiffre au téléphone.
 */
export function strikedPriceOf(
  canonicalMillicents: number | null,
  billedMillicents: number,
): string | null {
  if (canonicalMillicents === null || canonicalMillicents === billedMillicents) {
    return null;
  }
  return formatMillicents(canonicalMillicents);
}
