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
import type { ReceivedOperationView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldDateComponent,
  FoldListboxComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTimeComponent,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { formatInstant } from '../../../pim/operations/operation-schedule';
import {
  AUDIENCE_CHOICES,
  audienceLabel,
  KEEP_AUDIENCE,
  overrideDraftOf,
  readOverride,
  sameDraft,
  type AudienceChoice,
  type OverrideDraft,
} from '../operation-override';
import { ReceivedOperationsService } from '../received-operations.service';

export interface OperationOverridePanelData {
  readonly operation: ReceivedOperationView;
  /** Le nom de chaque SKU au catalogue vendu ; absent = on montre la référence. */
  readonly names: ReadonlyMap<string, string>;
}

/**
 * **Décider la surcharge d'une opération reçue** — masquer, fermer plus tôt,
 * restreindre la clientèle, retirer des articles (D9).
 *
 * Le panneau écrit lui-même et se ferme sur `true` : la carte relit alors le
 * miroir, parce que ce qui en résulte (`effective`) est calculé par le serveur
 * et ne se recalcule pas ici. Un refus reste dans le panneau.
 */
@Component({
  selector: 'app-operation-override-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldDateComponent,
    FoldListboxComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldTimeComponent,
  ],
  templateUrl: './operation-override-panel.html',
  styleUrl: './operation-override-panel.scss',
})
export class OperationOverridePanel implements FoldPanelContent<OperationOverridePanelData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<OperationOverridePanelData>();

  private readonly api = inject(ReceivedOperationsService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly audienceChoices = AUDIENCE_CHOICES;

  private readonly initial = computed(() => overrideDraftOf(this.data().operation));
  protected readonly draft = signal<OverrideDraft>({
    isHidden: false,
    orderUntilDay: '',
    orderUntilTime: '',
    audience: null,
    hiddenSkus: [],
  });
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly title = computed(() => `Surcharge — ${this.data().operation.name.fr}`);
  protected readonly receivedUntil = computed(() =>
    formatInstant(this.data().operation.orderUntil),
  );
  protected readonly receivedAudience = computed(() =>
    audienceLabel(this.data().operation.audience),
  );
  protected readonly audienceValue = computed<AudienceChoice>(
    () => this.draft().audience ?? KEEP_AUDIENCE,
  );

  protected readonly articles = computed(() => {
    const { operation, names } = this.data();
    const hidden = new Set(this.draft().hiddenSkus);
    return operation.skus.map((sku) => ({
      sku,
      name: names.get(sku) ?? sku,
      hidden: hidden.has(sku),
    }));
  });

  private readonly reading = computed(() => readOverride(this.draft(), this.data().operation.skus));
  protected readonly problem = computed(() => {
    const reading = this.reading();
    return reading.ok ? null : reading.problem;
  });
  protected readonly canSave = computed(
    () => !this.busy() && this.reading().ok && !sameDraft(this.draft(), this.initial()),
  );

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const initial = this.initial();
      untracked(() => this.draft.set(initial));
    });
  }

  protected setHidden(isHidden: boolean): void {
    this.draft.update((draft) => ({ ...draft, isHidden }));
  }

  protected setUntil(field: 'orderUntilDay' | 'orderUntilTime', value: string): void {
    this.draft.update((draft) => ({ ...draft, [field]: value }));
  }

  protected setAudience(choice: AudienceChoice): void {
    this.draft.update((draft) => ({
      ...draft,
      audience: choice === KEEP_AUDIENCE ? null : choice,
    }));
  }

  protected setArticleHidden(sku: string, hidden: boolean): void {
    this.draft.update((draft) => ({
      ...draft,
      hiddenSkus: hidden
        ? [...draft.hiddenSkus.filter((each) => each !== sku), sku]
        : draft.hiddenSkus.filter((each) => each !== sku),
    }));
  }

  protected cancel(): void {
    this.panel.close();
  }

  protected async save(): Promise<void> {
    const reading = this.reading();
    if (!reading.ok) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await this.api.setOverride(this.data().operation.key, reading.payload);
      this.panel.close(true);
    } catch (caught) {
      this.refusal.set(httpErrorMessage(caught, "La surcharge n'a pas pu être enregistrée."));
    } finally {
      this.busy.set(false);
    }
  }
}
