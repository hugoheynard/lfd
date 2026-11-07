import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FoldBackLinkComponent, FoldPageLayoutComponent } from 'fold-ng';

import { mailLabel, mailWhoAndWhen } from '../../rules/mail-labels';
import { MailTemplateHistory } from '../mail-template-history/mail-template-history';
import { MailTemplateTabs } from '../mail-template-tabs/mail-template-tabs';

/**
 * **L'onglet Historique de la page d'un e-mail** (Hugo, 2026-11-07) : la
 * chronologie des versions publiées et du dernier retour au modèle d'origine.
 * Lecture seule ; aucune lecture de plus que l'historique lui-même.
 */
@Component({
  selector: 'app-mail-template-history-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBackLinkComponent, FoldPageLayoutComponent, MailTemplateHistory, MailTemplateTabs],
  templateUrl: './mail-template-history-page.html',
  styleUrl: './mail-template-history-page.scss',
})
export class MailTemplateHistoryPage {
  /** Le segment de route `:template` (`withComponentInputBinding`). */
  readonly template = input.required<string>();

  protected readonly title = computed(() => mailLabel(this.template()).title);
  protected readonly whoAndWhen = computed(() => mailWhoAndWhen(this.template()));
}
