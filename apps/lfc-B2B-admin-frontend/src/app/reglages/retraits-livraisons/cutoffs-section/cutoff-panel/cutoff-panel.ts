import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  clockTimeSchema,
  type OrderCutoffPayload,
  type OrderCutoffView,
  type PickupAddressView,
  type Weekday,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { OrderCutoffsService } from '../../order-cutoffs.service';
import { WEEKDAY_CHOICES } from '../cutoff-format';

/** Charge d'ouverture : la règle à éditer, ou `null` pour en créer une. */
export interface CutoffPanelData {
  readonly rule: OrderCutoffView | null;
  /** Les points de retrait, pour le sélecteur de portée. */
  readonly points: readonly PickupAddressView[];
}

/** Ce que propose le sélecteur « combien de jours avant ». */
const DAYS_BEFORE_CHOICES: readonly { readonly value: number; readonly label: string }[] = [
  { value: 0, label: 'Le jour même' },
  { value: 1, label: 'La veille' },
  { value: 2, label: "L'avant-veille" },
  { value: 3, label: '3 jours avant' },
  { value: 7, label: 'Une semaine avant' },
];

/** La valeur du `<option>` qui vise « tout » (pas de point, ou pas de jour). */
const ANY = '';

/**
 * Panneau **Heure limite** — crée ou édite une règle.
 *
 * Trois champs seulement, mais chacun porte un sens qu'il faut nommer : à quoi
 * la règle s'applique (un point, ou le défaut), quel jour d'acheminement elle
 * vise, et **combien de jours avant** la limite tombe. Ce dernier n'est pas une
 * décoration : « 18 h » sans lui ne dit pas 18 h de quel jour.
 */
@Component({
  selector: 'app-cutoff-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldSelectComponent,
  ],
  templateUrl: './cutoff-panel.html',
  styleUrl: './cutoff-panel.scss',
})
export class CutoffPanel {
  private readonly api = inject(OrderCutoffsService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<CutoffPanelData | undefined>(undefined);

  protected readonly weekdays = WEEKDAY_CHOICES;
  protected readonly daysBeforeChoices = DAYS_BEFORE_CHOICES;
  protected readonly any = ANY;

  protected readonly pickupAddressId = signal<string | null>(null);
  protected readonly weekday = signal<Weekday | null>(null);
  protected readonly daysBefore = signal(1);
  protected readonly time = signal('18:00');
  protected readonly saving = signal(false);

  protected readonly points = computed(() => this.data()?.points ?? []);
  protected readonly isCreate = computed(() => (this.data()?.rule ?? null) === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Nouvelle heure limite' : "Modifier l'heure limite",
  );

  /**
   * La règle relue en une phrase. Un `daysBefore` nu se lit à l'envers une fois
   * sur deux ; la phrase, elle, se vérifie d'un coup d'œil avant d'enregistrer.
   */
  protected readonly recap = computed(() => {
    const choice = DAYS_BEFORE_CHOICES.find((entry) => entry.value === this.daysBefore());
    const when = choice?.label.toLowerCase() ?? `${this.daysBefore()} jours avant`;
    return `Pour un acheminement ce jour-là, il faudra avoir commandé ${when} à ${this.time()}.`;
  });

  /** L'heure doit être un `HH:MM` réel — le même schéma que le serveur exigera. */
  protected readonly timeIsValid = computed(() => clockTimeSchema.safeParse(this.time()).success);
  protected readonly canSubmit = computed(() => this.timeIsValid() && !this.saving());

  constructor() {
    effect(() => {
      const rule = this.data()?.rule ?? null;
      if (rule === null) {
        return;
      }
      this.pickupAddressId.set(rule.pickupAddressId);
      this.weekday.set(rule.weekday);
      this.daysBefore.set(rule.daysBefore);
      this.time.set(rule.time);
    });
  }

  protected onScope(value: string): void {
    this.pickupAddressId.set(value === ANY ? null : value);
  }

  protected onWeekday(value: string): void {
    this.weekday.set(value === ANY ? null : (value as Weekday));
  }

  protected onDaysBefore(value: string): void {
    this.daysBefore.set(Number(value));
  }

  protected onTime(event: Event): void {
    this.time.set((event.target as HTMLInputElement).value);
  }

  protected async submit(): Promise<void> {
    const rule = this.data()?.rule ?? null;
    if (!this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    const payload: OrderCutoffPayload = {
      pickupAddressId: this.pickupAddressId(),
      weekday: this.weekday(),
      daysBefore: this.daysBefore(),
      time: this.time(),
    };
    try {
      if (rule === null) {
        await this.api.create(payload);
        this.notify.success('Heure limite ajoutée.');
      } else {
        await this.api.update(rule.id, payload);
        this.notify.success('Heure limite mise à jour.');
      }
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
