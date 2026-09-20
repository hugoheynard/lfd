import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldCheckboxComponent } from 'fold-ng';

import type { WorkshopLine } from '@lfd/contracts';

/**
 * **Une ligne de fiche d'atelier** — case, quantité, nom, contenant, initiales.
 *
 * 🔴 **Un seul composant pour les deux supports, et un seul gabarit.** Le poste
 * fixe et le téléphone n'enlèvent pas les mêmes choses (la colonne d'initiales
 * disparaît sous 1024 px, le contenant passe en seconde ligne), mais c'est la
 * **feuille de style** qui les enlève, jamais une branche du template : deux
 * gabarits divergeraient au premier produit ajouté, et c'est la ligne que le
 * fournil répète neuf fois — celle qui ne doit surtout pas changer de geste d'un
 * écran à l'autre.
 *
 * La case est un `fold-checkbox` : l'accessibilité, le clavier et le rôle
 * viennent de lui. Seules sa TAILLE et ses couleurs sont posées ici, par les
 * propriétés qu'il expose — l'établi n'a pas le chrome de l'application.
 */
@Component({
  selector: 'app-worksheet-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCheckboxComponent],
  templateUrl: './worksheet-line.html',
  styleUrl: './worksheet-line.scss',
  host: {
    // La ligne faite se lit d'un coup d'œil : fond crème, encre passée, nom
    // barré. C'est l'état, pas une décoration — d'où la classe sur l'hôte.
    '[class.is-done]': 'line().done',
  },
})
export class WorksheetLine {
  readonly line = input.required<WorkshopLine>();

  /**
   * La coche de cette ligne est en train de partir. La case est désarmée le
   * temps de l'envoi : un second clic enverrait un geste contraire qui pourrait
   * arriver avant le premier, et le serveur garderait le mauvais.
   */
  readonly busy = input(false);

  /** L'état demandé par la personne. Le parent écrit d'abord, envoie ensuite. */
  readonly toggled = output<boolean>();

  /**
   * Le nom accessible de la case. Sans lui, la case s'annonce « case à cocher »
   * et rien d'autre — neuf fois de suite, elles sont indiscernables.
   */
  protected readonly boxLabel = computed(
    () => `${this.line().quantity} ${this.line().productName}`,
  );
}
