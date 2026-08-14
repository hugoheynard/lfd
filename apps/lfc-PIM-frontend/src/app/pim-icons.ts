import type { Provider } from '@angular/core';
import { provideFoldIcons } from 'fold-ng';

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
 * Icônes custom du PIM (absentes du jeu fold intégré). Un seul point
 * d'enregistrement, consommé par **deux** entrées :
 *  - `app.config.ts` (mode standalone : PIM déployé seul),
 *  - le parent route du remote-entry (mode fédéré : la config du PIM n'est PAS
 *    appliquée, c'est celle du shell — on ré-enregistre donc au niveau route).
 */
/**
 * Ce que le PIM enregistre : un nom neuf, et un écrasement. Le nom neuf est
 * DÉCLARÉ dans `src/fold-icons.d.ts` — sans quoi il ne compilerait pas.
 */
const PIM_ICONS = {
  shopify: SHOPIFY_ICON,
  // ÉCRASE le `logout` de fold — même nom, notre dessin. C'est pour ça qu'il
  // n'apparaît pas dans l'augmentation ci-dessous : le nom est déjà connu.
  logout: LOGOUT_ICON,
} as const;

export function providePimIcons(): Provider {
  return provideFoldIcons(PIM_ICONS);
}
