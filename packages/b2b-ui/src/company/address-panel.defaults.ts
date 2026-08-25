import type { FoldPanelDefaults } from 'fold-ng';

/**
 * Comment un panneau d'adresse s'ouvre : tiroir latéral au large,
 * **bottom-sheet** sur étroit.
 *
 * Un tiroir de 490 px sur un téléphone, c'est un plein écran qui feint d'être
 * un côté ; la feuille par le bas dit ce qu'elle est et laisse le pouce à
 * portée du pied de panneau.
 *
 * Déclaré ICI et non au call-site : le côté appartient à la nature du panneau,
 * pas au geste qui l'ouvre. Cinq appels répétant `side: 'right'` d'un côté et
 * un `side: 'auto'` de l'autre, c'est exactement ce que ça donne quand chacun
 * décide.
 */
export const ADDRESS_PANEL_DEFAULTS: FoldPanelDefaults = { side: 'auto' };
