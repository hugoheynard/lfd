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
  publicPickupSlotsFor,
  type PublicPickupClosurePayload,
  type PublicPickupClosureView,
  type PublicPickupSlot,
  type PublicPickupSlotRulePayload,
  type PublicPickupSlotRuleView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
  FoldSelectComponent,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { PickupAddressesService } from '../../pickup-addresses.service';
import { weekdayLabel } from '../../weekday-choices';
import { ClosurePanel, type ClosurePanelData } from '../closure-panel/closure-panel';
import { SlotRulePanel, type SlotRulePanelData } from '../slot-rule-panel/slot-rule-panel';

type LoadState = 'loading' | 'ready' | 'error';

/** Combien de jours l'aperçu propose de regarder. Une semaine suffit à voir tourner les règles. */
const PREVIEW_DAYS = 7;

/**
 * **Les créneaux publics d'un point de retrait** — plan
 * `documentation/b2b/plan-creneaux-de-retrait.md`, lot B.
 *
 * 🔴 **Rien à voir avec les heures de retrait pro.** Celles-ci vivent dans leur
 * carte, dans `opening`, et ce chantier n'y touche pas (§3 du plan). Ici on
 * règle ce qu'un **visiteur** pourra choisir : des plages découpées à pas
 * constant, leur badge, leurs places, et les jours fermés.
 *
 * **Son propre enregistrement**, séparé de celui de la page (Hugo,
 * 2026-09-16) : l'horaire a sa route, en bloc et idempotente, avec son refus
 * propre — le chevauchement. Un chevauchement refusé ne doit pas faire échouer
 * l'enregistrement de l'adresse, qui n'y est pour rien.
 *
 * **Les brouillons portent un identifiant local** que le `PUT` ne renvoie pas :
 * c'est ce qui permet à l'aperçu de dériver la grille de ce qui est À L'ÉCRAN,
 * et non de ce qui est en base. Régler sans voir l'effet reviendrait à publier
 * pour vérifier.
 */
@Component({
  selector: 'app-public-slots-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldPageSectionComponent,
    FoldSelectComponent,
  ],
  templateUrl: './public-slots-card.html',
  styleUrl: './public-slots-card.scss',
})
export class PublicSlotsCard {
  private readonly pickups = inject(PickupAddressesService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  /** Le point dont on règle l'horaire public. */
  readonly pickupId = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly rules = signal<readonly PublicPickupSlotRuleView[]>([]);
  protected readonly closures = signal<readonly PublicPickupClosureView[]>([]);
  protected readonly saving = signal(false);
  protected readonly dirty = signal(false);
  /** Le refus du serveur, en clair, DANS la carte — un toast partirait trop vite. */
  protected readonly refusal = signal<string | null>(null);
  protected readonly previewDay = signal(today());
  protected readonly pendingRule = signal<string | null>(null);
  protected readonly pendingClosure = signal<string | null>(null);

  /** Les sept prochains jours, pour vérifier une règle posée sur un seul jour. */
  protected readonly previewDays = computed(() =>
    Array.from({ length: PREVIEW_DAYS }, (_, index) => {
      const day = addDays(today(), index);
      return { value: day, label: dayLabel(day, index) };
    }),
  );

  /** Réglé = au moins une plage. C'est cette bascule qui change ce que voit un visiteur (D6). */
  protected readonly configured = computed(() => this.rules().length > 0);

  /**
   * L'aperçu du jour choisi, dérivé par la MÊME fonction que l'accueil public.
   *
   * `taken` est vide : au lot B, aucune réservation n'existe encore (elles
   * arrivent au lot C). L'aperçu montre donc la grille à vide — ce qui est
   * exactement ce qu'on veut voir pour régler.
   */
  protected readonly preview = computed<readonly PublicPickupSlot[]>(() =>
    publicPickupSlotsFor(this.previewDay(), this.rules(), this.closures(), [], new Date()),
  );

  constructor() {
    effect(() => {
      void this.load(this.pickupId());
    });
  }

  protected async load(id: string): Promise<void> {
    this.state.set('loading');
    this.refusal.set(null);
    try {
      const schedule = await this.pickups.publicSchedule(id);
      this.rules.set(schedule.rules);
      this.closures.set(schedule.closures);
      this.dirty.set(false);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected label(rule: PublicPickupSlotRuleView): string {
    return weekdayLabel(rule.weekday);
  }

  /** « 7 créneaux de 45 min » — le compte dérivé, jamais saisi (D3). */
  protected countOf(rule: PublicPickupSlotRuleView): string {
    const span = minutesOf(rule.endTime) - minutesOf(rule.startTime);
    const count = Math.floor(span / rule.slotMinutes);
    return `${String(count)} créneau${count > 1 ? 'x' : ''} de ${String(rule.slotMinutes)} min`;
  }

  /** « 5 places » par créneau, ou l'absence de limite — qui est le défaut voulu. */
  protected placesOf(rule: PublicPickupSlotRuleView): string {
    const capacity = rule.serviceCapacity;
    return capacity === null
      ? 'Sans limite'
      : `${String(capacity)} place${capacity > 1 ? 's' : ''}`;
  }

  /** « Du 20 au 27 », ou un seul jour. */
  protected spanOf(closure: PublicPickupClosureView): string {
    return closure.fromDay === closure.toDay
      ? closure.fromDay
      : `${closure.fromDay} → ${closure.toDay}`;
  }

  protected hoursOf(closure: PublicPickupClosureView): string {
    return closure.startTime === null
      ? 'Journée entière'
      : `${closure.startTime}–${closure.endTime ?? ''}`;
  }

  protected async addRule(): Promise<void> {
    const payload = await this.openRule({ rule: null });
    if (payload !== undefined) {
      this.rules.update((current) => [...current, { ...payload, id: draftId() }]);
      this.touch();
    }
  }

  protected async editRule(rule: PublicPickupSlotRuleView): Promise<void> {
    const payload = await this.openRule({ rule });
    if (payload !== undefined) {
      this.rules.update((current) =>
        current.map((candidate) =>
          candidate.id === rule.id ? { ...payload, id: rule.id } : candidate,
        ),
      );
      this.touch();
    }
  }

  protected removeRule(rule: PublicPickupSlotRuleView): void {
    this.rules.update((current) => current.filter((candidate) => candidate.id !== rule.id));
    this.pendingRule.set(null);
    this.touch();
  }

  protected async addClosure(): Promise<void> {
    const payload = await this.openClosure({ closure: null });
    if (payload !== undefined) {
      this.closures.update((current) => [...current, { ...payload, id: draftId() }]);
      this.touch();
    }
  }

  protected async editClosure(closure: PublicPickupClosureView): Promise<void> {
    const payload = await this.openClosure({ closure });
    if (payload !== undefined) {
      this.closures.update((current) =>
        current.map((candidate) =>
          candidate.id === closure.id ? { ...payload, id: closure.id } : candidate,
        ),
      );
      this.touch();
    }
  }

  protected removeClosure(closure: PublicPickupClosureView): void {
    this.closures.update((current) => current.filter((candidate) => candidate.id !== closure.id));
    this.pendingClosure.set(null);
    this.touch();
  }

  protected askRemoveRule(rule: PublicPickupSlotRuleView): void {
    this.pendingRule.set(rule.id);
  }

  protected askRemoveClosure(closure: PublicPickupClosureView): void {
    this.pendingClosure.set(closure.id);
  }

  protected cancelRemove(): void {
    this.pendingRule.set(null);
    this.pendingClosure.set(null);
  }

  /**
   * Enregistre l'horaire **en bloc**. Le serveur juge le chevauchement sur
   * l'ensemble : envoyer plage par plage aurait fait refuser un état
   * intermédiaire parfaitement légitime.
   */
  protected async save(): Promise<void> {
    if (this.saving() || !this.dirty()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.pickups.savePublicSchedule(this.pickupId(), {
        rules: this.rules().map(withoutId),
        closures: this.closures().map(withoutId),
      });
      this.notify.success('Créneaux publics enregistrés.');
      await this.load(this.pickupId());
    } catch (error) {
      this.refusal.set(
        httpErrorMessage(error, "Les créneaux publics n'ont pas pu être enregistrés."),
      );
    } finally {
      this.saving.set(false);
    }
  }

  private touch(): void {
    this.dirty.set(true);
    this.refusal.set(null);
  }

  private async openRule(
    data: SlotRulePanelData,
  ): Promise<PublicPickupSlotRulePayload | undefined> {
    const ref = this.panels.open<SlotRulePanelData, PublicPickupSlotRulePayload>(SlotRulePanel, {
      data,
      width: 'md',
    });
    return await ref.closed;
  }

  private async openClosure(
    data: ClosurePanelData,
  ): Promise<PublicPickupClosurePayload | undefined> {
    const ref = this.panels.open<ClosurePanelData, PublicPickupClosurePayload>(ClosurePanel, {
      data,
      width: 'md',
    });
    return await ref.closed;
  }
}

/** L'identifiant d'un brouillon — local, jamais envoyé (le `PUT` ne prend pas d'id). */
function draftId(): string {
  return `draft_${String(Math.random()).slice(2)}`;
}

/** La charge sans son identifiant : ce que le `PUT` attend. */
function withoutId<T extends { id: string }>(view: T): Omit<T, 'id'> {
  const { id: _id, ...payload } = view;
  return payload;
}

/** `HH:MM` → minutes depuis minuit. */
function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
}

/** Le jour courant en `AAAA-MM-JJ`, heure locale du poste. */
function today(): string {
  return new Date().toLocaleDateString('sv-SE');
}

/** `AAAA-MM-JJ` + n jours, sans dépendance à un fuseau. */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('sv-SE');
}

/** « Aujourd'hui », « Demain », puis « jeu. 18 ». */
function dayLabel(day: string, index: number): string {
  if (index === 0) {
    return "Aujourd'hui";
  }
  if (index === 1) {
    return 'Demain';
  }
  return new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
  });
}
