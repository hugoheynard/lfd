import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInlineConfirmComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../../auth/permissions.store';
import { SaleReferenceDecisionsService } from '../../../../b2b/tarification/sale-reference-decisions.service';

/** La borne du motif — celle du contrat (`carryOverMercurialeLinePayloadSchema`). */
export const CARRY_OVER_REASON_MAX_LENGTH = 500;

/** Le motif proposé : modifiable, jamais vide (`plan-tarif-date-sur-une-reference.md`, § 6). */
export function defaultCarryOverReason(fromSku: string): string {
  return `Report de la déclinaison détachée ${fromSku}`;
}

/**
 * **Reporter une mercuriale sur la référence née d'un détachement**
 * (`plan-tarif-date-sur-une-reference.md`, § 6 — le geste L7c).
 *
 * Un avenant daté sur la mercuriale du client : mêmes paliers que
 * l'ancienne référence, dès maintenant, jusqu'à la fin de la mercuriale. Le
 * motif s'ouvre avec la confirmation, prérempli. Absent sans
 * `b2b_pricing:write`.
 */
@Component({
  selector: 'app-mercuriale-carry-over',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './mercuriale-carry-over.html',
  styleUrl: './mercuriale-carry-over.scss',
})
export class MercurialeCarryOver {
  readonly mercurialeId = input.required<string>();
  /** L'ANCIENNE référence, celle que la mercuriale négocie. */
  readonly fromSku = input.required<string>();
  /** La NOUVELLE référence, née du détachement. */
  readonly toSku = input.required<string>();

  /** Le report est écrit : au parent de relire la liste. */
  readonly carried = output<void>();

  private readonly api = inject(SaleReferenceDecisionsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly maxLength = CARRY_OVER_REASON_MAX_LENGTH;
  protected readonly allowed = computed(() => this.permissions.can('b2b_pricing:write'));

  protected readonly open = signal(false);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly trimmed = computed(() => this.reason().trim());
  protected readonly tooLong = computed(() => this.trimmed().length > CARRY_OVER_REASON_MAX_LENGTH);
  protected readonly missing = computed(() => this.trimmed() === '');

  protected onOpenChange(open: boolean): void {
    this.open.set(open);
    this.reason.set(open ? defaultCarryOverReason(this.fromSku()) : '');
  }

  protected async confirm(): Promise<void> {
    if (this.missing() || this.tooLong()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.carryOver(this.fromSku(), this.mercurialeId(), {
        toSku: this.toSku(),
        reason: this.trimmed(),
      });
      this.onOpenChange(false);
      this.carried.emit();
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "Le report n'a pas abouti. Réessayez."));
    } finally {
      this.saving.set(false);
    }
  }
}
