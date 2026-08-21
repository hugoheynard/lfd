import type { Provider } from '@angular/core';
import { provideFoldIcons } from 'fold-ng';

/**
 * **Le catalogue d'icônes de l'application** — ce que nous ajoutons au jeu
 * intégré de fold, et ce que nous lui empruntons pour l'écraser.
 *
 * Deux règles, et elles ne se ressemblent pas :
 *
 * - **un nom NEUF** doit être déclaré dans `src/fold-icons.d.ts`, sinon il ne
 *   compile pas : depuis fold 0.11, `FoldIconName` est fermé. C'est une bonne
 *   nouvelle — avant, une faute de frappe passait le build et laissait un trou
 *   à la place du glyphe ;
 * - **un écrasement** ne se déclare pas : le nom est déjà connu de fold, on ne
 *   fait que fournir un autre dessin.
 *
 * L'augmentation est **dérivée** de ce catalogue (`keyof typeof APP_ICONS`) :
 * ajouter une icône ici suffit, la déclaration suit. Recopier la liste à la
 * main invitait la dérive — un nom enregistré et jamais déclaré ne se voit
 * qu'au premier composant qui l'utilise.
 *
 * **Convention de dessin** : `viewBox="0 0 24 24"`, pas de `width`/`height`
 * (fold dimensionne), et `currentColor` partout — jamais une couleur en dur,
 * sinon l'icône ignore le thème et les tons sémantiques.
 */

// Glyphe « sac » générique enregistré sous `shopify` — on évite de reproduire le
// logo Shopify (marque déposée). Rendu en currentColor comme les icônes fold.
const SHOPIFY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M6 8h12l-.8 11.2A2 2 0 0 1 15.2 21H8.8a2 2 0 0 1-2-1.8L6 8Z"/>' +
  '<path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>';

// Déconnexion : porte + flèche sortante. ÉCRASE le `logout` de fold — même nom,
// notre dessin. Un override ne se déclare pas : le nom est déjà connu.
const LOGOUT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
  '<path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>';

/**
 * Le catalogue. Une entrée = un nom que `<fold-icon name="…">` accepte.
 *
 * `as const` n'est pas décoratif : c'est lui qui donne à `keyof typeof` des
 * littéraux, donc à l'augmentation de types une liste exacte.
 */
export const APP_ICONS = {
  shopify: SHOPIFY_ICON,
  // ÉCRASE le `logout` de fold — même nom, notre dessin.
  logout: LOGOUT_ICON,
} as const;

/** Enregistré une fois, dans `app.config.ts`. Vaut pour toute l'application. */
export function provideAppIcons(): Provider {
  return provideFoldIcons(APP_ICONS);
}
