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
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import type { PaymentMandateView } from '@lfd/contracts';

import { BankAccountService } from '../bank-account/bank-account.service';
import { MandatesService } from '../mandat/mandates.service';
import { NotifyService } from '../../notify.service';
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
    FoldInlineConfirmComponent,
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
    // `xl` et non `lg` : on relit une page A4 dans un cadre, et à `lg` le
    // document arrivait à une largeur où les deux colonnes du formulaire EPC —
    // créancier à gauche, débiteur à droite — se lisaient à la loupe. C'est la
    // plus grande largeur disponible ; au-delà, il faudrait sortir du système.
    width: 'xl',
  };

  readonly data = input<MandatePreviewPanelData | undefined>();

  private readonly panel = inject<FoldPanelRef<void>>(FoldPanelRef);
  private readonly accounts = inject(BankAccountService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly state = signal<LoadState>('loading');
  protected readonly source = signal<SafeResourceUrl | null>(null);

  private objectUrl: string | null = null;
  private blob: Blob | null = null;

  private readonly mandates = inject(MandatesService);
  private readonly notify = inject(NotifyService);

  /**
   * Le mandat courant, lu **par le panneau** et non reçu de l'appelant.
   *
   * 🔴 Deux écrans l'ouvrent — la fiche et la section des zones facultatives —
   * et faire descendre le mandat par les deux aurait donné deux sources de
   * vérité sur « ce document est-il signable ». C'est exactement la question où
   * se tromper coûte le plus : une seule lecture, faite ici.
   */
  protected readonly mandate = signal<PaymentMandateView | null>(null);

  /** Le document porte-t-il une RUM ? Alors il se signe, et le filigrane est tombé. */
  protected readonly issued = computed(() => this.mandate()?.status === 'draft');

  protected readonly sending = signal(false);
  /** L'envoi est en DEUX temps : un courriel parti ne se rattrape pas. */
  protected readonly confirming = signal(false);

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
    if (this.blob === null || opened === undefined) {
      return;
    }
    // Le nom suit le document : « apercu- » tombe avec le filigrane. Un fichier
    // rangé sur un bureau perd son contexte, jamais son nom — et c'est le nom
    // qu'on lit en rouvrant un dossier de téléchargements un mois plus tard.
    const reference = this.mandate()?.reference ?? opened.companyId;
    saveBlob(
      this.blob,
      this.issued() ? `mandat-sepa-${reference}.pdf` : `apercu-mandat-sepa-${opened.companyId}.pdf`,
    );
  }

  /**
   * Envoie le mandat au client, en pièce jointe.
   *
   * ⚠️ **Un courriel parti est parti.** Le geste passe donc par une confirmation
   * en ligne, et pas par un bouton nu : c'est le seul endroit de cette fiche qui
   * atteigne quelqu'un d'extérieur.
   */
  protected async send(): Promise<void> {
    const opened = this.data();
    const mandate = this.mandate();
    if (opened === undefined || mandate === null) {
      return;
    }
    this.sending.set(true);
    try {
      await this.mandates.send(opened.companyId, mandate.id);
      this.notify.success('Mandat envoyé au client.');
      this.confirming.set(false);
    } catch (error) {
      this.notify.error(error, "Le mandat n'a pas pu être envoyé.");
    } finally {
      this.sending.set(false);
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
      // Les deux lectures en parallèle : le document, et ce qu'il faut en dire.
      // En série, le panneau afficherait le PDF avant de savoir s'il se signe —
      // donc le mauvais avertissement pendant un instant.
      const [blob, section] = await Promise.all([
        this.accounts.preview(companyId),
        this.mandates.section(companyId),
      ]);
      this.mandate.set(section.mandate);
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
