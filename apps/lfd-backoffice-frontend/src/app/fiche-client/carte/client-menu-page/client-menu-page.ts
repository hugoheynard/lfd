import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type {
  PublishedCatalogView,
  SiteMenuState,
  SubAccountMenuBody,
  SubAccountMenuView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CatalogueService } from '../../../b2b/catalogue/catalogue.service';
import { CompanyDetailStore } from '../../../comptes-clients/company-cache/company-detail.store';
import { NotifyService } from '../../../notify.service';
import { GestureIntents } from '../../../shared/gesture-intents';
import { ClientSheetStore } from '../../client-sheet.store';
import { type MenuSource, MenuEditor } from '../menu-editor/menu-editor';
import { SubAccountMenuService } from '../sub-account-menu.service';
import {
  draftOf,
  intentSubjectOf,
  type MenuDraft,
  payloadOf,
  siteMenuStateLine,
} from '../sub-account-menu-draft';

/** Les états de l'écran, exclusifs. */
type MenuScreen = 'loading' | 'principal' | 'failed' | 'ready';

/**
 * **L'onglet Carte d'un sous-compte** (`carte-des-sites.md`, § 2, § 6) : la
 * carte qui compte pour ce site — la sienne, la carte commune de son
 * principal, ou aucune —, et les deux gestes du staff sous
 * `b2b_companies:write` : « faire une carte propre » (l'éditeur, `PUT /menu`)
 * et « revenir à la carte commune » (`PUT /menu/state`), chacun sous sa clé
 * d'intention.
 *
 * Tant que le site suit la carte commune, elle se lit ici sans se régler :
 * elle appartient au principal (onglet « Carte des sites » de sa fiche). Un
 * compte sans principal n'a pas de carte : l'onglet n'y est pas proposé, et
 * l'URL tapée le dit.
 */
@Component({
  selector: 'app-client-menu-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    MenuEditor,
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
  protected readonly view = signal<SubAccountMenuView | null>(null);
  protected readonly catalogue = signal<PublishedCatalogView | null>(null);
  private readonly catalogueFailed = signal(false);
  /** « Faire une carte propre » ouvert sur un site qui suit la carte commune. */
  protected readonly making = signal(false);
  protected readonly switching = signal(false);
  protected readonly switchRefusal = signal<string | null>(null);
  /** Les autres sites du même principal (Q4). */
  protected readonly siblings = signal<readonly MenuSource[]>([]);

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

  protected readonly stateLine = computed(() => {
    const view = this.view();
    return view === null ? '' : siteMenuStateLine(view);
  });

  /** La carte commune se lit, sans se régler, tant que le site la suit. */
  protected readonly readsCommon = computed(
    () => this.view()?.state === 'common' && !this.making(),
  );

  protected readonly commonDraft = computed(() => draftOf(this.view()?.common ?? null));

  /**
   * Le point de départ de la carte propre : elle-même, endormie ou non ; à
   * défaut, la carte commune, qu'on part de reprendre ; à défaut, tout ouvert.
   */
  protected readonly ownDraft = computed<MenuDraft>(() => {
    const view = this.view();
    return draftOf(view?.menu ?? view?.common ?? null);
  });

  /** La carte montrée n'est pas encore la carte propre active : l'enregistrer en fait une. */
  protected readonly ownUnsaved = computed(() => {
    const view = this.view();
    return view !== null && view.state !== 'own' && (this.making() || view.menu !== null);
  });

  protected readonly canFollowCommon = computed(() => {
    const view = this.view();
    return view !== null && view.state === 'own' && view.common !== null;
  });

  protected readonly saveOwn = (draft: MenuDraft): Promise<void> => this.writeOwn(draft);
  protected readonly readSibling = (siteId: string): Promise<SubAccountMenuBody | null> =>
    this.menus.read(siteId).then((view) => view.menu);

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

  protected makeOwn(): void {
    this.making.set(true);
  }

  protected cancelMaking(): void {
    this.making.set(false);
  }

  protected async followCommon(): Promise<void> {
    await this.switchTo('follows_common', 'Le site suit de nouveau la carte commune.');
  }

  private async switchTo(state: SiteMenuState, done: string): Promise<void> {
    const id = this.companyId();
    if (id === null || this.switching() || !this.canWrite()) {
      return;
    }
    this.switching.set(true);
    this.switchRefusal.set(null);
    const subject = `menu-state:${id}:${state}`;
    try {
      await this.menus.setState(id, state, this.intents.keyFor(subject));
      this.intents.done(subject);
      this.notify.success(done);
      await this.reread(id);
    } catch (error) {
      this.switchRefusal.set(httpErrorMessage(error, 'La carte du site n’a pas changé.'));
    } finally {
      this.switching.set(false);
    }
  }

  private async writeOwn(draft: MenuDraft): Promise<void> {
    const id = this.companyId();
    if (id === null) {
      return;
    }
    const subject = intentSubjectOf(id, draft);
    await this.menus.save(id, payloadOf(draft), this.intents.keyFor(subject));
    this.intents.done(subject);
    this.notify.success('Carte du site enregistrée.');
    await this.reread(id);
  }

  /** Relit l'état après un geste ; un échec de relecture laisse l'écran tel quel. */
  private async reread(id: string): Promise<void> {
    try {
      this.view.set(await this.menus.read(id));
      this.making.set(false);
    } catch {
      this.making.set(false);
    }
  }

  private async load(companyId: string, parentId: string): Promise<void> {
    this.menuStatus.set('loading');
    this.catalogueFailed.set(false);
    this.making.set(false);
    this.switchRefusal.set(null);
    void this.loadSiblings(companyId, parentId);
    const catalogue = this.catalogueApi.published().then(
      (view) => this.catalogue.set(view),
      () => this.catalogueFailed.set(true),
    );
    try {
      this.view.set(await this.menus.read(companyId));
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
