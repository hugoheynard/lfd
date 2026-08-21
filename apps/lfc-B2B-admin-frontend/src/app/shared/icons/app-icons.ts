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
 * L'échelle d'origine (1024) est **conservée** — remettre les tracés à 24 à la
 * main serait une occasion de les déformer sans que personne ne s'en aperçoive,
 * et fold ne lit que le ratio. Le `viewBox` est en revanche **resserré sur
 * l'emprise réelle du dessin** : le cadrage d'origine laissait 14 % de marge,
 * donc l'icône rendait plus petite que ses voisines à taille égale. Les icônes
 * fold remplissent ~92 % de leur boîte ; celle-ci aussi maintenant.
 *
 * Le trait est porté de `10.24` à **30** — l'anneau passe de 5 % à 6,9 % de la
 * boîte. Il s'ARRÊTE là volontairement, alors que l'alignement exact sur fold
 * (8,33 %) demanderait 44 : à cette graisse, les deux petits cercles du « % »
 * ne gardent que 17 % de trou et se lisent comme des points. Un « % » fait de
 * deux points et d'un trait est un autre glyphe. On préfère 1,4 point d'écart
 * de graisse à un signe qu'on ne reconnaît plus.
 */
const TAX_ICON =
  '<svg viewBox="33.4 33.4 957.2 957.2" fill="currentColor" stroke="currentColor" ' +
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
 * Même normalisation que {@link TAX_ICON}, resserrage du `viewBox` compris —
 * et c'est ici qu'il comptait le plus : le dessin n'occupait que **64 %** de sa
 * boîte, si bien qu'il paraissait nettement plus petit que ses voisines dans la
 * même barre. Ce n'était pas une affaire de graisse, mais de cadrage.
 *
 * La source portait un
 * `stroke-width="0.001"` — résidu de l'outil d'export, invisible à l'écran —
 * remplacé par une valeur qui, elle, sert : le cadre du dessin fait 6 % de la
 * boîte quand fold en trace 8,33 %, et l'écart se voyait dans la même barre.
 */
const PUBLISH_ICON =
  '<svg viewBox="16.1 15.2 69.6 69.6" fill="currentColor" stroke="currentColor" ' +
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
 * L'application mobile — un téléphone, écran et bouton. Source : SVG Repo
 * (domaine public).
 *
 * ⚠️ **La rotation a dû être refaite.** La source porte
 * `transform="rotate(270)"` sur la balise `<svg>` racine, donc autour de
 * l'origine `(0,0)` : le dessin partait en `y` négatif, hors du `viewBox`, et
 * l'icône aurait été **invisible** — pas déformée, absente. Le pivot est
 * rétabli autour du centre (`rotate(270 50 50)`) et porté par un groupe
 * intérieur, ce qui rend le téléphone au portrait, bouton en bas.
 *
 * Pas de trait ajouté, contrairement à ses voisines : le boîtier est déjà
 * dessiné à ~8 % de la boîte, la graisse du jeu fold.
 */
const MOBILE_ICON =
  '<svg viewBox="18.4 18.4 63.2 63.2" fill="currentColor">' +
  '<g transform="rotate(270 50 50)">' +
  '<path d="M74,30H26c-3.3,0-6,2.7-6,6v28c0,3.3,2.7,6,6,6h48c3.3,0,6-2.7,6-6V36C80,32.7,77.3,30,74,' +
  '30z M25,53 c-1.7,0-3-1.3-3-3s1.3-3,3-3s3,1.3,3,3S26.7,53,25,53z M72,62c0,1.1-0.9,2-2,2H32c-1.1,' +
  '0-2-0.9-2-2V38c0-1.1,0.9-2,2-2h38 c1.1,0,2,0.9,2,2V62z"/>' +
  '<path d="M64,42H38c-1.1,0-2,0.9-2,2v12c0,1.1,0.9,2,2,2h26c1.1,0,2-0.9,2-2V44C66,42.9,65.1,42,64,' +
  '42z"/>' +
  '</g></svg>';

/**
 * Les familles du catalogue — trois épingles de tailles décroissantes, la
 * taxonomie qui se ramifie. Source : SVG Repo / IBM Carbon (domaine public).
 *
 * ⚠️ **Le rectangle transparent a été retiré, et il fallait le retirer.** La
 * source embarque un `<rect width="32" height="32">` dont le `fill:none` vient
 * d'une `<style>` INTERNE (`.cls-1`). En supprimant la feuille de style —
 * inutile hors de son contexte d'origine — le rectangle aurait hérité du
 * `fill="currentColor"` de la racine et **peint un carré plein** à la place de
 * l'icône. Il ne servait qu'à figer les bornes 32×32 dans l'outil de dessin ;
 * ici, c'est le `viewBox` qui les tient.
 *
 * `<defs>` et `<title>` partent pour la même raison : rien de ce qui ne dessine
 * pas n'a de raison d'entrer dans le bundle.
 *
 * **Graisse relevée de 6,25 % à 8,44 %** (trait 0,7). Carbon trace à 2 sur une
 * boîte de 32 ; fold trace à 2 sur 24. L'écart n'était pas une impression : à
 * taille égale, celle-ci rendait un quart plus fine que ses voisines. Le plus
 * petit contre-fond du dessin — le rectangle intérieur de la grande épingle —
 * passe de 6 à 5,3 unités, il reste largement lisible.
 */
const CATEGORY_ICON =
  '<svg viewBox="0 0 32 32" fill="currentColor" stroke="currentColor" ' +
  'stroke-width="0.7" stroke-linejoin="round">' +
  '<path d="M29,10H24v2h5v6H22v2h3v2.142a4,4,0,1,0,2,0V20h2a2.0027,2.0027,0,0,0,2-2V12A2.0023,' +
  '2.0023,0,0,0,29,10ZM28,26a2,2,0,1,1-2-2A2.0027,2.0027,0,0,1,28,26Z"/>' +
  '<path d="M19,6H14V8h5v6H12v2h3v6.142a4,4,0,1,0,2,0V16h2a2.0023,2.0023,0,0,0,2-2V8A2.0023,2.0023,' +
  '0,0,0,19,6ZM18,26a2,2,0,1,1-2-2A2.0027,2.0027,0,0,1,18,26Z"/>' +
  '<path d="M9,2H3A2.002,2.002,0,0,0,1,4v6a2.002,2.002,0,0,0,2,2H5V22.142a4,4,0,1,0,2,0V12H9a2.002,' +
  '2.002,0,0,0,2-2V4A2.002,2.002,0,0,0,9,2ZM8,26a2,2,0,1,1-2-2A2.0023,2.0023,0,0,1,8,26ZM3,10V4H9l.' +
  '0015,6Z"/>' +
  '</svg>';

/**
 * Les emplacements — deux bâtiments, le grand et l'annexe. Source : SVG Repo
 * (domaine public).
 *
 * Dessin **plein** (des blocs percés de fenêtres), pas un tracé au trait :
 * aucun `stroke` ne lui est ajouté, contrairement à ses voisines. Il en
 * refermerait les fenêtres — 6,3 unités de côté, elles tomberaient à 3,3 — pour
 * un gain de graisse qu'une forme pleine n'a pas besoin d'aller chercher.
 *
 * Son `viewBox` est en revanche **resserré** : le dessin n'occupait que 60 % de
 * sa boîte d'origine et rendait donc bien plus petit que ses voisines. C'est le
 * même défaut de cadrage que `publish`, et il pèse plus lourd que la graisse.
 */
const PLACES_ICON =
  '<svg viewBox="18.42 18.42 63.16 63.16" fill="currentColor">' +
  '<path d="M77.2,45.2H60.1c-1.6,0-2.8,1.3-2.8,2.8v0c0,0.5,0.4,0.9,0.9,0.9h20.8c0.5,0,0.9-0.4,0.9-0' +
  '.9v0 C80,46.5,78.7,45.2,77.2,45.2z M77.2,51.8h-17c-0.5,0-0.9,0.4-0.9,0.9v19.9c0,0.5,0.4,0.9,0.9,' +
  '0.9h5.2c0.5,0,0.9-0.4,0.9-0.9v-3.8 c0-0.5,0.5-0.9,1-0.9H70c0.5,0,1,0.4,1,0.9v3.8c0,0.5,0.4,0.9,0' +
  '.9,0.9h5.2c0.5,0,0.9-0.4,0.9-0.9V52.8 C78.1,52.2,77.7,51.8,77.2,51.8z M67.2,64.6c0,0.5-0.4,0.9-0' +
  '.9,0.9h-1.9c-0.5,0-0.9-0.4-0.9-0.9v-1.9c0-0.5,0.4-0.9,0.9-0.9h1.9 c0.5,0,0.9,0.4,0.9,0.9V64.6z M' +
  '67.2,58c0,0.5-0.4,0.9-0.9,0.9h-1.9c-0.5,0-0.9-0.4-0.9-0.9v-1.9c0-0.5,0.4-0.9,0.9-0.9h1.9 c0.5,0,' +
  '0.9,0.4,0.9,0.9V58z M73.9,64.6c0,0.5-0.4,0.9-0.9,0.9H71c-0.5,0-0.9-0.4-0.9-0.9v-1.9c0-0.5,0.4-0.' +
  '9,0.9-0.9h1.9 c0.5,0,0.9,0.4,0.9,0.9V64.6z M73.9,58c0,0.5-0.4,0.9-0.9,0.9H71c-0.5,0-0.9-0.4-0.9-' +
  '0.9v-1.9c0-0.5,0.4-0.9,0.9-0.9h1.9 c0.5,0,0.9,0.4,0.9,0.9V58z"/>' +
  '<path d="M53.1,26.4H24.6c-2.6,0-4.6,2.1-4.6,4.6v0.1c0,0.9,0.7,1.6,1.6,1.6h34.6c0.9,0,1.6-0.7,1.6' +
  '-1.6v-0.1 C57.7,28.6,55.6,26.4,53.1,26.4z M53,37.4H24.7c-0.9,0-1.6,0.7-1.6,1.6v33c0,0.9,0.7,1.6,' +
  '1.6,1.6h8.7c0.9,0,1.5-0.7,1.5-1.6v-6.3 c0-0.9,0.8-1.6,1.6-1.6h4.6c0.9,0,1.6,0.7,1.6,1.6V72c0,0.9' +
  ',0.6,1.6,1.5,1.6H53c0.9,0,1.6-0.7,1.6-1.6V39 C54.6,38.1,53.9,37.4,53,37.4z M36.5,58.6c0,0.9-0.7,' +
  '1.6-1.6,1.6h-3.1c-0.9,0-1.6-0.7-1.6-1.6v-3.1c0-0.9,0.7-1.6,1.6-1.6h3.1 c0.9,0,1.6,0.7,1.6,1.6V58' +
  '.6z M36.5,47.6c0,0.9-0.7,1.6-1.6,1.6h-3.1c-0.9,0-1.6-0.7-1.6-1.6v-3.1c0-0.9,0.7-1.6,1.6-1.6h3.1 ' +
  'c0.9,0,1.6,0.7,1.6,1.6V47.6z M47.5,58.6c0,0.9-0.7,1.6-1.6,1.6h-3.1c-0.9,0-1.6-0.7-1.6-1.6v-3.1c0' +
  '-0.9,0.7-1.6,1.6-1.6h3.1 c0.9,0,1.6,0.7,1.6,1.6V58.6z M47.5,47.6c0,0.9-0.7,1.6-1.6,1.6h-3.1c-0.9' +
  ',0-1.6-0.7-1.6-1.6v-3.1c0-0.9,0.7-1.6,1.6-1.6h3.1 c0.9,0,1.6,0.7,1.6,1.6V47.6z"/>' +
  '</svg>';

/**
 * Les intégrations — deux maillons de chaîne. Source : SVG Repo (domaine
 * public). Remplace le `shopify` que portait l'onglet : Shopify est UNE
 * intégration, pas la catégorie, et l'onglet en accueillera d'autres.
 *
 * Anneaux pleins de 64 unités sur 1024, soit 6,25 % — la graisse d'IBM Carbon,
 * pas celle de fold. Un trait de 21 la porte à 8,3 % sans coût : l'ouverture
 * intérieure d'un maillon fait 256 unités, elle en perd 21.
 */
const INTEGRATIONS_ICON =
  '<svg viewBox="29.37 29.34 965.26 965.26" fill="currentColor" stroke="currentColor" ' +
  'stroke-width="21" stroke-linejoin="round">' +
  '<path d="M640 384v64H448a128 128 0 0 0-128 128v128a128 128 0 0 0 128 128h320a128 128 0 0 0 128-1' +
  '28V576a128 128 0 0 0-64-110.848V394.88c74.56 26.368 128 97.472 128 181.056v128a192 192 0 0 1-192' +
  ' 192H448a192 192 0 0 1-192-192V576a192 192 0 0 1 192-192h192z"/>' +
  '<path d="M384 640v-64h192a128 128 0 0 0 128-128V320a128 128 0 0 0-128-128H256a128 128 0 0 0-128 ' +
  '128v128a128 128 0 0 0 64 110.848v70.272A192.064 192.064 0 0 1 64 448V320a192 192 0 0 1 192-192h3' +
  '20a192 192 0 0 1 192 192v128a192 192 0 0 1-192 192H384z"/>' +
  '</svg>';

/**
 * Un produit — la fiche et son étiquette. Source : SVG Repo / IBM Carbon
 * (domaine public). Remplace le `grid` de l'onglet Produits, qui disait
 * « tableau » et servait aussi ailleurs.
 *
 * ⚠️ Deux `<rect>` **font partie du dessin** (les traits de l'étiquette) et un
 * troisième est le cadrage transparent de Carbon. Ne garder que les `<path>`
 * aurait effacé l'étiquette ; garder le troisième aurait peint un carré plein.
 * On distingue le cadrage à ce qu'il **couvre la boîte entière** — plus fiable
 * que son nom de classe, qui change d'un export à l'autre.
 *
 * Graisse relevée à 8,4 % comme {@link CATEGORY_ICON}, même origine Carbon,
 * même écart avec fold.
 */
const PRODUCT_ICON =
  '<svg viewBox="3 3 26 26" fill="currentColor" stroke="currentColor" ' +
  'stroke-width="0.7" stroke-linejoin="round">' +
  '<rect x="8" y="18" width="6" height="2"/>' +
  '<rect x="8" y="22" width="10" height="2"/>' +
  '<path d="M26,4H6A2.0025,2.0025,0,0,0,4,6V26a2.0025,2.0025,0,0,0,2,2H26a2.0025,2.0025,0,0,0,2-2V6' +
  'A2.0025,2.0025,0,0,0,26,4ZM18,6v4H14V6ZM6,26V6h6v6h8V6h6l.0012,20Z"/>' +
  '</svg>';

/**
 * Les collections — un document et son étiquette accrochée. Source : SVG Repo /
 * IBM Carbon (domaine public), sous le nom « classification ». Remplace
 * `org-chart`, qui dessinait une hiérarchie : une collection est justement ce
 * qui NE hiérarchise pas — un produit appartient à une famille et à 0..n
 * collections.
 *
 * ⚠️ Elle embarque un `<circle>` — le point de l'étiquette. Une version du
 * normalisateur qui ne lit que les `<path>` l'aurait fait disparaître sans rien
 * signaler : l'icône se serait affichée, simplement amputée. Le cadrage
 * transparent de Carbon est retiré comme ailleurs.
 *
 * Graisse relevée à 8,4 %, même origine Carbon, même écart avec fold.
 */
const COLLECTIONS_ICON =
  '<svg viewBox="0.89 0.89 30.21 30.21" fill="currentColor" stroke="currentColor" ' +
  'stroke-width="0.7" stroke-linejoin="round">' +
  '<circle cx="15" cy="19" r="1"/>' +
  '<path d="M27.7,9.3l-7-7A.9087.9087,0,0,0,20,2H10A2.0058,2.0058,0,0,0,8,4V14H6a2.0023,2.0023,0,0,' +
  '0-2,2v6a2.0023,2.0023,0,0,0,2,2H8v4a2.0058,2.0058,0,0,0,2,2H26a2.0058,2.0058,0,0,0,2-2V10A.9092.' +
  '9092,0,0,0,27.7,9.3ZM20,4.4,25.6,10H20ZM6,16h9.5972L19,19l-3.3926,3H6ZM26,28H10V24h5.6089a2.0076' +
  ',2.0076,0,0,0,1.3135-.4927l3.3833-2.9917a2.0015,2.0015,0,0,0,.01-3.0229l-3.4033-3.0083A1.9961,1.' +
  '9961,0,0,0,15.6089,14H10V4h8v6a2.0058,2.0058,0,0,0,2,2h6Z"/>' +
  '</svg>';

/**
 * La production — un tapis, ses roues et son mécanisme. Source : SVG Repo
 * (domaine public). Remplace le `list` du menu, qui décrivait la forme de
 * l'écran (une liste) et non ce qu'on y fait.
 *
 * Boîte laissée telle quelle : le dessin la remplit déjà entièrement. Un trait
 * de 0,35 sur 16 porte sa graisse à 8,4 %, celle du jeu fold.
 */
const PRODUCTION_ICON =
  '<svg viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" ' +
  'stroke-width="0.35" stroke-linejoin="round">' +
  '<path d="M14,11.05V8.5a.5.5,0,0,0-.5-.5h-3a.5.5,0,0,0-.5.5V11H6V8.5A.5.5,0,0,0,5.5,8h-3a.5.5,0,0' +
  ',0-.5.5v2.55A2.5,2.5,0,0,0,2.5,16h11a2.5,2.5,0,0,0,.5-4.95ZM6,12a2.46,2.46,0,0,0,0,3H4.49a2.46,2' +
  '.46,0,0,0,0-3H6Zm.49,1.5A1.5,1.5,0,1,1,8,15,1.5,1.5,0,0,1,6.5,13.5ZM10,12h1.52a2.46,2.46,0,0,0,0' +
  ',3H10a2.46,2.46,0,0,0,0-3Zm1-3h2v2H11ZM3,9H5v2H3ZM1,13.5A1.5,1.5,0,1,1,2.5,15,1.5,1.5,0,0,1,1,13' +
  '.5ZM13.5,15A1.5,1.5,0,1,1,15,13.5,1.5,1.5,0,0,1,13.5,15ZM2,7A.5.5,0,0,0,2,6,1,1,0,1,1,3,5,.5.5,0' +
  ',0,0,4,5,2,2,0,0,0,2,3V2H6a2,2,0,0,0,4,0h4V3a2,2,0,0,0-2,2,.5.5,0,0,0,1,0,1,1,0,1,1,1,1,.5.5,0,0' +
  ',0,0,1,2,2,0,0,0,1-3.72V1.5a.5.5,0,0,0-.5-.5H9.72A2,2,0,0,0,6.28,1H1.5a.5.5,0,0,0-.5.5V3.28A2,2,' +
  '0,0,0,2,7ZM8,1A1,1,0,1,1,7,2,1,1,0,0,1,8,1Z"/>' +
  '</svg>';

/**
 * `basha` — enregistrée à la demande, **sans usage pour l'instant**.
 *
 * C'est un choix explicite et non un oubli : elle attend sa page. Le jour où
 * elle n'en trouve pas, la retirer coûte une ligne — et une icône enregistrée
 * que rien n'affiche pèse ses quelques centaines d'octets dans le bundle, ce
 * qui est le prix qu'on accepte ici.
 *
 * Boîte laissée telle quelle : le dessin remplit déjà ses 512 unités. Pas de
 * trait ajouté non plus — c'est une illustration détaillée, et l'épaissir
 * empâterait les traits fins plutôt que de l'aligner sur quoi que ce soit.
 */
const BASHA_ICON =
  '<svg viewBox="0 0 512 512" fill="currentColor">' +
  '<path d="M205.436,283.406c9.759,0,17.674-7.915,17.674-17.684s-7.915-17.684-17.674-17.684 c-9.778' +
  ',0-17.693,7.915-17.693,17.684S195.657,283.406,205.436,283.406z"/>' +
  '<path d="M306.563,283.406c9.76,0,17.674-7.915,17.674-17.684s-7.914-17.684-17.674-17.684 c-9.778,' +
  '0-17.693,7.915-17.693,17.684S296.785,283.406,306.563,283.406z"/>' +
  '<path d="M508.56,480.316c0-0.011-36.776-200.64-55.08-299.509c7.096-3.48,12.017-10.701,12.017-19.' +
  '134 c0-11.799-9.573-21.371-21.383-21.371h-0.031c-3.78-12.453-8.287-24.21-13.757-35.097c-14.938-2' +
  '9.835-36.993-53.611-66.268-69.169 c-29.276-15.612-65.14-23.133-108.068-23.133c-28.633,0-54.066,3' +
  '.335-76.566,10.193c-33.741,10.214-60.809,28.748-80.44,54.366 c-13.758,17.881-23.848,39.003-31.08' +
  '9,62.84h-0.031c-11.81,0-21.381,9.572-21.381,21.371c0,8.432,4.93,15.653,12.016,19.134 C40.215,279' +
  '.676,3.44,480.316,3.44,480.316L0,499.097h512L508.56,480.316z M110.099,119.5 c12.588-24.862,29.48' +
  '3-42.856,52.822-55.392c23.361-12.482,53.785-19.382,93.069-19.382c26.168,0,48.471,3.066,67.304,8.' +
  '806 c28.25,8.691,48.74,22.966,64.498,43.343c9.302,12.079,16.875,26.572,22.842,43.427H101.438 C10' +
  '4.049,132.957,106.868,125.923,110.099,119.5z M284.664,430.974H256.01h-28.674c0,0,22.044,15.053-4' +
  '.413,16.41 c-26.458,1.378-88.2-50.605-57.328-49.249c30.891,1.357,94.808-36.941,94.808-36.941s55.' +
  '112,38.298,86.003,36.941 c30.871-1.356-30.87,50.627-57.348,49.249C262.62,446.027,284.664,430.974' +
  ',284.664,430.974z M136.494,357.723V225.155h239.011 v132.578c-6.765-6.184-14.618-14.958-23.589-28' +
  '.809c-19.848-30.643-43.011-28.281-95.906-28.281 c-52.936,0-76.079-2.362-95.926,28.281C151.122,34' +
  '2.765,143.259,351.549,136.494,357.723z M334.089,467.273 c53.755-31.192,71.127-81.144,62.207-93.3' +
  '48V204.364H115.704v169.531c-8.971,12.151,8.391,62.166,62.196,93.378H38.184 c0.839-4.6,1.813-9.87' +
  '3,2.912-15.86c11.53-62.841,35.904-195.688,49.351-268.359h331.084 c8.879,47.953,22.511,122.032,34' +
  '.073,184.986c5.967,32.487,11.374,61.991,15.3,83.372c1.099,5.987,2.072,11.26,2.911,15.86H334.089 ' +
  'z"/>' +
  '</svg>';

/**
 * OPS — un assemblage de blocs vu en isométrie : l'écosystème et ses briques.
 * Source : SVG Repo (domaine public). Remplace `waveform`, qui évoquait un
 * signal alors que la section montre une CARTE de briques et leur santé.
 *
 * Boîte laissée telle quelle : le dessin la remplit déjà. Un trait de 0,6 sur
 * 24 relève sa graisse à celle du jeu fold — le tracé d'origine est très fin,
 * et c'est le genre d'icône qui disparaît dans un rail sombre.
 */
const OPS_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" ' +
  'stroke-width="0.6" stroke-linejoin="round">' +
  '<path d="M11.998 0 7.303 2.717v2.045L2.428 7.555v5.01l-2.09 1.209v5.435l4.697 2.719 1.662-.963L1' +
  '2 24l5.3-3.035 1.665.963 4.697-2.719v-5.436l-2.09-1.207V7.555l-4.877-2.793V2.717L11.998 0zm0 1.1' +
  '95 3.127 1.813L12 4.803 8.875 3.006l3.123-1.81zm-3.658 2.7L11.482 5.7v3.676L8.34 7.555v-3.66zm7.' +
  '318 0v3.66L12.52 9.373V5.699l3.138-1.804zm1.037 2.062 3.842 2.197v3.813l-1.572-.91-4.697 2.716v5' +
  '.436l1.998 1.156L12 22.805l-4.264-2.44 1.996-1.156v-5.436l-4.697-2.716-1.57.908v-3.81l3.838-2.19' +
  '6v2.195h.002L12 10.871l4.695-2.717V5.957zm-11.66 6.297 3.125 1.808-3.125 1.797-3.125-1.796.518-.' +
  '301 2.607-1.508zm13.93 0 2.607 1.51.516.299-3.123 1.796-3.125-1.796 3.125-1.81zM1.377 14.949l3.1' +
  '42 1.809v3.676L1.377 18.61v-3.66zm7.318 0v3.662L5.658 20.37l-.101.06v-3.673l3.138-1.807zm6.61 0 ' +
  '3.144 1.809v3.676l-.107-.065-3.037-1.758V14.95zm7.318 0v3.662l-3.139 1.819v-3.672l3.139-1.809z"/' +
  '>' +
  '</svg>';

/**
 * Imprimer — une imprimante et sa feuille. Source : SVG Repo (domaine public).
 * Portée par « Imprimer le dossier », le seul bouton d'impression de l'app
 * (dossier de production), qui n'avait aucune icône.
 *
 * Pas de trait ajouté : le dessin est déjà tracé épais (les montants font ~42
 * unités sur 512, soit 8,2 %), et la boîte est pleine.
 */
const PRINT_ICON =
  '<svg viewBox="0 0 512 512" fill="currentColor">' +
  '<path d="M490.667,149.333h-85.333v-128C405.333,9.551,395.782,0,384,0H128c-11.782,0-21.333,9.551-' +
  '21.333,21.333v128H21.333 C9.551,149.333,0,158.885,0,170.667v106.667v128c0,11.782,9.551,21.333,21' +
  '.333,21.333h85.333v64 c0,11.782,9.551,21.333,21.333,21.333h256c11.782,0,21.333-9.551,21.333-21.3' +
  '33v-64h85.333c11.782,0,21.333-9.551,21.333-21.333 v-128V170.667C512,158.885,502.449,149.333,490.' +
  '667,149.333z M149.333,42.667h213.333v106.667H149.333V42.667z M42.667,192H128 h256h85.333v64H384H' +
  '128H42.667V192z M42.667,384v-85.333h64V384H42.667z M362.667,469.333H149.333v-64V298.667h213.333v' +
  '106.667 V469.333z M469.333,384h-64v-85.333h64V384z"/>' +
  '<path d="M298.667,320h-85.333C201.551,320,192,329.551,192,341.333c0,11.782,9.551,21.333,21.333,2' +
  '1.333h85.333 c11.782,0,21.333-9.551,21.333-21.333C320,329.551,310.449,320,298.667,320z"/>' +
  '<path d="M213.333,85.333H192c-11.782,0-21.333,9.551-21.333,21.333c0,11.782,9.551,21.333,21.333,2' +
  '1.333h21.333 c11.782,0,21.333-9.551,21.333-21.333C234.667,94.885,225.115,85.333,213.333,85.333z"' +
  '/>' +
  '<path d="M320,64h-21.333c-11.782,0-21.333,9.551-21.333,21.333c0,11.782,9.551,21.333,21.333,21.33' +
  '3H320 c11.782,0,21.333-9.551,21.333-21.333C341.333,73.551,331.782,64,320,64z"/>' +
  '<path d="M298.667,384h-85.333C201.551,384,192,393.551,192,405.333c0,11.782,9.551,21.333,21.333,2' +
  '1.333h85.333 c11.782,0,21.333-9.551,21.333-21.333C320,393.551,310.449,384,298.667,384z"/>' +
  '</svg>';

/**
 * Le catalogue. Une entrée = un nom que `<fold-icon name="…">` accepte.
 *
 * `as const` n'est pas décoratif : c'est lui qui donne à `keyof typeof` des
 * littéraux, donc à l'augmentation de types une liste exacte.
 */
export const APP_ICONS = {
  basha: BASHA_ICON,
  catalog: CATALOG_ICON,
  collections: COLLECTIONS_ICON,
  integrations: INTEGRATIONS_ICON,
  category: CATEGORY_ICON,
  mobile: MOBILE_ICON,
  ops: OPS_ICON,
  places: PLACES_ICON,
  print: PRINT_ICON,
  product: PRODUCT_ICON,
  production: PRODUCTION_ICON,
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
