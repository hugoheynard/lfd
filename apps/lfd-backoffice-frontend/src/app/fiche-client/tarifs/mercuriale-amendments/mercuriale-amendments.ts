import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type {
  AmendCompanyMercurialePayload,
  CompanyPricingCategoryView,
  PosedMercurialeAmendmentView,
  PosedMercurialeView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldComboboxComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldNumberInputComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { CompanyPricingService } from '../company-pricing.service';
import {
  AMENDMENT_REASON_MAX_LENGTH,
  catalogueOptions,
  endAmendment,
  priceAmendment,
  runningOptions,
  runningSkus,
  type AmendmentDraft,
} from './amendment-draft';
import { amendmentLine } from './amendment-lines';

/** Le geste ouvert, s'il y en a un. */
type Gesture = 'price' | 'end' | null;

/**
 * **Les avenants d'une mercuriale** (`plan-tarif-date-sur-une-reference.md`,
 * T6) — sous sa grille, sur la fiche tarifaire du client : la liste des
 * avenants écrits, et les deux gestes qui en écrivent un — ajouter ou changer
 * un prix, arrêter une ligne. La grille n'est jamais réécrite.
 *
 * Le motif est obligatoire (invariant du domaine). Une mercuriale terminée ne
 * s'amende plus : les gestes disparaissent, la liste reste.
 */
@Component({
  selector: 'app-mercuriale-amendments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldComboboxComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldNumberInputComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './mercuriale-amendments.html',
  styleUrl: './mercuriale-amendments.scss',
})
export class MercurialeAmendments {
  readonly companyId = input.required<string>();
  readonly mercuriale = input.required<PosedMercurialeView>();
  readonly categories = input.required<readonly CompanyPricingCategoryView[]>();

  /** Un avenant est écrit : au parent de relire la fiche. */
  readonly amended = output<void>();

  private readonly pricing = inject(CompanyPricingService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly maxLength = AMENDMENT_REASON_MAX_LENGTH;
  protected readonly gesture = signal<Gesture>(null);
  protected readonly sku = signal<string | null>(null);
  protected readonly euros = signal<number | null>(null);
  protected readonly fromDay = signal('');
  protected readonly toDay = signal('');
  protected readonly reason = signal('');
  protected readonly refusal = signal<string | null>(null);
  protected readonly saving = signal(false);

  /**
   * Un avenant est une écriture : ni sur une mercuriale terminée, ni sans
   * `b2b_pricing:write` — le serveur la refuserait (403), l'écran ne l'offre pas.
   */
  protected readonly amendable = computed(
    () => this.mercuriale().status !== 'expired' && this.permissions.can('b2b_pricing:write'),
  );
  protected readonly amendments = computed<readonly PosedMercurialeAmendmentView[]>(
    () => this.mercuriale().amendments ?? [],
  );
  protected readonly lineOf = amendmentLine;
  protected readonly catalogue = computed(() => catalogueOptions(this.categories()));
  protected readonly running = computed(() => runningOptions(this.mercuriale()));
  /** L'article choisi a déjà un prix en cours : l'avenant le changera. */
  protected readonly changesPrice = computed(() => {
    const sku = this.sku();
    return sku !== null && runningSkus(this.mercuriale()).has(sku);
  });
  protected readonly tooLong = computed(
    () => this.reason().trim().length > AMENDMENT_REASON_MAX_LENGTH,
  );

  protected open(gesture: Exclude<Gesture, null>): void {
    this.reset();
    this.gesture.set(gesture);
  }

  protected cancel(): void {
    this.reset();
  }

  protected async submit(): Promise<void> {
    const draft = this.draft();
    if (!draft.ok) {
      this.refusal.set(draft.refusal);
      return;
    }
    if (this.tooLong()) {
      return;
    }
    await this.send(draft.payload);
  }

  private draft(): AmendmentDraft {
    return this.gesture() === 'end'
      ? endAmendment({ sku: this.sku(), fromDay: this.fromDay(), reason: this.reason() })
      : priceAmendment(
          {
            sku: this.sku(),
            euros: this.euros(),
            fromDay: this.fromDay(),
            toDay: this.toDay(),
            reason: this.reason(),
          },
          runningSkus(this.mercuriale()),
        );
  }

  private async send(payload: AmendCompanyMercurialePayload): Promise<void> {
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.pricing.amend(this.companyId(), this.mercuriale().id, payload);
      this.notify.success('Avenant enregistré — la grille est inchangée.');
      this.reset();
      this.amended.emit();
    } catch (error) {
      this.notify.error(error, "L'avenant n'a pas pu être enregistré.");
    } finally {
      this.saving.set(false);
    }
  }

  private reset(): void {
    this.gesture.set(null);
    this.sku.set(null);
    this.euros.set(null);
    this.fromDay.set('');
    this.toDay.set('');
    this.reason.set('');
    this.refusal.set(null);
  }
}
