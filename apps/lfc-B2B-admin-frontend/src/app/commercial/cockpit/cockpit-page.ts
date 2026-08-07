import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FoldBadgeComponent, FoldButtonComponent } from 'fold-ng';
import type { LeadScoreView, PlayType } from '@lfd/contracts';

import { CockpitService } from './cockpit.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Badge variant (fold) — accepté par `fold-badge [variant]`. */
type BadgeVariant = 'neutral' | 'accent' | 'info' | 'warning' | 'alert' | 'success';

/** Libellé + ton de chaque play (la motion commerciale à jouer). */
const PLAY: Record<PlayType, { label: string; variant: BadgeVariant; hint: string }> = {
  lock_in: {
    label: 'Verrouiller',
    variant: 'warning',
    hint: 'Prospect chaud à convertir en abonné',
  },
  rescue: { label: 'Rescousse', variant: 'alert', hint: 'Dossier d’activation bloqué à débloquer' },
  upgrade: { label: 'Upgrade', variant: 'success', hint: 'Compte engagé à étendre' },
  win_back: { label: 'Reconquête', variant: 'info', hint: 'Lead qui refroidit à relancer' },
};

/**
 * Onglet **Tableau de bord** (cockpit) : la queue **« 5 meilleurs coups du jour »**,
 * lue du read-model matérialisé (`GET /admin/cockpit`, recalculé par cron). Chaque
 * coup est **typé par play** (verrouiller / rescousse / upgrade / reconquête),
 * **scoré** (0..100) et justifié par un `reason` lisible — le score n'est pas une
 * boîte noire. L'ordre vient du serveur (score décroissant) ; afficher journalise
 * `reco.shown`.
 */
@Component({
  selector: 'app-cockpit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent],
  templateUrl: './cockpit-page.html',
  styleUrl: './cockpit-page.scss',
})
export class CockpitPage {
  private readonly service = inject(CockpitService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly leads = signal<readonly LeadScoreView[]>([]);

  protected readonly computedAt = computed<string | null>(() => {
    const first = this.leads()[0];
    return first ? first.computedAt : null;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.leads.set(await this.service.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected play(lead: LeadScoreView): { label: string; variant: BadgeVariant; hint: string } {
    return PLAY[lead.play];
  }

  /** Fraîcheur du read-model, formatée (date + heure courtes). */
  protected freshnessLabel(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
