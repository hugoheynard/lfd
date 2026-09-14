import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
} from '@angular/core';
import type { CompanyMemberRole } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldSurfaceDirective,
} from 'fold-ng';

import { AccountService } from '../../../account/account.service';
import { AuthFacade } from '../../../auth/auth.facade';

/** Les états de l'écran — exclusifs, et c'est tout leur intérêt. */
type AccountView = 'loading' | 'signed-out' | 'failed' | 'incomplete' | 'dossier';

import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ClientChrome } from '../../client-chrome.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { ClientFeatureAccess } from '../../feature-access/client-feature-access.service';
import { ClientCompany } from '../../client-company.service';
import { ProOnboarding } from '../../pro-onboarding.service';
import { FoldScrollIndicatorComponent, FoldWellComponent } from '../../../../shared';
import { ShopPromise } from '../../shop-promise/shop-promise';
import { AccountCard } from '../account-card/account-card';
import { AddressesDeskCard } from '../addresses/addresses-desk-card/addresses-desk-card';
import { AddressesMobileCard } from '../addresses/addresses-mobile-card/addresses-mobile-card';
import { BankDeskCard } from '../bank/bank-desk-card/bank-desk-card';
import { BankMobileCard } from '../bank/bank-mobile-card/bank-mobile-card';
import { DataDeskCard } from '../data/data-desk-card/data-desk-card';
import { DataMobileCard } from '../data/data-mobile-card/data-mobile-card';
import { DossierCard } from '../dossier-card/dossier-card';
import { IdentityDeskCard } from '../identity/identity-desk-card/identity-desk-card';
import { IdentityMobileCard } from '../identity/identity-mobile-card/identity-mobile-card';
import { KbisDeskCard } from '../kbis/kbis-desk-card/kbis-desk-card';
import { KbisMobileCard } from '../kbis/kbis-mobile-card/kbis-mobile-card';
import { PaymentDeskCard } from '../payment/payment-desk-card/payment-desk-card';
import { PaymentMobileCard } from '../payment/payment-mobile-card/payment-mobile-card';
import { PreferencesDeskCard } from '../preferences/preferences-desk-card/preferences-desk-card';
import { PreferencesMobileCard } from '../preferences/preferences-mobile-card/preferences-mobile-card';
import { ProfileDeskCard } from '../profile/profile-desk-card/profile-desk-card';
import { ProfileMobileCard } from '../profile/profile-mobile-card/profile-mobile-card';
import { SupportCard } from '../support-card/support-card';
import { UsersDeskCard } from '../users/users-desk-card/users-desk-card';
import { UsersMobileCard } from '../users/users-mobile-card/users-mobile-card';

/**
 * Les neuf sujets, numérotés dans l'ordre de lecture. « Mes informations »
 * précède les utilisateurs : qui je suis, puis les autres.
 */
const SECTIONS = [
  'identity',
  'profile',
  'users',
  'kbis',
  'addresses',
  'bank',
  'payment',
  'preferences',
  'data',
] as const;

/**
 * Les sujets qui n'ont de sens que si la boutique permet de COMMANDER (plan
 * `plan-inscription-pro-seule.md` §4) : un régime de règlement et une habitude
 * de service ne se lisent qu'à l'aune d'une commande.
 */
const ORDER_ONLY_SECTIONS: ReadonlySet<(typeof SECTIONS)[number]> = new Set([
  'payment',
  'preferences',
]);

/**
 * Les rôles qui voient et déposent le RIB (plan `plan-rib-client.md` §2) : le
 * détenteur et le rôle comptable. L'API refuse les autres ; l'écran ne leur
 * propose pas une carte qui ne ferait que dire non.
 */
const BANK_ROLES: ReadonlySet<CompanyMemberRole> = new Set(['owner', 'billing']);

/**
 * `/mon-compte` — le dossier client, écrit pour celui qui le possède.
 *
 * **Neuf sections, pas neuf écrans.** Le back-office a une fiche à onglets parce
 * qu'un commercial y passe la journée ; un client y passe deux fois par an. Une
 * seule page, aucun sous-écran à retrouver — et le sommaire de bureau fait
 * DÉFILER, il ne change pas d'écran : chaque entrée pointe l'ancre de sa
 * section.
 *
 * **Deux cartes par section, une seule affichée** (règle de Hugo,
 * 2026-09-14). La carte BUREAU garde tout son contenu, et ses gestes
 * d'écriture ouvrent le panneau fold de la section. La carte MOBILE ne garde
 * que l'essentiel et un bouton pleine largeur en bas ; les phrases, les listes
 * et les formulaires sont dans le panneau. Les deux sont dans le DOM et le
 * CSS de la page masque l'une ou l'autre au pli — `display: none`, donc un
 * lecteur d'écran n'en lit qu'une. Les ancres du sommaire restent sur la
 * section.
 */
@Component({
  selector: 'app-compte-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AccountCard,
    AddressesDeskCard,
    AddressesMobileCard,
    BankDeskCard,
    BankMobileCard,
    ClientBannerBlock,
    ClientBannerOutlet,
    DataDeskCard,
    DataMobileCard,
    DossierCard,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldScrollIndicatorComponent,
    FoldSurfaceDirective,
    FoldWellComponent,
    IdentityDeskCard,
    IdentityMobileCard,
    KbisDeskCard,
    KbisMobileCard,
    PaymentDeskCard,
    PaymentMobileCard,
    PreferencesDeskCard,
    PreferencesMobileCard,
    ProfileDeskCard,
    ProfileMobileCard,
    ShopPromise,
    SupportCard,
    UsersDeskCard,
    UsersMobileCard,
  ],
  templateUrl: './compte-page.html',
  styleUrl: './compte-page.scss',
  // La colonne à hauteur d'écran, en pile, ne vaut que pour le dossier : un
  // état de chargement ou la carte « Compléter » défilent comme une page.
  host: { '[class.dossier]': "view() === 'dossier'" },
})
export class ComptePage {
  protected readonly t = inject(ClientCopyService).t;
  private readonly chrome = inject(ClientChrome);
  protected readonly access = inject(ClientFeatureAccess);
  protected readonly onboarding = inject(ProOnboarding);

  /**
   * Le niveau qui décide de la promesse « ouvre bientôt » — `null` tant que la
   * lecture est en vol, pour qu'elle ne clignote pas quand la boutique est
   * ouverte. Un échec vaut `closed`, donc la phrase s'affiche : le sens prudent.
   */
  protected readonly promiseLevel = computed(() =>
    this.access.state() === 'loading' ? null : this.access.shop(),
  );

  /**
   * La promesse a-t-elle quelque chose à DIRE ? Elle se tait quand on commande
   * (`order`) et tant que le niveau n'est pas lu : en pile, c'est ce qui décide
   * si elle prend la place du titre dans le bleu.
   */
  protected readonly promiseShown = computed(() => {
    const level = this.promiseLevel();
    return level === 'closed' || level === 'browse';
  });

  private readonly auth = inject(AuthFacade);
  protected readonly account = inject(AccountService);

  /**
   * **Ce que l'écran peut montrer**, un seul à la fois.
   *
   * 🔴 Il empilait tout (relevé le 2026-09-14) : une lecture de `/me` en échec
   * s'affichait « Compte non reconnu », et une personne pas encore entrée voyait
   * la carte « Compléter mon dossier » au-dessus de sept cartes de compte vides.
   * Le compte complet ne se montre donc qu'à qui a une société ; sans société,
   * seule la carte de dossier ; sans entrée, seulement de quoi entrer.
   */
  protected readonly view = computed<AccountView>(() => {
    if (this.auth.isLoading()) {
      return 'loading';
    }
    if (!this.auth.isAuthenticated()) {
      return 'signed-out';
    }
    const status = this.account.status();
    if (status === 'error') {
      return 'failed';
    }
    if (status !== 'ready') {
      return 'loading';
    }
    return this.client.company() === null ? 'incomplete' : 'dossier';
  });

  protected retry(): void {
    this.account.load();
  }

  protected signIn(): void {
    this.auth.login('/mon-compte');
  }

  /**
   * 🔴 **L'identité vient de notre base** (`GET /me`), plus d'une maquette. Cet
   * écran affichait « Brasserie Marchand », son SIRET et son n° de TVA à
   * quelqu'un qui n'est pas elle — sur l'écran censé lui dire qui il est chez
   * nous.
   */
  protected readonly client = inject(ClientCompany);
  protected readonly company = this.client.company;

  /** Le RIB ne se montre qu'au détenteur et au rôle comptable de la société. */
  protected readonly showsBank = computed(() => {
    const role = this.company()?.role;
    return role !== undefined && BANK_ROLES.has(role);
  });

  /** Le libellé de la pastille du rail : « Section 2 sur 7 ». */
  protected railPosition(active: number): string {
    return this.t()
      .account.railPosition.replace('{n}', String(active + 1))
      .replace('{total}', String(this.summary().length));
  }

  /**
   * Le sommaire — numéroté, chaque entrée pointant l'ancre de sa carte.
   *
   * La numérotation suit ce qui est MONTRÉ : une carte retirée ne laisse pas de
   * trou, sans quoi le sommaire promettrait une carte qu'on ne trouve pas.
   */
  protected readonly summary = computed(() => {
    const labels = this.t().account.sections;
    const orderable = this.access.atLeast('order');
    const bank = this.showsBank();
    const shown = SECTIONS.filter(
      (key) => (orderable || !ORDER_ONLY_SECTIONS.has(key)) && (bank || key !== 'bank'),
    );
    return shown.map((key, index) => ({
      key,
      label: labels[key],
      number: String(index + 1).padStart(2, '0'),
      anchor: `compte-${key}`,
    }));
  });

  constructor() {
    effect(() => this.chrome.kicker.set(this.t().nav.destinations.account));
    this.chrome.back.set(null);
    this.chrome.menu.set(true);
    this.chrome.bell.set(null);
    this.chrome.barOnDesktop.set(true);
    // En pile, le bandeau descend dans la page pour y défiler (voir le gabarit).
    // Rallumé en partant : l'écran suivant n'a pas repris le sien.
    this.chrome.bandNarrow.set(false);
    inject(DestroyRef).onDestroy(() => this.chrome.bandNarrow.set(true));
  }
}
