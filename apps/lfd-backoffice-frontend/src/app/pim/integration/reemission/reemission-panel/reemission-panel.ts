import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CatalogReemissionView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldLoadingStateComponent,
  FoldStatusBadgeComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../../auth/permissions.store';
import { ReemissionTracker } from '../reemission-tracker';

/** La pastille d'un état : les clés que `fold-status-badge` colore, et nos mots. */
const STATUS_BADGES: Readonly<
  Record<CatalogReemissionView['status'], { readonly status: string; readonly label: string }>
> = {
  running: { status: 'pending', label: 'En cours' },
  done: { status: 'active', label: 'Terminée' },
  failed: { status: 'error', label: 'Arrêtée' },
};

/** Avec l'heure : on relance souvent dans la même journée. */
const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * **Réémettre, et suivre le compte rendu** — le filet des faits du catalogue,
 * rendu à l'écran le 2026-10-18 (il n'avait plus de bouton depuis X4).
 *
 * Sans `productId`, il réémet tout et montre en s'ouvrant la dernière
 * réémission, quelle qu'elle soit : un « tout » lancé ailleurs se voit, et se
 * suit. Avec, il réémet cette fiche et ne montre que ce qu'il a lancé.
 *
 * Il ne s'affiche qu'avec `pim_channels:write`, le droit que la route oppose :
 * offrir un bouton que le serveur refuserait apprendrait la règle par un 403.
 */
@Component({
  selector: 'app-reemission-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldLoadingStateComponent,
    FoldStatusBadgeComponent,
  ],
  providers: [ReemissionTracker],
  templateUrl: './reemission-panel.html',
  styleUrl: './reemission-panel.scss',
})
export class ReemissionPanel implements OnInit {
  /** La fiche à réémettre ; `null` = tout le catalogue. */
  readonly productId = input<string | null>(null);

  protected readonly tracker = inject(ReemissionTracker);
  protected readonly canWrite = inject(PermissionsStore).can('pim_channels:write');

  protected readonly everything = computed(() => this.productId() === null);
  protected readonly badge = computed(() => {
    const job = this.tracker.job();
    return job === null ? null : STATUS_BADGES[job.status];
  });

  ngOnInit(): void {
    if (this.canWrite && this.everything()) {
      void this.tracker.showLatest();
    }
  }

  protected launch(): void {
    void this.tracker.launch(this.productId());
  }

  protected startedLine(job: CatalogReemissionView): string {
    const when = DATE_FORMAT.format(new Date(job.startedAt));
    return job.startedByName === null ? when : `${when}, par ${job.startedByName}`;
  }
}
