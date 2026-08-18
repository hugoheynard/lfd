import {
  revenueCentsAt,
  unitPriceCentsAt,
  type ArticleBasis,
  type Scenario,
} from './revenue-model';

/**
 * **Sur quelle mesure les seuils d'une grille se lisent.**
 *
 * Ce n'est pas un réglage d'affichage : c'est la question qui décide du prix, et
 * la réponse ne vient pas de la grille mais de ce qui a été signé à côté. Trois
 * régimes, tous réels, et une même grille n'y rapporte pas la même chose.
 */
export type PricingRegime =
  /**
   * **Sans engagement.** Le moteur lit les seuils d'une mercuriale sur la
   * quantité de LA COMMANDE. Le client qui étale sa saison n'atteint donc que le
   * palier de sa commande type — jamais celui de son volume annuel.
   */
  | { readonly kind: 'perOrder'; readonly orderSize: number }
  /**
   * **Engagement signé.** Le volume annoncé ouvre le palier dès la première
   * commande : `max(promis, livré)`. En dessous de la promesse, le prix est
   * **plat** ; au-delà, le cumul reprend la main.
   */
  | { readonly kind: 'commitment'; readonly promised: number }
  /**
   * **Cumul livré.** Chaque unité au palier atteint à cet instant, sans rien
   * refacturer. C'est le régime d'un barème de volume sans promesse — celui qui
   * protège d'une sortie anticipée, parce que les premières unités ont été
   * payées au prix fort.
   */
  | { readonly kind: 'delivered' };

/**
 * **Le chiffre encaissé pour un volume, sous un régime donné.**
 *
 * Les trois se réduisent à deux briques : un prix constant × un volume, ou
 * l'intégrale progressive de {@link revenueCentsAt}. Le régime d'engagement est
 * la composition des deux — plat jusqu'à la promesse, progressif au-delà — et
 * c'est exactement ce que fait le moteur : sous la promesse le palier ne bouge
 * pas, au-dessus c'est le cumul qui décide.
 */
export function revenueUnderRegime(
  scenario: Scenario,
  basis: ArticleBasis,
  volume: number,
  regime: PricingRegime,
): number {
  if (volume < 1) {
    return 0;
  }
  switch (regime.kind) {
    case 'perOrder':
      return volume * unitPriceCentsAt(scenario, basis, Math.max(1, regime.orderSize));
    case 'commitment':
      return commitmentRevenue(scenario, basis, volume, Math.max(1, regime.promised));
    case 'delivered':
      return revenueCentsAt(scenario, basis, volume);
  }
}

/**
 * Plat jusqu'à la promesse, progressif au-delà.
 *
 * Au-dessus de la promesse, les unités marginales sont facturées au palier du
 * cumul — exactement ce que calcule l'intégrale progressive sur cet intervalle.
 * La retrancher plutôt que la réécrire garde une seule arithmétique dans le
 * fichier, donc un seul endroit où elle peut être fausse.
 */
function commitmentRevenue(
  scenario: Scenario,
  basis: ArticleBasis,
  volume: number,
  promised: number,
): number {
  const atPromise = promised * unitPriceCentsAt(scenario, basis, promised);
  if (volume <= promised) {
    return volume * unitPriceCentsAt(scenario, basis, promised);
  }
  return (
    atPromise + revenueCentsAt(scenario, basis, volume) - revenueCentsAt(scenario, basis, promised)
  );
}

/** Le prix moyen réellement payé à ce volume, sous ce régime. */
export function averageUnderRegime(
  scenario: Scenario,
  basis: ArticleBasis,
  volume: number,
  regime: PricingRegime,
): number | null {
  if (volume < 1) {
    return null;
  }
  return Math.round(revenueUnderRegime(scenario, basis, volume, regime) / volume);
}
