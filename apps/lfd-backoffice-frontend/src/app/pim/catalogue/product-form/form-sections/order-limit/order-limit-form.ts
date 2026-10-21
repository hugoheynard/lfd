import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrderTimeLimitView } from '@lfd/pim-contracts';
import { FoldButtonComponent, FoldCalloutComponent, FoldPanelHostService } from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { daysPhrase } from '../../../../order-time-limits/limit-format';
import { LimitPanel } from '../../../../order-time-limits/limit-panel/limit-panel';
import { OrderTimeLimitsService } from '../../../../order-time-limits/order-time-limits.service';
import { ProductFormStore } from '../../product-form-store';
import { limitApplies, productRule } from './order-limit-row';

/**
 * **Limite de commande** — jusqu'à quand on prend commande de ce produit.
 *
 * Depuis le 2026-10-21 (décision de Hugo, `limites-de-commande/
 * schema-des-reglages.md` §4) : une limite par **produit**, règle entière (le
 * délai ET l'heure), **sans rattrapage**, valable pour toutes ses
 * déclinaisons. La règle générale, elle, se règle dans Réglages › Commandes ›
 * Heure limite ; la plus stricte des deux s'applique.
 *
 * ## Elle ne participe PAS à l'enregistrement de la fiche
 *
 * La limite vit dans un autre contexte, avec sa propre route. Le panneau écrit
 * seul en se fermant — rien à accrocher au garde « modifications non
 * enregistrées ».
 */
@Component({
  selector: 'app-order-limit-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, RouterLink],
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
  protected readonly pendingRemoval = signal(false);

  /** La limite posée sur ce produit, ou `null`. */
  protected readonly rule = computed(() => productRule(this.rules(), this.store.productId()));

  /** Ce qui s'applique, en une phrase — ou `null` : seule la règle générale juge. */
  protected readonly phrase = computed(() => {
    const rule = this.rule();
    return limitApplies(rule)
      ? `${daysPhrase(rule.daysBefore ?? 0)}, avant ${rule.time ?? ''}`
      : null;
  });

  constructor() {
    // Rechargé quand la fiche change d'identité : rester sur les règles de la
    // précédente ferait modifier un article en croyant en modifier un autre.
    effect(() => {
      if (this.store.productId() !== '') {
        void this.load();
      }
    });
  }

  protected async load(): Promise<void> {
    try {
      this.rules.set(await this.api.list());
      this.failed.set(false);
    } catch {
      // « Aucune limite » et « on n'a pas pu lire » ne se ressemblent que sur
      // un écran mal fait.
      this.failed.set(true);
    }
  }

  protected edit(): void {
    const ref = this.panelHost.open(LimitPanel, {
      data: { productId: this.store.productId(), label: this.store.pageTitle(), rule: this.rule() },
    });
    void ref.closed.then((saved) => {
      if (saved === true) {
        void this.load();
      }
    });
  }

  protected askRemove(): void {
    this.pendingRemoval.set(true);
  }

  protected cancelRemove(): void {
    this.pendingRemoval.set(false);
  }

  protected async remove(): Promise<void> {
    const rule = this.rule();
    this.pendingRemoval.set(false);
    if (rule === null) {
      return;
    }
    try {
      await this.api.remove(rule.id);
      this.notify.success('Limite retirée — seule la règle générale juge ce produit.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }
}
