import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { EditOperationPayload, OperationImage, OperationView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
  FoldPanelHostService,
  FoldTextareaComponent,
} from 'fold-ng';

import {
  LibraryPicker,
  type LibraryPickerData,
  type PickedMedia,
} from '../../catalogue/library-picker/library-picker';
import {
  EMPTY_LOCALIZED,
  type LocalizedDraft,
  localizedDraftOf,
  localizedOf,
  refusalOf,
  sameLocalized,
} from '../operation-format';
import { OperationsService } from '../operations.service';

/**
 * **Présentation** — ce que l'annonce affiche : le nom, l'accroche, l'image.
 * La clé n'en fait pas partie, elle ne change jamais.
 *
 * L'image se CHOISIT dans la médiathèque, jamais ne s'y dépose : c'est le
 * sélecteur du référentiel, en mode une seule image. La médiathèque compte
 * ensuite l'opération parmi les porteurs de cette image.
 */
@Component({
  selector: 'app-presentation-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInputComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './presentation-card.html',
  styleUrl: './presentation-card.scss',
})
export class PresentationCard {
  private readonly api = inject(OperationsService);
  private readonly panels = inject(FoldPanelHostService);

  readonly operation = input.required<OperationView>();
  /** L'opération archivée ne se modifie plus : la carte se lit, sans Enregistrer. */
  readonly locked = input(false);
  readonly saved = output<string>();

  protected readonly name = signal<LocalizedDraft>(EMPTY_LOCALIZED);
  protected readonly lede = signal<LocalizedDraft>(EMPTY_LOCALIZED);
  protected readonly image = signal<OperationImage | null>(null);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** Ce qu'on enverrait — `null` tant qu'il manque le nom en français. */
  private readonly payload = computed<EditOperationPayload | null>(() => {
    const name = localizedOf(this.name());
    return name === null ? null : { name, lede: localizedOf(this.lede()), image: this.image() };
  });

  /** Enregistrer n'est cliquable que si la saisie diffère de ce qui est enregistré. */
  protected readonly changed = computed(() => {
    const payload = this.payload();
    const view = this.operation();
    return (
      payload !== null &&
      !(
        sameLocalized(payload.name, view.name) &&
        sameLocalized(payload.lede, view.lede) &&
        payload.image?.url === view.image?.url &&
        payload.image?.alt === view.image?.alt
      )
    );
  });

  protected readonly nameMissing = computed(() => this.name().fr.trim() === '');

  constructor() {
    // Relu à chaque nouvelle vue : après un enregistrement, la page relit
    // l'opération, et le brouillon repart de ce que le serveur a retenu.
    effect(() => {
      const view = this.operation();
      this.name.set(localizedDraftOf(view.name));
      this.lede.set(localizedDraftOf(view.lede));
      this.image.set(view.image);
    });
  }

  protected setName(locale: keyof LocalizedDraft, value: string): void {
    this.name.update((draft) => ({ ...draft, [locale]: value }));
  }

  protected setLede(locale: keyof LocalizedDraft, value: string): void {
    this.lede.update((draft) => ({ ...draft, [locale]: value }));
  }

  protected setAlt(alt: string): void {
    this.image.update((image) => (image === null ? null : { ...image, alt }));
  }

  /** Une image neuve repart sans alternative : celle de l'ancienne ne la décrit pas. */
  protected chooseImage(): void {
    const current = this.image();
    void this.panels
      .open<LibraryPickerData, readonly PickedMedia[]>(LibraryPicker, {
        data: { already: current === null ? [] : [current.url], single: true },
      })
      .closed.then((picked) => {
        const [chosen] = picked ?? [];
        if (chosen !== undefined) {
          this.image.set({ url: chosen.url, alt: '' });
        }
      });
  }

  protected removeImage(): void {
    this.image.set(null);
  }

  protected async save(): Promise<void> {
    const payload = this.payload();
    if (payload === null || this.locked()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await this.api.editPresentation(this.operation().key, payload);
      this.saved.emit('Présentation enregistrée.');
    } catch (error) {
      this.refusal.set(refusalOf(error, "La présentation n'a pas pu être enregistrée."));
    } finally {
      this.busy.set(false);
    }
  }
}
