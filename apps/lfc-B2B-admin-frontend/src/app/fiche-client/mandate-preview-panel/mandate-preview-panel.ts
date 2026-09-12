import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { BankAccountService } from '../bank-account/bank-account.service';
import { saveBlob } from '../../shared/download/save-blob';

/** Ce que la fiche remet au panneau. */
export interface MandatePreviewPanelData {
  readonly companyId: string;
  /** Raison sociale, pour titrer sans relire la fiche. */
  readonly companyLabel: string;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **L'aperçu du mandat SEPA d'un client**, dans un dialog central.
 *
 * ## 🔴 Ce document n'est PAS à faire signer, et le dit deux fois
 *
 * Il porte « EXEMPLE » en travers de la page — c'est le rendu du serveur, pas
 * une décoration d'écran — et le panneau le répète en toutes lettres. Aucune RUM
 * n'est frappée : une signature apposée dessus créerait un mandat sans
 * référence, inutilisable, mais que le client croirait avoir donné.
 *
 * Le répéter à l'écran alors que le filigrane est déjà là n'est pas redondant :
 * le filigrane voyage avec le fichier, la phrase voyage avec le geste. C'est
 * celle-ci qu'on lit avant de cliquer sur « Télécharger ».
 *
 * ## Pourquoi un blob et pas une URL
 *
 * Une `<iframe src="/admin/…">` part **sans le jeton staff** : l'intercepteur ne
 * voit que les requêtes `HttpClient`, et le navigateur afficherait la page
 * blanche d'un 401. Le PDF est donc récupéré en mémoire, puis donné à l'iframe
 * sous forme d'URL d'objet — et révoqué à la fermeture, faute de quoi il
 * resterait pour la durée de l'onglet.
 */
@Component({
  selector: 'app-mandate-preview-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './mandate-preview-panel.html',
  styleUrl: './mandate-preview-panel.scss',
})
export class MandatePreviewPanel implements FoldPanelContent<MandatePreviewPanelData> {
  static readonly foldPanel: FoldPanelDefaults = {
    // CENTRÉ : on REGARDE un document, on ne remplit pas un formulaire à côté de
    // la fiche. Un panneau latéral rendrait une page A4 sur une colonne étroite,
    // c'est-à-dire illisible — et l'aperçu n'existe que pour relire.
    side: 'center',
    width: 'lg',
  };

  readonly data = input<MandatePreviewPanelData | undefined>();

  private readonly panel = inject<FoldPanelRef<void>>(FoldPanelRef);
  private readonly accounts = inject(BankAccountService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly state = signal<LoadState>('loading');
  protected readonly source = signal<SafeResourceUrl | null>(null);

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
      saveBlob(this.blob, `apercu-mandat-sepa-${opened.companyId}.pdf`);
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
    // Une seconde composition remplace la première : sans cela, l'URL d'objet
    // précédente resterait pour la durée de l'onglet — un PDF complet à chaque
    // « Réessayer ».
    this.revoke();
    try {
      const blob = await this.accounts.preview(companyId);
      this.blob = blob;
      this.objectUrl = URL.createObjectURL(blob);
      // `bypassSecurityTrustResourceUrl` sur une URL D'OBJET que nous venons de
      // fabriquer à partir d'octets reçus de notre propre API : rien
      // d'utilisateur n'entre dans cette chaîne. C'est la seule forme sous
      // laquelle Angular accepte un `src` d'iframe.
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
  }
}
