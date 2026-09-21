import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ShopLevel } from '@lfd/contracts';
import { FoldCalloutComponent } from 'fold-ng';

import { ClientLocale } from '../client-locale.service';
import { proAccountCopy } from '../copy/screens/pro-account.copy';

/**
 * La promesse « la boutique ouvre bientôt », tant qu'on ne peut pas commander
 * (plan `plan-inscription-pro-seule.md` §3.1).
 *
 * Présentationnel : le niveau arrive en entrée, et le composant ne sait pas
 * d'où il vient. Au niveau `order`, il ne rend RIEN — il n'y a rien à retirer le
 * jour de l'ouverture. Un échec de lecture des niveaux vaut `closed` en amont,
 * et la phrase s'affiche : promettre « bientôt » à qui pourrait déjà commander
 * coûte moins que l'inverse.
 */
@Component({
  selector: 'app-shop-promise',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent],
  templateUrl: './shop-promise.html',
})
export class ShopPromise {
  /** Le niveau de la boutique tel que le serveur le dit. */
  readonly level = input.required<ShopLevel>();

  private readonly locale = inject(ClientLocale);

  /** La phrase à dire, ou `null` quand la boutique est ouverte à la commande. */
  protected readonly sentence = computed(() => {
    const promise = proAccountCopy(this.locale.current()).promise;
    switch (this.level()) {
      case 'closed':
        return promise.closed;
      case 'browse':
        return promise.browse;
      case 'order':
        return null;
    }
  });
}
