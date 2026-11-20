import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type {
  ShopItemView,
  SubAccountMenuEntry,
  SubAccountMenuLevel,
  SubAccountMenuMode,
  SubAccountOffMenuDisplay,
} from '@lfd/contracts';
import {
  FoldBackLinkComponent,
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
  type FoldViewToggleOption,
} from 'fold-ng';
import { map } from 'rxjs';

import { NotifyService } from '../../../notify.service';
import { companyName } from '../../client-workspace.service';
import { fill } from '../../copy/client-copy.service';
import { siteMenuCopy } from '../../copy/screens/site-menu.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { ManageableSites } from '../manageable-sites';
import { SiteMenuGateway } from '../site-menu.gateway';
import {
  draftOf,
  effectAt,
  familyPathOf,
  isOpenUnder,
  ITEM_LEVEL,
  type MenuDraft,
  type NodeEffect,
  OPEN_DRAFT,
  payloadOf,
  sameDraft,
  staleEntries,
  withEffect,
} from '../site-menu-draft';

/** Les états de l'écran, exclusifs. */
type MenuScreen = 'loading' | 'unknown' | 'failed' | 'ready';

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

const NODE_EFFECTS: readonly NodeEffect[] = ['inherit', 'include', 'exclude'];
const MODES: readonly SubAccountMenuMode[] = ['except', 'only'];
const OFF_MENU_DISPLAYS: readonly SubAccountOffMenuDisplay[] = ['visible_locked', 'hidden'];

/**
 * `/mes-sites/:subAccountId/carte` — **la carte d'un site**, réglée par le
 * propriétaire ou l'administrateur de son compte principal
 * (`documentation/comptes-client/plan-carte-des-sites.md`, § 3.3, § 5).
 *
 * L'écran compose la carte entière et l'envoie d'un geste (`PUT`) :
 * Enregistrer n'est cliquable que si elle diffère de celle lue. L'arbre est le
 * catalogue de l'espace affiché — celui du principal —, famille par famille ;
 * chaque nœud hérite, inclut ou exclut, et le plus fin l'emporte. Le résumé et
 * l'état « ouvert / fermé » de chaque article rejouent le jugement du serveur.
 */
@Component({
  selector: 'app-site-menu-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldBackLinkComponent,
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
  templateUrl: './site-menu-page.html',
  styleUrl: './site-menu-page.scss',
})
export class SiteMenuPage {
  protected readonly copy = screenCopy('siteMenu', siteMenuCopy);
  private readonly manageable = inject(ManageableSites);
  private readonly gateway = inject(SiteMenuGateway);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly notify = inject(NotifyService);

  private readonly subAccountId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('subAccountId') ?? '')),
    { initialValue: '' },
  );

  protected readonly site = computed(() => this.manageable.siteOf(this.subAccountId()));
  /** Un booléen : un `/me` relu rend un autre objet, pas un autre site — la carte ne se relit pas. */
  private readonly siteKnown = computed(() => this.site() !== null);

  private readonly menuStatus = signal<'loading' | 'failed' | 'ready'>('loading');
  /** La carte lue (ou enregistrée) : ce à quoi le brouillon se compare. */
  private readonly baseline = signal<MenuDraft>(OPEN_DRAFT);
  protected readonly draft = signal<MenuDraft>(OPEN_DRAFT);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly copyNotice = signal<CopyNotice | null>(null);
  protected readonly copiedFrom = signal<string | null>(null);

  protected readonly screen = computed<MenuScreen>(() => {
    if (!this.manageable.settled()) {
      return 'loading';
    }
    if (this.site() === null) {
      return 'unknown';
    }
    const catalogue = this.catalogue.status();
    if (this.menuStatus() === 'failed' || catalogue === 'failed') {
      return 'failed';
    }
    return this.menuStatus() === 'ready' && catalogue === 'ready' ? 'ready' : 'loading';
  });

  protected readonly lead = computed(() => {
    const site = this.site();
    return site === null ? '' : fill(this.copy().lead, { site: companyName(site) });
  });

  protected readonly dirty = computed(() => !sameDraft(this.draft(), this.baseline()));

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

  /** Les autres sites du même principal, dont on peut reprendre la carte (Q4). */
  protected readonly otherSites = computed(() =>
    this.manageable
      .sites()
      .filter((site) => site.id !== this.subAccountId())
      .map((site) => ({ value: site.id, label: companyName(site) })),
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
    void this.catalogue.hydrate();
    effect(() => {
      const id = this.subAccountId();
      if (this.siteKnown()) {
        untracked(() => void this.load(id));
      }
    });
  }

  protected retry(): void {
    void this.catalogue.hydrate();
    void this.load(this.subAccountId());
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
    const source = this.manageable.siteOf(siteId);
    if (source === null) {
      return;
    }
    this.copiedFrom.set(siteId);
    const name = companyName(source);
    try {
      const view = await this.gateway.read(siteId);
      if (view.menu === null) {
        this.copyNotice.set({ variant: 'info', text: fill(this.copy().copyEmpty, { site: name }) });
        return;
      }
      this.draft.set(draftOf(view.menu));
      this.copyNotice.set({ variant: 'info', text: fill(this.copy().copied, { site: name }) });
    } catch {
      this.copyNotice.set({ variant: 'alert', text: this.copy().copyFailed });
    }
  }

  protected async save(): Promise<void> {
    if (this.saving() || !this.dirty()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const sent = this.draft();
    const refused = await this.gateway.save(this.subAccountId(), payloadOf(sent));
    this.saving.set(false);
    if (refused !== null) {
      this.refusal.set(refused);
      return;
    }
    this.baseline.set(sent);
    this.copyNotice.set(null);
    this.notify.success(this.copy().saved);
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

  private async load(subAccountId: string): Promise<void> {
    this.menuStatus.set('loading');
    this.refusal.set(null);
    this.copyNotice.set(null);
    this.copiedFrom.set(null);
    try {
      const view = await this.gateway.read(subAccountId);
      const read = draftOf(view.menu);
      this.baseline.set(read);
      this.draft.set(read);
      this.menuStatus.set('ready');
    } catch {
      this.menuStatus.set('failed');
    }
  }
}
