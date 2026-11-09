import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { MailEditorUnsubscribeFooter } from '@lfd/mail-blocks';
import { FoldIconComponent } from 'fold-ng';

/**
 * **Le pied de désinscription d'un e-mail marketing**, sous l'e-mail du
 * canevas (plan `plan-desinscription-des-e-mails.md`, B2 et U4) : grisé et
 * verrouillé — ni sélectionnable, ni éditable, ni déplaçable. Le bloc l'ajoute
 * à l'envoi, après tout le document ; le lien n'y est qu'un libellé, l'adresse
 * réelle est posée pour chaque destinataire.
 */
@Component({
  selector: 'app-mail-unsubscribe-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './mail-unsubscribe-footer.html',
  styleUrl: './mail-unsubscribe-footer.scss',
})
export class MailUnsubscribeFooter {
  readonly footer = input.required<MailEditorUnsubscribeFooter>();
}
