import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { FoldViewNavComponent, type FoldViewNavItem } from 'fold-ng';

/** L'onglet ouvert de la page d'un e-mail. */
export type MailTemplateTab = 'edit' | 'history';

const ITEMS: readonly FoldViewNavItem[] = [
  { key: 'edit', label: 'Édition', icon: 'edit' },
  { key: 'history', label: 'Historique', icon: 'clock' },
];

/**
 * **Les onglets de la page d'un e-mail** (Hugo, 2026-11-07) : Édition
 * (`/emails/:template`) et Historique (`/emails/:template/historique`).
 * Chaque onglet est une route ; la garde de sortie de l'édition retient donc
 * le passage à l'historique comme toute sortie.
 *
 * Des boutons qui naviguent, pas des liens : `fold-view-nav` allume un lien
 * par `routerLinkActive` sans `exact` (vérifié le 2026-11-07 dans
 * `mail-space-tabs`), et `/emails/:template` resterait allumé sous
 * `/historique`. L'onglet actif est donc dit par la page.
 */
@Component({
  selector: 'app-mail-template-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldViewNavComponent],
  templateUrl: './mail-template-tabs.html',
})
export class MailTemplateTabs {
  readonly template = input.required<string>();
  readonly active = input.required<MailTemplateTab>();

  private readonly router = inject(Router);
  protected readonly items = ITEMS;

  protected go(key: string): void {
    if (key === this.active()) {
      return;
    }
    const commands = ['/emails', this.template()];
    void this.router.navigate(key === 'history' ? [...commands, 'historique'] : commands);
  }
}
