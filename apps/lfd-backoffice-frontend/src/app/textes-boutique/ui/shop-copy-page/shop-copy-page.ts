import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldSearchComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { COPY_LOCALES, LOCALE_LABELS } from '../../rules/copy-text';

import { CopyNavigation } from '../../state/copy-navigation';
import { DraftWriter } from '../../state/draft-writer';
import { PreviewLink } from '../../state/preview-link';
import { ShopCopyStore } from '../../state/shop-copy-store';
import { CopyTexts } from '../copy-texts/copy-texts';
import { PublicationHistoryPanel } from '../publication-history-panel/publication-history-panel';
import { ShopPreview } from '../shop-preview/shop-preview';
import { SpaceTree } from '../space-tree/space-tree';

/**
 * **Contenu › Textes de la boutique** (`plan-textes-de-la-boutique.md`, §7) —
 * les espaces, les textes de l'espace dans la langue choisie, et l'aperçu qui suit
 * la frappe. En tête : la langue, la recherche, ce qui attend, Publier, l'historique.
 *
 * Sous `b2b_storefront:read` (la route) ; écrire et publier demandent `:write`,
 * que le store lit pour ouvrir ou fermer les champs.
 */
const LOCALE_OPTIONS: readonly FoldViewToggleOption[] = COPY_LOCALES.map((locale) => ({
  value: locale,
  label: locale.toUpperCase(),
  ariaLabel: LOCALE_LABELS[locale],
}));

/** « Chercher un texte en … » */
const LOCALE_NAMES = { fr: 'français', en: 'anglais', it: 'italien' } as const;

@Component({
  selector: 'app-shop-copy-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ShopCopyStore, CopyNavigation, DraftWriter, PreviewLink],
  imports: [
    CopyTexts,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldSearchComponent,
    FoldViewToggleComponent,
    ShopPreview,
    SpaceTree,
  ],
  templateUrl: './shop-copy-page.html',
  styleUrl: './shop-copy-page.scss',
})
export class ShopCopyPage implements OnInit {
  protected readonly store = inject(ShopCopyStore);
  protected readonly navigation = inject(CopyNavigation);
  private readonly writer = inject(DraftWriter);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly localeOptions = LOCALE_OPTIONS;
  protected readonly localeNames = LOCALE_NAMES;

  ngOnInit(): void {
    void this.store.load();
  }

  /** Publier envoie d'abord la frappe en attente : on publie ce qu'on voit. */
  protected async publish(): Promise<void> {
    await this.writer.flush();
    await this.store.publish();
  }

  protected openHistory(): void {
    this.panels.open(PublicationHistoryPanel);
  }

  protected pendingLabel(count: number): string {
    return count === 1 ? '1 modification à publier' : `${count} modifications à publier`;
  }
}
