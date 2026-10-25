import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import type { ReleasedToReserveLine } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldSelectOption,
} from 'fold-ng';

import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { NotifyService } from '../../notify.service';
import { ulid } from '../../shared/ulid';
import { ReserveShopService } from '../reserve-shop.service';
import { initialRows, linesToSend, overFree, type ReserveShopRow } from './reserve-shop-draft';

/** Ce que la page passe au panneau : la journée de la réserve, la commande, ce qu'elle a rendu. */
export interface ReserveShopPanelData {
  readonly serviceDay: string;
  readonly reference: string;
  readonly released: readonly ReleasedToReserveLine[];
}

/**
 * **« Envoyer en boutique »** (plan A1, lot A1.4) — le pain rendu à la
 * réserve par une annulation après l'arrêt sort vers une boutique, qui le
 * reçoit comme un réassort. Choisir le point, ajuster les quantités
 * (pré-remplies avec ce qui a été rendu, bornées au libre), envoyer.
 *
 * 🔴 La clé d'idempotence est tirée UNE fois, à l'ouverture : un double clic
 * ou un nouvel essai rejoue la même, et le serveur ne sort rien de plus.
 */
@Component({
  selector: 'app-reserve-shop-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './reserve-shop-panel.html',
  styleUrl: './reserve-shop-panel.scss',
})
export class ReserveShopPanel implements OnInit {
  private readonly service = inject(ReserveShopService);
  private readonly pickups = inject(PickupAddressesService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<ReserveShopPanelData | undefined>(undefined);

  /** La clé d'idempotence — une par ouverture. */
  private readonly key = ulid();

  protected readonly sites = signal<readonly FoldSelectOption<string>[]>([]);
  protected readonly sitesFailed = signal(false);
  protected readonly siteId = signal<string | null>(null);
  protected readonly rows = signal<readonly ReserveShopRow[]>([]);
  protected readonly sending = signal(false);
  /** Le refus du serveur, dit DANS le panneau, qui reste ouvert. */
  protected readonly refusal = signal<string | null>(null);

  protected readonly tooMany = computed(() => overFree(this.rows()));
  protected readonly canSend = computed(
    () =>
      !this.sending() &&
      this.siteId() !== null &&
      linesToSend(this.rows()).length > 0 &&
      !this.tooMany(),
  );

  /** Les entrées sont posées par l'hôte avant l'initialisation : `data` est lisible ici. */
  ngOnInit(): void {
    this.rows.set(initialRows(this.data()?.released ?? []));
    void this.loadSites();
  }

  protected async loadSites(): Promise<void> {
    this.sitesFailed.set(false);
    try {
      const sites = await this.pickups.list();
      this.sites.set(sites.map((site) => ({ value: site.id, label: site.label })));
    } catch {
      this.sitesFailed.set(true);
    }
  }

  protected choose(sku: string, quantity: number | null): void {
    this.rows.update((rows) =>
      rows.map((row) => (row.sku === sku ? { ...row, chosen: quantity } : row)),
    );
  }

  protected async send(): Promise<void> {
    const data = this.data();
    const siteId = this.siteId();
    if (data === undefined || siteId === null || !this.canSend()) {
      return;
    }
    this.sending.set(true);
    this.refusal.set(null);
    try {
      await this.service.send(data.serviceDay, {
        siteId,
        key: this.key,
        lines: [...linesToSend(this.rows())],
      });
      this.notify.success('Envoyé en boutique : le comptoir le réceptionnera à son arrivée.');
      this.ref.close(true);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "L'envoi en boutique n'a pas pu être fait."));
    } finally {
      this.sending.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
