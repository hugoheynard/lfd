import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnDestroy,
  type OnInit,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import {
  FoldButtonComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { saveBlob } from '../../../../shared/download/save-blob';

/** Ce que la fiche remet au panneau : les octets déjà lus, et de quoi les nommer. */
export interface MandatePanelData {
  /** Le PDF, déjà rapporté par la fiche — le panneau ne fait aucune requête. */
  readonly blob: Blob;
  /** L'entité dont on regarde le mandat, rappelée sous le titre. */
  readonly entityName: string;
  /** Le nom sous lequel « Télécharger » l'enregistre. */
  readonly fileName: string;
}

/**
 * **Le mandat SEPA d'exemple, REGARDÉ dans la page** — plus dans un onglet.
 *
 * Contrôler une adresse ou un ICS sur la fiche imprimée est un aller-retour :
 * on regarde, on ferme, on corrige. Un onglet séparé fait perdre la fiche de
 * vue, se fait bloquer par les bloqueurs de fenêtres, et laisse au navigateur
 * le soin de dire quand le document n'est plus regardé — ce qu'il ne dit
 * jamais. Un panneau modal le dit : sa fermeture EST cet instant.
 *
 * 🔴 **Un panneau et non un dialogue centré parce que fold n'a pas de
 * dialogue** : `fold-panel-host` est la seule surface d'overlay du design
 * system (elle rend bien un `role="dialog"` avec sa barrière modale). Le
 * panneau est ouvert en `xl` (820 px) et en surface `solid` : un A4 derrière du
 * verre dépoli ne se lit pas, et un A4 dans 490 px ne se lit pas non plus.
 */
@Component({
  selector: 'app-mandate-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldPanelFooterComponent, FoldPanelHeaderComponent],
  templateUrl: './mandate-panel.html',
  styleUrl: './mandate-panel.scss',
})
export class MandatePanel implements FoldPanelContent<MandatePanelData>, OnInit, OnDestroy {
  /**
   * La forme INTRINSÈQUE du panneau, déclarée sur la classe plutôt qu'au point
   * d'appel : un document A4 est large et opaque partout où on l'ouvre, ce
   * n'est pas une décision de l'appelant.
   */
  static readonly foldPanel: FoldPanelDefaults = { width: 'xl', surface: 'solid' };

  private readonly sanitizer = inject(DomSanitizer);
  private readonly panel = inject(FoldPanelRef);

  readonly data = input.required<MandatePanelData>();

  /** L'URL d'objet nue, gardée pour la révoquer — la version sûre ne la rend pas. */
  private objectUrl: string | null = null;

  protected readonly source = signal<SafeResourceUrl | null>(null);

  ngOnInit(): void {
    this.objectUrl = URL.createObjectURL(this.data().blob);
    // 🔴 `bypassSecurityTrustResourceUrl` est légitime ICI, et la raison doit
    // rester écrite : l'URL est FABRIQUÉE par nous (`URL.createObjectURL`) à
    // partir d'octets que notre propre serveur vient de rendre sur une route
    // staff. Elle ne vient d'aucune saisie, d'aucun paramètre de route,
    // d'aucune réponse tierce — il n'y a donc rien à assainir. Un
    // `bypassSecurityTrust*` sans cette phrase est ce qui rend le suivant
    // indéfendable.
    this.source.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
  }

  /**
   * La révocation se fait À LA FERMETURE, pas après un délai.
   *
   * C'est ce que le panneau apporte par rapport à l'onglet : sa destruction est
   * l'instant exact où plus personne ne regarde le document. L'ancien
   * `openBlob` devait deviner ce moment avec un `setTimeout` d'une minute —
   * trop tôt il coupait l'URL sous un onglet en cours de chargement, trop tard
   * il gardait dix PDF en mémoire sur un écran laissé ouvert la journée.
   */
  ngOnDestroy(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  /**
   * Le même document, enregistré — sans second aller-retour au serveur : les
   * octets sont déjà là, et les redemander pourrait rendre un autre fichier.
   */
  protected download(): void {
    const { blob, fileName } = this.data();
    saveBlob(blob, fileName);
  }

  protected close(): void {
    this.panel.close();
  }
}
