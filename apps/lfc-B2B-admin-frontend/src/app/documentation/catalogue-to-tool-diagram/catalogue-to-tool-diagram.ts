import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « de la carte à l'outil » — le chemin complet, et les deux étages
 * qu'on confond toujours.
 *
 * **Une** carte « sur place » : un taux réglé une fois par article, un
 * catalogue décrit une fois. Puis un **adaptateur** par outil, qui TRADUIT ce
 * catalogue dans le vocabulaire de sa cible — collections et handles pour
 * Shopify, familles et rayons pour une caisse. L'**intégration** ne fait que
 * transporter le résultat.
 *
 * Il a d'abord été dessiné avec DEUX cartes (« sur place QR », « sur place
 * caisse »). C'était exprimable, mais ça faisait régler le même 10 % deux fois
 * par article : deux valeurs qui doivent rester d'accord, et dont le désaccord
 * ne se voit que sur une facture. Deux cartes ne se justifient que si les
 * catalogues DIFFÈRENT.
 *
 * Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-catalogue-to-tool-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalogue-to-tool-diagram.html',
  styleUrl: './catalogue-to-tool-diagram.scss',
})
export class CatalogueToToolDiagram {}
