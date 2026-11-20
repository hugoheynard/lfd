import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { PrincipalSitesMenuView, PublishedCatalogView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CatalogueService } from '../../../b2b/catalogue/catalogue.service';
import { NotifyService } from '../../../notify.service';
import { GestureIntents } from '../../../shared/gesture-intents';
import { ClientSheetStore } from '../../client-sheet.store';
import { MenuEditor } from '../menu-editor/menu-editor';
import { SubAccountMenuService } from '../sub-account-menu.service';
import { draftOf, intentSubjectOf, type MenuDraft, payloadOf } from '../sub-account-menu-draft';

/** Les états de l'écran, exclusifs. */
type SitesMenuScreen = 'loading' | 'site' | 'failed' | 'ready';

/**
 * **L'onglet Carte des sites d'un principal** (`carte-des-sites.md`, § 6) :
 * la carte commune, qui s'applique à chacun de ses sites sans carte propre,
 * jamais au principal lui-même. Réglée par le staff sous `b2b_companies:write`,
 * enregistrée sous la clé d'intention de l'écran (le principal en est averti
 * par e-mail, une fois par intention).
 */
@Component({
  selector: 'app-sites-menu-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    MenuEditor,
  ],
  templateUrl: './sites-menu-page.html',
  styleUrl: './sites-menu-page.scss',
})
export class SitesMenuPage {
  private readonly sheetStore = inject(ClientSheetStore);
  private readonly menus = inject(SubAccountMenuService);
  private readonly catalogueApi = inject(CatalogueService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);
  private readonly intents = new GestureIntents();

  protected readonly canWrite = computed(() => this.permissions.can('b2b_companies:write'));

  private readonly companyId = computed(() => this.sheetStore.sheet()?.companyId ?? null);
  private readonly isSite = computed(() => (this.sheetStore.sheet()?.parent ?? null) !== null);

  private readonly menuStatus = signal<'loading' | 'failed' | 'ready'>('loading');
  protected readonly view = signal<PrincipalSitesMenuView | null>(null);
  protected readonly catalogue = signal<PublishedCatalogView | null>(null);
  private readonly catalogueFailed = signal(false);

  protected readonly screen = computed<SitesMenuScreen>(() => {
    const state = this.sheetStore.state();
    if (state === 'error') {
      return 'failed';
    }
    if (state === 'loading' || this.sheetStore.sheet() === null) {
      return 'loading';
    }
    if (this.isSite()) {
      return 'site';
    }
    if (this.menuStatus() === 'failed' || this.catalogueFailed()) {
      return 'failed';
    }
    return this.menuStatus() === 'ready' && this.catalogue() !== null ? 'ready' : 'loading';
  });

  protected readonly initial = computed(() => draftOf(this.view()?.menu ?? null));
  protected readonly hasMenu = computed(() => (this.view()?.menu ?? null) !== null);

  protected readonly saveCommon = (draft: MenuDraft): Promise<void> => this.write(draft);

  constructor() {
    effect(() => {
      const id = this.companyId();
      if (id !== null && !this.isSite()) {
        untracked(() => void this.load(id));
      }
    });
  }

  protected retry(): void {
    const id = this.companyId();
    if (id === null) {
      void this.sheetStore.reload();
      return;
    }
    void this.load(id);
  }

  private async write(draft: MenuDraft): Promise<void> {
    const id = this.companyId();
    if (id === null) {
      return;
    }
    const subject = `sites-${intentSubjectOf(id, draft)}`;
    await this.menus.saveSitesMenu(id, payloadOf(draft), this.intents.keyFor(subject));
    this.intents.done(subject);
    this.notify.success('Carte commune des sites enregistrée.');
    try {
      this.view.set(await this.menus.readSitesMenu(id));
    } catch {
      // La carte est posée ; la relecture manquée laisse l'écran sur ce qui a été envoyé.
    }
  }

  private async load(companyId: string): Promise<void> {
    this.menuStatus.set('loading');
    this.catalogueFailed.set(false);
    const catalogue = this.catalogueApi.published().then(
      (view) => this.catalogue.set(view),
      () => this.catalogueFailed.set(true),
    );
    try {
      this.view.set(await this.menus.readSitesMenu(companyId));
      this.menuStatus.set('ready');
    } catch {
      this.menuStatus.set('failed');
    }
    await catalogue;
  }
}
