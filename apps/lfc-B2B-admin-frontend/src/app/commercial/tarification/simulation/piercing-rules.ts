import type { PricingBoardView } from '@lfd/contracts';

/**
 * **Les règles qui franchissent le scellement d'une mercuriale.**
 *
 * La simulation calcule le prix d'une mercuriale comme la caisse le ferait —
 * mais seulement **tant que la mercuriale scelle**. Une promotion cochée
 * « par-dessus mercuriale » s'ajoute au tarif négocié : le prix facturé descend
 * alors sous la courbe tracée, et le chiffre simulé est trop haut.
 *
 * Le détecter ici coûte une lecture du tableau déjà chargé, et évite le seul
 * mensonge que cet écran puisse dire. Il n'essaie **pas** de la compter dans la
 * courbe : la composer demanderait la fonction qui facture, donc le serveur —
 * et une simulation qui se croit exacte à moitié serait pire que celle qui
 * annonce ce qu'elle ignore.
 */
export function piercingRuleLabels(board: PricingBoardView | null): readonly string[] {
  if (board === null) {
    return [];
  }
  return [...board.globalRules, ...board.categories.flatMap((category) => category.rules)]
    .filter((rule) => rule.stacksOverMercuriale && rule.status === 'active')
    .map((rule) => rule.label);
}
