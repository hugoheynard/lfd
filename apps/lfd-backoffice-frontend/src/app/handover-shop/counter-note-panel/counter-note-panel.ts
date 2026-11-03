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

import { CounterDeliveryNoteService } from '../../comptoir/counter-delivery-note.service';
import { CounterOrderSheetService } from '../../comptoir/counter-order-sheet.service';
import { blobRefusalMessage } from '../../shared/download/blob-refusal';

/** Les deux documents d'une commande que le comptoir ouvre. */
export type CounterDocument = 'order' | 'delivery';

/** La commande, et lequel de ses deux bons on montre. */
export interface CounterNotePanelData {
  readonly orderId: string;
  /** Le numéro lu dans le rail, pour titrer sans relire la commande. */
  readonly reference: string;
  readonly document: CounterDocument;
}

/** Le titre du dialogue, par document. */
export const COUNTER_DOCUMENT_TITLES: Readonly<Record<CounterDocument, string>> = {
  order: 'Bon de commande',
  delivery: 'Bon de livraison',
};

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Un bon chiffré de la commande**, dans un dialogue, prêt à imprimer pour le
 * client (Hugo, 2026-11-03) : le bon de commande — celui que le client a reçu —
 * ou le bon de livraison — ce qui est vraiment parti.
 *
 * Il remplace la fiche sans prix d'avant, qui redisait ce que le rail montre
 * déjà. Le BL naît à la remise : le rail le grise avant, et son service
 * réessaie le temps que le bon s'écrive.
 */
@Component({
  selector: 'app-counter-note-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './counter-note-panel.html',
  styleUrl: './counter-note-panel.scss',
})
export class CounterNotePanel implements FoldPanelContent<CounterNotePanelData> {
  static readonly foldPanel: FoldPanelDefaults = {
    // CENTRÉ et large, comme l'aperçu du mandat : on lit une page A4.
    side: 'center',
    // Plus large que `xl`, la plus grande taille nommée (Hugo, 2026-11-03 :
    // « un plus gros dialog ») : une page A4 se lit à sa taille, sans loupe.
    // Fold borne un panneau à la fenêtre, donc rien ne déborde sur un écran
    // plus étroit.
    width: 1100,
  };

  readonly data = input<CounterNotePanelData | undefined>();

  private readonly panel = inject<FoldPanelRef<void>>(FoldPanelRef);
  private readonly notes = inject(CounterDeliveryNoteService);
  private readonly sheets = inject(CounterOrderSheetService);

  protected readonly title = computed(
    () => COUNTER_DOCUMENT_TITLES[this.data()?.document ?? 'order'],
  );
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly state = signal<LoadState>('loading');
  protected readonly source = signal<SafeResourceUrl | null>(null);
  protected readonly refusal = signal<string | null>(null);

  private objectUrl: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.revoke();
    });
    effect(() => {
      const opened = this.data();
      if (opened !== undefined) {
        void this.load();
      }
    });
  }

  protected close(): void {
    this.panel.close();
  }

  protected async load(): Promise<void> {
    const opened = this.data();
    if (opened === undefined) {
      return;
    }
    this.state.set('loading');
    this.refusal.set(null);
    // Un « Réessayer » remplace le document : l'ancienne URL d'objet tombe.
    this.revoke();
    try {
      const blob =
        opened.document === 'delivery'
          ? await this.notes.clientPdf(opened.orderId)
          : await this.sheets.pdf(opened.orderId);
      this.objectUrl = URL.createObjectURL(blob);
      this.source.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
      this.state.set('ready');
    } catch (error) {
      this.refusal.set(await blobRefusalMessage(error));
      this.state.set('error');
    }
  }

  private revoke(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.source.set(null);
  }
}
