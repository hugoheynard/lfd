import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrderTimeLimitScopeType, OrderTimeLimitView } from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { daysPhrase, gracePhrase, timePhrase } from '../../../../order-time-limits/limit-format';
import { LimitPanel } from '../../../../order-time-limits/limit-panel/limit-panel';
import { OrderTimeLimitsService } from '../../../../order-time-limits/order-time-limits.service';
import { ProductFormStore } from '../../product-form-store';
import { ownRule, type OrderLimitRow } from './order-limit-row';

/**
 * **Limite de commande** — jusqu'à quand on prend commande de cet article.
 *
 * ## Pourquoi ici et pas dans les réglages
 *
 * L'écran général (`/pim/limites-de-commande`) pose le rang **global** et les
 * **familles** : ce sont des décisions de maison. Le rang produit et le rang
 * déclinaison, eux, répondent à « combien de temps demande CET article » — et
 * c'est en le regardant qu'on se pose la question. Un sélecteur de produit dans
 * un écran de réglages ferait chercher au mauvais endroit.
 *
 * ## Ce que l'encart montre, et ce qu'il ne montre pas
 *
 * Uniquement ce que cette fiche **pose elle-même**. Ce dont elle hérite n'y est
 * pas : l'afficher ferait croire qu'on le modifie en modifiant ici, et on en
 * poserait une seconde copie sur le produit sans s'en rendre compte. Le renvoi
 * vers l'écran général dit où la règle héritée se change.
 *
 * ## Il ne participe PAS à l'enregistrement de la fiche
 *
 * La limite vit dans un autre contexte, avec sa propre route. L'encart lit et
 * écrit seul, par un panneau qui enregistre en se fermant — donc rien à
 * accrocher au garde « modifications non enregistrées », et rien à perdre en
 * quittant l'écran.
 */
@Component({
  selector: 'app-order-limit-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, FoldCalloutComponent, RouterLink],
  templateUrl: './order-limit-form.html',
  styleUrls: ['../form-section.scss', './order-limit-form.scss'],
})
export class OrderLimitForm {
  private readonly api = inject(OrderTimeLimitsService);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  protected readonly store = inject(ProductFormStore);

  private readonly rules = signal<readonly OrderTimeLimitView[]>([]);
  protected readonly failed = signal(false);
  protected readonly pendingRemoval = signal<string | null>(null);

  /**
   * Les deux portées que cette fiche peut poser. La déclinaison n'apparaît que
   * lorsqu'il y en a une de sélectionnée — sans elle, la ligne viserait le vide.
   */
  protected readonly rows = computed<readonly OrderLimitRow[]>(() => {
    const productId = this.store.productId();
    if (productId === '') {
      return [];
    }
    const rules = this.rules();
    const variantId = this.store.selectedVariantId();
    const product: OrderLimitRow = {
      scopeType: 'product',
      scopeId: productId,
      label: 'Cette fiche, toutes déclinaisons',
      rule: ownRule(rules, 'product', productId),
    };
    if (variantId === '') {
      return [product];
    }
    return [
      product,
      {
        scopeType: 'variant',
        scopeId: variantId,
        label: 'Cette déclinaison seulement',
        rule: ownRule(rules, 'variant', variantId),
      },
    ];
  });

  constructor() {
    // Rechargé quand la fiche change d'identité : rester sur les règles de la
    // précédente ferait modifier un article en croyant en modifier un autre.
    effect(() => {
      const productId = this.store.productId();
      if (productId !== '') {
        void this.load();
      }
    });
  }

  protected async load(): Promise<void> {
    try {
      this.rules.set(await this.api.list());
      this.failed.set(false);
    } catch {
      // On ne montre pas une liste vide : « aucune limite propre » et « on n'a
      // pas pu lire » ne se ressemblent que sur un écran mal fait.
      this.failed.set(true);
    }
  }

  protected days(rule: OrderTimeLimitView): string {
    return daysPhrase(rule.daysBefore);
  }

  protected time(rule: OrderTimeLimitView): string {
    return timePhrase(rule.time);
  }

  protected grace(rule: OrderTimeLimitView): string {
    return gracePhrase(rule.graceMinutes);
  }

  protected edit(row: OrderLimitRow): void {
    const ref = this.panelHost.open(LimitPanel, {
      data: {
        rule: row.rule,
        categories: [],
        preset: { scope: scopeOf(row.scopeType, row.scopeId), label: row.label },
      },
    });
    void ref.closed.then((saved) => {
      if (saved === true) {
        void this.load();
      }
    });
  }

  protected askRemove(rule: OrderTimeLimitView): void {
    this.pendingRemoval.set(rule.id);
  }

  protected cancelRemove(): void {
    this.pendingRemoval.set(null);
  }

  protected async remove(rule: OrderTimeLimitView): Promise<void> {
    this.pendingRemoval.set(null);
    try {
      await this.api.remove(rule.id);
      this.notify.success('Limite retirée — cet article suit de nouveau sa famille.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }
}

function scopeOf(
  type: OrderTimeLimitScopeType,
  id: string,
): { type: OrderTimeLimitScopeType; id: string } {
  return { type, id };
}
