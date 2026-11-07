import { computed, inject, Injectable, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import type {
  MailDocumentBlockPreviewPayload,
  MailDocumentBlockPreviewView,
} from '@lfd/mail-blocks';

import { MailEditorService } from '../data/mail-editor.service';

/** La pause dans les gestes avant de redemander le rendu — celle de l'écriture des phrases. */
export const BLOCK_PREVIEW_DEBOUNCE_MS = 800;

/**
 * **Le rendu bloc par bloc du canevas** (plan `plan-editeur-par-blocs.md`,
 * § 22, S5f) : `POST …/block-previews`, redemandé après une pause, et le
 * dernier demandé l'emporte — une réponse plus ancienne qui arrive après est
 * jetée. Un échec garde le rendu précédent à l'écran et le dit.
 *
 * Fourni par la page d'un e-mail.
 */
@Injectable()
export class MailBlockPreviewsStore {
  private readonly api = inject(MailEditorService);

  readonly view = signal<MailDocumentBlockPreviewView | null>(null);
  readonly loading = signal(false);
  /** Le dernier refus du serveur, tel qu'il l'a dit ; `null` après un rendu réussi. */
  readonly error = signal<string | null>(null);

  /** Les fragments par bloc (`MailBlock.id`). */
  readonly fragments = computed(
    () => new Map((this.view()?.blocks ?? []).map((block) => [block.blockId, block.html])),
  );

  private timer: ReturnType<typeof setTimeout> | undefined;
  private sequence = 0;

  /** Demande un rendu après `delay` ms ; une nouvelle demande remplace celle qui attend. */
  request(template: string, payload: MailDocumentBlockPreviewPayload, delay = 0): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.render(template, payload);
    }, delay);
  }

  async render(template: string, payload: MailDocumentBlockPreviewPayload): Promise<void> {
    const sequence = ++this.sequence;
    this.loading.set(true);
    try {
      const view = await this.api.blockPreviews(template, payload);
      if (sequence === this.sequence) {
        this.view.set(view);
        this.error.set(null);
      }
    } catch (error) {
      if (sequence === this.sequence) {
        this.error.set(httpErrorMessage(error, 'L’e-mail n’a pas pu être rendu.'));
      }
    } finally {
      if (sequence === this.sequence) {
        this.loading.set(false);
      }
    }
  }

  /** Oublie le rendu d'un autre e-mail. */
  clear(): void {
    clearTimeout(this.timer);
    this.sequence++;
    this.view.set(null);
    this.error.set(null);
    this.loading.set(false);
  }
}
