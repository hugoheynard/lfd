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
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M6 8h12l-.8 11.2A2 2 0 0 1 15.2 21H8.8a2 2 0 0 1-2-1.8L6 8Z"/>' +
  '<path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>';

// Déconnexion : porte + flèche sortante. ÉCRASE le `logout` de fold — même nom,
// notre dessin. Un override ne se déclare pas : le nom est déjà connu.
const LOGOUT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
  '<path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>';

/**
 * Régimes de TVA — le « % » dans un cadre. Source : SVG Repo (domaine public).
 *
 * Normalisée en trois gestes, tous nécessaires :
 * - `fill="#000000"` → `currentColor`, sinon l'icône reste noire en thème
 *   sombre et ignore les tons sémantiques ;
 * - `width`/`height` retirés — c'est fold qui dimensionne, une taille en dur
 *   gagnerait contre lui ;
 * - les deux groupes `SVGRepo_*Carrier` supprimés : le « tracer » porte un
 *   `stroke="#CCCCCC"` qui aurait dessiné un liseré gris en clair comme en
 *   sombre.
 *
 * Le `viewBox` d'origine (1024) est **conservé** : les tracés sont dessinés
 * pour lui, et les remettre à l'échelle 24 à la main serait une occasion de
 * les déformer sans que personne ne s'en aperçoive. fold ne lit que le ratio.
 *
 * Le trait est porté de `10.24` à **30** — l'anneau passe de 5 % à 6,9 % de la
 * boîte. Il s'ARRÊTE là volontairement, alors que l'alignement exact sur fold
 * (8,33 %) demanderait 44 : à cette graisse, les deux petits cercles du « % »
 * ne gardent que 17 % de trou et se lisent comme des points. Un « % » fait de
 * deux points et d'un trait est un autre glyphe. On préfère 1,4 point d'écart
 * de graisse à un signe qu'on ne reconnaît plus.
 */
const TAX_ICON =
  '<svg viewBox="0 0 1024 1024" fill="currentColor" stroke="currentColor" ' +
  'stroke-width="30">' +
  '<path d="M441.71 414.154c0-23.138-17.983-41.656-39.864-41.656-21.875 0-39.864 18.522-39.864 ' +
  '41.656s17.989 41.656 39.864 41.656c21.881 0 39.864-18.518 39.864-41.656zm40.96 0c0 45.495-36.048 ' +
  '82.616-80.824 82.616-44.769 0-80.824-37.124-80.824-82.616s36.055-82.616 80.824-82.616c44.776 0 ' +
  '80.824 37.121 80.824 82.616zm176.274 192.62c0-23.138-17.983-41.656-39.864-41.656-21.875 ' +
  '0-39.864 18.522-39.864 41.656s17.989 41.656 39.864 41.656c21.881 0 39.864-18.518 ' +
  '39.864-41.656zm40.96 0c0 45.495-36.048 82.616-80.824 82.616-44.769 0-80.824-37.124-80.824-82.616s' +
  '36.055-82.616 80.824-82.616c44.776 0 80.824 37.121 80.824 82.616zm-95.515-225.529L363.022 ' +
  '629.79c-7.88 8.114-7.69 21.08.424 28.96s21.08 7.69 28.96-.424l241.367-248.545c7.88-8.114 ' +
  '7.69-21.08-.424-28.96s-21.08-7.69-28.96.424z"/>' +
  '<path d="M829.44 911.36c45.245 0 81.92-36.675 81.92-81.92V194.56c0-45.245-36.675-81.92-81.92-81.92' +
  'H194.56c-45.245 0-81.92 36.675-81.92 81.92v634.88c0 45.245 36.675 81.92 81.92 81.92h634.88zm0 ' +
  '40.96H194.56c-67.866 0-122.88-55.014-122.88-122.88V194.56c0-67.866 55.014-122.88 122.88-122.88h' +
  '634.88c67.866 0 122.88 55.014 122.88 122.88v634.88c0 67.866-55.014 122.88-122.88 122.88z"/>' +
  '</svg>';

/**
 * Publication — deux fenêtres reliées par un aiguillage : le catalogue qui part
 * vers ses canaux. Source : SVG Repo (domaine public).
 *
 * Même normalisation que {@link TAX_ICON}. La source portait un
 * `stroke-width="0.001"` — résidu de l'outil d'export, invisible à l'écran —
 * remplacé par une valeur qui, elle, sert : le cadre du dessin fait 6 % de la
 * boîte quand fold en trace 8,33 %, et l'écart se voyait dans la même barre.
 */
const PUBLISH_ICON =
  '<svg viewBox="0 0 100 100" fill="currentColor" stroke="currentColor" ' +
  'stroke-width="2.33" stroke-linejoin="round">' +
  '<path d="M78,60a2,2,0,0,1,2,2V78a2,2,0,0,1-2,2H62a2,2,0,0,1-2-2V62a2,2,0,0,1,2-2ZM40.2,26.9l12.9' +
  '.2a1.16,1.16,0,0,1,1.2,1.2h0l.2,12.9a1.16,1.16,0,0,1-1.2,1.2H51a1.16,1.16,0,0,1-1.2-1.2h0l-.1-4a' +
  '.77.77,0,0,0-1.3-.6h0l-7.9,7.9A10.32,10.32,0,0,1,42,50a11.07,11.07,0,0,1-1.9,6.2l8.3,8.3a.77.77,' +
  '0,0,0,1.3-.6h0l.1-4A1.16,1.16,0,0,1,51,58.7h0l2.4-.1a1.16,1.16,0,0,1,1.2,1.2h0l-.2,12.9a1.16,' +
  '1.16,0,0,1-1.2,1.2h0l-12.9.2a1.16,1.16,0,0,1-1.2-1.2h0V70.6a1.16,1.16,0,0,1,1.2-1.2h0l4-.1a.77' +
  '.77,0,0,0,.6-1.3h0l-8.4-8.4A11.24,11.24,0,0,1,31,61a11,11,0,1,1,6.2-20.1L45,33.1a.77.77,0,0,0-' +
  '.6-1.3h0l-4-.1a1.16,1.16,0,0,1-1.2-1.2h0l-.1-2.4a1.08,1.08,0,0,1,1.1-1.2ZM74,66H66v8h8ZM31,45a5,' +
  '5,0,1,0,5,5A5,5,0,0,0,31,45ZM78,20a2,2,0,0,1,2,2V38a2,2,0,0,1-2,2H62a2,2,0,0,1-2-2V22a2,2,0,0,1,' +
  '2-2Zm-4,6H66v8h8Z"/>' +
  '</svg>';

/**
 * Le catalogue — un livre ouvert, pages jointes. Source : SVG Repo (domaine
 * public). Portée par l'entrée « PIM » du menu, qui affichait jusqu'ici la même
 * grille que son onglet « Produits » : deux niveaux, une seule image.
 *
 * Seule des trois à être un tracé **au trait** (`fill="none"` + `stroke`),
 * comme les icônes intégrées de fold — elle s'aligne donc exactement : `2` sur
 * une boîte de 24, bouts et jointures arrondis, ce que fold applique à tout son
 * jeu. Sa graisse d'origine (1.416) la faisait paraître délavée à côté.
 */
const CATALOG_ICON =
  '<svg viewBox="0 0 24 24">' +
  '<path fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" ' +
  'd="M5,6 L1,4.5 L1,18.443038 L12,23 L23,18.443038 L23,4 L19,6 M5,16 L5,2 L12,5 L19,2 L19,16 ' +
  'L12,19 L5,16 Z M11.95,5 L11.95,19"/>' +
  '</svg>';

/**
 * Le catalogue. Une entrée = un nom que `<fold-icon name="…">` accepte.
 *
 * `as const` n'est pas décoratif : c'est lui qui donne à `keyof typeof` des
 * littéraux, donc à l'augmentation de types une liste exacte.
 */
export const APP_ICONS = {
  catalog: CATALOG_ICON,
  shopify: SHOPIFY_ICON,
  publish: PUBLISH_ICON,
  tax: TAX_ICON,
  // ÉCRASE le `logout` de fold — même nom, notre dessin.
  logout: LOGOUT_ICON,
} as const;

/** Enregistré une fois, dans `app.config.ts`. Vaut pour toute l'application. */
export function provideAppIcons(): Provider {
  return provideFoldIcons(APP_ICONS);
}
