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
import {
  DEFAULT_DESTINATION,
  destinationOf,
  noPreference,
  preferenceForDestination,
  preferenceForMethod,
} from '@lfd/b2b-ui/company';
import { DELIVERY_SERVICE_OPEN } from '@lfd/b2b-ui/flags';
import {
  type CompanyView,
  type FulfillmentMethod,
  type FulfillmentPreferenceView,
  NO_FULFILLMENT_PREFERENCE,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldListboxComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
  type FoldSelectOption,
} from 'fold-ng';

import { AccountService } from '../../../../account/account.service';
import { ClientAddresses } from '../../../client-addresses.service';
import { ClientPreferences } from '../../../client-preferences.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { LangSwitch } from '../../../lang-switch/lang-switch';
import { panelSide } from '../../../panel-side';
import { ServicePoints } from '../../../shop/pickup-points.store';
import { canEditPreferences, samePreference } from '../preferences-section';

/**
 * Le choix du mode, sentinelle comprise : `fold-listbox` lit `null` comme
 * « rien de choisi » et retomberait sur son placeholder, alors que « aucun
 * mode » est un choix.
 */
type MethodChoice = FulfillmentMethod | 'none';

/** Charge d'ouverture : la société, si l'on peut écrire, et ce qu'elle a posé. */
export interface PreferencesPanelData {
  /** `null` : personne de reconnu ou compte sans société — seule la langue se règle. */
  readonly companyId: string | null;
  /** `owner`/`admin` : ceux que l'API laisse écrire. Les autres lisent l'habitude. */
  readonly canManage: boolean;
  readonly preference: FulfillmentPreferenceView;
}

/**
 * Le panneau **Préférences** — l'habitude de service, la langue, et la règle
 * des notifications.
 *
 * ## L'habitude, pour de vrai
 *
 * Deux listes : le MODE (aucun, retrait, livraison), puis sa DESTINATION —
 * « par défaut » d'abord, parce que suivre le défaut du moment est un choix et
 * le plus fréquent, puis les points ou les adresses nommés. La préférence se
 * dérive par les fonctions du paquet partagé (`preferenceForMethod`…), les
 * mêmes que la fiche staff : changer de mode remet la destination au défaut,
 * et le socle de signature, que ce panneau ne montre pas, repart tel quel.
 * Enregistrer ne s'arme que sur un changement ; un refus reste dans le panneau.
 *
 * ## La langue, sans rien enregistrer
 *
 * Le même `app-lang-switch` que le chrome : il écrit `ClientLocale`, et tout
 * l'écran se redessine. Aucun appel — la langue n'est pas un réglage de la
 * société.
 */
@Component({
  selector: 'app-preferences-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldListboxComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    LangSwitch,
  ],
  templateUrl: './preferences-panel.html',
  styleUrl: './preferences-panel.scss',
})
export class PreferencesPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  static open(panels: FoldPanelHostService, company: CompanyView | null): void {
    panels.open(PreferencesPanel, {
      side: panelSide(),
      data: {
        companyId: company?.id ?? null,
        canManage: canEditPreferences(company),
        preference: company?.fulfillmentPreference ?? NO_FULFILLMENT_PREFERENCE,
      },
    });
  }

  readonly data = input.required<PreferencesPanelData>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly preferences = inject(ClientPreferences);
  private readonly account = inject(AccountService);
  private readonly addresses = inject(ClientAddresses);
  private readonly service = inject(ServicePoints);
  private readonly ref = inject(FoldPanelRef);

  protected readonly draft = signal<FulfillmentPreferenceView>(NO_FULFILLMENT_PREFERENCE);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly methods = computed<readonly FoldSelectOption<MethodChoice>[]>(() => {
    const copy = this.t().account;
    // La livraison fermée ne se propose plus — sauf à qui l'a déjà posée, qui
    // doit pouvoir la lire avant d'en changer.
    const delivery = DELIVERY_SERVICE_OPEN || this.data().preference.method === 'delivery';
    return [
      { value: 'none', label: copy.prefMethodNone },
      { value: 'pickup', label: copy.prefMethodPickup },
      ...(delivery ? [{ value: 'delivery' as const, label: copy.prefMethodDelivery }] : []),
    ];
  });

  protected readonly method = computed<MethodChoice>(() => this.draft().method ?? 'none');

  protected readonly destinationLabel = computed(() =>
    this.draft().method === 'pickup'
      ? this.t().account.prefPickupPoint
      : this.t().account.prefDeliveryAddress,
  );

  /** « Par défaut » en tête, puis les destinations nommées, la défaut du jour étiquetée. */
  protected readonly destinations = computed<readonly FoldSelectOption<string>[]>(() => {
    const copy = this.t().account;
    const pickup = this.draft().method === 'pickup';
    const named = pickup ? this.service.pickups() : this.addresses.deliveries();
    return [
      {
        value: DEFAULT_DESTINATION,
        label: pickup ? copy.prefPickupDefault : copy.prefDeliveryDefault,
      },
      ...named.map((place) => ({
        value: place.id,
        label: place.isDefault ? `${place.label} (${copy.prefDefaultTag})` : place.label,
      })),
    ];
  });

  protected readonly destination = computed(() => destinationOf(this.draft()));

  protected readonly canSave = computed(
    () =>
      this.data().canManage &&
      this.data().companyId !== null &&
      !this.saving() &&
      !samePreference(this.draft(), this.data().preference),
  );

  constructor() {
    // Les points de retrait ne sont pas lus par `/mon-compte` : on les demande
    // ici, une fois (`hydrate` est idempotent).
    void this.service.hydrate();
    effect(() => {
      const { preference } = this.data();
      untracked(() => this.draft.set(preference));
    });
  }

  protected chooseMethod(choice: MethodChoice): void {
    this.draft.update((current) => {
      if (choice === 'none') {
        return noPreference(current);
      }
      return current.method === choice ? current : preferenceForMethod(choice, current);
    });
  }

  protected chooseDestination(chosen: string): void {
    const method = this.draft().method;
    if (method !== null) {
      this.draft.update((current) => preferenceForDestination(method, chosen, current));
    }
  }

  protected async save(): Promise<void> {
    const companyId = this.data().companyId;
    if (!this.canSave() || companyId === null) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const refusal = await this.account.saveFulfillment(companyId, this.draft());
    this.saving.set(false);
    if (refusal === null) {
      this.ref.close(true);
    } else {
      this.refusal.set(refusal);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
