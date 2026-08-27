import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FoldAppShellComponent, FoldIconComponent } from 'fold-ng';

import { ClientChrome } from '../client-chrome.service';
import { ClientOnboarding } from '../client-onboarding.service';
import { ClientCopyService } from '../copy/client-copy.service';
import { LangSwitch } from '../lang-switch/lang-switch';

/**
 * Le shell de l'app CLIENT : la barre de marque bleue, et rien d'autre.
 *
 * Pas de rail — l'app cliente est pensée pour le téléphone, sa navigation sera
 * une nav mobile, pas une colonne de bureau. `mobileNav="none"` dit au shell de
 * ne pas préparer de tiroir qu'on ne remplira jamais.
 *
 * La barre est projetée dans le slot `[header]` du shell : c'est lui qui la
 * place, lui qui la peint (`--fold-color-bg-header`) et lui qui la marque
 * `data-surface="chrome"`. L'écran n'a donc plus à porter son propre en-tête.
 */
@Component({
  selector: 'app-client-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-theme': 'lfc-app', '[class.bar-narrow-only]': '!chrome.barOnDesktop()' },
  imports: [FoldAppShellComponent, FoldIconComponent, LangSwitch, RouterOutlet],
  templateUrl: './client-shell.html',
  styleUrl: './client-shell.scss',
})
export class ClientShell {
  protected readonly chrome = inject(ClientChrome);
  protected readonly t = inject(ClientCopyService).t;

  constructor() {
    // Instancié pour son EFFET, pas pour son API : c'est lui qui repose prénom
    // et téléphone au retour d'Auth0. Un service `providedIn: 'root'` que
    // personne n'injecte ne s'exécute jamais.
    inject(ClientOnboarding);
  }

  protected goBack(): void {
    this.chrome.back()?.();
  }

  protected openMenu(): void {
    this.chrome.menu()?.();
  }

  /** Le compte fait partie du NOM du bouton : sans lui, la pastille est muette. */
  protected readonly bellLabel = computed(() => {
    const count = this.chrome.bellCount();
    const label = this.t().chrome.notifications;
    return count > 0 ? `${label} — ${count}` : label;
  });

  protected openBell(): void {
    this.chrome.bell()?.();
  }
}
