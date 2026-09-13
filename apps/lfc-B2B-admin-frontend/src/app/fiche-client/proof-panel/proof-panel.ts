import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { MandatesService } from '../mandat/mandates.service';
import { saveBlob } from '../../shared/download/save-blob';

/** Ce que la fiche remet au panneau. */
export interface ProofPanelData {
  readonly companyId: string;
  /** Le nom du fichier déposé, pour le proposer tel quel au téléchargement. */
  readonly fileName: string;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Le mandat signé déposé**, regardé avant d'être classé.
 *
 * ## Pourquoi un panneau, alors qu'un téléchargement existait déjà
 *
 * Parce que télécharger une pièce pour vérifier qu'elle est la bonne est un
 * geste coûteux : il laisse un fichier sur un poste à chaque contrôle. Le cas
 * courant — « est-ce bien le mandat de ce client, est-il signé ? » — se répond
 * en regardant.
 *
 * ## 🔴 PDF ou image, et le rendu diffère
 *
 * Un client renvoie ce qu'il a sous la main : un PDF scanné, ou la photo du
 * papier prise au téléphone. Une `<iframe>` affiche le premier et propose de
 * télécharger le second sur certains navigateurs ; une `<img>` fait l'inverse.
 * Le type réel est donc relu dans le blob — il vient du serveur, qui l'a lui
 * -même retrouvé dans les octets descellés — et commande le rendu.
 *
 * ## Pourquoi un blob et pas une URL
 *
 * Un `src="/admin/…"` part **sans le jeton staff** : l'intercepteur ne voit que
 * les requêtes `HttpClient`, et le navigateur afficherait la page blanche d'un
 * 401. La pièce est donc récupérée en mémoire, puis donnée sous forme d'URL
 * d'objet — révoquée à la fermeture, faute de quoi elle resterait pour la durée
 * de l'onglet.
 */
@Component({
  selector: 'app-proof-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './proof-panel.html',
  styleUrl: './proof-panel.scss',
})
export class ProofPanel implements FoldPanelContent<ProofPanelData> {
  static readonly foldPanel: FoldPanelDefaults = {
    // CENTRÉ et large, comme l'aperçu du mandat : on REGARDE une page A4, on ne
    // remplit pas un formulaire à côté de la fiche.
    side: 'center',
    width: 'xl',
  };

  readonly data = input<ProofPanelData | undefined>();

  private readonly panel = inject<FoldPanelRef<void>>(FoldPanelRef);
  private readonly mandates = inject(MandatesService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly state = signal<LoadState>('loading');
  protected readonly source = signal<SafeResourceUrl | null>(null);
  protected readonly contentType = signal('');

  /** Une photo se rend en `<img>`, un PDF en `<iframe>`. */
  protected readonly isImage = computed(() => this.contentType().startsWith('image/'));

  private objectUrl: string | null = null;
  private blob: Blob | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.revoke();
    });
    effect(() => {
      const opened = this.data();
      if (opened !== undefined) {
        void this.load(opened.companyId);
      }
    });
  }

  protected download(): void {
    const opened = this.data();
    if (this.blob !== null && opened !== undefined) {
      saveBlob(this.blob, opened.fileName || 'mandat-signe.pdf');
    }
  }

  protected close(): void {
    this.panel.close();
  }

  protected async load(companyId = this.data()?.companyId): Promise<void> {
    if (companyId === undefined) {
      return;
    }
    this.state.set('loading');
    this.revoke();
    try {
      const blob = await this.mandates.proof(companyId);
      this.blob = blob;
      this.contentType.set(blob.type);
      this.objectUrl = URL.createObjectURL(blob);
      // `bypassSecurityTrustResourceUrl` sur une URL D'OBJET fabriquée à partir
      // d'octets reçus de notre propre API : rien d'utilisateur n'entre dans
      // cette chaîne.
      this.source.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  private revoke(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.blob = null;
    this.source.set(null);
  }
}
