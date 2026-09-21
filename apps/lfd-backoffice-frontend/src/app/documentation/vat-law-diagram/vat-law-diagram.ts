import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « d'où viennent les colonnes » — la chaîne loi → contexte → matrice.
 *
 * Il répond à la question qu'on pose vraiment devant l'écran des contextes de
 * vente : *pourquoi cette liste-là ?* La réponse n'est pas un choix produit —
 * c'est que le code général des impôts traite différemment ce qu'on emporte
 * (consommation différée) et ce qu'on sert en salle (consommation immédiate).
 * Un contexte transcrit une distinction fiscale ; il ne décrit pas un canal.
 *
 * D'où la troisième colonne, volontairement VIDE au deuxième étage : l'alcool
 * change le taux sans changer le lieu de consommation, donc il fait une LIGNE
 * de la matrice, jamais une colonne. C'est l'erreur que le schéma existe pour
 * empêcher — elle dédoublerait les contextes à chaque particularité fiscale.
 *
 * Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-vat-law-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vat-law-diagram.html',
  styleUrl: './vat-law-diagram.scss',
})
export class VatLawDiagram {}
