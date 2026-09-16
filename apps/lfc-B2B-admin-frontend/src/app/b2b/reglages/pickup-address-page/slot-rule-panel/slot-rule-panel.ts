import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type {
  PublicPickupSlotRulePayload,
  PublicPickupSlotRuleView,
  Weekday,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
  FoldTimeComponent,
} from 'fold-ng';

import { WEEKDAY_CHOICES, weekdayLabel } from '../../weekday-choices';

/** Ce qu'on ouvre : une plage à modifier, ou `null` pour en poser une neuve. */
export interface SlotRulePanelData {
  readonly rule: PublicPickupSlotRuleView | null;
}

/** La valeur du choix « tous les jours » — un `Weekday` ne peut pas la valoir. */
const ANY_DAY = 'any';

/** Une plage neuve s'ouvre sur la matinée, découpée au quart d'heure. */
const DEFAULTS = { startTime: '07:00', endTime: '12:00', slotMinutes: 15 } as const;

/** Bornes de la durée : en deçà on ne sert personne, au-delà ce n'est plus un créneau. */
const MIN_STEP = 5;
const MAX_STEP = 240;

/**
 * **Une plage de créneaux publics** — le « générateur avec une durée » du plan
 * (`documentation/b2b/plan-creneaux-de-retrait.md`, D2).
 *
 * 🔴 Le panneau EST le générateur : on y saisit deux bornes et un pas, et il dit
 * ce qu'il produira avant qu'on enregistre. Un générateur SÉPARÉ de l'édition
 * aurait fait deux gestes pour une même chose — poser une plage, puis la
 * rouvrir pour lui donner son badge — alors que la règle « Saisir » du dépôt
 * demande un panneau pour l'un comme pour l'autre.
 *
 * Ce qui se joue dans le récapitulatif : un pas qui ne divise pas la plage.
 * `07:00–12:00` par 45 min rend six créneaux et s'arrête à 11:30 — la demie
 * restante n'ouvre rien. Le voir AVANT d'enregistrer évite de le découvrir dans
 * l'aperçu, ou pire, sur l'accueil public.
 */
@Component({
  selector: 'app-slot-rule-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldPanelHeaderComponent,
    FoldSelectComponent,
    FoldTimeComponent,
  ],
  templateUrl: './slot-rule-panel.html',
  styleUrl: './slot-rule-panel.scss',
})
export class SlotRulePanel {
  private readonly ref = inject(FoldPanelRef<PublicPickupSlotRulePayload>);

  readonly data = input<SlotRulePanelData | undefined>(undefined);

  protected readonly any = ANY_DAY;
  protected readonly weekdays = WEEKDAY_CHOICES;
  protected readonly minStep = MIN_STEP;
  protected readonly maxStep = MAX_STEP;

  protected readonly weekday = signal<Weekday | null>(null);
  protected readonly startTime = signal<string>(DEFAULTS.startTime);
  protected readonly endTime = signal<string>(DEFAULTS.endTime);
  protected readonly slotMinutes = signal<number | null>(DEFAULTS.slotMinutes);
  protected readonly badge = signal('');
  protected readonly serviceCapacity = signal<number | null>(null);

  protected readonly isCreate = computed(() => (this.data()?.rule ?? null) === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Nouvelle plage de créneaux' : 'Modifier la plage',
  );

  /** Combien de créneaux la découpe produit — 0 quand le pas ne tient pas. */
  protected readonly slotCount = computed(() => {
    const step = this.slotMinutes();
    const span = minutesOf(this.endTime()) - minutesOf(this.startTime());
    if (step === null || step <= 0 || span <= 0) {
      return 0;
    }
    return Math.floor(span / step);
  });

  /** La dernière heure réellement offerte, ou `null` si la plage n'ouvre rien. */
  protected readonly lastSlot = computed(() => {
    const count = this.slotCount();
    const step = this.slotMinutes();
    if (count === 0 || step === null) {
      return null;
    }
    return timeOf(minutesOf(this.startTime()) + (count - 1) * step);
  });

  /**
   * ⚠️ Le reste que la découpe laisse tomber. Une plage `07:00–12:00` par 45 min
   * s'arrête à 11:30 : la demie qui suit n'ouvre aucun créneau, et personne ne
   * pourra venir à 11:45. Ce n'est pas une erreur — c'est un fait qui se dit.
   */
  protected readonly leftover = computed(() => {
    const step = this.slotMinutes();
    const span = minutesOf(this.endTime()) - minutesOf(this.startTime());
    return step === null || step <= 0 || span <= 0 ? 0 : span % step;
  });

  /** La plage en une phrase, relue avant d'enregistrer. */
  protected readonly recap = computed(() => {
    const count = this.slotCount();
    if (count === 0) {
      return "Cette plage n'ouvre aucun créneau : raccourcissez la durée, ou élargissez les bornes.";
    }
    const capacity = this.serviceCapacity();
    const places =
      capacity === null
        ? 'sans limite de place'
        : `${String(capacity)} place${capacity > 1 ? 's' : ''} par créneau, soit ${String(capacity * count)} au total`;
    return `${weekdayLabel(this.weekday())} : ${String(count)} créneau${count > 1 ? 'x' : ''} de ${String(this.slotMinutes() ?? 0)} min, de ${this.startTime()} à ${this.lastSlot() ?? this.startTime()} — ${places}.`;
  });

  /**
   * Un badge **vide** n'est pas un badge : le domaine refuse la chaîne vide, et
   * l'écran ne doit pas l'envoyer (D2, vitruve S10). On le transforme en `null`
   * plutôt que de faire refuser l'enregistrement pour une case qu'on a juste
   * laissée tranquille.
   */
  protected readonly trimmedBadge = computed(() => {
    const badge = this.badge().trim();
    return badge === '' ? null : badge;
  });

  protected readonly canSubmit = computed(
    () => this.slotCount() > 0 && this.startTime() !== '' && this.endTime() !== '',
  );

  constructor() {
    // `data` est fixé à l'ouverture et ne change plus ; un `effect` suffit à
    // préremplir sans rejouer.
    effect(() => {
      const rule = this.data()?.rule ?? null;
      if (rule === null) {
        return;
      }
      this.weekday.set(rule.weekday);
      this.startTime.set(rule.startTime);
      this.endTime.set(rule.endTime);
      this.slotMinutes.set(rule.slotMinutes);
      this.badge.set(rule.badge ?? '');
      this.serviceCapacity.set(rule.serviceCapacity);
    });
  }

  protected onWeekday(value: string): void {
    this.weekday.set(value === ANY_DAY ? null : (value as Weekday));
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.ref.close({
      weekday: this.weekday(),
      startTime: this.startTime(),
      endTime: this.endTime(),
      slotMinutes: this.slotMinutes() ?? DEFAULTS.slotMinutes,
      badge: this.trimmedBadge(),
      serviceCapacity: this.serviceCapacity(),
    });
  }

  protected cancel(): void {
    this.ref.close();
  }
}

/** `HH:MM` → minutes depuis minuit. Une heure vide vaut 0, et la plage sera refusée. */
function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
}

/** Minutes depuis minuit → `HH:MM`. */
function timeOf(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
