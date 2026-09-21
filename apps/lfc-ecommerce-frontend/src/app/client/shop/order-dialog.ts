import type { FoldPanelDefaults } from 'fold-ng';

/**
 * **Le gabarit des dialogues de commande** — « où je la prends », puis « à
 * quelle heure ».
 *
 * 🔴 LES DEUX FONT LA MÊME LARGEUR (Hugo, 2026-09-20 : « comme ça on a un
 * parcours uniforme »). Elles ne l'ont pas toujours faite : le sélecteur
 * d'heure était en `lg` — « des créneaux par jour doivent tenir sur une ligne »
 * — et celui de maison en `md`, chacun réglé pour son propre contenu. Or ce
 * sont deux VOLETS D'UN MÊME PARCOURS, enchaînés sans que rien ne se ferme
 * entre les deux : la boîte qui rétrécit de deux cents pixels au moment où l'on
 * passe de la maison à l'heure donne l'impression d'avoir changé d'écran, alors
 * qu'on n'a fait qu'avancer d'un pas.
 *
 * `lg` et non `md` : c'est la contrainte la plus forte des deux qui décide —
 * une journée de créneaux doit tenir, une liste de maisons s'accommode de
 * n'importe quelle largeur.
 *
 * ⚠️ Le `side` n'est qu'un DÉFAUT. Les deux dialogues le posent à l'ouverture
 * avec `dialogSide()`, qui lit la largeur de la fenêtre au moment du geste :
 * centré au bureau, feuille du bas en pile. Ouvrir est un geste, et c'est la
 * largeur de ce moment-là qui compte, pas celle du chargement.
 *
 * Le CHÂSSIS visuel de ces deux dialogues — en-tête, gouttières, titre, filet —
 * vit dans `_dialog.scss`, et pour la même raison.
 */
export const ORDER_DIALOG: FoldPanelDefaults = {
  side: 'center',
  width: 'lg',
  surface: 'solid',
};
