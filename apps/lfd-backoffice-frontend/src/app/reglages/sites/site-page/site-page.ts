import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import type { SiteView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDangerZoneComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { SITES_PATH } from '../sites-path';
import { SitesService } from '../sites.service';
import { PublicSlotsCard } from './public-slots-card/public-slots-card';
import { SiteDiscountCard } from './site-discount-card/site-discount-card';
import { SiteHoursCard } from './site-hours-card/site-hours-card';
import { SiteIdentityCard } from './site-identity-card/site-identity-card';
import { SiteRolesCard } from './site-roles-card/site-roles-card';

const NOT_FOUND = 404;

/**
 * **Un site** (Réglages › Sites, doc
 * `documentation/sites/sites.md`,
 * §4, lot S1) — l'ancienne page d'un point de retrait, élargie : un site EST
 * le point de retrait, même identifiant. Elle gagne les rôles, les couleurs et
 * l'archivage. **Chaque carte enregistre ce qu'elle montre** (Hugo,
 * 2026-10-13) : la page charge, relit et archive — elle n'écrit rien
 * d'autre. Dans l'ordre : identité, rôles, paramétrage du retrait, archivage.
 * Tout passe par `admin/sites`, sous `lfc_site_settings`.
 *
 * Ce qui suit est l'histoire de la page du point, toujours vraie.
 *
 * **Un point de retrait**, en page plutôt qu'en panneau.
 *
 * 🔴 **Pourquoi une page, alors que la règle « Saisir » dit un panneau.** La
 * convention du 2026-09-14 (`lfc-ecommerce-frontend/CLAUDE.md`) veut que
 * toute saisie s'ouvre dans un panneau fold, et elle nomme « une adresse ».
 * Elle a été écrite pour la BOUTIQUE (commit `6902e7a8`, `feat(boutique)`), où
 * ce qu'on saisit tient en un formulaire.
 *
 * Un point de retrait n'est plus une adresse : il porte l'adresse, son rang par
 * défaut, ses heures, sa réduction et les clientèles de cette réduction — et il
 * recevra ses créneaux publics, leurs badges, leurs capacités et les fermetures
 * datées (`documentation/commandes/plan-creneaux-de-retrait.md`). Six sujets, bientôt
 * huit, qu'on ne lit pas de haut en bas : on va directement à celui qu'on vient
 * régler. C'est le critère qui sépare une page d'un panneau dans ce
 * back-office, où six pages de détail suivent déjà ce motif. Décidé avec Hugo
 * le 2026-09-16 ; le `CLAUDE.md` de cette app porte la règle.
 *
 * Le même composant sert la création et l'édition : sans `id`, il n'y a rien à
 * charger, et seule la carte d'identité s'affiche, avec un unique « Ajouter ».
 */
@Component({
  selector: 'app-site-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PublicSlotsCard,
    SiteDiscountCard,
    SiteHoursCard,
    SiteIdentityCard,
    SiteRolesCard,
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDangerZoneComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './site-page.html',
})
export class SitePage {
  private readonly sites = inject(SitesService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  /**
   * L'identifiant de la route (`withComponentInputBinding`), **absent** sur
   * `/nouveau` : c'est ce qui distingue la création de l'édition, sans second
   * composant ni drapeau à passer.
   */
  readonly id = input<string | undefined>(undefined);

  /**
   * Le refus du serveur, en clair. Il reste SUR LA PAGE, au-dessus des cartes :
   * un toast disparaîtrait pendant qu'on cherche quoi corriger.
   */
  protected readonly refusal = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly loading = signal(true);
  /** L'`id` de la route ne désigne aucun site : l'écran le dit, et n'invente rien. */
  protected readonly notFound = signal(false);
  /** La lecture a échoué pour une autre raison : on propose de réessayer. */
  protected readonly loadFailed = signal(false);
  /** Le site tel que le serveur l'a rendu — ce que lisent les cartes. */
  protected readonly site = signal<SiteView | null>(null);
  /** Les cartes du retrait ne se montrent qu'à un site qui fait du retrait. */
  protected readonly pickup = computed(() => this.site()?.pickup ?? false);
  /** Un site archivé ne se modifie plus (le serveur le refuse) : tout se fige. */
  protected readonly archived = computed(() => this.site()?.archivedAt != null);
  protected readonly isCreate = computed(() => this.id() === undefined);

  /** Le titre EST le nom du site — sa ville à défaut, comme dans la liste. */
  protected readonly heading = computed(() => {
    const site = this.site();
    if (this.isCreate()) {
      return 'Nouveau site';
    }
    return site === null ? 'Site' : site.label || site.ville || 'Site';
  });

  /** L'adresse en une ligne, sous le titre — comme la ligne d'identité d'une entité. */
  protected readonly addressLine = computed(() => {
    const site = this.site();
    return site === null ? '' : [site.ligne1, `${site.codePostal} ${site.ville}`].join(' · ');
  });

  /**
   * Pourquoi ce site ne s'archive pas, ou `null`. Le serveur refuse le défaut
   * et celui d'où partent les livraisons (`site-errors.ts`, relu le
   * 2026-10-13) ; la zone le dit plutôt que d'offrir un geste refusé.
   */
  protected readonly archiveBlocker = computed(() => {
    const site = this.site();
    if (site === null || site.archivedAt !== null) {
      return null;
    }
    if (site.isDefault) {
      return 'C’est le site par défaut : désignez d’abord un autre site par défaut.';
    }
    if (site.deliveryDeparture) {
      return 'Les livraisons partent d’ici : décochez d’abord « Livraison » dans ses rôles.';
    }
    return null;
  });

  /**
   * Le libellé d'action de la zone dangereuse, ou `undefined` quand l'archivage
   * serait refusé : la zone reste alors un cadre qui explique sans rien offrir.
   */
  protected readonly deleteAction = computed(() =>
    this.site() !== null && this.archiveBlocker() === null && !this.archived()
      ? 'Archiver ce site'
      : undefined,
  );

  /** Ce qu'il faut taper pour archiver : le nom du site, ou sa ville sans nom. */
  protected readonly confirmPhrase = computed(() => {
    const site = this.site();
    return site === null ? '' : site.label || site.ville;
  });

  constructor() {
    // Par un `effect` et non dans le constructeur : un `input` de route n'est
    // pas encore fourni à la construction, et le routeur peut changer le
    // segment sans reconstruire la page.
    effect(() => {
      const id = this.id();
      if (id === undefined) {
        this.loading.set(false);
        return;
      }
      void this.load(id);
    });
  }

  /** Charge le site par sa lecture unitaire (`GET admin/sites/:id`). */
  protected async load(id: string): Promise<void> {
    this.loading.set(true);
    this.notFound.set(false);
    this.loadFailed.set(false);
    this.refusal.set(null);
    try {
      const site = await this.sites.get(id);
      this.site.set(site);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === NOT_FOUND) {
        this.notFound.set(true);
      } else {
        this.loadFailed.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  /** Une carte a enregistré : on relit le site, sans faire clignoter la page. */
  protected async reload(): Promise<void> {
    const id = this.id();
    if (id === undefined) {
      return;
    }
    try {
      // Le site seul : les brouillons de l'identité ne sont pas touchés, une
      // carte qui enregistre n'écrase pas une saisie en cours d'une autre.
      this.site.set(await this.sites.get(id));
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le site n’a pas pu être relu.'));
    }
  }

  /** La carte d'identité a créé le site : sa page, où se règle le reste. */
  protected async onCreated(id: string): Promise<void> {
    await this.router.navigate([SITES_PATH, id]);
  }

  /**
   * 🔴 **Archiver, pas supprimer** (plan des sites, §3.1) : un site archivé
   * n'est plus proposé, mais se résout encore par id — départs, tournées et
   * copies des commandes passées le citent. La zone fait taper son nom, comme
   * la suppression d'un point le faisait depuis le 2026-09-15. Un refus reste
   * sur la page.
   */
  protected async archive(): Promise<void> {
    const id = this.id();
    if (id === undefined || this.deleteAction() === undefined || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.sites.archive(id);
      this.notify.success('Site archivé.');
      await this.backToList();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Le site n'a pas pu être archivé."));
    } finally {
      this.saving.set(false);
    }
  }

  protected backToList(): Promise<boolean> {
    return this.router.navigate([SITES_PATH]);
  }
}
