import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
} from 'fold-ng';

import { ClientSalesTerms } from '../client-sales-terms.service';
import { ClientCopyService } from '../copy/client-copy.service';
import { ClientLocale } from '../client-locale.service';

/**
 * Le dialogue des **conditions générales de vente**, ouvert depuis le pied de
 * page.
 *
 * `side: 'center'` est le seul côté qui INTERROMPE la page : il la couvre et la
 * voile. C'est ce qu'on veut d'un document qu'on lit pour s'engager — un tiroir
 * latéral laisserait la boutique cliquable derrière et ferait des CGV un
 * aparté.
 *
 * Le registre est **administratif**, et il est voulu : corps justifié avec
 * césure, interlignage large, articles numérotés, titres en petites capitales.
 * Ce n'est pas de la copie de vitrine — aucune illustration, aucune couleur
 * d'accent, rien qui invite à survoler.
 *
 * Le corps défile dans **son propre conteneur** (`.body`), jamais la page
 * derrière : c'est le couple `:host { min-height: 0 }` + `.body { overflow-y:
 * auto }`, le même que `ContactPanel`.
 */
@Component({
  selector: 'app-sales-terms-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './sales-terms-panel.html',
  styleUrl: './sales-terms-panel.scss',
})
export class SalesTermsPanel {
  static readonly foldPanel: FoldPanelDefaults = {
    side: 'center',
    surface: 'solid',
    width: 'md',
  };

  private readonly terms = inject(ClientSalesTerms);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly locale = inject(ClientLocale).current;

  /** Le titre du document — il nomme aussi le dialogue pour l'accessibilité. */
  protected readonly title = this.terms.title;
  protected readonly articles = this.terms.articles;
  protected readonly status = this.terms.status;

  constructor() {
    // Le chargement part À L'OUVERTURE, pas au démarrage de l'app : c'est tout
    // l'objet du chargement paresseux, et c'est ici qu'on sait qu'on lit.
    this.terms.ensureLoaded();
  }

  /** Rejoue la lecture après un échec. Le service sait qu'une lecture ratée se retente. */
  protected retry(): void {
    this.terms.ensureLoaded();
  }
}
