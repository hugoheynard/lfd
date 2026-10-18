import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  type OnDestroy,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import type { VitrineNoticePreviewView, VitrineSubscriberView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldFieldsetComponent,
  FoldInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTextareaComponent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { VitrineWebhookService } from '../vitrine-webhook.service';
import { noticeSelection, reachable, vitrineNoticeIssue } from '../vitrine-notice-format';

/**
 * **Notifier les abonnés** — un e-mail aux contacts des agences, en deux
 * temps : la saisie, puis l'APERÇU (l'e-mail rendu par le serveur et la
 * liste des adresses) avant un « Envoyer » explicite. Rien ne part sans.
 *
 * La clé d'idempotence est tirée à l'entrée dans l'aperçu : un double clic
 * sur « Envoyer » retrouve la même annonce ; revenir modifier en tire une
 * neuve, puisque ce n'est plus le même e-mail.
 */
@Component({
  selector: 'app-vitrine-notice-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldFieldsetComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './vitrine-notice-panel.html',
  styleUrl: './vitrine-notice-panel.scss',
})
export class VitrineNoticePanel implements OnDestroy {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'lg', surface: 'solid' };

  /** Les abonnés de l'écran, coupés compris. */
  readonly data = input.required<readonly VitrineSubscriberView[]>();

  private readonly api = inject(VitrineWebhookService);
  private readonly panel = inject(FoldPanelRef);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly subject = signal('');
  protected readonly message = signal('');
  protected readonly selected = linkedSignal(() => new Set(reachable(this.data())));
  protected readonly preview = signal<VitrineNoticePreviewView | null>(null);
  protected readonly frame = signal<SafeResourceUrl | null>(null);
  protected readonly working = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly issue = computed(() =>
    vitrineNoticeIssue({
      subject: this.subject(),
      message: this.message(),
      selectedCount: this.selected().size,
    }),
  );

  private idempotencyKey = '';
  private objectUrl: string | null = null;

  protected toggle(id: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(id);
    else next.delete(id);
    this.selected.set(next);
  }

  protected async showPreview(): Promise<void> {
    if (this.issue() !== '' || this.working()) return;
    await this.attempt('L’aperçu n’a pas pu être préparé.', async () => {
      const preview = await this.api.previewNotice(this.draft());
      this.idempotencyKey = crypto.randomUUID();
      this.showFrame(preview.html);
      this.preview.set(preview);
    });
  }

  protected async send(): Promise<void> {
    if (this.preview() === null || this.working()) return;
    await this.attempt('L’annonce n’a pas pu être envoyée.', async () => {
      const id = await this.api.sendNotice({
        ...this.draft(),
        idempotencyKey: this.idempotencyKey,
      });
      this.panel.close(id);
    });
  }

  protected edit(): void {
    this.preview.set(null);
    this.refusal.set(null);
  }

  protected cancel(): void {
    this.panel.close(undefined);
  }

  ngOnDestroy(): void {
    this.releaseFrame();
  }

  private draft(): {
    subject: string;
    message: string;
    subscriberIds: string[] | null;
  } {
    const selection = noticeSelection(this.data(), this.selected());
    return {
      subject: this.subject().trim(),
      message: this.message().trim(),
      subscriberIds: selection === null ? null : [...selection],
    };
  }

  private async attempt(fallback: string, gesture: () => Promise<void>): Promise<void> {
    this.working.set(true);
    this.refusal.set(null);
    try {
      await gesture();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, fallback));
    } finally {
      this.working.set(false);
    }
  }

  private showFrame(html: string): void {
    this.releaseFrame();
    this.objectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    // 🔴 `bypassSecurityTrustResourceUrl` est légitime ICI : l'URL est
    // FABRIQUÉE par nous (`URL.createObjectURL`) à partir du HTML que notre
    // serveur vient de rendre — le texte saisi y est échappé par le gabarit —,
    // et l'iframe est `sandbox` sans aucun droit : aucun script n'y tourne.
    this.frame.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
  }

  private releaseFrame(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
