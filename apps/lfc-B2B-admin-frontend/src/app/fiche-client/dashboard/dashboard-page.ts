import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FoldButtonComponent, FoldLoadingStateComponent } from 'fold-ng';
import type { CustomerSheetView } from '@lfd/contracts';

import { CustomerSheetService } from '../../commercial/calendrier/customer-sheet/customer-sheet.service';
import { CustomerSheet } from '../../commercial/calendrier/customer-sheet/customer-sheet';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Tableau de bord** d'un compte : ce que le commercial regarde avant d'appeler
 * — les chiffres, les dernières commandes, l'historique d'interaction.
 *
 * C'est la fiche commerciale construite pour la page rendez-vous, réemployée
 * telle quelle : elle était déjà présentationnelle (elle reçoit sa vue, elle ne
 * la charge pas), donc elle n'a rien coûté à déplacer. Une seule lecture du
 * compte, deux endroits où elle sert.
 */
@Component({
  selector: 'app-client-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CustomerSheet, FoldButtonComponent, FoldLoadingStateComponent],
  templateUrl: './dashboard-page.html',
})
export class ClientDashboardPage {
  readonly id = input.required<string>();

  private readonly api = inject(CustomerSheetService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly sheet = signal<CustomerSheetView | null>(null);

  constructor() {
    // Un `input` de route n'est **pas encore lié** dans le constructeur : le lire
    // ici lève NG0950, et le `catch` en dessous transformait la panne en écran
    // d'erreur muet. L'effet attend la liaison — et rejoue tout seul quand on
    // passe d'un compte à l'autre sans quitter la page (le composant est réutilisé).
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(id: string = this.id()): Promise<void> {
    this.state.set('loading');
    try {
      this.sheet.set(await this.api.sheet(id));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
