import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { clockTimeSchema, type OrderCutoffPayload, type OrderCutoffView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { OrderCutoffsService } from '../../order-cutoffs.service';
import { GRACE_CHOICES } from '../cutoff-format';

/** Charge d'ouverture : la limite générale à éditer, ou `null` pour la poser. */
export interface CutoffPanelData {
  readonly rule: OrderCutoffView | null;
}

/** Ce que propose le sélecteur « combien de jours avant ». */
const DAYS_BEFORE_CHOICES: readonly { readonly value: number; readonly label: string }[] = [
  { value: 0, label: 'Le jour même' },
  { value: 1, label: 'La veille' },
  { value: 2, label: "L'avant-veille" },
  { value: 3, label: '3 jours avant' },
  { value: 7, label: 'Une semaine avant' },
];

/**
 * Panneau **Heure limite** — pose ou édite la **limite générale** du commerce,
 * celle qui vaut pour tous les points et tous les jours.
 *
 * Elle seule s'édite depuis le 2026-10-13 (option A de
 * `documentation/commandes/plan-reglages-commandes.md` §2) : la limite par
 * point de retrait ou par jour n'est pas reprise, son démontage est décidé.
 * Le panneau n'offre donc plus de portée ; il écrit `null` × `null`.
 *
 * Deux champs portent un sens qu'il faut nommer : **combien de jours avant** la
 * limite tombe — « 18 h » sans lui ne dit pas 18 h de quel jour — et le
 * **rattrapage** accordé après.
 *
 * Le rattrapage n'ouvre rien en libre-service : dans cette fenêtre le client est
 * refusé avec un autre message, celui qui dit d'appeler. Le récapitulatif le dit
 * en toutes lettres, parce que « 45 minutes de grâce » se lit spontanément comme
 * « 45 minutes de plus pour commander », et que ce serait faux.
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

  protected readonly daysBeforeChoices = DAYS_BEFORE_CHOICES;
  protected readonly graceChoices = GRACE_CHOICES;
  protected readonly daysBefore = signal(1);
  protected readonly time = signal('18:00');
  protected readonly graceMinutes = signal(0);
  protected readonly saving = signal(false);

  protected readonly isCreate = computed(() => (this.data()?.rule ?? null) === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Poser la limite générale' : 'Modifier la limite générale',
  );

  /**
   * La règle relue en une phrase. Un `daysBefore` nu se lit à l'envers une fois
   * sur deux ; la phrase, elle, se vérifie d'un coup d'œil avant d'enregistrer.
   */
  protected readonly recap = computed(() => {
    const choice = DAYS_BEFORE_CHOICES.find((entry) => entry.value === this.daysBefore());
    const when = choice?.label.toLowerCase() ?? `${this.daysBefore()} jours avant`;
    const base = `Pour un acheminement un jour donné, il faudra avoir commandé ${when} à ${this.time()}.`;
    const grace = this.graceMinutes();
    if (grace === 0) {
      return base;
    }
    return `${base} Pendant les ${grace} minutes suivantes, la commande sera refusée avec une invitation à appeler — elle ne passera pas toute seule.`;
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
      this.daysBefore.set(rule.daysBefore);
      this.time.set(rule.time);
      this.graceMinutes.set(rule.graceMinutes);
    });
  }

  protected onDaysBefore(value: string): void {
    this.daysBefore.set(Number(value));
  }

  protected onGrace(value: string): void {
    this.graceMinutes.set(Number(value));
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
      // La limite générale : tous les points, tous les jours (option A).
      pickupAddressId: null,
      weekday: null,
      daysBefore: this.daysBefore(),
      time: this.time(),
      graceMinutes: this.graceMinutes(),
    };
    try {
      if (rule === null) {
        await this.api.create(payload);
        this.notify.success('Limite générale posée.');
      } else {
        await this.api.update(rule.id, payload);
        this.notify.success('Limite générale mise à jour.');
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
