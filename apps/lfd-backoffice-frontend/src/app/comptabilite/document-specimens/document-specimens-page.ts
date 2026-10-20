import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnDestroy,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import {
  FoldAsideLayoutComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldChoiceRowComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { saveBlob } from '../../shared/download/save-blob';
import {
  isSpecimenKey,
  SPECIMEN_GROUPS,
  SPECIMEN_LABELS,
  type SpecimenKey,
} from '../document-specimen-catalogue';
import { DocumentSpecimensService } from '../document-specimens.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Documents — planche d'exemples** (`documentation/comptabilite/planche-des-documents.md`).
 *
 * Un contrôle VISUEL : les bons chiffrés, les bons non chiffrés et la facture,
 * rendus par le serveur à partir de données d'exemple fixes — jamais une vraie
 * commande, rien d'écrit, rien d'envoyé. On choisit à gauche, on regarde à
 * droite, et « Ouvrir dans un onglet » sert à imprimer.
 *
 * Le PDF est lu par `HttpClient` (le jeton staff), puis montré par une URL
 * d'objet — révoquée au document suivant et à la sortie de l'écran.
 */
@Component({
  selector: 'app-document-specimens-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldAsideLayoutComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldChoiceRowComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './document-specimens-page.html',
  styleUrl: './document-specimens-page.scss',
})
export class DocumentSpecimensPage implements OnDestroy {
  private readonly api = inject(DocumentSpecimensService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly groups = SPECIMEN_GROUPS;
  protected readonly selected = signal<SpecimenKey>('order-sheet-pro');
  protected readonly label = computed(() => SPECIMEN_LABELS[this.selected()]);
  protected readonly state = signal<LoadState>('loading');
  protected readonly source = signal<SafeResourceUrl | null>(null);
  /** Le navigateur a refusé l'onglet : on propose de télécharger à la place. */
  protected readonly tabBlocked = signal(false);

  private blob: Blob | null = null;
  /** L'URL d'objet nue, gardée pour la révoquer — la version sûre ne la rend pas. */
  private objectUrl: string | null = null;
  /** Le rang de la dernière demande : une réponse plus ancienne n'écrase rien. */
  private request = 0;

  constructor() {
    void this.load();
  }

  ngOnDestroy(): void {
    this.revoke();
  }

  protected choose(key: string): void {
    if (!isSpecimenKey(key) || key === this.selected()) {
      return;
    }
    this.selected.set(key);
    void this.load();
  }

  protected async load(): Promise<void> {
    const request = ++this.request;
    this.state.set('loading');
    this.tabBlocked.set(false);
    try {
      const blob = await this.api.pdf(this.selected());
      if (request === this.request) {
        this.show(blob);
      }
    } catch {
      if (request === this.request) {
        this.state.set('error');
      }
    }
  }

  protected openInTab(): void {
    if (this.objectUrl !== null && window.open(this.objectUrl, '_blank') === null) {
      this.tabBlocked.set(true);
    }
  }

  protected download(): void {
    if (this.blob !== null) {
      saveBlob(this.blob, `exemple-${this.selected()}.pdf`);
    }
  }

  private show(blob: Blob): void {
    this.revoke();
    this.blob = blob;
    this.objectUrl = URL.createObjectURL(blob);
    // 🔴 `bypassSecurityTrustResourceUrl` est légitime ICI : l'URL est
    // FABRIQUÉE par nous (`URL.createObjectURL`) à partir d'octets que notre
    // propre serveur vient de rendre sur une route staff. Elle ne vient
    // d'aucune saisie, d'aucun paramètre de route, d'aucune réponse tierce.
    this.source.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
    this.state.set('ready');
  }

  private revoke(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.source.set(null);
    this.blob = null;
  }
}
