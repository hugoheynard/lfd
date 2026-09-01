import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « les trois portes » — ce qui sépare une fiche vide d'une fiche en
 * vente, et laquelle des trois peut dire non.
 *
 * Elles se ressemblent assez pour qu'on les confonde : la barre de complétude
 * verdit, la déclaration se signe, la publication s'appuie. Deux d'entre
 * elles n'empêchent pourtant rien — la barre mesure la forme, la signature
 * n'écrit aucun statut — et croire l'inverse fait chercher un refus du côté de
 * la barre le jour où la publication est refusée.
 *
 * Le refus, lui, tient en une phrase, et le schéma la pose en clair sous les
 * trois portes : toute déclinaison active doit porter une fiche réglementaire.
 * Le piège est dans la liste vide, qui compte comme déclarée.
 *
 * Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-product-gates-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-gates-diagram.html',
  styleUrl: './product-gates-diagram.scss',
})
export class ProductGatesDiagram {}
