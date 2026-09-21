import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FoldBadgeComponent, FoldEmptyStateComponent } from 'fold-ng';
import type { LeadScoreView, PlayType } from '@lfd/contracts';

/** Ton fold d'un badge — la file se lit à la couleur avant de se lire au texte. */
type BadgeVariant = 'neutral' | 'accent' | 'info' | 'warning' | 'alert' | 'success';

/** Ce qu'est chaque **play** : le geste commercial à faire, pas l'état du lead. */
const PLAY: Readonly<Record<PlayType, { label: string; variant: BadgeVariant; hint: string }>> = {
  lock_in: {
    label: 'Verrouiller',
    variant: 'warning',
    hint: 'Prospect chaud à convertir en abonné',
  },
  rescue: {
    label: 'Rescousse',
    variant: 'alert',
    hint: "Dossier d'activation bloqué à débloquer",
  },
  upgrade: { label: 'Upgrade', variant: 'success', hint: 'Compte engagé à étendre' },
  win_back: { label: 'Reconquête', variant: 'info', hint: 'Lead qui refroidit à relancer' },
  nurture: { label: 'Démarchage', variant: 'neutral', hint: 'Lead sortant à faire avancer' },
};

/** Une ligne de la file, calculée une fois. */
interface PlayRow {
  readonly lead: LeadScoreView;
  readonly rank: number;
  readonly label: string;
  readonly variant: BadgeVariant;
  readonly hint: string;
}

/**
 * La file **« les meilleurs coups du jour »** — chaque lead avec le geste à
 * jouer, sa justification et son score.
 *
 * Présentationnel : l'ordre vient du serveur (score décroissant) et n'est jamais
 * retrié ici. Le score s'affiche **avec sa jauge** parce qu'un nombre sur 100 ne
 * se compare pas d'un coup d'œil, alors qu'une barre si.
 */
@Component({
  selector: 'app-play-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldEmptyStateComponent],
  templateUrl: './play-queue.html',
  styleUrl: './play-queue.scss',
})
export class PlayQueue {
  readonly leads = input.required<readonly LeadScoreView[]>();

  protected readonly rows = computed<readonly PlayRow[]>(() =>
    this.leads().map((lead, index) => ({ lead, rank: index + 1, ...PLAY[lead.play] })),
  );
}
