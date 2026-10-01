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
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldCalloutComponent, FoldListboxComponent, FoldLoadingStateComponent } from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { AdminDeliveryDoorstepRuleService } from '../../../comptes-clients/admin-delivery-doorstep-rule.service';
import {
  ADDRESS_DOORSTEP_OPTIONS,
  type AddressDoorstepChoice,
  choiceOf,
  ruleOfChoice,
} from '../../../livraison/doorstep-rules';

type RuleState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly choice: AddressDoorstepChoice };

/**
 * **La décision réglée d'avance à la porte, pour CETTE adresse**
 * (`plan-a-la-porte.md`, B3 bis, LB-Q6) — à côté de « dépôt autorisé », sous
 * le même droit (`delivery_procedures`) : le commercial la redéfinit, ou la
 * laisse au réglage de livraison. Le client ne la règle pas.
 *
 * Lue à l'ouverture par sa route à part (la vue des adresses, que le client
 * lit aussi, ne la porte pas) ; écrite dès qu'on la choisit. Un refus
 * s'affiche tel quel et le choix revient à ce qui est enregistré.
 */
@Component({
  selector: 'app-delivery-doorstep-rule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldListboxComponent, FoldLoadingStateComponent],
  templateUrl: './delivery-doorstep-rule.html',
  styleUrl: './delivery-doorstep-rule.scss',
})
export class DeliveryDoorstepRule {
  private readonly service = inject(AdminDeliveryDoorstepRuleService);
  private readonly permissions = inject(PermissionsStore);

  readonly companyId = input.required<string>();
  readonly addressId = input.required<string>();

  protected readonly options = ADDRESS_DOORSTEP_OPTIONS;
  protected readonly canEdit = computed(() => this.permissions.can('delivery_procedures:write'));
  protected readonly state = signal<RuleState>({ status: 'loading' });
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly choice = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.choice : null;
  });

  constructor() {
    effect(() => {
      const companyId = this.companyId();
      const addressId = this.addressId();
      untracked(() => void this.load(companyId, addressId));
    });
  }

  protected async choose(choice: AddressDoorstepChoice): Promise<void> {
    const previous = this.choice();
    if (!this.canEdit() || this.saving() || previous === null || choice === previous) {
      return;
    }
    this.state.set({ status: 'ready', choice });
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.service.set(this.companyId(), this.addressId(), ruleOfChoice(choice));
    } catch (error) {
      this.state.set({ status: 'ready', choice: previous });
      this.refusal.set(
        httpErrorMessage(error, 'La décision à la porte n’a pas pu être enregistrée.'),
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async load(companyId: string, addressId: string): Promise<void> {
    this.state.set({ status: 'loading' });
    try {
      const view = await this.service.read(companyId, addressId);
      this.state.set({ status: 'ready', choice: choiceOf(view.rule) });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
