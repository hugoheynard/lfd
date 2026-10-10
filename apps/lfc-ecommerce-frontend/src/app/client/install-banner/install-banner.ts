import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { ClientCopyService } from '../copy/client-copy.service';
import { InstallPrompt } from '../install-prompt.service';

/**
 * Le bandeau qui dit qu'on peut sortir l'app du navigateur
 * (`documentation/todos/todo-installation-app-cliente.md`).
 *
 * Il naît FERMÉ et ne s'ouvre qu'après le premier rendu navigateur : au rendu
 * serveur, ni `navigator`, ni `matchMedia`, ni l'invite n'existent. Il ne flotte
 * pas — collé au bas en `sticky`, il reprend sa place dans le flux en fin de
 * défilement et ne recouvre donc jamais le dernier bouton d'un écran.
 */
@Component({
  selector: 'app-install-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './install-banner.html',
  styleUrl: './install-banner.scss',
})
export class InstallBanner {
  private readonly prompt = inject(InstallPrompt);
  protected readonly t = inject(ClientCopyService).t;

  private readonly open = signal(false);
  protected readonly context = computed(() => (this.open() ? this.prompt.context() : 'none'));

  constructor() {
    afterNextRender(() => this.open.set(!this.prompt.isDismissed()));
  }

  protected async install(): Promise<void> {
    await this.prompt.install();
  }

  protected later(): void {
    this.prompt.dismiss();
    this.open.set(false);
  }
}
