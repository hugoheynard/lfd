import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { SaleReferenceDecisionKind, StaffPermission } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInlineConfirmComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../../auth/permissions.store';
import { SaleReferenceDecisionsService } from '../../../../b2b/tarification/sale-reference-decisions.service';

/** La borne du motif — celle du contrat (`carryOverDecisionPayloadSchema`). */
export const CARRY_OVER_REASON_MAX_LENGTH = 500;

/** Le motif proposé : modifiable, jamais vide (`plan-tarif-date-sur-une-reference.md`, § 6). */
export function defaultCarryOverReason(fromSku: string): string {
  return `Report de la déclinaison détachée ${fromSku}`;
}

/**
 * **Le droit qu'un report demande** : celui de POSER la famille
 * (`plan-report-apres-detachement.md`, § 4) — un plancher sous les limites de
 * prix, tout le reste sous la tarification.
 */
export function carryOverPermission(kind: SaleReferenceDecisionKind): StaffPermission {
  return kind === 'price_floor' ? 'lfc_price_limits:write' : 'b2b_pricing:write';
}

/** Ce que la confirmation annonce, par famille — des valeurs de donnée traduites ici. */
const CONSEQUENCES: Readonly<
  Record<SaleReferenceDecisionKind, (from: string, to: string) => string>
> = {
  mercuriale: (from, to) =>
    `Le prix négocié de ${from} vaudra pour ${to} dès maintenant, jusqu’à la fin de la mercuriale.`,
  price_rule: (from, to) =>
    `Une règle identique sera posée sur ${to} dès maintenant, jusqu’à la fin de celle de ${from} ; en pause si elle l’est.`,
  price_floor: (from, to) =>
    `Le plancher de ${from} protégera ${to} dès maintenant, jusqu’à sa fin ; un pourcentage s’applique au prix de ${to}.`,
  volume_ladder: (from, to) =>
    `Un barème aux mêmes paliers sera posé sur ${to} dès maintenant, jusqu’à la fin de celui de ${from} ; en pause s’il l’est.`,
  volume_commitment: (from, to) =>
    `La même quantité promise sera engagée sur ${to} dès maintenant, jusqu’à la fin de l’engagement de ${from}, qui court toujours.`,
  price_template: (from, to) => `Dans ce gabarit, la ligne de ${from} deviendra celle de ${to}.`,
};

/**
 * **Reporter une décision sur la référence née d'un détachement**
 * (`plan-tarif-date-sur-une-reference.md`, § 6 ; `plan-report-apres-detachement.md`,
 * § 5) — mercuriale, règle, plancher, barème, engagement, ou la ligne d'un
 * gabarit à remplacer.
 *
 * Le motif s'ouvre avec la confirmation, prérempli. Absent sans le droit de
 * poser la famille : `lfc_price_limits:write` pour un plancher,
 * `b2b_pricing:write` pour le reste.
 */
@Component({
  selector: 'app-decision-carry-over',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './decision-carry-over.html',
  styleUrl: './decision-carry-over.scss',
})
export class DecisionCarryOver {
  readonly kind = input.required<SaleReferenceDecisionKind>();
  readonly decisionId = input.required<string>();
  /** L'ANCIENNE référence, celle que la décision nomme. */
  readonly fromSku = input.required<string>();
  /** La NOUVELLE référence, née du détachement. */
  readonly toSku = input.required<string>();

  /** Le report est écrit : au parent de relire la liste. */
  readonly carried = output<void>();

  private readonly api = inject(SaleReferenceDecisionsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly maxLength = CARRY_OVER_REASON_MAX_LENGTH;
  protected readonly allowed = computed(() =>
    this.permissions.can(carryOverPermission(this.kind())),
  );
  protected readonly consequence = computed(() =>
    CONSEQUENCES[this.kind()](this.fromSku(), this.toSku()),
  );
  /** Un gabarit n'a pas de journal : son motif n'est écrit nulle part. */
  protected readonly journaled = computed(() => this.kind() !== 'price_template');
  protected readonly triggerLabel = computed(() =>
    this.kind() === 'price_template' ? 'Remplacer dans le gabarit' : `Reporter sur ${this.toSku()}`,
  );

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
      await this.api.carryOverDecision(this.kind(), this.decisionId(), {
        fromSku: this.fromSku(),
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
