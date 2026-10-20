import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { DeliveryZoneView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { formatAdjustmentValue } from '@lfd/b2b-ui/pricing';
import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryZonesService } from '../delivery-zones.service';
import { ADD_POSTAL_CODE_PARAM } from './add-postal-code-param';
import { UncoveredPostalCodes } from './uncovered-postal-codes/uncovered-postal-codes';
import { ZonePanel, type ZonePanelData } from './zone-panel/zone-panel';

const POSTAL_PREFIX = /^\d{2,5}$/u;

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Section **Zones de livraison** des Réglages Retraits & livraisons (staff) — un
 * code postal → un frais de livraison ajouté au panier (stations éloignées :
 * Val d'Isère, Tignes…). Ajouter / éditer / supprimer : tout passe par
 * `ZonePanel`, la suppression dans sa zone dangereuse depuis le 2026-09-15 (un
 * clic dans le menu de la liste suffisait avant) ; ici on liste, on ouvre le
 * panneau et on recharge.
 *
 * Au-dessus de la liste, les codes postaux d'adresses de livraison qu'aucune
 * zone ne couvre (2026-10-20) ; « Ajouter un tarif » ouvre le panneau en
 * création, prérempli. La fiche client y envoie par `?addPostalCode=73320`.
 */
@Component({
  selector: 'app-delivery-zones-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldBadgeComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldIconComponent,
    UncoveredPostalCodes,
  ],
  templateUrl: './delivery-zones-section.html',
  styleUrl: './delivery-zones-section.scss',
})
export class DeliveryZonesSection {
  private readonly zones = inject(DeliveryZonesService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);

  /** Régler une zone, c'est fixer un frais : `delivery_fee` (2026-10-10). */
  protected readonly canWrite = computed(() => this.permissions.can('delivery_fee:write'));
  /** La lecture des codes non couverts est sous `delivery_fee`, comme les zones. */
  protected readonly canReadFees = computed(() => this.permissions.can('delivery_fee:read'));

  protected readonly state = signal<LoadState>('loading');
  protected readonly list = signal<readonly DeliveryZoneView[]>([]);

  protected readonly fee = formatAdjustmentValue;

  constructor() {
    void this.load().then(() => this.openRequestedPostalCode());
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.list.set(await this.zones.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected add(): void {
    void this.openPanel({ zone: null });
  }

  protected addFor(postalCode: string): void {
    void this.openPanel({ zone: null, postalCode });
  }

  /**
   * `?addPostalCode=` (lien de la fiche client) : ouvre le panneau prérempli
   * une fois, puis retire le paramètre — un rechargement ne le rouvrirait pas.
   * Par le `Router` seul : la section est une carte, pas la page routée.
   */
  private openRequestedPostalCode(): void {
    const url = this.router.parseUrl(this.router.url);
    const postalCode = url.queryParamMap.get(ADD_POSTAL_CODE_PARAM);
    if (postalCode === null) {
      return;
    }
    url.queryParams = Object.fromEntries(
      Object.entries(url.queryParams).filter(([key]) => key !== ADD_POSTAL_CODE_PARAM),
    );
    void this.router.navigateByUrl(url, { replaceUrl: true });
    if (this.canWrite() && POSTAL_PREFIX.test(postalCode)) {
      this.addFor(postalCode);
    }
  }

  protected edit(zone: DeliveryZoneView): void {
    void this.openPanel({ zone });
  }

  private async openPanel(data: ZonePanelData): Promise<void> {
    const ref = this.panels.open<ZonePanelData | undefined, boolean>(ZonePanel, {
      data,
      width: 'md',
    });
    if ((await ref.closed) === true) {
      await this.load();
    }
  }
}
