import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { type FoldPanelDefaults, FoldPanelHeaderComponent } from 'fold-ng';

import { ClientAudience } from '../client-audience.service';
import { ClientLegalDocuments } from '../client-legal-documents.service';
import { ClientCopyService } from '../copy/client-copy.service';
import { SalesTermsReader } from '../sales-terms-reader/sales-terms-reader';
import { defaultSalesTermsSide, salesTermsDocumentOf } from '../sales-terms-side';

/**
 * Le dialogue des **CGV**, ouvert depuis le lien unique du pied de page.
 *
 * Les quatre autres mentions gardent `LegalDocumentPanel` ; les CGV ont le
 * leur parce qu'elles portent deux textes et un switch (plan
 * `legal/plan-cgv-par-audience.md`, bandeau du 2026-10-15). Le contenu est
 * celui de `/cgv` — `SalesTermsReader` — pour qu'un lien partagé et le pied de
 * page montrent la même chose.
 *
 * Le dialogue reste le geste du pied de page, comme pour les autres mentions :
 * il ne fait pas quitter un panier en cours. Le côté s'y tient en mémoire, pas
 * dans l'adresse — un dialogue n'a pas d'adresse ; c'est `/cgv` qui en a une.
 *
 * Ouvert côté pro pour une clientèle pro (`ClientAudience`), particulier
 * sinon ; le côté suit la clientèle tant que le lecteur n'a pas basculé, et
 * celle-ci peut n'être connue qu'après l'ouverture (`/me` en vol).
 */
@Component({
  selector: 'app-sales-terms-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, SalesTermsReader],
  templateUrl: './sales-terms-panel.html',
  styleUrl: './sales-terms-panel.scss',
})
export class SalesTermsPanel {
  static readonly foldPanel: FoldPanelDefaults = {
    side: 'center',
    surface: 'solid',
    width: 'md',
  };

  private readonly audience = inject(ClientAudience);
  private readonly documents = inject(ClientLegalDocuments);

  protected readonly t = inject(ClientCopyService).t;

  protected readonly side = linkedSignal(() => defaultSalesTermsSide(this.audience.current()));

  /** Le titre du texte affiché — il nomme aussi le dialogue. */
  protected readonly title = computed(() =>
    this.documents.titleOf(salesTermsDocumentOf(this.side())),
  );
}
