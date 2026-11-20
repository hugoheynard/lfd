import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type {
  ShopItemView,
  SubAccountMenuBody,
  SubAccountMenuEntry,
  SubAccountMenuLevel,
  SubAccountMenuMode,
  SubAccountOffMenuDisplay,
} from '@lfd/contracts';
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
  type FoldViewToggleOption,
} from 'fold-ng';

import { fill } from '../../copy/client-copy.service';
import { siteMenuCopy } from '../../copy/screens/site-menu.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import {
  draftOf,
  effectAt,
  familyPathOf,
  isOpenUnder,
  ITEM_LEVEL,
  type MenuDraft,
  type NodeEffect,
  OPEN_DRAFT,
  sameDraft,
  staleEntries,
  withEffect,
} from '../site-menu-draft';

/** Une ligne d'article sous sa famille. */
interface ItemRow {
  readonly sku: string;
  readonly name: string;
  readonly effect: NodeEffect;
  readonly open: boolean;
}

/** Une famille du catalogue, ses articles à elle, et son rang dans l'arbre. */
interface FamilyBlock {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
  readonly effect: NodeEffect;
  readonly items: readonly ItemRow[];
}

/** Un avis après « copier la carte d'un autre site ». */
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

/**
 * **L'éditeur d'une carte** (`carte-des-sites.md`, § 3.3) — celle d'un site
 * comme la carte commune des sites d'un principal (§ 6.1), qui ont la même
 * forme. L'arbre est le catalogue de l'espace affiché, famille par famille ;
 * chaque nœud hérite, inclut ou exclut, et le plus fin l'emporte. Le résumé et
 * l'état « ouvert / fermé » de chaque article rejouent le jugement du serveur.
 *
 * L'éditeur tient le brouillon et le compare à `initial` ; l'écran fournit
 * `save`, qui écrit la carte entière et rend le refus du serveur (ou `null`).
 * Sans `canWrite`, la carte se lit : ni réglage, ni bouton (« Ma carte »).
 * `unsaved` dit que la carte montrée n'est pas encore posée à cet endroit
 * (une carte propre partie de la carte commune) : Enregistrer est cliquable
 * sans changement. Le catalogue est hydraté par l'écran.
 */
@Component({
  selector: 'app-site-menu-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
  templateUrl: './site-menu-editor.html',
  styleUrl: './site-menu-editor.scss',
})
export class SiteMenuEditor {
  protected readonly copy = screenCopy('siteMenu', siteMenuCopy);
  private readonly catalogue = inject(ShopCatalogue);

  readonly initial = input.required<MenuDraft>();
  readonly unsaved = input(false);
  readonly canWrite = input(true);
  readonly save = input<((draft: MenuDraft) => Promise<string | null>) | null>(null);
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

  protected readonly dirty = computed(
    () => this.unsaved() || !sameDraft(this.draft(), this.baseline()),
  );

  protected readonly modeOptions = computed<readonly FoldViewToggleOption[]>(() => [
    { value: 'except', label: this.copy().modeExcept },
    { value: 'only', label: this.copy().modeOnly },
  ]);

  protected readonly offMenuOptions = computed<readonly FoldViewToggleOption[]>(() => [
    { value: 'visible_locked', label: this.copy().offMenuLocked },
    { value: 'hidden', label: this.copy().offMenuHidden },
  ]);

  protected readonly effectOptions = computed<readonly FoldViewToggleOption[]>(() => [
    { value: 'inherit', label: this.copy().inherit },
    { value: 'include', label: this.copy().include },
    { value: 'exclude', label: this.copy().exclude },
  ]);

  /** Les libellés lus, sans réglage : le mode, l'affichage hors carte, l'effet d'un nœud. */
  protected readonly modeLabel = computed(
    () => this.modeOptions().find((option) => option.value === this.draft().mode)?.label ?? '',
  );
  protected readonly offMenuLabel = computed(
    () =>
      this.offMenuOptions().find((option) => option.value === this.draft().offMenu)?.label ?? '',
  );

  protected readonly families = computed<readonly FamilyBlock[]>(() => {
    const draft = this.draft();
    const shelves = this.catalogue.shelves();
    const items = this.catalogue.items();
    return shelves.map((shelf) => ({
      id: shelf.id,
      name: shelf.name,
      depth: familyPathOf(shelf.id, shelves).length - 1,
      effect: effectAt(draft, 'family', shelf.id),
      items: items
        .filter((item) => item.shelfId === shelf.id)
        .map((item) => this.rowOf(draft, item)),
    }));
  });

  protected readonly summary = computed(() => {
    const items = this.catalogue.items();
    const shelves = this.catalogue.shelves();
    const open = items.filter((item) => isOpenUnder(this.draft(), item, shelves)).length;
    return fill(this.copy().summary, { open: String(open), total: String(items.length) });
  });

  /** « Seulement » sans entrée ferme tout : permis, et dit (§ 3.3). */
  protected readonly closedAll = computed(
    () => this.draft().mode === 'only' && this.draft().entries.length === 0,
  );

  protected readonly stale = computed(() =>
    staleEntries(this.draft(), this.catalogue.items(), this.catalogue.shelves()),
  );

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
    return this.effectOptions().find((option) => option.value === effect)?.label ?? '';
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

  protected setFamily(familyId: string, value: string): void {
    this.setEffect('family', familyId, value);
  }

  protected setItem(sku: string, value: string): void {
    this.setEffect(ITEM_LEVEL, sku, value);
  }

  protected remove(entry: SubAccountMenuEntry): void {
    this.draft.update((draft) => withEffect(draft, entry.level, entry.ref, 'inherit'));
  }

  protected levelLabel(level: SubAccountMenuLevel): string {
    const copy = this.copy();
    return level === 'family'
      ? copy.levelFamily
      : level === 'product'
        ? copy.levelProduct
        : copy.levelSku;
  }

  /** Reprend la carte d'un autre site dans le brouillon ; Enregistrer l'applique. */
  protected async copyFrom(siteId: string): Promise<void> {
    const read = this.readSource();
    const source = this.sources().find((site) => site.value === siteId);
    if (read === null || source === undefined) {
      return;
    }
    this.copiedFrom.set(siteId);
    try {
      const menu = await read(siteId);
      if (menu === null) {
        this.copyNotice.set({
          variant: 'info',
          text: fill(this.copy().copyEmpty, { site: source.label }),
        });
        return;
      }
      this.draft.set(draftOf(menu));
      this.copyNotice.set({
        variant: 'info',
        text: fill(this.copy().copied, { site: source.label }),
      });
    } catch {
      this.copyNotice.set({ variant: 'alert', text: this.copy().copyFailed });
    }
  }

  protected async submit(): Promise<void> {
    const save = this.save();
    if (save === null || this.saving() || !this.dirty()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const sent = this.draft();
    const refused = await save(sent);
    this.saving.set(false);
    if (refused !== null) {
      this.refusal.set(refused);
      return;
    }
    this.baseline.set(sent);
    this.copyNotice.set(null);
  }

  private setEffect(level: SubAccountMenuLevel, ref: string, value: string): void {
    const effect = NODE_EFFECTS.find((candidate) => candidate === value);
    if (effect !== undefined) {
      this.draft.update((draft) => withEffect(draft, level, ref, effect));
    }
  }

  private rowOf(draft: MenuDraft, item: ShopItemView): ItemRow {
    return {
      sku: item.sku,
      name: item.name,
      effect: effectAt(draft, ITEM_LEVEL, item.sku),
      open: isOpenUnder(draft, item, this.catalogue.shelves()),
    };
  }
}
