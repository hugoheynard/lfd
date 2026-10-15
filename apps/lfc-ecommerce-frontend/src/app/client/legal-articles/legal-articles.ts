import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { LegalDocumentArticle } from '../client-legal-documents.service';

/**
 * **Les articles numérotés d'un document légal**, dans le registre
 * administratif de la maison : rang dans la gouttière, titre en petites
 * capitales, corps justifié avec césure.
 *
 * Sorti du dialogue des mentions le 2026-10-15 parce que les CGV se lisent
 * désormais à deux endroits — le dialogue du pied de page et la page `/cgv` —
 * et que deux copies de cette mise en page auraient divergé au premier
 * correctif. La césure demande un `lang` sur un ancêtre : c'est au conteneur
 * de le poser.
 */
@Component({
  selector: 'app-legal-articles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal-articles.html',
  styleUrl: './legal-articles.scss',
})
export class LegalArticles {
  readonly articles = input.required<readonly LegalDocumentArticle[]>();
}
