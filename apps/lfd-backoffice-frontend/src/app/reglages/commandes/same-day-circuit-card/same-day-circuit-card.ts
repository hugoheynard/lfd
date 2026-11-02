import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  type OrderCutoffSettingsPatch,
  type OrderCutoffSettingsView,
  type SameDayProWithoutCredit,
  SHELF_HOLD_MINUTES_MAX,
  SHELF_HOLD_MINUTES_MIN,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffSettingsService } from '../order-cutoff-settings.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Le brouillon de la carte ; la durée vaut `null` quand le champ est vidé. */
interface CircuitDraft {
  readonly sameDayPublicAllowed: boolean;
  readonly sameDayProAllowed: boolean;
  readonly sameDayProOnline: boolean;
  readonly sameDayProWithoutCredit: SameDayProWithoutCredit;
  readonly shelfHoldMinutes: number | null;
}

/** Les clés de la carte, dans l'ordre de l'écran. */
const DRAFT_KEYS = [
  'sameDayPublicAllowed',
  'sameDayProAllowed',
  'sameDayProOnline',
  'sameDayProWithoutCredit',
  'shelfHoldMinutes',
] as const satisfies readonly (keyof CircuitDraft)[];

/** Ce que devient, au comptoir, la commande du jour d'un pro sans crédit au compte. */
const WITHOUT_CREDIT_OPTIONS = [
  { value: 'refuse', label: 'Refuser la commande' },
  { value: 'payment_link', label: 'Envoyer un lien de paiement' },
] as const satisfies readonly { value: SameDayProWithoutCredit; label: string }[];

/**
 * **Le circuit du jour J** — commander pour aujourd'hui sur le stock de la
 * vitrine (lot L3, `documentation/limites-de-commande/jour-meme-sur-stock.md`
 * §3, Hugo 2026-11-02) : autoriser les particuliers, les pros, les pros en
 * ligne ; le sort d'un pro sans crédit au comptoir ; la tenue du stock par un
 * paiement en cours.
 *
 * Lus par la passation depuis le lot L4 ; l'encadré « ne prennent pas encore
 * effet » est retiré au lot L6. Le serveur refuse une durée hors bornes (400). Même droit que la page,
 * `lfc_order_settings`.
 */
@Component({
  selector: 'app-same-day-circuit-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './same-day-circuit-card.html',
  styleUrl: './same-day-circuit-card.scss',
})
export class SameDayCircuitCard {
  private readonly service = inject(OrderCutoffSettingsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly withoutCreditOptions = WITHOUT_CREDIT_OPTIONS;
  protected readonly holdMin = SHELF_HOLD_MINUTES_MIN;
  protected readonly holdMax = SHELF_HOLD_MINUTES_MAX;

  protected readonly canWrite = computed(() => this.permissions.can('lfc_order_settings:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly settings = signal<OrderCutoffSettingsView | null>(null);
  protected readonly draft = signal<CircuitDraft | null>(null);
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);

  /** Ce qui diffère du réglage servi — seules ces clés partent. */
  protected readonly patch = computed<OrderCutoffSettingsPatch | null>(() => {
    const served = this.settings();
    const draft = this.draft();
    if (served === null || draft === null) {
      return null;
    }
    const differs = (key: (typeof DRAFT_KEYS)[number]): boolean =>
      draft[key] !== null && draft[key] !== served[key];
    if (!DRAFT_KEYS.some(differs)) {
      return null;
    }
    const hold = draft.shelfHoldMinutes;
    return {
      ...(differs('sameDayPublicAllowed') && { sameDayPublicAllowed: draft.sameDayPublicAllowed }),
      ...(differs('sameDayProAllowed') && { sameDayProAllowed: draft.sameDayProAllowed }),
      ...(differs('sameDayProOnline') && { sameDayProOnline: draft.sameDayProOnline }),
      ...(differs('sameDayProWithoutCredit') && {
        sameDayProWithoutCredit: draft.sameDayProWithoutCredit,
      }),
      ...(hold !== null && differs('shelfHoldMinutes') && { shelfHoldMinutes: hold }),
    };
  });

  /** Un champ de durée vidé ne s'enregistre pas : le serveur exige un entier. */
  protected readonly canSave = computed(
    () => this.patch() !== null && this.draft()?.shelfHoldMinutes !== null && !this.pending(),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.apply(await this.service.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Change une clé du brouillon. */
  protected set<K extends keyof CircuitDraft>(key: K, value: CircuitDraft[K]): void {
    const draft = this.draft();
    if (draft !== null) {
      this.draft.set({ ...draft, [key]: value });
    }
  }

  /** Revient au réglage servi. */
  protected reset(): void {
    const served = this.settings();
    if (served !== null) {
      this.apply(served);
    }
    this.failure.set(null);
  }

  /** Envoie ce qui a changé, puis relit. Un refus garde le brouillon, avec la raison. */
  protected async save(): Promise<void> {
    const patch = this.patch();
    if (patch === null || !this.canSave()) {
      return;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await this.service.update(patch);
      this.apply(await this.service.read());
    } catch (error) {
      this.failure.set(
        httpErrorMessage(error, 'Les réglages du jour J n’ont pas pu être enregistrés.'),
      );
    } finally {
      this.pending.set(false);
    }
  }

  private apply(view: OrderCutoffSettingsView): void {
    this.settings.set(view);
    this.draft.set({
      sameDayPublicAllowed: view.sameDayPublicAllowed,
      sameDayProAllowed: view.sameDayProAllowed,
      sameDayProOnline: view.sameDayProOnline,
      sameDayProWithoutCredit: view.sameDayProWithoutCredit,
      shelfHoldMinutes: view.shelfHoldMinutes,
    });
  }
}
