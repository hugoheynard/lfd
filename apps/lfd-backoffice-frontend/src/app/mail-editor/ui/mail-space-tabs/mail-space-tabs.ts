import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { MailSpace } from '@lfd/mail-blocks';
import { FoldViewNavComponent, type FoldViewNavItem } from 'fold-ng';

/**
 * **Les onglets d'un espace d'e-mails** (plan § 25, C2/C3 — retouche du
 * 2026-11-07, Hugo : « expéditeur devrait être dans un onglet ») :
 * Templates, Charte, Expéditeur. Chaque onglet est une ROUTE — un lien se
 * partage, le retour du navigateur revient à l'onglet d'avant, et la garde
 * de sortie de la charte retient un changement d'onglet comme toute sortie.
 *
 * Templates a son propre segment (`/templates`) : `fold-view-nav` allume un
 * lien par `routerLinkActive` sans `exact`, et la racine de l'espace serait
 * restée allumée sous les deux autres onglets (vérifié le 2026-11-07).
 */
@Component({
  selector: 'app-mail-space-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldViewNavComponent],
  templateUrl: './mail-space-tabs.html',
})
export class MailSpaceTabs {
  readonly space = input.required<MailSpace>();

  protected readonly items = computed<readonly FoldViewNavItem[]>(() => {
    const root = `/emails/espaces/${this.space()}`;
    return [
      { key: 'templates', label: 'Templates', icon: 'mail', link: `${root}/templates` },
      { key: 'charter', label: 'Charte', icon: 'palette', link: `${root}/charte` },
      { key: 'sender', label: 'Expéditeur', icon: 'user', link: `${root}/expediteur` },
    ];
  });
}
