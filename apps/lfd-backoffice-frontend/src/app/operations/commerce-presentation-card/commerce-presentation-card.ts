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
import type { CommerceOperationView, EditCommerceOperationPayload } from '@lfd/contracts';
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
  EMPTY_LOCALIZED,
  type LocalizedDraft,
  localizedDraftOf,
  localizedOf,
  refusalOf,
  sameLocalized,
  shopDisplayPhrase,
} from '../commerce-operation-format';
import { CommerceOperationsService } from '../commerce-operations.service';
import { OperationImage } from '../operation-image/operation-image';
import {
  OperationImagePicker,
  type OperationImagePickerData,
} from '../operation-image-picker/operation-image-picker';

/**
 * **L'annonce** — ce que l'encart du rayon affiche : le nom, le chapeau,
 * l'image. La clé n'en fait pas partie, elle ne change jamais.
 *
 * L'image se CHOISIT dans la médiathèque (O3) ; l'opération n'envoie que son
 * adresse, et le texte alternatif reste celui de la médiathèque (plan, « Après
 * le lot 2 »). Une image retenue mais pas encore enregistrée se montre sans
 * texte alternatif : il sera lu au retour du serveur.
 */
@Component({
  selector: 'app-commerce-presentation-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInputComponent,
    FoldTextareaComponent,
    OperationImage,
  ],
  templateUrl: './commerce-presentation-card.html',
  styleUrl: './commerce-presentation-card.scss',
})
export class CommercePresentationCard {
  private readonly api = inject(CommerceOperationsService);
  private readonly panels = inject(FoldPanelHostService);

  readonly operation = input.required<CommerceOperationView>();
  /** Archivée, pas encore reprise, ou sans droit d'écrire : la carte se lit. */
  readonly locked = input(false);
  readonly saved = output<string>();

  protected readonly name = signal<LocalizedDraft>(EMPTY_LOCALIZED);
  protected readonly lede = signal<LocalizedDraft>(EMPTY_LOCALIZED);
  /** L'adresse de l'image retenue ; `null` : aucune. */
  protected readonly imageUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly shopDisplay = computed(() => shopDisplayPhrase(this.operation().shopDisplay));

  /** L'image enregistrée, si c'est encore elle qu'on montre — avec son texte alternatif. */
  protected readonly storedImage = computed(() => {
    const image = this.operation().image;
    return image !== null && image.url === this.imageUrl() ? image : null;
  });

  /** Ce qu'on enverrait — `null` tant qu'il manque le nom en français. */
  private readonly payload = computed<EditCommerceOperationPayload | null>(() => {
    const name = localizedOf(this.name());
    const url = this.imageUrl();
    return name === null
      ? null
      : { name, lede: localizedOf(this.lede()), image: url === null ? null : { url } };
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
        (payload.image?.url ?? null) === (view.image?.url ?? null)
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
      this.imageUrl.set(view.image?.url ?? null);
    });
  }

  protected setName(locale: keyof LocalizedDraft, value: string): void {
    this.name.update((draft) => ({ ...draft, [locale]: value }));
  }

  protected setLede(locale: keyof LocalizedDraft, value: string): void {
    this.lede.update((draft) => ({ ...draft, [locale]: value }));
  }

  protected chooseImage(): void {
    void this.panels
      .open<OperationImagePickerData, string>(OperationImagePicker, {
        data: { currentUrl: this.imageUrl() ?? '' },
      })
      .closed.then((url) => {
        if (url !== undefined) {
          this.imageUrl.set(url);
        }
      });
  }

  protected removeImage(): void {
    this.imageUrl.set(null);
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
      this.saved.emit('Annonce enregistrée.');
    } catch (error) {
      this.refusal.set(refusalOf(error, "L'annonce n'a pas pu être enregistrée."));
    } finally {
      this.busy.set(false);
    }
  }
}
