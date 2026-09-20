import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { ClientDialog } from '../../dialog/client-dialog';
import { ClientCopyService } from '../../copy/client-copy.service';

/**
 * Le signalement — trois gestes, et rien d'autre.
 *
 * Une raison parmi cinq, une photo facultative, un mot facultatif. **Aucun champ
 * « objet » à rédiger** : les raisons sont celles qu'on entend au comptoir, et
 * le message part AVEC la commande, le mode et le créneau. C'est ce qui permet
 * à la phrase de pied d'être vraie — il n'y a rien à réexpliquer.
 *
 * ⚠️ Rien ne part encore : le canal de réclamation est l'un des trois ajouts que
 * `09-mes-commandes.md` demande au back-office. La feuille se ferme, et c'est
 * tout — elle ne prétend pas avoir envoyé.
 */
@Component({
  selector: 'app-report-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientDialog, FoldIconComponent],
  templateUrl: './report-sheet.html',
  styleUrl: './report-sheet.scss',
})
export class ReportSheet {
  /** La commande visée, par sa référence — vide quand la feuille est fermée. */
  readonly reference = input.required<string>();
  readonly open = input.required<boolean>();

  readonly closed = output<void>();

  protected readonly t = inject(ClientCopyService).t;

  protected readonly reason = signal<string | null>(null);
  protected readonly word = signal('');

  protected readonly reasons = computed(() => this.t().orders.reasons);

  /** Sans raison, il n'y a rien à envoyer : le bouton le dit avant le clic. */
  protected readonly ready = computed(() => this.reason() !== null);

  protected pick(reason: string): void {
    this.reason.set(reason);
  }

  protected write(value: string): void {
    this.word.set(value);
  }

  /** La feuille se referme sur un brouillon vierge : un signalement ne traîne pas. */
  protected close(): void {
    this.reason.set(null);
    this.word.set('');
    this.closed.emit();
  }
}
