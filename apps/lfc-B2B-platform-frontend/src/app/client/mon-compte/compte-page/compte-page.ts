import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
} from '@angular/core';
import type { CartAdjustment, CompanyMemberRole } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
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
import { ClientAddresses } from '../../client-addresses.service';
import { ClientCompany } from '../../client-company.service';
import { ClientLocale, LOCALES } from '../../client-locale.service';
import { formatCents, formatRate } from '../../format-money';
import { ServicePoints } from '../../shop/pickup-points.store';
import { ProOnboarding } from '../../pro-onboarding.service';
import { FoldScrollIndicatorComponent, FoldWellComponent } from '../../../../shared';
import { ShopPromise } from '../../shop-promise/shop-promise';
import { AccountCard } from '../account-card/account-card';
import { BankCard } from '../bank-card/bank-card';
import { DataCard } from '../data-card/data-card';
import { DossierCard } from '../dossier-card/dossier-card';
import { IdentityPanel } from '../identity-panel/identity-panel';
import { KbisCard } from '../kbis-card/kbis-card';
import { SupportCard } from '../support-card/support-card';
import { UsersCard } from '../users-card/users-card';

/** Les huit sujets, numérotés dans l'ordre de lecture. */
const SECTIONS = [
  'identity',
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
 * Les rôles qui éditent l'identité : ceux que l'API laisse écrire (vérifié le
 * 2026-09-14, `update-company-identity.handler.ts` refuse les autres en 403).
 * Aux autres, pas de bouton — un « Modifier » qui finirait en refus se lit
 * comme une panne.
 */
const IDENTITY_EDIT_ROLES: ReadonlySet<CompanyMemberRole> = new Set(['owner', 'admin']);

/**
 * Le pli de l'écran, en requête : le même seuil que `compte-page.scss` et que
 * le rail de `fold-well` (`scrollable="narrow"`). En deçà, les panneaux
 * montent du bas ; au-delà, ils s'amarrent à droite. Aucune constante de
 * l'app ne le porte en TypeScript (vérifié le 2026-09-14) : le CSS l'écrit
 * seul partout ailleurs.
 */
const NARROW_QUERY = '(max-width: 899.98px)';

/**
 * `/mon-compte` — le dossier client, écrit pour celui qui le possède.
 *
 * **Sept cartes, pas sept écrans.** Le back-office a une fiche à onglets parce
 * qu'un commercial y passe la journée ; un client y passe deux fois par an. Une
 * seule page qui descend, chaque carte autonome, aucun sous-écran à retrouver —
 * et le sommaire de bureau fait DÉFILER, il ne change pas d'écran. C'est écrit
 * sous la liste, et c'est vrai : chaque entrée pointe l'ancre de sa carte.
 *
 * Ce qui passe par nous le DIT. L'enseigne se change en autonomie ; raison
 * sociale, forme juridique, SIRET et TVA sont en lecture, avec la phrase qui
 * explique pourquoi — ce sont les mentions qui figurent sur les factures. Aucune
 * illusion de champ modifiable, et aucun champ grisé non plus : un champ mort se
 * lit comme une panne, une phrase se lit comme une règle.
 */
@Component({
  selector: 'app-compte-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AccountCard,
    BankCard,
    ClientBannerBlock,
    ClientBannerOutlet,
    DataCard,
    DossierCard,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldScrollIndicatorComponent,
    FoldSurfaceDirective,
    FoldWellComponent,
    KbisCard,
    ShopPromise,
    SupportCard,
    UsersCard,
  ],
  templateUrl: './compte-page.html',
  styleUrl: './compte-page.scss',
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

  /** « Modifier » sur l'identité légale, au détenteur et à l'administrateur seulement. */
  protected readonly canEditIdentity = computed(() => {
    const role = this.company()?.role;
    return role !== undefined && IDENTITY_EDIT_ROLES.has(role);
  });

  private readonly panels = inject(FoldPanelHostService);

  /**
   * Ouvre le panneau d'identité dans l'hôte de panneaux du shell client — qui
   * porte `data-theme="lfc-app"`, donc les jetons de l'app.
   *
   * Les valeurs partent en `data` au moment du clic : le panneau édite ce que
   * la carte montrait, et la relecture de `/me` qui suit un succès ne le
   * réécrit pas sous les doigts.
   */
  protected openIdentity(): void {
    const company = this.company();
    if (company === null) {
      return;
    }
    this.panels.open(IdentityPanel, {
      // Lu AU CLIC, pas en signal : c'est un geste, donc toujours dans le
      // navigateur, et la largeur qui compte est celle du moment où l'on ouvre.
      side: matchMedia(NARROW_QUERY).matches ? 'bottom' : 'right',
      data: {
        companyId: company.id,
        enseigne: company.enseigne,
        vatNumber: company.vatNumber,
        raisonSociale: company.raisonSociale,
        formeJuridique: company.formeJuridique,
        siret: company.siret,
      },
    });
  }

  /** Le libellé de la pastille du rail : « Section 2 sur 7 ». */
  protected railPosition(active: number): string {
    return this.t()
      .account.railPosition.replace('{n}', String(active + 1))
      .replace('{total}', String(this.summary().length));
  }

  private readonly addresses = inject(ClientAddresses);
  private readonly service = inject(ServicePoints);
  private readonly locale = inject(ClientLocale);

  /**
   * 🔴 **Les adresses viennent de notre base**, plus d'une maquette
   * (`GET /companies/:id/addresses`). Ce sont les mêmes que celles du carnet du
   * checkout, et c'est le point : deux listes d'adresses pour un même client
   * finiraient par ne pas dire la même chose.
   *
   * La zone et son tarif sont **calculés** sur le code postal, par le même
   * préfixe que le serveur — la maquette les écrivait à côté (« zone 1 · 20 € »)
   * sans qu'aucun barème ne les soutienne.
   */
  protected readonly deliveries = computed(() =>
    this.addresses.deliveries().map((address) => {
      const zone = this.service.zoneFor(address.codePostal);
      return {
        id: address.id,
        label: address.label,
        primary: address.isDefault,
        line: `${address.ligne1}, ${address.codePostal} ${address.ville}`,
        // Pas de zone = pas de livraison à cette adresse. Un tiret le dit ;
        // inventer « zone 1 » promettrait une tournée qui ne passe pas.
        zone: zone?.label ?? this.t().account.addressNoZone,
        fee: zone === null ? '—' : feeOf(zone.fee),
      };
    }),
  );

  /** L'adresse de facturation déclarée, ou la mention d'absence. */
  protected readonly billing = computed(() => {
    const billing = this.addresses.billing();
    return billing === null
      ? this.t().account.addressNone
      : `${billing.ligne1}, ${billing.codePostal} ${billing.ville}`;
  });

  /**
   * **Comment cette maison est servie d'habitude** — le point de départ de ses
   * commandes, jamais une contrainte.
   *
   * 🔴 La maquette écrivait « Le Labo · 7 h – 8 h », un point ET un créneau, en
   * dur. La préférence porte un MODE et une adresse, jamais une heure : un
   * créneau se choisit à chaque commande, et l'annoncer comme une habitude
   * laissait croire qu'il était réservé.
   */
  protected readonly habit = computed(() => {
    const preference = this.client.company()?.fulfillmentPreference ?? null;
    const copy = this.t().account;
    if (preference === null || preference.method === null) {
      return copy.prefNone;
    }
    if (preference.method === 'pickup') {
      const point = this.service.pickups().find((p) => p.id === preference.pickupAddressId);
      return point === undefined ? copy.prefPickupAny : `${copy.prefPickupAt} ${point.label}`;
    }
    const address = this.addresses.deliveries().find((a) => a.id === preference.deliveryAddressId);
    return address === undefined ? copy.prefDeliveryAny : `${copy.prefDeliveryTo} ${address.label}`;
  });

  /**
   * La langue de l'interface — celle qu'on est **en train de lire**.
   *
   * Elle était écrite « Français » en dur, ce qui restait juste jusqu'à ce que
   * quelqu'un bascule en anglais : l'écran affirmait alors le contraire de ce
   * qu'il montrait.
   */
  protected readonly language = computed(() => {
    const code = this.locale.current();
    return LOCALES.find((entry) => entry.code === code)?.name ?? code;
  });

  protected readonly deliveryCount = computed(() =>
    this.t().account.deliveryCount.replace('{n}', String(this.deliveries().length)),
  );

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

/** Un frais de zone tel qu'il se lit : « 8,00 € » ou « 3 % ». */
function feeOf(fee: CartAdjustment): string {
  return fee.mode === 'amount' ? formatCents(fee.cents) : formatRate(fee.bp / 100);
}
