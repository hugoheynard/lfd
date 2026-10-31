import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
  type OnInit,
} from '@angular/core';
import type { MercurialePromotionModeValue, PromotionView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldElementTitleComponent,
  FoldLoadingStateComponent,
  FoldMultiselectComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PromotionsService } from '../../../targeted-promotions/promotions.service';
import {
  POLICY_MODE_HINTS,
  POLICY_MODE_LABELS,
  promotionChoices,
  type PromotionPolicyForm,
} from '../promotion-policy';

type LoadState = 'loading' | 'ready' | 'error';

const MODES: readonly MercurialePromotionModeValue[] = ['none', 'all', 'selected'];

/**
 * **« Promotions pour ce client »** — le choix à trois positions d'une
 * mercuriale (`documentation/promotions/plan-la-mercuriale-decide.md`, § 7),
 * à la pose, sur le brouillon et sur l'avenant.
 *
 * En « Au choix », la liste se garde quand on bascule ailleurs puis qu'on
 * revient : c'est l'envoi (`policyPayload`) qui la vide hors `selected`.
 */
@Component({
  selector: 'app-promotion-policy-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    FoldLoadingStateComponent,
    FoldMultiselectComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './promotion-policy-picker.html',
  styleUrl: './promotion-policy-picker.scss',
})
export class PromotionPolicyPicker implements OnInit {
  readonly policy = model.required<PromotionPolicyForm>();
  readonly disabled = input(false);

  private readonly promotions = inject(PromotionsService);

  protected readonly state = signal<LoadState>('loading');
  private readonly all = signal<readonly PromotionView[]>([]);

  protected readonly modeOptions = computed<readonly FoldViewToggleOption[]>(() =>
    MODES.map((mode) => ({
      value: mode,
      label: POLICY_MODE_LABELS[mode],
      disabled: this.disabled(),
    })),
  );
  protected readonly hint = computed(() => POLICY_MODE_HINTS[this.policy().mode]);
  protected readonly choices = computed(() =>
    promotionChoices(this.all(), this.policy().promotionIds),
  );

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const list = await this.promotions.list();
      this.all.set(list.promotions);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected setMode(value: string): void {
    const mode = MODES.find((candidate) => candidate === value);
    if (mode !== undefined && !this.disabled()) {
      this.policy.update((policy) => ({ ...policy, mode }));
    }
  }

  protected setIds(ids: readonly string[]): void {
    this.policy.update((policy) => ({ ...policy, promotionIds: [...ids] }));
  }
}
