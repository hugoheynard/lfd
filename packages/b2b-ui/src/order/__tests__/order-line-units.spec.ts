import { formatCents, formatMillicents, formatVatPercent, formatVatRate } from '../order-format';

/**
 * **Les unités d'une ligne de commande, et la façon de les écrire.**
 *
 * 🔴 Ces cas existent parce que l'écran d'une commande au back-office affichait,
 * le 2026-09-07 :
 *
 * ```
 * Arrondi commercial 2026   1 706,16 €   1 384,45 €   550 %   58,15 €
 * ```
 *
 * Trois colonnes sur quatre étaient fausses. Le prix unitaire et le prix barré
 * — tous deux en **millicentimes** — passaient par `formatCents`, qui divise par
 * cent : mille fois trop. Le taux de TVA — un **pourcentage** — passait par
 * `formatVatRate`, qui multiplie par cent : « 5,5 » devenait « 550 % ».
 *
 * ⚠️ **Rien ne pouvait l'attraper**, et c'est la leçon. La porte `money-units`
 * le dit elle-même : « l'affichage… c'est la SOURCE d'un nom qui est surveillée,
 * pas ce qu'on en fait ensuite ». Un appel de formatage dans un gabarit Angular
 * n'a ni type ni nom à confronter. Ces cas fixent donc les couples unité↔fonction
 * là où ils sont vérifiables.
 */

/** Les valeurs de la ligne qui a produit le rapport, telles qu'elles sont en base. */
const CROISSANT = {
  /** 1,38445 € — un prix unitaire dérivé d'un arrondi commercial. */
  unitPriceMillicents: 138_445,
  /** 1,70616 € — le tarif d'entrée, avant que l'étage ne joue. */
  entryPriceMillicents: 170_616,
  /** Un POURCENTAGE : `Decimal(5,2)`, « %, ex. 5.50 ». */
  vatRate: 5.5,
  /** 58,15 € — un montant encaissable, donc en centimes. */
  lineTotalCents: 5_815,
};

/** Les chiffres réels contiennent des espaces insécables ; on compare le sens. */
function plain(text: string): string {
  return text.replace(/\s/gu, ' ');
}

describe('un prix unitaire vit en millicentimes', () => {
  it('rend 1,38445 € — et surtout pas 1 384,45 €', () => {
    expect(plain(formatMillicents(CROISSANT.unitPriceMillicents))).toBe('1,38445 €');
  });

  it('rend le tarif d’entrée sur la même échelle que le prix facturé', () => {
    // Les deux s'affichent côte à côte, barré et courant. Deux échelles
    // différentes feraient croire à une remise de 99 %.
    expect(plain(formatMillicents(CROISSANT.entryPriceMillicents))).toBe('1,70616 €');
  });

  it('n’ajoute pas de décimales à un prix rond', () => {
    // « 2,10 € » reste « 2,10 € » : les afficher toujours ferait passer chaque
    // prix rond pour un prix calculé.
    expect(plain(formatMillicents(210_000))).toBe('2,10 €');
  });
});

describe('un montant encaissable vit en centimes', () => {
  it('rend 58,15 € — la seule colonne qui était juste', () => {
    expect(plain(formatCents(CROISSANT.lineTotalCents))).toBe('58,15 €');
  });
});

describe('le taux de TVA d’une ligne est un POURCENTAGE', () => {
  it('rend 5,5 % — et surtout pas 550 %', () => {
    expect(plain(formatVatPercent(CROISSANT.vatRate))).toBe('5,5 %');
  });

  it('garde `formatVatRate` pour ce qui est vraiment une FRACTION', () => {
    // Les deux fonctions existent parce que les deux unités existent dans les
    // données. Ce qui manquait n'était pas une fonction, c'était de savoir
    // laquelle une ligne de commande demande — et le commentaire qui prétendait
    // le dire se trompait.
    expect(plain(formatVatRate(0.055))).toBe('5,5 %');
  });

  it('les deux se rejoignent sur la même valeur, exprimée deux fois', () => {
    // Le seul invariant qui lie les deux : un facteur 100, et il vit dans la
    // lib — jamais au site d'appel, où il finit du mauvais côté de la division.
    expect(formatVatPercent(20)).toBe(formatVatRate(0.2));
  });
});
