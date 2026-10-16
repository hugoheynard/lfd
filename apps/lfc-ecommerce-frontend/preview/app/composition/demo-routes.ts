import type {
  ActivationGate,
  FeatureLevelsView,
  PlacedOrderResponse,
  PublicContactSettingsView,
  PublicStorefrontPageView,
  PublishedShopCopyView,
  ShopCartResponse,
  ShopCartView,
} from '@lfd/contracts';
import { audienceOf, pickupOpenTo } from '@lfd/contracts/shop-values';

import { DEMO_CATALOGUE } from '../demo-data/demo-catalogue';
import {
  DEMO_COMPANY_ADDRESSES,
  DEMO_COMPANY_BANK_ACCOUNT,
  DEMO_COMPANY_INVOICES,
} from '../demo-data/demo-company';
import {
  DEMO_DELIVERY_AVAILABILITY,
  DEMO_DELIVERY_ZONES,
  DEMO_PICKUP_ADDRESSES,
  demoFulfillmentDays,
  demoSlots,
} from '../demo-data/demo-places';
import { demoMyQuote, demoQuote, readQuoteRequest } from '../demo-data/demo-quote';
import { demoDay } from '../demo-data/demo-days';
import type { PreviewWorld } from '../journeys/preview-world';

/** Une demande, telle que le backend de démonstration la lit. */
export interface DemoRequest {
  readonly method: string;
  /** Le chemin SOUS l'API, sans requête : `/shop/catalogue`. */
  readonly path: string;
  readonly params: URLSearchParams;
  readonly body: unknown;
}

/** Ce qu'une route répond : un corps (200), ou un statut d'échec délibéré. */
export type DemoAnswer =
  | { readonly status: 200; readonly body: unknown }
  | { readonly status: 404; readonly reason: string };

interface DemoRoute {
  readonly method: 'GET' | 'POST' | 'PUT';
  readonly pattern: RegExp;
  /** Ce que la route répond, et pourquoi — c'est la liste qu'on lit dans le rapport. */
  readonly serves: string;
  answer(request: DemoRequest, match: RegExpExecArray, world: PreviewWorld): DemoAnswer;
}

const ok = (body: unknown): DemoAnswer => ({ status: 200, body });

/** L'identifiant de la commande que la passation simulée rend. */
export const DEMO_ORDER_ID = 'demo-order';

const FEATURE_LEVELS: FeatureLevelsView = { customerMandate: 'closed', facebookLogin: 'hidden' };
const EMPTY_STOREFRONT: PublicStorefrontPageView = { rows: 0, objects: [] };
const EMPTY_TEXT = { fr: '', en: '', it: '' } as const;
const EMPTY_CARD = { kicker: EMPTY_TEXT, title: EMPTY_TEXT, body: EMPTY_TEXT } as const;
/** Cartes vides : la boutique garde alors ses propres textes — ceux qu'on édite. */
const CONTACT_SETTINGS: PublicContactSettingsView = {
  phones: [],
  cards: { b2b: EMPTY_CARD, b2c: EMPTY_CARD },
};
const ACTIVATION: ActivationGate = { canActivate: true, blocking: [], checklist: [] };

/**
 * **Ce que le backend de démonstration sert** — toutes les LECTURES du
 * parcours de commande, depuis les données du parcours, et TROIS écritures
 * simulées, en mémoire, faute de quoi le parcours ne se jouerait pas :
 *
 * - le **devis** (`POST /shop/quote[/mine]`) : une lecture qui porte un corps ;
 * - le **panier enregistré** (`PUT /shop/cart`) : renvoyé tel quel, rien n'est gardé ;
 * - la **passation** (`POST /shop/orders`, `POST /orders`) : rend une commande
 *   fictive, pour que la confirmation ait quelque chose à dire.
 *
 * Toute autre écriture est refusée (`demo-http-backend.ts`).
 */
export const DEMO_ROUTES: readonly DemoRoute[] = [
  {
    method: 'GET',
    pattern: /^\/shop\/copy$/u,
    serves: 'aucun remplacement publié : l’éditeur envoie les siens par message',
    answer: (request): DemoAnswer => {
      const locale = request.params.get('locale');
      const view: PublishedShopCopyView = {
        locale: locale === 'en' || locale === 'it' ? locale : 'fr',
        version: 0,
        texts: {},
      };
      return ok(view);
    },
  },
  {
    method: 'GET',
    pattern: /^\/feature-access(\/mine)?$/u,
    serves: 'les niveaux par défaut du code',
    answer: () => ok(FEATURE_LEVELS),
  },
  {
    method: 'GET',
    pattern: /^\/order-opening$/u,
    serves: 'l’ouverture du parcours',
    answer: (_request, _match, world) => ok(world.opening),
  },
  {
    method: 'GET',
    pattern: /^\/shop\/catalogue(\/mine)?$/u,
    serves: 'le catalogue de démonstration',
    answer: () => ok(DEMO_CATALOGUE),
  },
  {
    method: 'GET',
    pattern: /^\/shop\/storefront\/[^/]+(\/mine)?$/u,
    serves: 'une vitrine vide : le rayon se range par défaut',
    answer: () => ok(EMPTY_STOREFRONT),
  },
  {
    method: 'GET',
    pattern: /^\/pickup-addresses$/u,
    serves: 'deux maisons de démonstration',
    answer: () => ok(DEMO_PICKUP_ADDRESSES),
  },
  {
    method: 'GET',
    pattern: /^\/pickup-addresses\/mine$/u,
    serves: 'les maisons de démonstration ouvertes à la clientèle de la scène',
    // Depuis ba8ed5302, un client reconnu lit ses points ici : filtrés par sa
    // clientèle, comme le serveur (une société active = pro).
    answer: (_request, _match, world) => {
      const status = world.account?.companies[0]?.status ?? null;
      const audience = audienceOf(status);
      return ok(DEMO_PICKUP_ADDRESSES.filter((point) => pickupOpenTo(point, audience)));
    },
  },
  {
    method: 'GET',
    pattern: /^\/pickup-addresses\/[^/]+\/creneaux$/u,
    serves: 'des créneaux du jour demandé, le premier complet',
    answer: (request) => ok(demoSlots(request.params.get('jour') ?? demoDay(1))),
  },
  {
    method: 'GET',
    pattern: /^\/delivery-zones$/u,
    serves: 'une zone de livraison',
    answer: () => ok(DEMO_DELIVERY_ZONES),
  },
  {
    method: 'GET',
    pattern: /^\/delivery-availability$/u,
    serves: 'la livraison ouverte aux deux clientèles',
    answer: () => ok(DEMO_DELIVERY_AVAILABILITY),
  },
  {
    method: 'GET',
    pattern: /^\/fulfillment-days$/u,
    serves: 'le lendemain pour toutes les maisons',
    answer: () => ok(demoFulfillmentDays()),
  },
  {
    method: 'GET',
    pattern: /^\/me$/u,
    serves: 'la personne du parcours',
    answer: (_request, _match, world) =>
      world.account === null ? { status: 404, reason: 'visiteur' } : ok(world.account),
  },
  {
    method: 'GET',
    pattern: /^\/me\/loyalty$/u,
    serves: 'la fidélité du parcours',
    answer: (_request, _match, world) => ok(world.loyalty),
  },
  {
    method: 'GET',
    pattern: /^\/shop\/cart$/u,
    serves: 'aucun panier enregistré : le parcours pose le sien',
    answer: () => ok({ cart: null } satisfies ShopCartResponse),
  },
  {
    method: 'GET',
    pattern: /^\/contact-settings$/u,
    serves: 'des cartes de contact vides — la boutique garde ses textes',
    answer: () => ok(CONTACT_SETTINGS),
  },
  {
    method: 'GET',
    pattern: /^\/request-reasons$/u,
    serves: 'aucun motif de demande',
    answer: () => ok([]),
  },
  {
    method: 'GET',
    pattern: /^\/content\/footer$/u,
    serves: 'rien : le pied de page garde le texte du code',
    answer: () => ({ status: 404, reason: 'pied de page du code' }),
  },
  {
    method: 'GET',
    pattern: /^\/(orders\/mine|companies\/[^/]+\/orders)$/u,
    serves: 'aucune commande passée — le suivi reste vide',
    answer: () => ok([]),
  },
  {
    method: 'GET',
    pattern: /^\/subscriptions\/mine$/u,
    serves: 'aucun abonnement',
    answer: () => ok([]),
  },
  {
    method: 'GET',
    pattern: /^\/orders\/[^/]+\/payment$/u,
    serves: 'une intention de paiement fictive (aucun Stripe ne la lit)',
    answer: (_request, _match, world) =>
      world.placement.payment === undefined
        ? { status: 404, reason: 'rien à régler' }
        : ok(world.placement.payment),
  },
  {
    method: 'GET',
    pattern: /^\/companies\/[^/]+\/activation$/u,
    serves: 'une société activable',
    answer: () => ok(ACTIVATION),
  },
  {
    method: 'GET',
    pattern: /^\/companies\/[^/]+\/addresses$/u,
    serves: 'le carnet de la société : une facturation, une livraison par défaut',
    answer: () => ok(DEMO_COMPANY_ADDRESSES),
  },
  {
    method: 'GET',
    pattern: /^\/companies\/[^/]+\/bank-account$/u,
    serves: 'aucun RIB déposé',
    answer: () => ok(DEMO_COMPANY_BANK_ACCOUNT),
  },
  {
    method: 'GET',
    pattern: /^\/companies\/[^/]+\/invoices$/u,
    serves: 'aucune facture émise',
    answer: () => ok(DEMO_COMPANY_INVOICES),
  },
  {
    method: 'POST',
    pattern: /^\/shop\/quote$/u,
    serves: 'le décompte du catalogue de démonstration',
    answer: (request) => quoteAnswer(request.body, (quote) => demoQuote(quote)),
  },
  {
    method: 'POST',
    pattern: /^\/shop\/quote\/mine$/u,
    serves: 'le décompte, avec les points qu’il rapporterait',
    answer: (request, _match, world) =>
      quoteAnswer(request.body, (quote) => demoMyQuote(quote, world.loyalty.open)),
  },
  {
    method: 'PUT',
    pattern: /^\/shop\/cart$/u,
    serves: 'le panier renvoyé tel quel, rien n’est gardé',
    answer: (request) => ok(savedCart(request.body)),
  },
  {
    method: 'POST',
    pattern: /^\/(shop\/)?orders$/u,
    serves: 'une commande fictive, pour que la confirmation ait quelque chose à dire',
    answer: (_request, _match, world) => ok(placed(world)),
  },
];

function quoteAnswer(
  body: unknown,
  price: (request: NonNullable<ReturnType<typeof readQuoteRequest>>) => unknown,
): DemoAnswer {
  const request = readQuoteRequest(body);
  return request === null ? { status: 404, reason: 'devis illisible' } : ok(price(request));
}

function savedCart(body: unknown): ShopCartView {
  const request = readQuoteRequest(body);
  return { lines: [...(request?.lines ?? [])], savedAt: new Date().toISOString() };
}

function placed(world: PreviewWorld): PlacedOrderResponse {
  return { id: DEMO_ORDER_ID, orderNumber: 'APERCU-0001', ...world.placement };
}
