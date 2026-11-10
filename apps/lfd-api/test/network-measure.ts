/**
 * **La mesure des appels réseau dans une transaction**, côté e2e
 * (`documentation/todos/todo-reseau-hors-transaction.md`, 2026-11-06).
 *
 * Allumée par `E2E_NETWORK_LOG` seulement ; sans la variable, rien n'est
 * mesuré ni écrit. Elle écoute la garde (`assertOutsideTransaction`) et
 * écrit une ligne JSON par violation : la suite, le cas, l'appel, sa pile, et
 * la pile d'ouverture de la transaction.
 *
 * ⚠️ Un e2e double la plupart des tiers (Stripe, l'envoi, le stockage des
 * médias, les identités de dev, les adaptateurs « désactivés » sans URL) : la
 * garde posée dans l'adaptateur RÉEL ne s'exécute alors jamais. Pour que la
 * mesure voie quand même ces appels, chaque instance servie sous un jeton
 * sortant est enveloppée ici — sauf l'adaptateur réel, qui se garde déjà
 * (sans quoi chaque appel compterait deux fois). Instrument de mesure, pas
 * double : le comportement de l'instance ne change pas.
 *
 * Les cartes n'ont plus de jeton ici depuis le lot P0.c2 du plan M2
 * (2026-11-09) : le jeton doublé est le registre `CardProviders`, dont les
 * méthodes s'appellent légitimement sous transaction (le choix d'un compte),
 * et c'est le prestataire doublé (`E2eCardProvider`, `card-payments.ts`) qui
 * pose lui-même la garde sur ses appels « réseau », comme l'adaptateur réel.
 */
import { appendFileSync } from "node:fs";
import { relative } from "node:path";

import type { INestApplication } from "@nestjs/common";

import { CustomerIdentityPort } from "../src/b2b/account/domain/ports/customer-identity.port.js";
import { EstablishmentDirectory } from "../src/b2b/account/domain/ports/establishment-directory.js";
import { PublicShelfStateReader } from "../src/b2b/catalog/domain/ports/public-shelf-state.reader.js";
import { ShopShelfCache } from "../src/b2b/catalog/domain/ports/shop-shelf-cache.js";
import { ShopShelfSwitch } from "../src/b2b/catalog/domain/ports/shop-shelf-switch.js";
import { MarketDirectory } from "../src/b2b/growth/domain/ports/market-directory.js";
import { CheckoutGateway } from "../src/b2b/payments/domain/ports/checkout-gateway.js";
import { PublicSettingsEdgeCache } from "../src/b2b/shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { ShopCopyEdgeCache } from "../src/b2b/shop-copy/domain/ports/shop-copy-edge-cache.js";
import { DistanceMatrix } from "../src/delivery/domain/ports/distance-matrix.js";
import { Geocoder } from "../src/delivery/domain/ports/geocoder.js";
import { RoadRoutingWaker } from "../src/delivery/domain/ports/road-routing-waker.js";
import { RouteGeometry } from "../src/delivery/domain/ports/route-geometry.js";
import { MAILER } from "../src/mail/templates/mailer.tokens.js";
import {
  assertOutsideTransaction,
  onNetworkCallViolation,
} from "../src/platform/database/outside-transaction.js";
import { traceTransactionOrigins } from "../src/platform/database/transaction.store.js";
import { InboundMailReader } from "../src/platform/mailer/inbound/inbound-mail.reader.js";
import { WebhookPoster } from "../src/platform/outbound/webhook-poster.js";
import { CustomerDocumentStore } from "../src/platform/storage/customer-document-store.js";
import { DocumentStore } from "../src/platform/storage/document-store.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
import { ProductionDocumentStore } from "../src/platform/storage/production-document-store.js";
import { StaffIdentityPort } from "../src/staff/invitations/staff-identity.port.js";
import { StaffPushSender } from "../src/staff/notifications/domain/ports/staff-push.js";
import { E2E_NETWORK_LOG } from "./setup-env.js";

/** Les jetons servis par un adaptateur sortant, et le nom de leur tiers. */
/** Un jeton Nest : une classe (abstraite comprise) ou un symbole. */
type ProviderToken = symbol | (abstract new (...args: never[]) => unknown);

const OUTBOUND_TOKENS: readonly { readonly token: ProviderToken; readonly name: string }[] = [
  { token: CheckoutGateway, name: "Stripe.CheckoutGateway" },
  { token: MAILER, name: "Resend.MAILER" },
  { token: InboundMailReader, name: "Resend.InboundMailReader" },
  { token: MediaStore, name: "R2.MediaStore" },
  { token: DocumentStore, name: "S3.DocumentStore" },
  { token: CustomerDocumentStore, name: "S3.CustomerDocumentStore" },
  { token: ProductionDocumentStore, name: "S3.ProductionDocumentStore" },
  { token: CustomerIdentityPort, name: "Auth0.CustomerIdentityPort" },
  { token: StaffIdentityPort, name: "Auth0.StaffIdentityPort" },
  { token: DistanceMatrix, name: "OSRM.DistanceMatrix" },
  { token: RouteGeometry, name: "OSRM.RouteGeometry" },
  { token: RoadRoutingWaker, name: "OSRM.RoadRoutingWaker" },
  { token: Geocoder, name: "BAN.Geocoder" },
  { token: WebhookPoster, name: "webhook.WebhookPoster" },
  { token: StaffPushSender, name: "web-push.StaffPushSender" },
  { token: ShopShelfCache, name: "Cloudflare.ShopShelfCache" },
  { token: ShopShelfSwitch, name: "Cloudflare.ShopShelfSwitch" },
  { token: PublicShelfStateReader, name: "Cloudflare.PublicShelfStateReader" },
  { token: ShopCopyEdgeCache, name: "Cloudflare.ShopCopyEdgeCache" },
  { token: PublicSettingsEdgeCache, name: "Cloudflare.PublicSettingsEdgeCache" },
  { token: EstablishmentDirectory, name: "recherche-entreprises.EstablishmentDirectory" },
  { token: MarketDirectory, name: "recherche-entreprises.MarketDirectory" },
];

/**
 * Les classes qui se gardent elles-mêmes, ou délèguent à une classe gardée :
 * les envelopper compterait chaque appel deux fois (relevé le 2026-11-06).
 */
const SELF_GUARDED: ReadonlySet<string> = new Set([
  "StripeCheckoutGateway",
  "EffectiveCopyMailer",
  "ResendInboundMailReader",
  "R2MediaStore",
  "S3DocumentStore",
  "KeptDocumentStore",
  "Auth0CustomerIdentity",
  "SubjectRoutedCustomerIdentity",
  "Auth0StaffIdentity",
  "OsrmDistanceMatrix",
  "OsrmRouteGeometry",
  "OsrmRoadRoutingWaker",
  "BanGeocoder",
  "PinnedHttpsWebhookPoster",
  "WebPushSender",
  "DurableObjectShopShelfCache",
  "DurableObjectShopShelfSwitch",
  "InternalPublicShelf",
  "InternalShopCopyEdgeCache",
  "InternalPublicSettingsEdgeCache",
  "RechercheEntreprisesEstablishmentDirectory",
  "RechercheEntreprisesDirectory",
]);

/** Une mesure allumée : à arrêter à la fermeture de l'application. */
export interface NetworkMeasure {
  readonly stop: () => void;
}

/** Allume la mesure si `E2E_NETWORK_LOG` est posé ; sinon, ne fait rien. */
export function startNetworkMeasure(app: INestApplication): NetworkMeasure {
  const target = E2E_NETWORK_LOG;
  if (target === undefined || target === "") {
    return { stop: () => undefined };
  }
  traceTransactionOrigins(true);
  for (const { token, name } of OUTBOUND_TOKENS) {
    const instance: unknown = app.get(token, { strict: false });
    instrument(instance, name);
  }
  const suite = relative(process.cwd(), expect.getState().testPath ?? "inconnu");
  const unsubscribe = onNetworkCallViolation((violation) => {
    const line = { suite, test: expect.getState().currentTestName ?? null, ...violation };
    appendFileSync(target, `${JSON.stringify(line)}\n`);
  });
  return {
    stop: () => {
      unsubscribe();
      traceTransactionOrigins(false);
    },
  };
}

/** Enveloppe chaque méthode de l'instance d'un appel à la garde, sans rien changer d'autre. */
function instrument(instance: unknown, name: string): void {
  if (typeof instance !== "object" || instance === null) return;
  const className: unknown = Reflect.get(instance.constructor, "name");
  if (typeof className === "string" && SELF_GUARDED.has(className)) return;
  for (const method of methodNames(instance)) {
    const original: unknown = Reflect.get(instance, method);
    if (typeof original !== "function") continue;
    Reflect.set(instance, method, function guarded(this: unknown, ...args: unknown[]): unknown {
      assertOutsideTransaction(`${name}.${method}`);
      const result: unknown = Reflect.apply(original, this, args);
      return result;
    });
  }
}

/** Les méthodes de l'instance : ses propres fonctions et celles de sa chaîne de prototypes. */
function methodNames(instance: object): readonly string[] {
  const names = new Set<string>();
  for (let proto: object | null = instance; proto !== null && proto !== Object.prototype;) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      if (key !== "constructor" && typeof descriptor?.value === "function") names.add(key);
    }
    proto = Reflect.getPrototypeOf(proto);
  }
  return [...names];
}
