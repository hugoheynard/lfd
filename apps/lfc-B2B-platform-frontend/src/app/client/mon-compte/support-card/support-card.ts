import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldCardComponent, FoldIconComponent, FoldPanelHostService } from 'fold-ng';

import { ClientContent } from '../../client-content.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { panelSide } from '../../panel-side';
import { supportChannels } from '../../support-channels';
import { SupportPanel } from '../support-panel/support-panel';

/**
 * « Contacter le service commercial » — la carte bleu clair de `/mon-compte`,
 * sur le **contact commercial** du contenu de plateforme, pas sur l'identité du
 * pied de page (Hugo, 2026-09-14).
 *
 * ## Deux cartes, une seule affichée
 *
 * - **Au bureau**, dans l'aside : l'adresse s'affiche SOUS le titre, en lien
 *   `mailto:`, le téléphone seulement s'il est renseigné. Aucun dialogue — la
 *   place y est, et ouvrir un panneau pour lire une adresse est un clic de trop.
 *   La carte n'est donc PAS `interactive` : elle contient des liens.
 * - **En pile**, amarrée au bas de la colonne : la carte entière est le geste,
 *   `interactive`, et ouvre le panneau des coordonnées. Ce panneau ne SAISIT
 *   rien, il se lit : il garde `panelSide()` (règle « Consulter n'est pas
 *   saisir » du `CLAUDE.md` de l'app).
 *
 * Les deux sont dans le DOM, le CSS choisit au pli — comme les cartes de la page.
 * Sans aucun canal, la carte se tait plutôt que d'ouvrir un panneau vide.
 */
@Component({
  selector: 'app-support-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldIconComponent],
  templateUrl: './support-card.html',
  styleUrl: './support-card.scss',
})
export class SupportCard {
  protected readonly t = inject(ClientCopyService).t;
  private readonly contact = inject(ClientContent).commercialContact;
  private readonly panels = inject(FoldPanelHostService);

  protected readonly channels = computed(() => supportChannels(this.contact()));

  protected readonly reachable = computed(() => {
    const { phone, email } = this.channels();
    return phone !== null || email !== null;
  });

  protected open(): void {
    // Solide : des coordonnées se lisent sur un fond qui ne laisse pas passer la page.
    this.panels.open(SupportPanel, { side: panelSide(), surface: 'solid' });
  }
}
