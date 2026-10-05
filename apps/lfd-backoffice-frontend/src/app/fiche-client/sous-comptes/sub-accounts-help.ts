import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldCardComponent, FoldDisclosureComponent } from 'fold-ng';

/**
 * **L'aide de l'onglet Sous-comptes**, texte de Hugo (2026-10-05). Repliable
 * comme les réglages du simulateur (`fold-disclosure`, seul motif d'aide
 * repliable du back-office) : ouverte quand la notion est neuve pour ce
 * client — ni principal ni sous-compte —, repliée sinon.
 */
@Component({
  selector: 'app-sub-accounts-help',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldDisclosureComponent],
  templateUrl: './sub-accounts-help.html',
  styleUrl: './sub-accounts-help.scss',
})
export class SubAccountsHelp {
  readonly open = input.required<boolean>();
}
