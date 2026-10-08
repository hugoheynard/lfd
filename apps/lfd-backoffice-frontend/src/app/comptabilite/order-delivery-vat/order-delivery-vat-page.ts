import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DeliveryVatMode } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { OrderDeliveryVatService } from './order-delivery-vat.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Quand chaque mode est juste — ce que le comptable doit savoir pour choisir. */
const WHEN_RIGHT: Readonly<Record<DeliveryVatMode, string>> = {
  standard:
    'Juste quand la livraison est une prestation de transport distincte de la vente : elle est taxée au taux normal, quoi qu’elle transporte.',
  follows_goods:
    'Juste quand le port est l’accessoire de la vente : il suit le taux de ce qu’il transporte, réparti au prorata de la base hors taxe de chaque taux.',
};

/**
 * Vue **TVA de la livraison** de la Comptabilité (plan
 * `documentation/order/plan-tva-des-frais-de-port.md`, V2).
 *
 * Sur le modèle de la surtaxe de retard, mais sous `b2b_accounting` : c'est le
 * comptable qui sait si le transport est une prestation distincte ou
 * l'accessoire de la vente. Enregistrer demande `b2b_accounting:write`.
 *
 * Le serveur répond toujours un mode ; `configured` dit s'il a été CHOISI.
 * L'écran ne présente donc jamais le repli (`standard`) comme une décision.
 */
@Component({
  selector: 'app-order-delivery-vat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './order-delivery-vat-page.html',
  styleUrl: './order-delivery-vat-page.scss',
})
export class OrderDeliveryVatPage {
  private readonly api = inject(OrderDeliveryVatService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_accounting:write'));

  protected readonly state = signal<LoadState>('loading');
  protected readonly saving = signal(false);
  /** Le mode relu au serveur — ce qui s'applique aujourd'hui. */
  protected readonly saved = signal<DeliveryVatMode>('standard');
  protected readonly configured = signal(false);
  /** Le mode choisi à l'écran, pas encore enregistré. */
  protected readonly mode = signal<DeliveryVatMode>('standard');

  protected readonly options: readonly FoldSelectOption<DeliveryVatMode>[] = [
    { value: 'standard', label: 'Taux normal (20 %)' },
    { value: 'follows_goods', label: 'Au prorata des produits' },
  ];

  protected readonly whenRight = computed(() => WHEN_RIGHT[this.mode()]);

  /**
   * Enregistrable dès qu'il y a quelque chose à dire : un mode différent, ou le
   * repli confirmé comme choix — « non réglé » et « taux normal choisi » se
   * relisent différemment.
   */
  protected readonly dirty = computed(() => !this.configured() || this.mode() !== this.saved());

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const view = await this.api.read();
      this.saved.set(view.mode);
      this.mode.set(view.mode);
      this.configured.set(view.configured);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected onMode(mode: DeliveryVatMode): void {
    this.mode.set(mode);
  }

  protected async submit(): Promise<void> {
    if (!this.canWrite() || this.saving() || !this.dirty()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.api.save({ mode: this.mode() });
      this.notify.success('TVA de la livraison enregistrée.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }
}
