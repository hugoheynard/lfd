import { inject, Injectable } from '@angular/core';

import type { LocaleCode } from '../../../src/app/client/client-locale.service';
import { ShopCopyComposer } from '../../../src/app/client/copy/shop-copy-composer';
import { overlayCopy } from '../../../src/app/client/copy/shop-copy-overlay';
import { CopyMarkers } from './copy-markers';

/**
 * **Les textes de la boutique, marqués de leur clé** — le `ShopCopyComposer`
 * de l'aperçu, et de lui seul (cf. `copy-markers.ts`).
 *
 * Même superposition que la boutique — le code, puis les remplacements de la
 * langue (ici : le publié puis les brouillons, posés par l'éditeur) — et UNE
 * passe de plus : chaque chaîne reçoit le marqueur de sa clé complète
 * (`slotPicker.ctaIdle`, `cart.whoTitle`). Le dictionnaire général et les
 * fonctions d'écran passent tous par ce point : le texte qu'on voit est donc
 * exactement celui que la boutique servirait, et chacun rend sa clé au clic.
 */
@Injectable()
export class MarkedShopCopyComposer extends ShopCopyComposer {
  private readonly markers = inject(CopyMarkers);

  override compose<T extends object>(space: string, base: T, locale: LocaleCode): T {
    const copy = super.compose(space, base, locale);
    return overlayCopy(copy, this.markers.markAll(copy, space));
  }
}
