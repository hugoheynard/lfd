import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type {
  PublishedCatalogView,
  PublishedEntryView,
  SubAccountMenuBody,
  SubAccountMenuEntry,
  SubAccountMenuLevel,
  SubAccountMenuMode,
  SubAccountOffMenuDisplay,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldViewToggleComponent,
  type FoldBadgeVariant,
  type FoldViewToggleOption,
} from 'fold-ng';

import {
  articlesOf,
  draftOf,
  effectAt,
  isOpenUnder,
  type MenuDraft,
  type NodeEffect,
  OPEN_DRAFT,
  sameDraft,
  soldToPros,
  staleEntries,
  withEffect,
} from '../sub-account-menu-draft';

/** Une déclinaison sous son produit. */
interface VariantRow {
  readonly sku: string;
  readonly name: string;
  readonly effect: NodeEffect;
  readonly open: boolean;
}

/** Un produit, et ses déclinaisons quand il en a plusieurs. */
interface ProductRow {
  readonly productSku: string;
  readonly name: string;
  readonly effect: NodeEffect;
  /** « 2 / 3 ouvertes », ou « Ouvert » / « Hors carte » pour une seule déclinaison. */
  readonly openLabel: string;
  readonly openTone: FoldBadgeVariant;
  readonly variants: readonly VariantRow[];
}

interface FamilyBlock {
  readonly id: string;
  readonly name: string;
  readonly effect: NodeEffect;
  readonly products: readonly ProductRow[];
}

interface CopyNotice {
  readonly variant: 'info' | 'alert';
  readonly text: string;
}

/** Un site dont on peut reprendre la carte. */
export interface MenuSource {
  readonly value: string;
  readonly label: string;
}

const NODE_EFFECTS: readonly NodeEffect[] = ['inherit', 'include', 'exclude'];
const MODES: readonly SubAccountMenuMode[] = ['except', 'only'];
const OFF_MENU_DISPLAYS: readonly SubAccountOffMenuDisplay[] = ['visible_locked', 'hidden'];

const EFFECT_LABELS: Readonly<Record<NodeEffect, string>> = {
  inherit: 'Hérite',
  include: 'Inclus',
  exclude: 'Exclu',
};

const LEVEL_LABELS: Readonly<Record<SubAccountMenuLevel, string>> = {
  family: 'Famille',
  product: 'Produit',
  sku: 'SKU',
};

const MODE_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'except', label: 'Tout, sauf les exclusions (liste noire)' },
  { value: 'only', label: 'Seulement les inclusions (liste blanche)' },
];

const OFF_MENU_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'visible_locked', label: 'Visible, non commandable' },
  { value: 'hidden', label: 'Absent' },
];

/**
 * **L'éditeur d'une carte**, aux trois grains (`carte-des-sites.md`, § 3.3) —
 * celle d'un site comme la carte commune d'un principal (§ 6.1) : les deux ont
 * la même forme, seul l'endroit où elles s'enregistrent diffère.
 *
 * L'éditeur tient le brouillon et le compare à `initial` ; l'écran qui
 * l'emploie fournit `save`, qui écrit (sous sa clé d'intention) et lève au
 * refus. Sans `canWrite`, la carte se lit : ni réglage, ni bouton. `unsaved`
 * dit que la carte montrée n'est pas encore posée à cet endroit (une carte
 * propre partie de la carte commune) : Enregistrer est alors cliquable sans
 * changement.
 */
@Component({
  selector: 'app-menu-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDisclosureComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './menu-editor.html',
  styleUrl: './menu-editor.scss',
})
export class MenuEditor {
  readonly catalogue = input.required<PublishedCatalogView>();
  readonly initial = input.required<MenuDraft>();
  readonly canWrite = input(false);
  readonly unsaved = input(false);
  /** À qui la carte s'applique, dans le résumé : « à ce site », « à ses sites ». */
  readonly audience = input('à ce site');
  readonly settingsSubtitle = input('');
  readonly saveLabel = input('Enregistrer la carte');
  readonly save = input<((draft: MenuDraft) => Promise<void>) | null>(null);
  /** Les sites dont on peut reprendre la carte (Q4), et comment la lire. */
  readonly sources = input<readonly MenuSource[]>([]);
  readonly readSource = input<((siteId: string) => Promise<SubAccountMenuBody | null>) | null>(
    null,
  );

  private readonly baseline = signal<MenuDraft>(OPEN_DRAFT);
  protected readonly draft = signal<MenuDraft>(OPEN_DRAFT);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly copyNotice = signal<CopyNotice | null>(null);
  protected readonly copiedFrom = signal<string | null>(null);

  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly offMenuOptions = OFF_MENU_OPTIONS;
  protected readonly effectOptions: readonly FoldViewToggleOption[] = NODE_EFFECTS.map((value) => ({
    value,
    label: EFFECT_LABELS[value],
  }));

  protected readonly dirty = computed(
    () => this.unsaved() || !sameDraft(this.draft(), this.baseline()),
  );

  protected readonly modeLabel = computed(
    () => MODE_OPTIONS.find((option) => option.value === this.draft().mode)?.label ?? '',
  );
  protected readonly offMenuLabel = computed(
    () => OFF_MENU_OPTIONS.find((option) => option.value === this.draft().offMenu)?.label ?? '',
  );

  protected readonly families = computed<readonly FamilyBlock[]>(() => {
    const catalogue = this.catalogue();
    const draft = this.draft();
    return catalogue.shelves.map((shelf) => ({
      id: shelf.categoryId,
      name: shelf.name ?? shelf.categoryId,
      effect: effectAt(draft, 'family', shelf.categoryId),
      products: catalogue.entries
        .filter((entry) => entry.categoryId === shelf.categoryId)
        .filter((entry) => entry.variants.some(soldToPros))
        .map((entry) => productRowOf(draft, entry)),
    }));
  });

  protected readonly summary = computed(() => {
    const articles = this.catalogue().entries.flatMap(articlesOf);
    const open = articles.filter((article) => isOpenUnder(this.draft(), article)).length;
    return `${String(open)} articles ouverts ${this.audience()} sur ${String(articles.length)} vendus aux pros.`;
  });

  /** « Seulement » sans entrée ferme tout : permis, et dit (§ 3.3). */
  protected readonly closedAll = computed(
    () => this.draft().mode === 'only' && this.draft().entries.length === 0,
  );

  protected readonly stale = computed(() => staleEntries(this.draft(), this.catalogue()));

  constructor() {
    effect(() => {
      const initial = this.initial();
      untracked(() => {
        this.baseline.set(initial);
        this.draft.set(initial);
        this.refusal.set(null);
        this.copyNotice.set(null);
        this.copiedFrom.set(null);
      });
    });
  }

  protected effectLabel(effect: NodeEffect): string {
    return EFFECT_LABELS[effect];
  }

  protected levelLabel(level: SubAccountMenuLevel): string {
    return LEVEL_LABELS[level];
  }

  protected setMode(value: string): void {
    const mode = MODES.find((candidate) => candidate === value);
    if (mode !== undefined) {
      this.draft.update((draft) => ({ ...draft, mode }));
    }
  }

  protected setOffMenu(value: string): void {
    const offMenu = OFF_MENU_DISPLAYS.find((candidate) => candidate === value);
    if (offMenu !== undefined) {
      this.draft.update((draft) => ({ ...draft, offMenu }));
    }
  }

  protected setEffect(level: SubAccountMenuLevel, ref: string, value: string): void {
    const effect = NODE_EFFECTS.find((candidate) => candidate === value);
    if (effect !== undefined) {
      this.draft.update((draft) => withEffect(draft, level, ref, effect));
    }
  }

  protected remove(entry: SubAccountMenuEntry): void {
    this.draft.update((draft) => withEffect(draft, entry.level, entry.ref, 'inherit'));
  }

  /** Reprend la carte d'un autre site dans le brouillon ; Enregistrer l'applique. */
  protected async copyFrom(siteId: string): Promise<void> {
    const read = this.readSource();
    if (read === null) {
      return;
    }
    const name = this.sources().find((site) => site.value === siteId)?.label ?? siteId;
    this.copiedFrom.set(siteId);
    try {
      const menu = await read(siteId);
      if (menu === null) {
        this.copyNotice.set({ variant: 'info', text: `${name} n’a pas de carte : rien à copier.` });
        return;
      }
      this.draft.set(draftOf(menu));
      this.copyNotice.set({
        variant: 'info',
        text: `Carte de ${name} reprise. Enregistrez pour l’appliquer.`,
      });
    } catch {
      this.copyNotice.set({
        variant: 'alert',
        text: 'La carte de l’autre site n’a pas pu être lue.',
      });
    }
  }

  protected async submit(): Promise<void> {
    const save = this.save();
    if (save === null || this.saving() || !this.dirty() || !this.canWrite()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const sent = this.draft();
    try {
      await save(sent);
      this.baseline.set(sent);
      this.copyNotice.set(null);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'La carte n’a pas été enregistrée.'));
    } finally {
      this.saving.set(false);
    }
  }
}

function productRowOf(draft: MenuDraft, entry: PublishedEntryView): ProductRow {
  const articles = articlesOf(entry);
  const names = new Map(entry.variants.map((variant) => [variant.sku, variant.name]));
  const variants = articles.map((article) => ({
    sku: article.sku,
    name: names.get(article.sku) ?? article.sku,
    effect: effectAt(draft, 'sku', article.sku),
    open: isOpenUnder(draft, article),
  }));
  const open = variants.filter((variant) => variant.open).length;
  const single = variants.length === 1;
  return {
    productSku: entry.productSku,
    name: entry.name,
    effect: effectAt(draft, 'product', entry.productSku),
    openLabel: single
      ? open === 1
        ? 'Ouvert'
        : 'Hors carte'
      : `${String(open)} / ${String(variants.length)} ouvertes`,
    openTone: open === 0 ? 'neutral' : open === variants.length ? 'success' : 'warning',
    variants: single ? [] : variants,
  };
}
