import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldInputComponent,
} from 'fold-ng';

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
 *
 * **Un seul formulaire pour deux gestes.** Créer et renommer saisissent la même
 * chose au même endroit ; deux zones de saisie côte à côte auraient obligé à
 * lire laquelle est laquelle. `renamingId` dit lequel des deux est ouvert — et
 * son `null` dit « aucun », ce qu'un second booléen n'aurait pas su dire sans
 * pouvoir contredire le premier.
 */
@Component({
  selector: 'app-variant-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, FoldButtonIconComponent, FoldInputComponent],
  templateUrl: './variant-bar.html',
  styleUrl: './variant-bar.scss',
})
export class VariantBar {
  protected readonly store = inject(ProductFormStore);

  /** Le formulaire, replié tant qu'on ne l'ouvre pas. */
  protected readonly creating = signal(false);
  /** La déclinaison en cours de renommage, `null` si on n'en renomme aucune. */
  protected readonly renamingId = signal<string | null>(null);
  protected readonly draftName = signal('');

  /** L'un ou l'autre — jamais les deux, et le gabarit n'a qu'une question à poser. */
  protected readonly editing = computed(() => this.creating() || this.renamingId() !== null);

  protected open(): void {
    this.renamingId.set(null);
    this.draftName.set('');
    this.creating.set(true);
  }

  /**
   * Ouvre le renommage sur une déclinaison — **pré-rempli avec son NOM**, pas
   * avec le libellé de l'onglet : celui-ci peut être un repli (« Déclinaison
   * 2 »), et l'enregistrer ferait entrer le repli en base comme un vrai nom.
   */
  protected rename(tab: { id: string; name: string }): void {
    this.creating.set(false);
    this.draftName.set(tab.name);
    this.renamingId.set(tab.id);
  }

  protected cancel(): void {
    this.creating.set(false);
    this.renamingId.set(null);
  }

  protected async submit(): Promise<void> {
    const name = this.draftName().trim();
    if (name === '') {
      return;
    }
    const renaming = this.renamingId();
    if (renaming !== null) {
      await this.store.renameVariant(renaming, name);
    } else {
      await this.store.addVariant(name);
    }
    this.cancel();
  }
}
