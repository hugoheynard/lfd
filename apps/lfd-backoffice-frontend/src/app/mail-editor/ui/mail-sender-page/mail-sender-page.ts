import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { hasSenderNature, isMailSpace, MAIL_SPACE_LABELS } from '@lfd/mail-blocks';
import { FoldBackLinkComponent, FoldEmptyStateComponent, FoldPageLayoutComponent } from 'fold-ng';

import { MailSenderCard } from '../mail-sender-card/mail-sender-card';
import { MailSpaceTabs } from '../mail-space-tabs/mail-space-tabs';

/**
 * **L'onglet « Expéditeur » d'un espace d'e-mails** (plan § 25, C3 — retouche
 * du 2026-11-07, Hugo : « expéditeur devrait être dans un onglet ») : la
 * carte de l'expéditeur, seule, sous les onglets de l'espace. Un segment qui
 * n'est pas un espace est refusé sans rien demander au serveur.
 *
 * Deux cartes pour un espace qui envoie du marketing (lot U5) : l'expéditeur
 * de service, et l'expéditeur marketing. L'espace de l'équipe (`lfd`)
 * n'envoie jamais de marketing : sa seconde carte n'existe pas.
 */
@Component({
  selector: 'app-mail-sender-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldEmptyStateComponent,
    FoldPageLayoutComponent,
    MailSenderCard,
    MailSpaceTabs,
  ],
  templateUrl: './mail-sender-page.html',
  styleUrl: './mail-sender-page.scss',
})
export class MailSenderPage {
  /** Le segment de route `:space` (`withComponentInputBinding`). */
  readonly space = input.required<string>();

  protected readonly known = computed(() => {
    const space = this.space();
    return isMailSpace(space) ? space : null;
  });
  protected readonly title = computed(() => {
    const space = this.known();
    return space === null ? 'Espace inconnu' : MAIL_SPACE_LABELS[space];
  });
  protected readonly sendsMarketing = computed(() => {
    const space = this.known();
    return space !== null && hasSenderNature(space, 'marketing');
  });
}
