import type { CartLine } from './cart.store';

/**
 * **Ce dont le prix d'un panier dépend**, réduit à une chaîne comparable.
 *
 * Le devis se redemande quand cette clé change, et **seulement** quand elle
 * change. C'est ce qui distingue une saisie qui avance d'un signal qui ré-émet :
 * `cart.lines()` rend un tableau neuf à chaque geste, y compris quand le geste
 * ne change rien — reposer la même quantité, un champ qui perd puis reprend le
 * focus, une flèche haut puis bas. Mesuré avant ce garde-fou : **13 appels pour
 * une saisie de huit lignes** dont plusieurs ne demandaient rien de nouveau.
 *
 * ## Ce qui entre, et pourquoi rien d'autre
 *
 * Le **client** et les couples **SKU × quantité**. Le serveur résout sur
 * exactement ça : la mercuriale vient du client, le palier de la quantité. Le
 * nom et le prix catalogue d'une ligne n'entrent pas — ils viennent du catalogue,
 * pas du panier, et les inclure ferait redemander un devis parce qu'un libellé a
 * changé.
 *
 * ## L'ORDRE des lignes n'en fait pas partie
 *
 * Les clés sont triées : le prix d'un panier ne dépend pas de l'ordre dans lequel
 * on l'a rempli. Sans le tri, retirer puis remettre le même article changerait la
 * clé sans changer le prix — et redemanderait pour rien, ce que ce module existe
 * précisément pour éviter.
 */
export function quoteKeyOf(companyId: string, lines: readonly CartLine[]): string {
  if (lines.length === 0) {
    // Un panier vide ne se chiffre pas : l'appelant n'a rien à demander, et une
    // clé vide le dit sans qu'il ait à recompter les lignes.
    return '';
  }
  const parts = lines.map((line) => `${line.sku}×${String(line.quantity)}`).sort();
  return [companyId, ...parts].join('|');
}
