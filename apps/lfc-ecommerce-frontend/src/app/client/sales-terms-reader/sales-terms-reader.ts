import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { ClientLegalDocuments } from '../client-legal-documents.service';
import { ClientLocale } from '../client-locale.service';
import { ClientCopyService } from '../copy/client-copy.service';
import { LegalArticles } from '../legal-articles/legal-articles';
import {
  parseSalesTermsSide,
  salesTermsDocumentOf,
  type SalesTermsSide,
} from '../sales-terms-side';

/**
 * **Les CGV, d'un côté ou de l'autre** — le contenu commun au dialogue du pied
 * de page et à la page `/cgv` (plan `legal/plan-cgv-par-audience.md`, bandeau
 * du 2026-10-15 : « une seule page CGV avec un switch Particulier / Pro »).
 *
 * Le côté est une ENTRÉE et non un état : la page le tient dans l'adresse, le
 * dialogue dans un signal. Le composant ne fait qu'annoncer le côté demandé
 * (`sideChange`) — c'est à son hôte de décider où il se garde.
 *
 * 🔴 **Des CGV pro sans article disent « en cours de rédaction »**, jamais le
 * texte particulier : un pro y lirait un droit de rétractation qu'il n'a pas
 * (C2, choix (b) de Hugo).
 *
 * Le bouton du PDF et la ligne « version de référence » vont ensemble, et
 * seulement quand un PDF est en vigueur pour CE côté : la ligne affirmerait
 * sinon une référence qu'on ne peut pas tendre.
 */
@Component({
  selector: 'app-sales-terms-reader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldViewToggleComponent,
    LegalArticles,
  ],
  templateUrl: './sales-terms-reader.html',
  styleUrl: './sales-terms-reader.scss',
})
export class SalesTermsReader {
  /** Le côté affiché. */
  readonly side = input.required<SalesTermsSide>();
  /** Le côté que le lecteur vient de choisir au switch. */
  readonly sideChange = output<SalesTermsSide>();

  private readonly documents = inject(ClientLegalDocuments);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly c = computed(() => this.t().legalDocument.salesTerms);
  protected readonly locale = inject(ClientLocale).current;

  protected readonly sides = computed<readonly FoldViewToggleOption[]>(() => [
    { value: 'particulier', label: this.c().sideParticulier },
    { value: 'pro', label: this.c().sidePro },
  ]);

  private readonly document = computed(() => salesTermsDocumentOf(this.side()));

  protected readonly status = computed(() => this.documents.statusOf(this.document()));
  protected readonly articles = computed(() => this.documents.articlesOf(this.document()));
  protected readonly hasPdf = computed(() => this.documents.hasPdf(this.document()));
  protected readonly pdfUrl = computed(() => this.documents.pdfUrlOf(this.document()));

  /** Le titre de l'état vide : un texte pro pas encore rédigé n'est pas une mention vide. */
  protected readonly emptyTitle = computed(() =>
    this.side() === 'pro' ? this.c().proDraftTitle : this.t().legalDocument.emptyTitle,
  );
  protected readonly emptySubtitle = computed(() =>
    this.side() === 'pro' ? '' : this.t().legalDocument.emptySubtitle,
  );

  constructor() {
    // ⚠️ `untracked`, pour la même raison que le dialogue des mentions :
    // `ensureLoaded` lit l'état du document, et un effet qui s'y abonnerait
    // relancerait en boucle une lecture ratée. Seul le côté est une dépendance.
    effect(() => {
      const document = this.document();
      untracked(() => this.documents.ensureLoaded(document));
    });
  }

  protected choose(value: string): void {
    const side = parseSalesTermsSide(value);
    if (side !== null && side !== this.side()) {
      this.sideChange.emit(side);
    }
  }

  protected retry(): void {
    this.documents.ensureLoaded(this.document());
  }
}
