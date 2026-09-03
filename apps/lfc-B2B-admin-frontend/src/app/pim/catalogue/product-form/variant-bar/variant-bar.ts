import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FoldButtonComponent, FoldInputComponent } from 'fold-ng';

import { ProductFormStore } from '../product-form-store';

/**
 * **La barre des déclinaisons**, sous l'en-tête de la fiche.
 *
 * Elle répond à une question que la page ne posait pas : *de quel article
 * parle-t-on ?* Une fiche porte un ou plusieurs articles — c'est l'article qui a
 * un prix, un poids et une fiche réglementaire, et c'est lui qu'un canal reçoit.
 * Tant qu'il n'y en avait qu'un, l'aplatir dans la fiche ne coûtait rien ; dès
 * qu'il y en a deux, il faut dire lequel est à l'écran.
 *
 * Le composant ne dérive **rien** : les onglets, leurs libellés et celui qui est
 * ouvert viennent du magasin. Il n'a que son propre brouillon de nom, parce que
 * c'est une saisie qui n'existe qu'ici et qui disparaît avec le formulaire.
 */
@Component({
  selector: 'app-variant-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldInputComponent],
  templateUrl: './variant-bar.html',
  styleUrl: './variant-bar.scss',
})
export class VariantBar {
  protected readonly store = inject(ProductFormStore);

  /** Le formulaire de création, replié tant qu'on ne l'ouvre pas. */
  protected readonly creating = signal(false);
  protected readonly draftName = signal('');

  protected open(): void {
    this.draftName.set('');
    this.creating.set(true);
  }

  protected cancel(): void {
    this.creating.set(false);
  }

  protected async create(): Promise<void> {
    const name = this.draftName().trim();
    if (name === '') {
      return;
    }
    await this.store.addVariant(name);
    this.creating.set(false);
  }
}
