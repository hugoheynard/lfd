import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  MAIL_SPACES,
  type MailCharterSettings,
  type MailEditorListItem,
  type MailSpace,
} from '@lfd/mail-blocks';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { MailChartersService } from '../../data/mail-charters.service';
import { MailEditorService } from '../../data/mail-editor.service';
import { groupMailSpaces, type MailSpaceListing } from '../../rules/mail-template-spaces';

/** Les couleurs de la charte que la carte montre en pastilles. */
interface CharterSwatch {
  readonly label: string;
  readonly color: string;
}

/**
 * **Les e-mails** (§ 6, S5a ; § 25, C2) : la porte de l'éditeur. Une carte
 * par espace — La Folie Coffee, La Folie Douce — avec ce qu'il couvre, son
 * nombre d'e-mails, ses brouillons en attente et un aperçu de sa charte
 * (logo s'il est réglé, pastilles des couleurs principales). Toute la carte
 * mène à l'espace (`/emails/espaces/:space`), qui liste ses e-mails.
 *
 * S5e : « Publier tous les e-mails » reste ICI : il met en service les
 * phrases en attente de TOUS les e-mails, tous espaces confondus
 * (`copyPendingCount` n'est pas compté par espace). Posé dans un espace, il
 * publierait en silence les phrases de l'autre. Les brouillons
 * d'arrangement n'en sont pas : chacun se publie depuis son e-mail. Le refus
 * du serveur (`409` : rien n'attend) s'affiche tel qu'il le dit.
 *
 * L'aperçu de la charte est lu par espace (`GET /admin/mail-charters/:space`) ;
 * une lecture refusée retire l'aperçu de sa carte et le dit, la carte reste.
 */
@Component({
  selector: 'app-mail-templates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    RouterLink,
  ],
  templateUrl: './mail-templates-page.html',
  styleUrl: './mail-templates-page.scss',
})
export class MailTemplatesPage {
  private readonly api = inject(MailEditorService);
  private readonly charters = inject(MailChartersService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly mails = signal<readonly MailEditorListItem[]>([]);
  protected readonly spaces = computed(() => groupMailSpaces(this.mails()));
  /** La charte lue de chaque espace ; absente tant qu'elle n'est pas lue, ou si la lecture a échoué. */
  protected readonly charterSettings = signal<Partial<Record<MailSpace, MailCharterSettings>>>({});
  protected readonly charterError = signal(false);
  /** Phrases (toutes langues) qui attendent « Publier tous les e-mails ». */
  protected readonly copyPendingCount = signal(0);
  protected readonly publishing = signal(false);
  /** Le dernier refus de la publication de tous les e-mails, tel que le serveur l'a dit. */
  protected readonly publishError = signal<string | null>(null);
  protected readonly canWrite = computed(() => this.permissions.can('mail_templates:write'));
  /** Le suivi des envois a son droit à part (`mail_sends`) : l'entrée ne se montre qu'avec lui. */
  protected readonly canSeeSends = computed(() => this.permissions.can('mail_sends:read'));
  protected readonly pendingLabel = computed(() => {
    const count = this.copyPendingCount();
    return count === 1 ? '1 modification en attente' : `${count} modifications en attente`;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.status.set('loading');
    try {
      const view = await this.api.list();
      this.mails.set(view.mails);
      this.copyPendingCount.set(view.copyPendingCount);
      this.error.set(null);
      this.status.set('ready');
      void this.loadCharters();
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'La liste des e-mails n’a pas pu être lue.'));
      this.status.set('failed');
    }
  }

  /** Publie les phrases en attente de tous les e-mails, puis relit la liste. */
  async publishAll(): Promise<void> {
    if (!this.canWrite() || this.publishing()) {
      return;
    }
    this.publishing.set(true);
    this.publishError.set(null);
    try {
      const { publicationVersion } = await this.api.publishAll();
      this.notify.success(`Publié — version des textes ${publicationVersion}.`);
      await this.load();
    } catch (error) {
      this.publishError.set(httpErrorMessage(error, 'Les e-mails n’ont pas pu être publiés.'));
    } finally {
      this.publishing.set(false);
    }
  }

  /** Les chartes des deux espaces, pour l'aperçu des cartes ; un refus n'ôte que l'aperçu. */
  private async loadCharters(): Promise<void> {
    const read = await Promise.allSettled(MAIL_SPACES.map((space) => this.charters.load(space)));
    const settings: Partial<Record<MailSpace, MailCharterSettings>> = {};
    for (const result of read) {
      if (result.status === 'fulfilled') {
        settings[result.value.space] = result.value.settings;
      }
    }
    this.charterSettings.set(settings);
    this.charterError.set(read.some((result) => result.status === 'rejected'));
  }

  protected open(space: MailSpaceListing): void {
    void this.router.navigate(['/emails', 'espaces', space.space, 'templates']);
  }

  protected charterOf(space: MailSpaceListing): MailCharterSettings | null {
    return this.charterSettings()[space.space] ?? null;
  }

  /** Le logo réglé, avec son texte en français ; `null` : le logo d'origine, joint à l'envoi — pas d'adresse à montrer. */
  protected logoOf(space: MailSpaceListing): { readonly src: string; readonly alt: string } | null {
    const logo = this.charterOf(space)?.logo ?? null;
    return logo === null || logo.src === '' ? null : { src: logo.src, alt: logo.alt.fr ?? '' };
  }

  protected swatchesOf(space: MailSpaceListing): readonly CharterSwatch[] {
    const charter = this.charterOf(space);
    if (charter === null) {
      return [];
    }
    return [
      { label: 'Bandeau', color: charter.colors.band },
      { label: 'Couleur principale', color: charter.colors.primary },
      { label: 'Fond de page', color: charter.colors.page },
      { label: 'Texte', color: charter.colors.text },
    ];
  }

  protected draftLabel(count: number): string {
    return count === 1 ? '1 brouillon en attente' : `${count} brouillons en attente`;
  }

  protected countLabel(count: number): string {
    return count === 1 ? '1 e-mail' : `${count} e-mails`;
  }
}
