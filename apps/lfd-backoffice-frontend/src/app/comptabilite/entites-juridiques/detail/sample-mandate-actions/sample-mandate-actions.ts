import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import type { LegalEntityView } from '@lfd/contracts';
import { FoldButtonComponent, FoldPanelHostService } from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { saveBlob } from '../../../../shared/download/save-blob';
import { LegalEntitiesService } from '../../../legal-entities.service';
import { MandatePanel, type MandatePanelData } from '../mandate-panel/mandate-panel';

/** Le nom du fichier, écrit UNE fois : la fiche le donne au panneau qui l'enregistre. */
const MANDATE_FILE_NAME = 'mandat-sepa-exemple.pdf';

/**
 * **Le mandat d'exemple d'une entité** — le voir, ou le télécharger.
 *
 * ## Il suit `canCollect`, jamais l'envie
 *
 * Le serveur refuse en **409** de rendre un mandat sans ICS ni compte : il
 * imprimerait des cases vides sur un document qu'on fait signer. Les deux
 * boutons sont donc inactifs tant que l'entité ne peut pas encaisser — un
 * bouton actif dont la seule issue est une erreur est une affordance qui ment.
 *
 * **Deux gestes, pas un.** « Voir » ouvre la fiche **dans un panneau modal de
 * la page**, « Télécharger » l'enregistre. Contrôler une adresse ou un ICS à
 * l'écran est le geste courant, accumuler des PDF en est le contraire — d'où
 * l'ordre, « Voir » en premier et en emphase.
 *
 * Un échec se remonte (`failed`) : c'est la page qui porte le message, au même
 * endroit que les refus de ses autres gestes.
 */
@Component({
  selector: 'app-sample-mandate-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './sample-mandate-actions.html',
  styleUrl: './sample-mandate-actions.scss',
})
export class SampleMandateActions {
  private readonly api = inject(LegalEntitiesService);
  private readonly panels = inject(FoldPanelHostService);

  readonly entity = input.required<LegalEntityView>();
  /** La page est occupée par un autre geste. */
  readonly busy = input(false);

  /** Le message d'un échec, `null` quand un nouvel essai commence. */
  readonly failed = output<string | null>();

  protected readonly loading = signal(false);

  /**
   * Le mandat, et son échec DIT : un téléchargement qui rate ne laisse aucune
   * trace à l'écran, et sans message l'utilisateur conclut que le bouton ne
   * marche pas.
   */
  protected async download(): Promise<void> {
    await this.withMandate({ inline: false }, (blob) => {
      saveBlob(blob, MANDATE_FILE_NAME);
    });
  }

  /**
   * Le même mandat, REGARDÉ — dans un panneau modal, sans quitter la fiche.
   *
   * Pas de `<a href>` sur la route : elle est derrière le jeton staff, et une
   * navigation nue rendrait un 401 en page blanche. Les octets viennent donc
   * par `HttpClient`, et le panneau les affiche à partir d'une URL d'objet
   * qu'il révoque en se fermant. `inline` ne dit plus que l'intention de la
   * requête : un `blob:` n'a pas de `Content-Disposition`.
   */
  protected async view(): Promise<void> {
    const entity = this.entity();
    await this.withMandate({ inline: true }, (blob) => {
      const data: MandatePanelData = { blob, entityName: entity.name, fileName: MANDATE_FILE_NAME };
      // La largeur et la surface opaque sont déclarées par le panneau lui-même.
      this.panels.open<MandatePanelData>(MandatePanel, { data });
    });
  }

  /** Le va-et-vient commun aux deux gestes : occupé, échec DIT, repos. */
  private async withMandate(
    options: { readonly inline: boolean },
    hand: (blob: Blob) => void,
  ): Promise<void> {
    this.loading.set(true);
    this.failed.emit(null);
    try {
      hand(await this.api.sampleMandate(this.entity().id, options));
    } catch (caught) {
      this.failed.emit(httpErrorMessage(caught, 'Mandat d’exemple indisponible.'));
    } finally {
      this.loading.set(false);
    }
  }
}
