import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { httpErrorCode } from '@lfd/endpoints';
import type { OrderTimeLimitListItem } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldListboxComponent,
  FoldPanelHostService,
  type FoldSelectOption,
} from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { excludedPhrase, limitPhrase } from '../../../../order-time-limits/limit-format';
import { LimitPanel } from '../../../../order-time-limits/limit-panel/limit-panel';
import { OrderTimeLimitsService } from '../../../../order-time-limits/order-time-limits.service';
import { CategoryStore } from '../../../category-store';
import { ProductListStore } from '../../../product-list-store';
import { excludableProducts } from './family-descendants';

/**
 * **Limite de commande de la famille** — la poser, la modifier, l'archiver, la
 * restaurer, et gérer les produits qu'elle exclut.
 *
 * Une limite de famille vise toute sa descendance (sous-familles comprises),
 * sauf les produits exclus nommément ; quand plusieurs limites visent un
 * article, la plus stricte gagne. Elle vit dans un autre contexte que la
 * famille, avec ses routes : la carte écrit seule, hors des sections de la
 * page.
 *
 * Une exclusion devenue inerte (le produit a quitté la famille) n'est pas
 * signalée : il faudrait la lignée de chaque produit. Elle se montre et se
 * retire comme une autre.
 */
@Component({
  selector: 'app-category-order-limit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldListboxComponent],
  templateUrl: './category-order-limit.html',
  styleUrl: './category-order-limit.scss',
})
export class CategoryOrderLimit {
  private readonly api = inject(OrderTimeLimitsService);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly products = inject(ProductListStore);
  private readonly categories = inject(CategoryStore);

  readonly familyId = input.required<string>();
  readonly familyName = input.required<string>();

  private readonly rules = signal<readonly OrderTimeLimitListItem[]>([]);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly pendingRemoval = signal(false);
  protected readonly toExclude = signal<string | null>(null);

  /** La limite de CETTE famille, archivée comprise, ou `null`. */
  protected readonly rule = computed(
    () =>
      this.rules().find(
        (rule) => rule.scope.type === 'category' && rule.scope.id === this.familyId(),
      ) ?? null,
  );

  protected readonly phrase = computed(() => {
    const rule = this.rule();
    return rule === null ? null : limitPhrase(rule);
  });

  protected readonly excludedCount = computed(() =>
    excludedPhrase(this.rule()?.exclusions.length ?? 0),
  );

  /**
   * Les produits qu'on peut exclure : ceux de la descendance de la famille,
   * moins ceux déjà exclus. Le refus du serveur (409) reste le filet.
   */
  protected readonly productChoices = computed<FoldSelectOption<string>[]>(() => {
    const excluded = new Set((this.rule()?.exclusions ?? []).map((item) => item.productId));
    return excludableProducts(
      this.products.products(),
      this.categories.items(),
      this.familyId(),
      excluded,
    )
      .map((product) => ({
        value: product.id,
        label: `${product.name.fr ?? product.sku} — ${product.sku}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  });

  constructor() {
    effect(() => {
      if (this.familyId() !== '') {
        untracked(() => void this.load());
      }
    });
    void this.products.open();
    void this.categories.ensure().catch(() => undefined);
  }

  protected async load(): Promise<void> {
    try {
      this.rules.set(await this.api.list());
      this.failed.set(false);
    } catch {
      this.failed.set(true);
    }
  }

  protected edit(): void {
    const ref = this.panelHost.open(LimitPanel, {
      data: {
        scope: { type: 'category', id: this.familyId() },
        label: this.familyName(),
        rule: this.rule(),
      },
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

  protected async archive(): Promise<void> {
    const rule = this.rule();
    this.pendingRemoval.set(false);
    if (rule === null) {
      return;
    }
    await this.run(
      () => this.api.archive(rule.id),
      "Limite archivée — elle ne s'applique plus. Ses exclusions sont gardées pour une restauration.",
    );
  }

  protected async restore(): Promise<void> {
    const rule = this.rule();
    if (rule === null) {
      return;
    }
    await this.run(
      () => this.api.restore(rule.id),
      'Limite restaurée — elle s’applique de nouveau.',
    );
  }

  protected async exclude(): Promise<void> {
    const rule = this.rule();
    const productId = this.toExclude();
    if (rule === null || productId === null) {
      return;
    }
    this.busy.set(true);
    try {
      await this.api.exclude(rule.id, productId);
      this.toExclude.set(null);
      this.notify.success(`Produit exclu de la limite de ${this.familyName()}.`);
      await this.load();
    } catch (error) {
      if (httpErrorCode(error) === 'pim.order_time_limit.exclusion_outside_family') {
        // Le refus nommé par la famille de CET écran, que le serveur ne
        // connaît que par son identifiant.
        this.notify.refused(
          undefined,
          `Ce produit n'est pas dans la famille ${this.familyName()} : sa limite ne le vise pas, il n'y a rien à exclure.`,
        );
      } else {
        this.notify.error(error);
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async include(productId: string): Promise<void> {
    const rule = this.rule();
    if (rule === null) {
      return;
    }
    await this.run(
      () => this.api.include(rule.id, productId),
      `Produit réintégré — la limite de ${this.familyName()} le vise de nouveau.`,
    );
  }

  private async run(action: () => Promise<void>, success: string): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.notify.success(success);
      await this.load();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.busy.set(false);
    }
  }
}
