import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FoldCalloutComponent, FoldCheckboxComponent } from 'fold-ng';

import { ProductFormStore, type FormSection } from '../product-form-store';

/**
 * **La ligne d'héritage, sous l'en-tête de chaque carte.**
 *
 * Toujours au même endroit, et pour toutes les cartes : c'est ce qui la rend
 * lisible. Une case posée au milieu d'une carte et absente des autres oblige à
 * chercher, à chaque section, s'il y a quelque chose à savoir ; posée sous
 * l'en-tête, la réponse est là où le regard arrive déjà.
 *
 * Le composant ne décide de RIEN. Il demande sa ligne au magasin et la rend :
 * qui peut diverger, qui est portée par la fiche et qui n'a rien à dire sont
 * trois faits du modèle. Les recalculer ici en ferait une seconde version, à
 * tenir d'accord avec celle du serveur.
 */
@Component({
  selector: 'app-section-alignment',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldCheckboxComponent],
  templateUrl: './section-alignment.html',
  styleUrl: './section-alignment.scss',
})
export class SectionAlignment {
  protected readonly store = inject(ProductFormStore);

  readonly section = input.required<FormSection>();

  protected readonly row = computed(() => this.store.alignments().get(this.section()));
}
