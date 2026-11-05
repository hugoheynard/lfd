import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  DEFAULT_DELIVERY_PRICING,
  type AdminDeliveryZoneView,
  type CartAdjustment,
  type CustomerAudience,
  type DeliveryPricingView,
  type DeliveryZoneView,
} from '@lfd/contracts';
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
import { DeliveryAvailabilityService } from '../delivery-availability.service';
import { DeliveryZonesService } from '../delivery-zones.service';
import { AUDIENCE_LABELS, dialogSide, openAudiences } from './delivery-audiences';
import {
  GlobalPricingDialog,
  type GlobalPricingDialogData,
} from './global-pricing-dialog/global-pricing-dialog';
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
 *
 * Depuis 0b (plan `plan-livraison-offerte.md`), le **réglage global** par
 * clientèle (frais de base) se lit et se règle en tête, et chaque zone dit
 * ses remplacements. Seules les clientèles OUVERTES à la livraison
 * s'affichent. Le franco, posé mais appliqué au lot 1, est masqué.
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
  private readonly availability = inject(DeliveryAvailabilityService);

  /** Régler une zone, c'est fixer un frais : `delivery_fee` (2026-10-10). */
  protected readonly canWrite = computed(() => this.permissions.can('delivery_fee:write'));
  /** La lecture des codes non couverts est sous `delivery_fee`, comme les zones. */
  protected readonly canReadFees = computed(() => this.permissions.can('delivery_fee:read'));

  protected readonly state = signal<LoadState>('loading');
  protected readonly list = signal<readonly (DeliveryZoneView | AdminDeliveryZoneView)[]>([]);
  protected readonly pricing = signal<DeliveryPricingView>(DEFAULT_DELIVERY_PRICING);
  protected readonly audiences = signal<readonly CustomerAudience[]>([]);
  protected readonly audienceLabels = AUDIENCE_LABELS;

  protected readonly fee = formatAdjustmentValue;

  /** « + 9,00 € », ou « ancien frais de chaque zone » quand rien n'est réglé. */
  protected globalFee(fee: CartAdjustment | null): string {
    return fee === null ? 'Frais de chaque zone' : `+ ${this.fee(fee)}`;
  }

  /** Les remplacements posés d'une zone, pour les clientèles ouvertes. */
  protected overridesOf(
    zone: DeliveryZoneView | AdminDeliveryZoneView,
  ): readonly { readonly audience: CustomerAudience; readonly fee: CartAdjustment }[] {
    if (!('audienceTerms' in zone)) {
      return [];
    }
    return this.audiences().flatMap((audience) => {
      const fee = zone.audienceTerms[audience].fee;
      return fee === null ? [] : [{ audience, fee }];
    });
  }

  constructor() {
    void this.load().then(() => this.openRequestedPostalCode());
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      // Les remplacements et le réglage global sont sous `delivery_fee:read` ;
      // sans ce droit, la liste publique, sans eux.
      const [list, pricing, open] = await Promise.all([
        this.canReadFees() ? this.zones.listAdmin() : this.zones.list(),
        this.canReadFees() ? this.zones.pricing() : Promise.resolve(DEFAULT_DELIVERY_PRICING),
        this.availability.readPublic(),
      ]);
      this.list.set(list);
      this.pricing.set(pricing);
      this.audiences.set(openAudiences(open));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected editGlobal(): void {
    const ref = this.panels.open<GlobalPricingDialogData | undefined, boolean>(
      GlobalPricingDialog,
      {
        data: { pricing: this.pricing(), audiences: this.audiences() },
        side: dialogSide(),
      },
    );
    void ref.closed.then((saved) => (saved === true ? this.load() : undefined));
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

  protected edit(zone: DeliveryZoneView | AdminDeliveryZoneView): void {
    void this.openPanel({ zone });
  }

  private async openPanel(data: ZonePanelData): Promise<void> {
    const ref = this.panels.open<ZonePanelData | undefined, boolean>(ZonePanel, {
      data: { ...data, audiences: this.audiences() },
      width: 'md',
      side: dialogSide(),
    });
    if ((await ref.closed) === true) {
      await this.load();
    }
  }
}
