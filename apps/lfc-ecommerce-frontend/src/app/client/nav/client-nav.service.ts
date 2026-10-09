import { computed, inject, Injectable, Injector, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { ClientOrderHistory } from '../mes-commandes/client-order-history.service';
import { ClientLoyalty } from '../client-loyalty.service';
import { ClientSubscriptions } from '../client-subscriptions.service';
import { ClientCopyService } from '../copy/client-copy.service';
import { ClientWorkspace } from '../client-workspace.service';
import { AccountService } from '../../account/account.service';
import { companyScreensClosed } from '../company-screens';
import { ProOnboarding } from '../pro-onboarding.service';

/** Une destination du menu, telle qu'elle est DÉCLARÉE — sans compteur ni libellé. */
interface Destination {
  readonly id: 'shop' | 'orders' | 'loyalty' | 'invoices' | 'baskets' | 'account';
  readonly route: string;
  /**
   * L'écran existe-t-il ?
   *
   * Faux ne retire pas la destination : la réf pose que **l'ordre des
   * destinations ne change jamais** entre le menu mobile, la sous-barre et le rail. Une
   * destination qui disparaîtrait le temps qu'on écrive son écran ferait bouger
   * les quatre autres, et l'habitude du pouce avec.
   */
  readonly ready: boolean;
  /**
   * Un écran de SOCIÉTÉ : retiré en perso pour qui en a une (Hugo, 2026-09-15) —
   * le dossier, le relevé, les paniers récurrents. `companyWorkspaceGuard` ferme
   * les adresses qui ont une route.
   */
  readonly companyOnly?: true;
  /**
   * Un écran de la PERSONNE qui ne paraît que si le serveur l'a dit ouvert :
   * « Ma fidélité », en espace personnel connecté et programme ouvert au
   * public (plan des points, §12). Fermé, rien ne dit « bientôt ».
   */
  readonly loyaltyOnly?: true;
}

/**
 * L'ordre, et il est le même partout. Voir `07-accueil-connecte.md`.
 *
 * Le PANIER n'en fait pas partie : il vit dans la barre d'app, où il est
 * atteignable depuis n'importe quel écran sans ouvrir de menu. Un panier a une
 * quantité qui change en permanence — il appartient au chrome permanent, pas à
 * une liste de destinations qu'on parcourt.
 *
 * ⚠️ Ce commentaire écartait aussi la BOUTIQUE — « on n'y va pas, on y arrive
 * par une commande ». Le rayon a cessé de le justifier : il se VISITE sans
 * qu'aucun mode de service ait été choisi, et c'est écrit dans `rayon-page`
 * (« c'est ce que "je visite la boutique" promet » ; le mode n'est exigé que
 * pour régler). Une destination atteignable sans préalable et qu'aucun menu
 * n'annonce n'est pas une décision de parcours, c'est une porte cachée : il
 * fallait passer par « Nouvelle commande » et répondre à une question pour
 * voir le catalogue, alors que le regarder ne demande rien.
 *
 * Elle vient EN TÊTE depuis le 2026-09-21. Elle était deuxième, derrière
 * « Mon espace », qui était l'ancre — l'écran où l'on atterrissait en se
 * connectant. Cet écran a disparu dans `/bienvenue`, qui n'est pas une
 * destination du menu mais l'accueil : le menu commence donc par ce qu'on
 * FAIT, puis vient ce qu'on CONSULTE (commandes, factures, paniers, compte).
 *
 * ⚠️ Elle ne fait pas double emploi avec la tuile « Nouvelle commande » du haut
 * du menu : celle-là OUVRE une commande — mode de service d'abord —, celle-ci
 * mène au rayon. Deux intentions, deux adresses.
 */
const DESTINATIONS: readonly Destination[] = [
  { id: 'shop', route: '/boutique', ready: true },
  { id: 'orders', route: '/mes-commandes', ready: true },
  { id: 'loyalty', route: '/ma-fidelite', ready: true, loyaltyOnly: true },
  { id: 'invoices', route: '/mes-factures', ready: true, companyOnly: true },
  { id: 'baskets', route: '/paniers-recurrents', ready: false, companyOnly: true },
  { id: 'account', route: '/mon-compte', ready: true, companyOnly: true },
];

/**
 * Les adresses des écrans de SOCIÉTÉ — lues sur la même liste que le menu, pour
 * que la bascule d'espace (`ClientWorkspaceSwitch`) quitte exactement ce que le
 * menu retire en perso.
 */
export const COMPANY_ONLY_ROUTES: readonly string[] = DESTINATIONS.filter(
  (destination) => destination.companyOnly === true,
).map((destination) => destination.route);

/** Une destination prête à être dessinée, dans l'une ou l'autre des deux formes. */
export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  readonly ready: boolean;
  /**
   * Le compteur LONG (`7 · 13,70 €`, `1 à régler`) — seul le menu mobile pleine
   * page a la largeur de l'écrire.
   */
  readonly count: string;
  /** Le compteur COURT (`7`, `14`, `1`) — celui des deux bandes horizontales. */
  readonly countShort: string;
  /** Ce qui appelle une action plutôt qu'il n'informe : la pastille passe au beurre. */
  readonly warn: boolean;
}

/**
 * Les destinations de l'app cliente, comptées — six, et une septième, « Ma
 * fidélité », en espace personnel quand le programme est ouvert (2026-09-27).
 * Elle ne s'intercale pas au gré d'un écran en chantier : elle paraît ou non
 * selon un réglage durable. Les niveaux de boutique et les surfaces masquables
 * (`shop`, `orders`, `invoices`) qui en retiraient d'autres ont été retirés le
 * 2026-10-09 : ces destinations sont toujours montrées.
 *
 * Un seul endroit les déclare, et les trois surfaces qui les affichent (menu
 * mobile, sous-barre desktop, et le rail le jour où il existera) le lisent : la
 * réf exige que leur ORDRE ne varie jamais d'une surface à l'autre, ce qu'aucune
 * relecture ne garantit si chacune tient sa propre liste.
 *
 * Les compteurs viennent des mêmes sources que les écrans — les commandes
 * réellement passées, les gabarits récurrents réellement enregistrés.
 *
 * 🔴 **Les FACTURES n'en ont plus.** Elles annonçaient « 1 à régler », une
 * constante, sur une destination qui n'a aucun modèle derrière elle : aucune
 * facture n'est émise nulle part dans ce système. Une pastille d'alerte devant
 * un écran vide est la pire des maquettes — elle fait ouvrir l'écran.
 */
@Injectable({ providedIn: 'root' })
export class ClientNav {
  private readonly orders = inject(ClientOrderHistory);
  private readonly workspace = inject(ClientWorkspace);
  private readonly account = inject(AccountService);
  private readonly onboarding = inject(ProOnboarding);
  private readonly injector = inject(Injector);
  private readonly t = inject(ClientCopyService).t;
  private readonly router = inject(Router);
  private readonly loyalty = inject(ClientLoyalty);

  /**
   * L'adresse courante, en SIGNAL.
   *
   * `Router.url` est une propriété nue : un `computed()` qui la lirait ne se
   * recalculerait jamais, et l'onglet actif resterait figé sur celui de la
   * première page — un défaut qui ne se voit qu'en naviguant, donc jamais dans
   * un rendu isolé.
   *
   * Elle vit ici et pas dans les deux composants : le menu et la sous-barre
   * doivent souligner LA MÊME destination, et deux dérivations séparées sont
   * deux occasions de diverger.
   */
  readonly current = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split('?')[0] ?? ''),
    ),
    { initialValue: this.router.url.split('?')[0] ?? '' },
  );

  readonly items = computed<readonly NavItem[]>(() =>
    DESTINATIONS.filter(
      (d) =>
        !(d.companyOnly === true && this.companyScreensClosed()) &&
        // `isOpen` n'est vrai qu'en espace personnel connecté : le service rend
        // `{ open: false }` ailleurs sans appel, et lit une seule fois sinon.
        (d.loyaltyOnly !== true || this.loyalty.isOpen()),
    ).map((d) => ({
      id: d.id,
      route: d.route,
      ready: d.ready,
      label: this.t().nav.destinations[d.id],
      ...this.counts(d.id),
    })),
  );

  /** Le nombre d'items porteurs d'un compteur — ce que la cloche du menu annonce. */
  /**
   * En perso, pour qui a une société : ses écrans de société n'ont rien à
   * montrer. Sans aucune société, Mon compte reste — c'est la porte pro.
   */
  /**
   * 🔴 La RÈGLE vit dans `company-screens.ts`, elle n'est plus écrite ici
   * (Hugo, 2026-09-22). Le menu et `companyWorkspaceGuard` en portaient chacun
   * une version — identiques par chance et non par construction — et toutes
   * deux laissaient passer le cas de qui n'a AUCUNE société.
   */
  private readonly companyScreensClosed = computed(() =>
    companyScreensClosed({
      isPersonal: this.workspace.isPersonal(),
      hasChoice: this.workspace.hasChoice(),
      hasNoCompany: this.account.hasNoCompany(),
      declarationUnderway: this.onboarding.declarationUnderway(),
    }),
  );

  readonly pending = computed(() => this.items().filter((i) => i.countShort !== '').length);

  private counts(id: Destination['id']): Pick<NavItem, 'count' | 'countShort' | 'warn'> {
    if (id === 'orders') {
      // 🔴 Ce compteur lisait le `localStorage`, pendant que l'écran qu'il
      // annonce lit le serveur : le badge pouvait dire « 0 » devant une liste
      // pleine. Même source des deux côtés, désormais.
      const placed = this.orders.orders().length;
      return placed === 0
        ? EMPTY
        : { count: String(placed), countShort: String(placed), warn: false };
    }
    // ⚠️ `invoices` n'a AUCUN compteur, et c'est délibéré : rien n'émet de
    // facture. Le jour où la facturation existe, c'est ici que son compte se
    // branche — pas avant.
    if (id === 'baskets') {
      // Le service n'est construit QUE si la destination paraît : il lit
      // `/subscriptions/mine` dès sa construction, et un menu réduit ne lit pas
      // ce qu'il ne montre pas (plan §9). `untracked` parce qu'il pose un effet,
      // ce qu'Angular refuse depuis un contexte réactif.
      const subscriptions = untracked(() => this.injector.get(ClientSubscriptions));
      const models = subscriptions.all().length;
      return models === 0
        ? EMPTY
        : {
            count: this.t().nav.basketsCount.replace('{n}', String(models)),
            countShort: String(models),
            warn: false,
          };
    }
    return EMPTY;
  }
}

/** Pas de compteur : la pastille n'existe pas, elle n'est pas à zéro. */
const EMPTY = { count: '', countShort: '', warn: false } as const;
