import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';
import type { Slot } from '@lfd/contracts';

import { AvailabilityService } from '../availability.service';
import { draftFrom, emptyDraft, toPayload, type AvailabilityDraft } from '../availability-draft';
import { BookingPolicyCard } from './booking-policy-card/booking-policy-card';
import { ExceptionsCard } from './exceptions-card/exceptions-card';
import { SlotsPreviewCard, type PreviewDay } from './slots-preview-card/slots-preview-card';
import { WeekGridCard } from './week-grid-card/week-grid-card';

type LoadState = 'loading' | 'ready' | 'error';

/** Les jours d'aperçu demandés — deux semaines suffisent à juger. */
const PREVIEW_DAYS = 14;

/** La politique affichée avant que le serveur n'ait répondu. */
const FALLBACK_POLICY = {
  slotMinutes: 30,
  leadTimeHours: 24,
  horizonDays: 30,
  channels: ['phone'] as const,
};

/**
 * Section **Prise de rendez-vous** — l'**orchestrateur** des quatre cartes :
 * semaine type, règles, exceptions, aperçu.
 *
 * Il ne rend rien lui-même : il tient le **brouillon** (une seule source de
 * vérité, que les trois cartes d'édition transforment par les fonctions pures
 * d'`availability-draft`), enregistre en bloc, et rafraîchit l'aperçu.
 *
 * Quatre cartes plutôt qu'une : l'espacement vient alors du rythme de la page,
 * et chacune se lit — et se teste — pour ce qu'elle est.
 */
@Component({
  selector: 'app-availability-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    WeekGridCard,
    BookingPolicyCard,
    ExceptionsCard,
    SlotsPreviewCard,
  ],
  templateUrl: './availability-card.html',
  styleUrl: './availability-card.scss',
})
export class AvailabilityCard {
  private readonly service = inject(AvailabilityService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly draft = signal<AvailabilityDraft>(
    emptyDraft({ ...FALLBACK_POLICY, channels: ['phone'] }),
  );
  protected readonly preview = signal<readonly PreviewDay[]>([]);

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

  /** Une carte a transformé le brouillon : on l'adopte et on invalide « enregistré ». */
  protected onChanged(draft: AvailabilityDraft): void {
    this.draft.set(draft);
    this.saved.set(false);
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

  /** Recharge l'aperçu depuis la route partagée avec le client. */
  private async refreshPreview(): Promise<void> {
    const view = await this.service.slots(isoDay(1), isoDay(PREVIEW_DAYS));
    this.preview.set(groupByDay(view.slots));
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
