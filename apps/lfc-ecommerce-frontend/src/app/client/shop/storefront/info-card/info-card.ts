import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { PublicStorefrontContent, StorefrontText } from '@lfd/contracts';
import {
  formatSpec,
  type MediaFit,
  type MediaSide,
  sideForShape,
  type StorefrontShape,
  type StorefrontTone,
  toneApplies,
} from '@lfd/storefront-layout';
import { FoldButtonComponent, FoldCardComponent } from 'fold-ng';

import { ClientLocale, type LocaleCode } from '../../../client-locale.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { mediaSrcset, sizedMedia, SHEET_WIDTHS } from '../../media-source';
import { operationShelfId } from '../../operations';
import { operationBadge } from '../operation-badge';
import { StorefrontActions } from '../storefront-actions';
import type { StorefrontRenderer } from '../storefront-renderers';

/** Le texte dans la langue du visiteur, le français sinon — il est toujours là. */
function localized(text: StorefrontText, locale: LocaleCode): string {
  const translated = text[locale];
  return translated !== undefined && translated.trim() !== '' ? translated : text.fr;
}

/**
 * **Une annonce de vitrine** — l'entrée `info` du registre : pastille, titre,
 * phrase, image, et le rayon qu'elle ouvre s'il y en a un
 * (`boutique-rayon-layout.md`, « Ce qu'un objet porte »).
 *
 * Elle a remplacé la tuile d'opération simulée (la tuile Noël, la bande
 * Pâques) : une info sur une tuile, c'est l'ancienne tuile Noël ; sur une
 * bande, l'ancienne bande Pâques. La forme arrive en entrée, et la mise en page
 * suit la place réelle de la case (container queries).
 *
 * Elle n'est PAS une carte interactive : une annonce sans rayon n'a rien à
 * ouvrir, et une carte `role="button"` qui ne mène nulle part mentirait.
 * L'action est le seul bouton, et il n'existe que si le rayon existe.
 *
 * **Liée à une opération** (D11 de `architecture-operations-datees.md`), elle
 * ouvre le rayon `op:<key>` — le même geste que les pastilles de rayon — et,
 * sans pastille saisie, elle calcule la sienne depuis l'état de l'opération.
 */
@Component({
  selector: 'app-info-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldButtonComponent],
  host: { '[class]': 'hostClasses()' },
  templateUrl: './info-card.html',
  styleUrl: './info-card.scss',
})
export class InfoCard implements StorefrontRenderer {
  readonly content = input.required<PublicStorefrontContent>();
  readonly shape = input.required<StorefrontShape>();
  readonly mediaFit = input.required<MediaFit>();
  readonly mediaSide = input.required<MediaSide>();
  readonly tone = input.required<StorefrontTone>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale).current;
  protected readonly actions = inject(StorefrontActions);

  /** Le contenu, s'il est bien une info — le registre ne l'appelle pas autrement. */
  private readonly info = computed(() => {
    const content = this.content();
    return content.kind === 'info' ? content : null;
  });

  protected readonly title = computed(() => {
    const info = this.info();
    return info === null ? '' : localized(info.title, this.locale());
  });

  /** La pastille saisie ; sinon celle que l'opération liée se calcule ; sinon aucune. */
  protected readonly badge = computed(() => {
    const info = this.info();
    if (info === null) {
      return null;
    }
    if (info.badge !== null) {
      return localized(info.badge, this.locale());
    }
    const operation = info.operation ?? null;
    return operation === null
      ? null
      : operationBadge(operation, new Date(), this.locale(), this.t());
  });

  protected readonly lede = computed(() => {
    const lede = this.info()?.lede ?? null;
    return lede === null ? null : localized(lede, this.locale());
  });

  protected readonly image = computed(() => this.info()?.image ?? null);

  protected readonly imageSrc = computed(() => {
    const image = this.image();
    return image === null ? null : sizedMedia(image.url, SHEET_WIDTHS[0]);
  });

  protected readonly imageSrcset = computed(() => {
    const image = this.image();
    return image === null ? '' : mediaSrcset(image.url, SHEET_WIDTHS);
  });

  /** Le texte alternatif ; vide quand la médiathèque n'en a pas — l'image est alors décorative. */
  protected readonly imageAlt = computed(() => {
    const alt = this.image()?.alt ?? null;
    return alt === null ? '' : localized(alt, this.locale());
  });

  /**
   * Le rayon qu'ouvre l'annonce : celui de son opération (`op:<key>`), sinon
   * le rayon lié, sinon aucun. L'action rendue par le serveur tranche ; une
   * réponse d'avant les opérations n'en porte pas, et le rayon lié suffit.
   */
  protected readonly linkShelf = computed(() => {
    const info = this.info();
    if (info === null) {
      return null;
    }
    const operationKey = info.operationKey ?? null;
    if (info.action === 'operation' || (info.action === undefined && operationKey !== null)) {
      return operationKey === null ? null : operationShelfId(operationKey);
    }
    return info.action === 'none' ? null : info.linkShelfKey;
  });

  /** La place de l'image : une colonne sur cinq par colonne couverte, la moitié en pile. */
  protected readonly sizes = computed(() => {
    const spec = formatSpec(this.shape());
    return `(min-width: 900px) ${String(spec.columns * 20)}vw, ${String(Math.min(spec.mobileColumns, 2) * 50)}vw`;
  });

  protected readonly hostClasses = computed(() => {
    const shape = this.shape();
    const side = sideForShape(shape, this.mediaSide());
    const tone = toneApplies(shape, [this.content()]) ? this.tone() : 'light';
    const tall = formatSpec(shape).rows > 1 ? ' tall' : '';
    const contain = this.mediaFit() === 'contain' ? ' contain' : '';
    // Sans image, une annonce en texte (2026-09-24) : ni côté ni cadrage n'ont
    // de sens, le texte prend toute la case sur le fond de son ton.
    const bare = this.imageSrc() === null || this.imageSrc() === '';
    // Sans image, AUCUN côté : « plein » posait son voile sombre en travers
    // d'une annonce qui n'a rien à voiler (vu le 2026-09-24).
    const placement = bare ? 'side-none bare' : `side-${side}`;
    return `shape-${shape} ${placement} tone-${tone}${tall}${contain}`;
  });
}
