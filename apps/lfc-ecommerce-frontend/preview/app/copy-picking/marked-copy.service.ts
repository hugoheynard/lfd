import { computed, inject, Injectable } from '@angular/core';

import { ClientLocale, type LocaleCode } from '../../../src/app/client/client-locale.service';
import type { ClientCopy } from '../../../src/app/client/copy/client-copy.model';
import { ClientCopyService } from '../../../src/app/client/copy/client-copy.service';
import { EN } from '../../../src/app/client/copy/en';
import { FR } from '../../../src/app/client/copy/fr';
import { IT } from '../../../src/app/client/copy/it';
import { overlayCopy } from '../../../src/app/client/copy/shop-copy-overlay';
import { ShopCopyOverrides } from '../../../src/app/client/copy/shop-copy-overrides';
import { CopyMarkers } from './copy-markers';

const DICTIONARIES: Record<LocaleCode, ClientCopy> = { fr: FR, en: EN, it: IT };

/**
 * **Les textes de la boutique, marqués de leur clé** — le `ClientCopyService`
 * de l'aperçu, et de lui seul (cf. `copy-markers.ts`).
 *
 * Même superposition que la boutique — le code, puis les remplacements de la
 * langue (ici : le publié puis les brouillons, posés par l'éditeur) — et UNE
 * passe de plus : chaque chaîne reçoit le marqueur de sa clé. Le texte qu'on
 * voit est donc exactement celui que la boutique servirait.
 */
@Injectable()
export class MarkedCopyService extends ClientCopyService {
  private readonly markers = inject(CopyMarkers);
  private readonly shownLocale = inject(ClientLocale);
  private readonly replacements = inject(ShopCopyOverrides);

  override readonly t = computed<ClientCopy>(() => {
    const locale = this.shownLocale.current();
    const copy = overlayCopy(DICTIONARIES[locale], this.replacements.texts(locale));
    return overlayCopy(copy, this.markers.markAll(copy));
  });
}
