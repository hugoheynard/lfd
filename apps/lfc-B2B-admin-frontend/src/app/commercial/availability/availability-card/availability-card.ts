import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FoldButtonComponent, FoldCardComponent, FoldScrollRegionDirective } from 'fold-ng';
import type { AppointmentChannel, ExceptionKind, Slot } from '@lfd/contracts';

import { AvailabilityService } from '../availability.service';
import {
  addException,
  addRange,
  clearDay,
  copyToWeekdays,
  draftFrom,
  editRange,
  emptyDraft,
  hasInvalidRange,
  removeException,
  removeRange,
  toPayload,
  withPolicy,
  WEEK_DAYS,
  type AvailabilityDraft,
} from '../availability-draft';

type LoadState = 'loading' | 'ready' | 'error';

/** Les jours d'aperçu affichés sous la grille — deux semaines suffisent à juger. */
const PREVIEW_DAYS = 14;

/** Les canaux proposables, avec leur libellé. */
const CHANNELS: readonly { key: AppointmentChannel; label: string }[] = [
  { key: 'phone', label: 'Téléphone' },
  { key: 'visio', label: 'Visio' },
  { key: 'onsite', label: 'Sur place' },
];

/** Un jour de l'aperçu : sa date locale et les heures qu'elle ouvre. */
interface PreviewDay {
  readonly day: string;
  readonly times: readonly string[];
}

/**
 * Carte **Disponibilités** des Réglages ▸ Commercial : la grille hebdomadaire,
 * la politique de réservation, les exceptions datées, et l'**aperçu 14 jours**.
 *
 * L'aperçu est rendu par la même route que celle du client (`slots`) : ce que le
 * commercial voit ici est exactement ce que le client verra. Il ne se rafraîchit
 * qu'**après enregistrement** — un aperçu qui montrerait un brouillon non
 * enregistré serait un mensonge de plus, pas une aide.
 *
 * Tous les gestes sur la grille passent par les fonctions pures d'
 * `availability-draft.ts` : ce composant charge, rend, et enregistre.
 *
 * L'aperçu est borné par `[foldScrollRegion]` plutôt que par un `overflow`
 * maison : la directive pose les trois pièges d'un coup (`overflow`,
 * `min-height: 0`, `overscroll-behavior`) et **s'enregistre auprès du shell**,
 * qui peut alors le geler quand un panneau s'ouvre par-dessus.
 */
@Component({
  selector: 'app-availability-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldButtonComponent, FoldScrollRegionDirective],
  templateUrl: './availability-card.html',
  styleUrl: './availability-card.scss',
})
export class AvailabilityCard {
  private readonly service = inject(AvailabilityService);

  protected readonly weekDays = WEEK_DAYS;
  protected readonly channels = CHANNELS;

  protected readonly state = signal<LoadState>('loading');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly draft = signal<AvailabilityDraft>(
    emptyDraft({ slotMinutes: 30, leadTimeHours: 24, horizonDays: 30, channels: ['phone'] }),
  );
  protected readonly preview = signal<readonly PreviewDay[]>([]);

  /** Une plage dont la fin précède le début : on le dit avant d'enregistrer. */
  protected readonly invalid = computed(() => hasInvalidRange(this.draft()));
  protected readonly policy = computed(() => this.draft().policy);
  protected readonly exceptions = computed(() => this.draft().exceptions);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.draft.set(draftFrom(await this.service.config()));
      this.state.set('ready');
      await this.refreshPreview();
    } catch {
      this.state.set('error');
    }
  }

  /** Les plages d'un jour de semaine (index `Date.getDay()`). */
  protected rangesOf(weekday: number): readonly { startTime: string; endTime: string }[] {
    return this.draft().week[weekday] ?? [];
  }

  protected addRange(weekday: number): void {
    this.edit((draft) => addRange(draft, weekday));
  }

  protected removeRange(weekday: number, index: number): void {
    this.edit((draft) => removeRange(draft, weekday, index));
  }

  protected setStart(weekday: number, index: number, value: string): void {
    this.edit((draft) => editRange(draft, weekday, index, { startTime: value }));
  }

  protected setEnd(weekday: number, index: number, value: string): void {
    this.edit((draft) => editRange(draft, weekday, index, { endTime: value }));
  }

  protected copyToWeekdays(weekday: number): void {
    this.edit((draft) => copyToWeekdays(draft, weekday));
  }

  protected clearDay(weekday: number): void {
    this.edit((draft) => clearDay(draft, weekday));
  }

  protected setSlotMinutes(value: string): void {
    this.edit((draft) => withPolicy(draft, { slotMinutes: positive(value, 30) }));
  }

  protected setLeadTime(value: string): void {
    this.edit((draft) => withPolicy(draft, { leadTimeHours: positive(value, 0) }));
  }

  protected setHorizon(value: string): void {
    this.edit((draft) => withPolicy(draft, { horizonDays: positive(value, 1) }));
  }

  /** Bascule un canal — on refuse de tous les décocher, sinon plus rien n'est réservable. */
  protected toggleChannel(channel: AppointmentChannel): void {
    const current = this.policy().channels;
    const next = current.includes(channel)
      ? current.filter((c) => c !== channel)
      : [...current, channel];
    if (next.length === 0) {
      return;
    }
    this.edit((draft) => withPolicy(draft, { channels: next }));
  }

  protected isChannelOn(channel: AppointmentChannel): boolean {
    return this.policy().channels.includes(channel);
  }

  protected addException(day: string, kind: string, reason: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) {
      return;
    }
    const exceptionKind: ExceptionKind = kind === 'open' ? 'open' : 'closed';
    // Une ouverture ponctuelle exige des bornes ; on propose la matinée, qu'il
    // ajustera ensuite comme n'importe quelle plage.
    this.edit((draft) =>
      addException(draft, {
        day,
        kind: exceptionKind,
        startTime: exceptionKind === 'open' ? '09:00' : null,
        endTime: exceptionKind === 'open' ? '12:00' : null,
        reason: reason.trim(),
      }),
    );
  }

  protected removeException(index: number): void {
    this.edit((draft) => removeException(draft, index));
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.saved.set(false);
    try {
      // On rejoue ce que le SERVEUR a enregistré, pas ce qu'on croit avoir envoyé.
      this.draft.set(draftFrom(await this.service.save(toPayload(this.draft()))));
      this.saved.set(true);
      await this.refreshPreview();
    } catch {
      this.state.set('error');
    } finally {
      this.saving.set(false);
    }
  }

  /** Recharge l'aperçu 14 jours depuis la route partagée avec le client. */
  private async refreshPreview(): Promise<void> {
    const from = isoDay(1);
    const to = isoDay(PREVIEW_DAYS);
    const view = await this.service.slots(from, to);
    this.preview.set(groupByDay(view.slots));
  }

  /** Applique un geste et invalide l'indicateur « enregistré ». */
  private edit(change: (draft: AvailabilityDraft) => AvailabilityDraft): void {
    this.draft.update(change);
    this.saved.set(false);
  }
}

/** Le jour local dans `offset` jours, au format `AAAA-MM-JJ`. */
function isoDay(offset: number): string {
  return new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Regroupe les créneaux par jour, dans l'ordre où ils arrivent (déjà triés). */
function groupByDay(slots: readonly Slot[]): PreviewDay[] {
  const byDay = new Map<string, string[]>();
  for (const slot of slots) {
    const times = byDay.get(slot.day);
    if (times === undefined) {
      byDay.set(slot.day, [slot.time]);
    } else {
      times.push(slot.time);
    }
  }
  return [...byDay.entries()].map(([day, times]) => ({ day, times }));
}

/** Un entier ≥ `min`, sinon `min` — une saisie vide ne doit rien casser. */
function positive(value: string, min: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : min;
}
