import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  activeCarousel,
  describeFormat,
  formatSpec,
  GRID_COLUMNS,
  MOBILE_COLUMNS,
  mediaFitOf,
  mediaSideOf,
  mobileFormat,
  mobileSide,
} from '@lfd/storefront-layout';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  type FoldPanelDefaults,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { toneOf } from '../storefront-block';
import type { StorefrontObjectDialogData } from '../storefront-object-host';
import type { TemplateLabel } from '../storefront-templates';
import { StorefrontMediaMock } from '../storefront-media-mock/storefront-media-mock';
import { StorefrontObjectPanel } from '../storefront-object-panel/storefront-object-panel';
import { TemplateNameForm } from '../template-name-form/template-name-form';

/**
 * Le dialogue CENTRÉ d'un objet de la vitrine : à gauche son aperçu à sa
 * taille — bureau et mobile côte à côte —, fixe ; à droite ses réglages en
 * sections qui défilent ; au pied, « Enregistrer comme gabarit » et « Fermer ».
 * Sous 900 px, l'éditeur l'ouvre en plein écran, aperçu en haut.
 *
 * Il ne tient pas l'objet : il le LIT chez l'éditeur (`host.selected`), donc
 * l'aperçu suit chaque réglage appliqué, et chaque choix repart en intention.
 * Un refus — une forme qui ne tient pas, un rayon où la place est prise — se
 * dit ici, pas derrière le voile. Rien ne part au serveur : l'envoi reste le
 * bouton « Enregistrer » de la page.
 */
@Component({
  selector: 'app-storefront-object-dialog',
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    StorefrontMediaMock,
    StorefrontObjectPanel,
    TemplateNameForm,
  ],
  templateUrl: './storefront-object-dialog.html',
  styleUrl: './storefront-object-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorefrontObjectDialog {
  /** Large : l'aperçu et les réglages côte à côte. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'xl', surface: 'solid' };

  private readonly ref = inject<FoldPanelRef<void>>(FoldPanelRef);

  readonly data = input.required<StorefrontObjectDialogData>();

  protected readonly host = computed(() => this.data().host);
  protected readonly block = computed(() => this.host().selected());
  protected readonly notice = computed(() => this.host().notice());

  protected readonly desktopColumns = GRID_COLUMNS;
  protected readonly mobileColumns = MOBILE_COLUMNS;
  protected readonly toneOf = toneOf;
  protected readonly fitOf = mediaFitOf;
  protected readonly sideOf = mediaSideOf;
  protected readonly mobileSideOf = mobileSide;
  protected readonly carouselOf = activeCarousel;
  protected readonly spec = formatSpec;
  protected readonly mobileOf = mobileFormat;

  protected readonly title = computed(() => {
    const block = this.block();
    return block === null ? 'Objet retiré' : describeFormat(block.format);
  });

  protected readonly subtitle = computed(() => {
    const block = this.block();
    return block === null ? '' : `Colonne ${block.column}, rangée ${block.row}`;
  });

  /** Le formulaire de nom du gabarit, au pied. */
  protected readonly naming = signal(false);

  protected saveTemplate(label: TemplateLabel): void {
    if (this.host().saveSelectedAsTemplate(label)) {
      this.naming.set(false);
    }
  }

  close(): void {
    this.ref.close();
  }
}
