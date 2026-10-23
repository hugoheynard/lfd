import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

/** Le motif est borné côté serveur à 200 caractères (CHECK et domaine). */
const REASON_MAX = 200;

/** Ce que la carte montre de la ligne rejetée : le compte ou le mandat, nommé. */
export interface BankRejectionPanelData {
  readonly subject: string;
}

/**
 * **« Rejeté par la banque »** — le motif que le compte rendu d'import CENET
 * donne pour une ligne d'un export déposé (Hugo, 2026-10-23). Commun aux
 * comptes et aux mandats : le panneau ne fait que recueillir le motif et le
 * rendre à la carte, qui porte le geste.
 */
@Component({
  selector: 'app-bank-rejection-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldInputComponent, FoldPanelHeaderComponent],
  templateUrl: './bank-rejection-panel.html',
  styleUrl: './bank-rejection-panel.scss',
})
export class BankRejectionPanel {
  private readonly ref = inject(FoldPanelRef<string>);

  readonly data = input<BankRejectionPanelData | undefined>(undefined);

  protected readonly reason = signal('');
  protected readonly canSubmit = computed(() => {
    const reason = this.reason().trim();
    return reason !== '' && reason.length <= REASON_MAX;
  });

  protected submit(): void {
    if (this.canSubmit()) {
      this.ref.close(this.reason().trim());
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
