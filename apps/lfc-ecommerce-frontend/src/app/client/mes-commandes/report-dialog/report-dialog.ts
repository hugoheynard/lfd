import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
// Valeurs par le sous-chemin sans zod (budget `cloudflare`).
import { REQUEST_PHOTO_BOUNDS, type PublicRequestReasonView } from '@lfd/contracts/shop-values';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldFileDropzoneComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
  FoldTextareaComponent,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { ClientAudience } from '../../client-audience.service';
import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { dialogSide } from '../../panel-side';
import { ContactGateway } from '../../shop/contact.gateway';
import { localizedOr } from '../../shop/contact-settings.store';
import { OrderProblemGateway } from '../order-problem.gateway';

/** La commande visée : l'identifiant pour l'API, la référence pour l'écran. */
export interface ReportDialogData {
  readonly orderId: string;
  readonly reference: string;
}

/** Une photo retenue, avec son aperçu local (révoqué au retrait et à la fermeture). */
interface PickedPhoto {
  readonly file: File;
  readonly preview: string;
}

type ReasonsState = 'loading' | 'failed' | 'ready';

const ACCEPTED: readonly string[] = REQUEST_PHOTO_BOUNDS.contentTypes;

/**
 * Pourquoi une photo est refusée AVANT l'envoi, ou `null`. Les mêmes bornes que
 * le serveur (`REQUEST_PHOTO_BOUNDS`) : un refus après un téléversement de
 * 5 Mo sur un réseau de montagne coûte plus qu'un message tout de suite.
 */
export function photoIssue(file: File): 'type' | 'size' | null {
  if (!ACCEPTED.includes(file.type)) {
    return 'type';
  }
  return file.size > REQUEST_PHOTO_BOUNDS.maxBytes ? 'size' : null;
}

/**
 * **« Signaler un problème »** sur une commande retirée ou livrée
 * (`documentation/contenu-ecommerce/demandes-clients.md`, §3.2, §6, §7).
 *
 * Un motif `order_problem` du public de l'espace (réglé au back-office), un
 * mot facultatif, jusqu'à trois photos. Le message part AVEC la commande :
 * rien à réexpliquer. Saisie ⇒ dialogue fold par {@link dialogSide} ; il
 * remplace la feuille `ClientDialog` qui n'envoyait rien.
 *
 * Les photos se prennent ou se choisissent par `fold-file-dropzone` — sans
 * `capture`, le téléphone propose l'appareil photo ET la galerie.
 */
@Component({
  selector: 'app-report-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldFileDropzoneComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './report-dialog.html',
  styleUrl: './report-dialog.scss',
})
export class ReportDialog {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  /** Ouvre le signalement. Rend `true` s'il est parti, `undefined` sinon. */
  static open(
    panels: FoldPanelHostService,
    data: ReportDialogData,
  ): FoldPanelRef<boolean | undefined> {
    return panels.open<ReportDialogData, boolean | undefined>(ReportDialog, {
      side: dialogSide(),
      data,
    });
  }

  readonly data = input.required<ReportDialogData>();

  private readonly ref = inject(FoldPanelRef);
  private readonly reasonsGateway = inject(ContactGateway);
  private readonly problems = inject(OrderProblemGateway);
  private readonly notify = inject(NotifyService);
  private readonly audience = inject(ClientAudience).shown;
  private readonly locale = inject(ClientLocale).current;

  protected readonly t = inject(ClientCopyService).t;
  protected readonly accept = ACCEPTED.join(',');
  protected readonly maxPhotos = REQUEST_PHOTO_BOUNDS.maxCount;

  protected readonly state = signal<ReasonsState>('loading');
  private readonly reasons = signal<readonly PublicRequestReasonView[]>([]);

  protected readonly reasonOptions = computed(() =>
    this.reasons().map((reason) => ({
      value: reason.id,
      label: localizedOr(reason.label, this.locale(), reason.label.fr),
    })),
  );

  protected readonly reasonId = signal<string | null>(null);
  protected readonly message = signal('');
  protected readonly photos = signal<readonly PickedPhoto[]>([]);
  /** Ce qui a été écarté au dernier choix de photos — dit tout de suite, pas à l'envoi. */
  protected readonly photoRejects = signal<readonly string[]>([]);

  protected readonly sending = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly remaining = computed(() => this.maxPhotos - this.photos().length);
  protected readonly canSend = computed(() => !this.sending() && this.reasonId() !== null);

  constructor() {
    void this.load();
    inject(DestroyRef).onDestroy(() => this.photos().forEach(revoke));
  }

  protected remainingHint(): string {
    return fill(this.t().orders.photoRemaining, { n: String(this.remaining()) });
  }

  protected removeLabel(photo: PickedPhoto): string {
    return fill(this.t().orders.photoRemove, { name: photo.file.name });
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.reasons.set(await this.reasonsGateway.reasons('order_problem', this.audience()));
      this.state.set('ready');
    } catch {
      this.state.set('failed');
    }
  }

  /** Retient les photos valables dans la limite restante, et dit pourquoi les autres ne le sont pas. */
  protected pick(files: readonly File[]): void {
    const copy = this.t().orders;
    const rejects: string[] = [];
    const kept: PickedPhoto[] = [];
    for (const file of files) {
      const issue = photoIssue(file);
      if (issue !== null) {
        rejects.push(
          fill(issue === 'type' ? copy.photoBadType : copy.photoTooBig, { name: file.name }),
        );
      } else if (this.photos().length + kept.length >= this.maxPhotos) {
        rejects.push(fill(copy.photoTooMany, { n: String(this.maxPhotos) }));
        break;
      } else {
        kept.push({ file, preview: URL.createObjectURL(file) });
      }
    }
    this.photos.update((photos) => [...photos, ...kept]);
    this.photoRejects.set(rejects);
  }

  protected remove(photo: PickedPhoto): void {
    revoke(photo);
    this.photos.update((photos) => photos.filter((each) => each !== photo));
    this.photoRejects.set([]);
  }

  protected async send(): Promise<void> {
    const reasonId = this.reasonId();
    if (!this.canSend() || reasonId === null) {
      return;
    }
    this.sending.set(true);
    this.refusal.set(null);
    const refusal = await this.problems.report(this.data().orderId, {
      reasonId,
      message: this.message().trim(),
      photos: this.photos().map((photo) => photo.file),
    });
    this.sending.set(false);
    if (refusal === null) {
      this.notify.success(this.t().orders.reportSent);
      this.ref.close(true);
    } else {
      this.refusal.set(refusal === '' ? this.t().orders.reportRefused : refusal);
    }
  }

  protected cancel(): void {
    this.ref.close(undefined);
  }
}

function revoke(photo: PickedPhoto): void {
  URL.revokeObjectURL(photo.preview);
}
