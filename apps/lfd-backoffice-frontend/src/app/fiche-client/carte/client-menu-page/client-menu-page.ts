import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type {
  PublishedCatalogView,
  PublishedEntryView,
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
  FoldLoadingStateComponent,
  FoldViewToggleComponent,
  type FoldBadgeVariant,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CatalogueService } from '../../../b2b/catalogue/catalogue.service';
import { CompanyDetailStore } from '../../../comptes-clients/company-cache/company-detail.store';
import { NotifyService } from '../../../notify.service';
import { GestureIntents } from '../../../shared/gesture-intents';
import { ClientSheetStore } from '../../client-sheet.store';
import { SubAccountMenuService } from '../sub-account-menu.service';
import {
  articlesOf,
  draftOf,
  effectAt,
  intentSubjectOf,
  isOpenUnder,
  type MenuDraft,
  type NodeEffect,
  OPEN_DRAFT,
  payloadOf,
  sameDraft,
  soldToPros,
  staleEntries,
  withEffect,
} from '../sub-account-menu-draft';

/** Les états de l'écran, exclusifs. */
type MenuScreen = 'loading' | 'principal' | 'failed' | 'ready';

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
  /** « 2 / 3 ouvertes », ou « Ouvert » / « Fermé » pour une seule déclinaison. */
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

/**
 * **L'onglet Carte d'un sous-compte** (`carte-des-sites.md`, § 3.3, § 2) :
 * ce que ce site peut commander, réglé par le staff sous `b2b_companies:write`.
 *
 * L'écran compose la carte entière et l'envoie d'un geste (`PUT`). L'arbre est
 * le catalogue publié, vendu aux pros : famille → produit → déclinaison, chaque
 * nœud hérite, inclut ou exclut, et le plus fin l'emporte. Le résumé et l'état
 * de chaque ligne rejouent le jugement du serveur. Un compte sans principal n'a
 * pas de carte : l'onglet n'y est pas proposé, et l'URL tapée le dit.
 */
@Component({
  selector: 'app-client-menu-page',
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
    FoldLoadingStateComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './client-menu-page.html',
  styleUrl: './client-menu-page.scss',
})
export class ClientMenuPage {
  private readonly sheetStore = inject(ClientSheetStore);
  private readonly menus = inject(SubAccountMenuService);
  private readonly catalogueApi = inject(CatalogueService);
  private readonly details = inject(CompanyDetailStore);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);
  private readonly intents = new GestureIntents();

  protected readonly canWrite = computed(() => this.permissions.can('b2b_companies:write'));

  private readonly companyId = computed(() => this.sheetStore.sheet()?.companyId ?? null);
  private readonly parent = computed(() => this.sheetStore.sheet()?.parent ?? null);

  private readonly menuStatus = signal<'loading' | 'failed' | 'ready'>('loading');
  private readonly catalogue = signal<PublishedCatalogView | null>(null);
  private readonly catalogueFailed = signal(false);
  private readonly baseline = signal<MenuDraft>(OPEN_DRAFT);
  protected readonly draft = signal<MenuDraft>(OPEN_DRAFT);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly copyNotice = signal<CopyNotice | null>(null);
  protected readonly copiedFrom = signal<string | null>(null);
  /** Les autres sites du même principal (Q4). */
  protected readonly siblings = signal<readonly { value: string; label: string }[]>([]);

  protected readonly screen = computed<MenuScreen>(() => {
    const state = this.sheetStore.state();
    if (state === 'error') {
      return 'failed';
    }
    if (state === 'loading' || this.sheetStore.sheet() === null) {
      return 'loading';
    }
    if (this.parent() === null) {
      return 'principal';
    }
    if (this.menuStatus() === 'failed' || this.catalogueFailed()) {
      return 'failed';
    }
    return this.menuStatus() === 'ready' && this.catalogue() !== null ? 'ready' : 'loading';
  });

  protected readonly dirty = computed(() => !sameDraft(this.draft(), this.baseline()));

  protected readonly modeOptions: readonly FoldViewToggleOption[] = [
    { value: 'except', label: 'Tout, sauf les exclusions (liste noire)' },
    { value: 'only', label: 'Seulement les inclusions (liste blanche)' },
  ];
  protected readonly offMenuOptions: readonly FoldViewToggleOption[] = [
    { value: 'visible_locked', label: 'Visible, non commandable' },
    { value: 'hidden', label: 'Absent' },
  ];
  protected readonly effectOptions: readonly FoldViewToggleOption[] = NODE_EFFECTS.map((value) => ({
    value,
    label: EFFECT_LABELS[value],
  }));

  protected readonly families = computed<readonly FamilyBlock[]>(() => {
    const catalogue = this.catalogue();
    if (catalogue === null) {
      return [];
    }
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
    const catalogue = this.catalogue();
    const articles = catalogue === null ? [] : catalogue.entries.flatMap(articlesOf);
    const open = articles.filter((article) => isOpenUnder(this.draft(), article)).length;
    return `${String(open)} articles ouverts à ce site sur ${String(articles.length)} vendus aux pros.`;
  });

  /** « Seulement » sans entrée ferme tout : permis, et dit (§ 3.3). */
  protected readonly closedAll = computed(
    () => this.draft().mode === 'only' && this.draft().entries.length === 0,
  );

  protected readonly stale = computed(() => {
    const catalogue = this.catalogue();
    return catalogue === null ? [] : staleEntries(this.draft(), catalogue);
  });

  constructor() {
    effect(() => {
      const id = this.companyId();
      const parent = this.parent();
      if (id !== null && parent !== null) {
        untracked(() => void this.load(id, parent.id));
      }
    });
  }

  protected retry(): void {
    const id = this.companyId();
    const parent = this.parent();
    if (id === null || parent === null) {
      void this.sheetStore.reload();
      return;
    }
    void this.load(id, parent.id);
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
    const name = this.siblings().find((site) => site.value === siteId)?.label ?? siteId;
    this.copiedFrom.set(siteId);
    try {
      const view = await this.menus.read(siteId);
      if (view.menu === null) {
        this.copyNotice.set({ variant: 'info', text: `${name} n’a pas de carte : rien à copier.` });
        return;
      }
      this.draft.set(draftOf(view.menu));
      this.copyNotice.set({
        variant: 'info',
        text: `Carte de ${name} reprise. Enregistrez pour l’appliquer à ce site.`,
      });
    } catch {
      this.copyNotice.set({
        variant: 'alert',
        text: 'La carte de l’autre site n’a pas pu être lue.',
      });
    }
  }

  protected async save(): Promise<void> {
    const id = this.companyId();
    if (id === null || this.saving() || !this.dirty() || !this.canWrite()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const sent = this.draft();
    try {
      const subject = intentSubjectOf(id, sent);
      await this.menus.save(id, payloadOf(sent), this.intents.keyFor(subject));
      this.intents.done(subject);
      this.baseline.set(sent);
      this.copyNotice.set(null);
      this.notify.success('Carte du site enregistrée.');
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'La carte n’a pas été enregistrée.'));
    } finally {
      this.saving.set(false);
    }
  }

  private async load(companyId: string, parentId: string): Promise<void> {
    this.menuStatus.set('loading');
    this.catalogueFailed.set(false);
    this.refusal.set(null);
    this.copyNotice.set(null);
    this.copiedFrom.set(null);
    void this.loadSiblings(companyId, parentId);
    const catalogue = this.catalogueApi.published().then(
      (view) => this.catalogue.set(view),
      () => this.catalogueFailed.set(true),
    );
    try {
      const view = await this.menus.read(companyId);
      const read = draftOf(view.menu);
      this.baseline.set(read);
      this.draft.set(read);
      this.menuStatus.set('ready');
    } catch {
      this.menuStatus.set('failed');
    }
    await catalogue;
  }

  /** Sans la fiche du principal, la copie n'est simplement pas proposée. */
  private async loadSiblings(companyId: string, parentId: string): Promise<void> {
    try {
      const parent = await this.details.get(parentId);
      this.siblings.set(
        (parent?.hierarchy.subAccounts ?? [])
          .filter((site) => site.id !== companyId)
          .map((site) => ({ value: site.id, label: site.enseigne })),
      );
    } catch {
      this.siblings.set([]);
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
