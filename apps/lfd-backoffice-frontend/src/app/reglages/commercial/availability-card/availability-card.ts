import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FoldCalloutComponent } from 'fold-ng';
import type { Slot } from '@lfd/contracts';

import { AvailabilityService } from '../../../commercial/availability/availability.service';
import type { AvailabilityConfigView } from '@lfd/contracts';

import { draftFrom, emptyDraft, type AvailabilityDraft } from './availability-draft';
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
 * Il ne rend rien lui-même, et **n'écrit rien** : il tient le **brouillon** (une
 * seule source de vérité, que les trois cartes d'édition transforment par les
 * fonctions pures d'`availability-draft`), descend ce que le serveur détient
 * pour qu'elles sachent si elles ont quelque chose à enregistrer, réaligne la
 * tranche que l'une vient d'écrire, et rafraîchit l'aperçu.
 *
 * Quatre cartes plutôt qu'une : l'espacement vient alors du rythme de la page,
 * et chacune se lit — et se teste — pour ce qu'elle est.
 */
@Component({
  selector: 'app-availability-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
  protected readonly draft = signal<AvailabilityDraft>(
    emptyDraft({ ...FALLBACK_POLICY, channels: ['phone'] }),
  );
  protected readonly preview = signal<readonly PreviewDay[]>([]);
  /**
   * Ce que le **serveur** détient. Sert de référence aux cartes pour savoir si
   * elles ont quelque chose à enregistrer — un brouillon seul ne peut pas le dire.
   */
  protected readonly persisted = signal<AvailabilityConfigView | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const config = await this.service.config();
      this.persisted.set(config);
      this.draft.set(draftFrom(config));
      this.state.set('ready');
      await this.refreshPreview();
    } catch {
      this.state.set('error');
    }
  }

  /** Une carte a transformé le brouillon : on l'adopte. */
  protected onChanged(draft: AvailabilityDraft): void {
    this.draft.set(draft);
  }

  /**
   * Une carte a écrit **sa** tranche. On réaligne cette seule tranche du
   * brouillon : le serveur a pu normaliser ce qu'on lui a envoyé, et sans ça la
   * carte se croirait modifiée à jamais. Les édits en cours des deux autres, eux,
   * ne sont pas touchés — chacune enregistre quand elle le décide.
   */
  protected async onWeekPersisted(config: AvailabilityConfigView): Promise<void> {
    this.persisted.set(config);
    this.draft.update((draft) => ({ ...draft, week: draftFrom(config).week }));
    await this.refreshPreview();
  }

  protected async onPolicyPersisted(config: AvailabilityConfigView): Promise<void> {
    this.persisted.set(config);
    this.draft.update((draft) => ({ ...draft, policy: config.policy }));
    await this.refreshPreview();
  }

  protected async onExceptionsPersisted(config: AvailabilityConfigView): Promise<void> {
    this.persisted.set(config);
    this.draft.update((draft) => ({ ...draft, exceptions: draftFrom(config).exceptions }));
    await this.refreshPreview();
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
