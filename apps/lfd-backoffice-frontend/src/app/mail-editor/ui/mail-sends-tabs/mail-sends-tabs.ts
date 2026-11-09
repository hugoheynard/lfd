import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FoldViewNavComponent, type FoldViewNavItem } from 'fold-ng';

const ITEMS: readonly FoldViewNavItem[] = [
  { key: 'sends', label: 'Envois', icon: 'inbox', link: '/emails/envois' },
  {
    key: 'preferences',
    label: 'Désinscriptions et accords',
    icon: 'user',
    link: '/emails/desinscriptions',
  },
];

/**
 * **Les onglets du suivi** (plan `plan-desinscription-des-e-mails.md`, C4) :
 * les envois, et les désinscriptions et accords — tous deux sous le droit
 * `mail_sends`. Chaque onglet est une route. Les deux chemins ne sont pas
 * préfixes l'un de l'autre : `routerLinkActive` sans `exact` n'en allume
 * qu'un (la raison du segment `/templates` de `mail-space-tabs`).
 */
@Component({
  selector: 'app-mail-sends-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldViewNavComponent],
  templateUrl: './mail-sends-tabs.html',
})
export class MailSendsTabs {
  protected readonly items = ITEMS;
}
