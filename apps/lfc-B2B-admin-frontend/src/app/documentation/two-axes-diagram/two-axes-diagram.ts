import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « deux axes » — ce qui décide du taux n'est pas ce qui décide du
 * logiciel.
 *
 * **Une** carte « sur place », donc un taux réglé une fois et un catalogue
 * décrit une fois ; et plusieurs **intégrations** qui la servent — le QR par
 * Shopify, le comptoir par la caisse — choisies par le point de vente.
 *
 * Il a d'abord été dessiné avec DEUX cartes (« sur place QR », « sur place
 * caisse »). C'était exprimable, mais ça faisait régler le même 10 % deux fois
 * par famille : deux valeurs qui doivent rester d'accord, et dont le désaccord
 * ne se voit que sur une facture. Deux cartes ne se justifient que si les
 * catalogues DIFFÈRENT — ce qui n'est pas le cas ici.
 *
 * Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-two-axes-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './two-axes-diagram.html',
  styleUrl: './two-axes-diagram.scss',
})
export class TwoAxesDiagram {}
