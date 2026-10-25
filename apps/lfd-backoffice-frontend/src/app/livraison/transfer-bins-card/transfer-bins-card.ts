import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  DELIVERY_BIN_INNER_BAGS_MAX,
  DELIVERY_BINS_PER_DECLARATION_MAX,
  type DeliveryLoadingTransferStopView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { LabelPrinter } from '../../shared/label-printer/label-printer';
import { DeliveryBinsService } from '../delivery-bins.service';
import { DeliveryLoadingService } from '../delivery-loading.service';
import { transferBinsPayload, transferBinsSummary } from '../transfer-bins';

/**
 * **Les bacs d'un arrêt de transfert, au chargement** (plan du transfert
 * interne, lot T3, Q-T4 révisée) : les commandes du site sont en sacs, le
 * dépôt déclare N bacs ENTIERS du transfert, imprime leurs étiquettes, puis
 * les charge comme les autres. « Partir » refuse un transfert sans bac.
 */
@Component({
  selector: 'app-transfer-bins-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './transfer-bins-card.html',
  styleUrl: './transfer-bins-card.scss',
})
export class TransferBinsCard {
  private readonly loading = inject(DeliveryLoadingService);
  private readonly bins = inject(DeliveryBinsService);
  private readonly labels = inject(LabelPrinter);

  readonly stop = input.required<DeliveryLoadingTransferStopView>();
  /** `delivery_loading:write`, et la tournée encore au dépôt. */
  readonly canWrite = input(false);
  /** Des bacs viennent d'être déclarés : la tournée est à relire. */
  readonly declared = output<void>();

  protected readonly countMax = DELIVERY_BINS_PER_DECLARATION_MAX;
  protected readonly bagsMax = DELIVERY_BIN_INNER_BAGS_MAX;

  protected readonly title = computed(() => `→ ${this.stop().siteLabel}`);
  protected readonly subtitle = computed(() => transferBinsSummary(this.stop()));
  /**
   * R4c — des réassorts « au plus tôt » rangés dans ce transfert après son
   * dernier bac chargé : il les emporte, mais il leur faut un bac de plus.
   */
  protected readonly lateResupplies = computed(() => this.stop().resuppliesAfterLoading ?? 0);

  /** Le formulaire est replié tant qu'on ne déclare pas. */
  protected readonly declaring = signal(false);
  protected readonly types = signal<readonly FoldSelectOption<string>[]>([]);
  protected readonly typesError = signal<string | null>(null);
  protected readonly binTypeId = signal<string | null>(null);
  protected readonly count = signal<number | null>(1);
  protected readonly innerBags = signal<number | null>(0);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Les bacs qu'on vient de déclarer — leurs étiquettes seulement. */
  protected readonly justDeclared = signal<readonly string[]>([]);

  private readonly payload = computed(() =>
    transferBinsPayload(this.binTypeId(), this.count(), this.innerBags()),
  );
  protected readonly canSubmit = computed(() => !this.saving() && this.payload() !== null);

  /**
   * Les étiquettes A6 du transfert, en PDF dans un onglet (2026-10-25) : les
   * bacs qu'on vient de déclarer, ou tous. N'écrit rien.
   */
  protected printLabels(): void {
    void this.labels.transferBins(this.stop().transferId, this.justDeclared());
  }

  protected async open(): Promise<void> {
    this.declaring.set(true);
    this.error.set(null);
    if (this.types().length > 0) {
      return;
    }
    try {
      const view = await this.bins.binTypes();
      const live = view.types.filter((type) => type.archivedAt === null);
      this.types.set(live.map((type) => ({ value: type.id, label: type.name })));
      this.typesError.set(null);
    } catch (caught) {
      this.typesError.set(httpErrorMessage(caught, 'Les formats de bac n’ont pas pu être lus.'));
    }
  }

  protected close(): void {
    this.declaring.set(false);
  }

  protected async submit(): Promise<void> {
    const payload = this.payload();
    if (this.saving() || payload === null) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const done = await this.loading.declareTransferBins(this.stop().transferId, payload);
      this.justDeclared.set(done.binIds);
      this.declaring.set(false);
      this.declared.emit();
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Les bacs n’ont pas pu être déclarés.'));
    } finally {
      this.saving.set(false);
    }
  }
}
