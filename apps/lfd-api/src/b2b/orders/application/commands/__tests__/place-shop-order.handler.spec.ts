import {
  DEFAULT_DELIVERY_AVAILABILITY,
  type CatalogPricing,
  type DeliveryAvailabilityView,
  type DeliveryZoneView,
  type PickupAddressView,
  type PlaceShopOrderPayload,
} from "@lfd/contracts";

import { FeatureLevelResolver } from "../../../../feature-access/application/feature-level.resolver.js";
import { FeatureLevelLookup } from "../../../../feature-access/domain/ports/feature-level.lookup.js";
import { PublicDeliveryClosedError } from "../../../../feature-access/domain/public-delivery-closed.error.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { InvalidEmailError } from "../../../../account/domain/errors/account-errors.js";
import { CanonicalPriceHistoryReader } from "../../../../catalog/domain/ports/canonical-price-history.reader.js";
import { CatalogVersionReader } from "../../../../catalog/domain/ports/catalog-version.reader.js";
import { UnknownSkuError } from "../../../../catalog/domain/errors/unknown-sku.error.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { type UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { DeliveryAvailabilityReader } from "../../../../delivery-availability/domain/ports/delivery-availability.reader.js";
import { DeliveryZoneRepository } from "../../../../delivery-zones/domain/delivery-zone.repository.js";
import {
  PaymentGateway,
  type CreateIntentParams,
} from "../../../../payments/domain/payment-gateway.js";
import { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import { Pricer } from "../../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../../pricing/application/pricing-materials.loader.js";
import { CompanyMercurialeReader } from "../../../../pricing/domain/ports/company-mercuriale.reader.js";
import { CustomerVolumeReader } from "../../../../pricing/domain/ports/customer-volume.reader.js";
import { PriceFloorReader } from "../../../../pricing/domain/ports/price-floor.reader.js";
import { PriceRuleReader } from "../../../../pricing/domain/ports/price-rule.reader.js";
import { SkuVolumeReader } from "../../../../pricing/domain/ports/sku-volume.reader.js";
import { VolumeCommitmentReader } from "../../../../pricing/domain/ports/volume-commitment.reader.js";
import { VolumeLadderReader } from "../../../../pricing/domain/ports/volume-ladder.reader.js";
import type { OrderToPlace } from "../../../domain/entities/order.js";
import {
  IdempotencyKeyReusedError,
  OrderAlreadyInFlightError,
} from "../../../domain/errors/order-errors.js";
import { OrderPlacedEvent } from "../../../domain/events/order-placed.event.js";
import {
  CompanyStatusReader,
  type OrderCompanyStatus,
} from "../../../domain/ports/company-status.reader.js";
import {
  DeliveryDefaultsReader,
  NO_DELIVERY_DEFAULTS,
  type DeliveryDefaults,
} from "../../../domain/ports/delivery-defaults.reader.js";
import {
  GuestBuyerRegistrar,
  type GuestBuyer,
} from "../../../domain/ports/guest-buyer.registrar.js";
import { OrderCutoffReader } from "../../../domain/ports/order-cutoff.reader.js";
import { OrderCutoffWaiverGate } from "../../../domain/ports/order-cutoff-waiver.gate.js";
import { OrderLateFeeReader } from "../../../domain/ports/order-late-fee.reader.js";
import { OrderReader } from "../../../domain/ports/order.reader.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import {
  ShopOrderIdempotencyStore,
  type IdempotencyClaim,
} from "../../../domain/ports/shop-order-idempotency.store.js";
import { CartAdjustments } from "../../services/cart-adjustments.service.js";
import { CustomerAudiences } from "../../services/customer-audiences.service.js";
import { OrderDrafting } from "../../services/order-drafting.service.js";
import { OrderOperations } from "../../services/order-operations.service.js";
import { noSaleOperations } from "../../../../catalog/application/__tests__/sale-operations-doubles.js";
import { OrderLinePricing } from "../../services/order-line-pricing.service.js";
import { PlaceShopOrderCommand } from "../place-shop-order.command.js";
import { PlaceShopOrderHandler } from "../place-shop-order.handler.js";
import { PAINS } from "../../../../catalog/domain/__tests__/families.fixture.js";

/**
 * **La commande sans compte**, éprouvée là où elle décide — plan
 * `documentation/order/plan-commande-sans-compte.md`, lot C.
 *
 * Ce que ces cas mesurent est ce qui DISTINGUE ce chemin de la passation
 * connectée : l'inscription du porteur, la carte sans alternative, la clientèle
 * figée, et surtout le rejeu qui ne rend aucun secret de paiement. La
 * composition du panier elle-même est celle de la caisse — elle a ses suites, et
 * les redoubler ici mesurerait deux fois la même chose.
 *
 * Le service de composition est le **vrai**, monté sur des doubles : c'est lui
 * qui ré-résout les prix et déduit la zone, et le doubler ferait éprouver le
 * handler contre une fiction.
 */

/** L'instant où les prix sont résolus — jamais le mur, jamais une fenêtre glissante. */
const PRICED_AT = new Date("2026-01-15T09:00:00.000Z");

const CATALOG: readonly UnsealedCatalogItem[] = [
  {
    family: PAINS,
    allergens: null,
    orderTimeLimit: null,
    sku: "VIE-001",
    name: "Croissant",
    unitPriceMillicents: 200_000,
    vatRate: 0,
  },
];

const catalog = new InMemoryProductCatalog(CATALOG);

/** Aucune question datée posée : la porte refuse plutôt que de servir un tarif d'aujourd'hui. */
const noPriceHistory = new (class extends CanonicalPriceHistoryReader {
  pricingAt(): Promise<ReadonlyMap<string, CatalogPricing>> {
    return Promise.resolve(new Map());
  }
  startsAt(): Promise<Date | null> {
    return Promise.resolve(null);
  }
})();

const noMercuriales: CompanyMercurialeReader = {
  liveFor: () => Promise.resolve(null),
  liveAsOf: () => Promise.resolve(null),
  listFor: () => Promise.resolve([]),
  liveEverywhere: () => Promise.resolve([]),
};

const noPriceRules: PriceRuleReader = {
  listArchived: () => Promise.resolve([]),
  inScopes: () => Promise.resolve([]),
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

const noPriceFloors: PriceFloorReader = {
  inScopes: () => Promise.resolve([]),
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

const noSkuVolumes: SkuVolumeReader = { volumesFor: () => Promise.resolve(new Map()) };

const noVolumeLadders: VolumeLadderReader = {
  inScopes: () => Promise.resolve([]),
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

const noCommitments: VolumeCommitmentReader = {
  liveFor: () => Promise.resolve([]),
  liveAsOf: () => Promise.resolve([]),
};

const noCustomerVolumes: CustomerVolumeReader = {
  volumesFor: () => Promise.resolve(new Map<string, number>()),
};

const noDeliveryDefaults: DeliveryDefaultsReader = {
  of: (): Promise<DeliveryDefaults> => Promise.resolve(NO_DELIVERY_DEFAULTS),
};

const noOrderCutoffs: OrderCutoffReader = { list: () => Promise.resolve([]) };

const noLateFee: OrderLateFeeReader = { current: () => Promise.resolve(null) };

/**
 * **Aucune dérogation, et il ne peut pas y en avoir.** Une commande publique n'a
 * pas de société, donc rien à qui en accorder une : `OrderDrafting` ne consulte
 * même pas ce registre. Le double existe pour que la construction tienne.
 */
const noWaivers: OrderCutoffWaiverGate = {
  openFor: () => Promise.resolve(null),
  consume: () => Promise.reject(new Error("une commande publique ne consomme aucune dérogation")),
};

const deliveryAvailability = (
  view: DeliveryAvailabilityView = DEFAULT_DELIVERY_AVAILABILITY,
): DeliveryAvailabilityReader => ({ current: () => Promise.resolve(view) });

/** Sans société, la clientèle tarifée est B2C — et ce lecteur n'est jamais appelé. */
const noCompanies: CompanyStatusReader = {
  companyStatusOf: (): Promise<OrderCompanyStatus | null> => Promise.resolve(null),
};

function versionsAt(id: string | null): CatalogVersionReader {
  return { currentId: () => Promise.resolve(id), byId: () => Promise.resolve(null) };
}

const LABO_POINT: PickupAddressView = {
  id: "pickup_1",
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "75002",
  ville: "Paris",
  pays: "France",
  isDefault: true,
  discount: null,
  discountAudiences: { b2b: true, b2c: true },
  opening: { publicOpening: null, proPickup: null },
};

function pickups(resolved: PickupAddressView | null = LABO_POINT): PickupAddressRepository {
  return {
    list: () => Promise.resolve([]),
    resolve: () => Promise.resolve(resolved),
    create: () => Promise.resolve("pickup_1"),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    setDefault: () => Promise.resolve(),
  };
}

function zones(found: DeliveryZoneView | null = null): DeliveryZoneRepository {
  return {
    list: () => Promise.resolve(found === null ? [] : [found]),
    findById: () => Promise.resolve(found),
    resolveForPostalCode: (codePostal) =>
      Promise.resolve(
        found !== null && found.postalPrefixes.some((prefix) => codePostal.startsWith(prefix))
          ? found
          : null,
      ),
    create: () => Promise.resolve("zone_1"),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  };
}

/** La composition réelle, montée sur les doubles ci-dessus. */
function drafting(): OrderDrafting {
  return new OrderDrafting(
    new OrderLinePricing(
      catalog,
      new Pricer(
        new PricingMaterialsLoader(
          noPriceRules,
          noMercuriales,
          noPriceFloors,
          noSkuVolumes,
          noVolumeLadders,
          noCommitments,
          noCustomerVolumes,
        ),
        new FixedClock(PRICED_AT),
        noPriceHistory,
      ),
      new FixedClock(PRICED_AT),
    ),
    versionsAt("cver_courante"),
    new CartAdjustments(pickups(), zones(), deliveryAvailability()),
    noDeliveryDefaults,
    noOrderCutoffs,
    new FixedClock(PRICED_AT),
    catalog,
    noWaivers,
    noLateFee,
    new CustomerAudiences(noCompanies),
    new OrderOperations(noSaleOperations(PRICED_AT)),
  );
}

/** Le registre doublé : il note ce qu'on lui demande, et rend ce qu'on lui dit. */
class FakeKeys extends ShopOrderIdempotencyStore {
  readonly claimed: { key: string; fingerprint: string }[] = [];
  readonly released: string[] = [];
  readonly resolved: { key: string; orderId: string }[] = [];

  constructor(private readonly verdict: IdempotencyClaim = { kind: "claimed" }) {
    super();
  }

  claim(key: string, fingerprint: string): Promise<IdempotencyClaim> {
    this.claimed.push({ key, fingerprint });
    return Promise.resolve(this.verdict);
  }

  release(key: string): Promise<void> {
    this.released.push(key);
    return Promise.resolve();
  }

  resolve(key: string, orderId: string): Promise<void> {
    this.resolved.push({ key, orderId });
    return Promise.resolve();
  }
}

/** L'annuaire doublé : il capture l'invité inscrit et rend son identifiant. */
class FakeRegistrar extends GuestBuyerRegistrar {
  readonly registered: GuestBuyer[] = [];

  register(buyer: GuestBuyer): Promise<string> {
    this.registered.push(buyer);
    return Promise.resolve("user_guest");
  }
}

/** Ce que les doubles de paiement ont vu passer. */
interface PaymentCalls {
  intent: CreateIntentParams | null;
  retrieved: number;
}

function payments(sink: PaymentCalls): PaymentGateway {
  return {
    createIntent: (params) => {
      sink.intent = params;
      return Promise.resolve({ paymentIntentId: "pi_public", clientSecret: "pi_public_secret" });
    },
    retrieveIntent: () => {
      sink.retrieved += 1;
      return Promise.resolve({ paymentIntentId: "pi_public", clientSecret: "pi_public_secret" });
    },
    publishableKey: () => "pk_test_123",
    parseWebhook: () => ({ kind: "ignored" }),
  };
}

function capturingRepo(sink: { placed: OrderToPlace | null }): OrderRepository {
  return {
    place: (order) => {
      sink.placed = order.toPersistence();
      return Promise.resolve({ id: "order_public_1", orderNumber: "ORD-PUBLIC" });
    },
    // `null` = aucune ligne n'a franchi — cf. `OrderRepository.markPaid`.
    markPaid: () => Promise.resolve(null),
    markPaymentFailed: () => Promise.resolve(null),
    markFulfilled: () => Promise.reject(new Error("non utilisé")),
    markReady: () => Promise.reject(new Error("non utilisé")),
    absorbIntoPlan: () => Promise.reject(new Error("non utilisé")),
  };
}

/**
 * Le lecteur de commandes, écrit en entier : un doublé partiel casté n'est pas
 * le port, et laisserait la suite jouer un contrat qui n'existe plus.
 *
 * Il ne rend **jamais** de commande : aucun de ces cas ne passe par le rejeu,
 * qui s'éprouve en e2e contre une vraie `OrderView`.
 */
const noReader: OrderReader = {
  listByCompany: () => Promise.resolve([]),
  listPersonal: () => Promise.resolve([]),
  findById: () => Promise.resolve(null),
  listForAdmin: () => Promise.resolve([]),
  findAuthorByReference: () => Promise.resolve(null),
  findForPacking: () => Promise.reject(new Error("non utilisé")),
  listForProduction: () => Promise.resolve([]),
};

const KEY = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function payload(over: Partial<PlaceShopOrderPayload> = {}): PlaceShopOrderPayload {
  return {
    idempotencyKey: KEY,
    buyer: { firstName: "Camille", email: "camille@exemple.fr", phone: "0600000000" },
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: "pickup_1",
    requestedDeliveryDate: "2026-09-01",
    note: "",
    lines: [{ sku: "VIE-001", quantity: 2 }],
    ...over,
  };
}

/**
 * Le VRAI résolveur, sur un faux port de lecture.
 *
 * ⚠️ Et non un doublé du résolveur : c'est lui qui décide si une dérogation
 * l'emporte sur le défaut du catalogue, et le doubler ferait passer ce test à
 * côté de la seule chose qu'il y ait à éprouver — que le niveau LU est bien
 * celui qui ferme.
 *
 * Ouvert par défaut : les cas de ce fichier éprouvent la passation, pas la
 * porte. Celui qui l'éprouve la ferme explicitement.
 */
class FakeLevels extends FeatureLevelLookup {
  constructor(private readonly level: "closed" | "open") {
    super();
  }

  storedOverride(): Promise<string | null> {
    return Promise.resolve(this.level);
  }

  isExempt(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

function features(publicDelivery: "closed" | "open" = "open"): FeatureLevelResolver {
  return new FeatureLevelResolver(new FakeLevels(publicDelivery));
}

/** Le handler et tout ce qu'il a touché, monté d'un coup. */
function scene(
  options: { readonly claim?: IdempotencyClaim; readonly publicDelivery?: "closed" | "open" } = {},
) {
  const sink = { placed: null as OrderToPlace | null };
  const paid: PaymentCalls = { intent: null, retrieved: 0 };
  const keys = new FakeKeys(options.claim ?? { kind: "claimed" });
  const buyers = new FakeRegistrar();
  const published = new RecordingPublisher();
  const handler = new PlaceShopOrderHandler(
    buyers,
    drafting(),
    capturingRepo(sink),
    payments(paid),
    published,
    new FixedClock(PRICED_AT),
    keys,
    noReader,
    new DirectUnitOfWork(),
    features(options.publicDelivery),
  );
  return { handler, sink, paid, keys, buyers, published };
}

describe("PlaceShopOrderHandler — le porteur", () => {
  it("INSCRIT un invité et porte la commande à son nom", async () => {
    // C'est la voie retenue par le plan (§2) : la commande reste un `Order`
    // ordinaire, et c'est le PORTEUR qui change de nature. Sans lui,
    // `placedByUserId` aurait dû devenir nullable — 29 fichiers, un contrat de
    // canal publié et trois événements de domaine (§3.1).
    const { handler, sink, buyers } = scene();

    await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(buyers.registered).toEqual([
      { firstName: "Camille", email: "camille@exemple.fr", phone: "0600000000" },
    ]);
    expect(sink.placed?.placedByUserId).toBe("user_guest");
    expect(sink.placed?.placedByStaffId).toBeNull();
  });

  it("NORMALISE l'adresse avant de l'écrire", async () => {
    // Deux graphies d'une même boîte ne doivent pas donner deux façons d'écrire
    // à la même personne — même si D2 admet qu'elles donnent deux lignes.
    const { handler, buyers } = scene();

    await handler.execute(
      new PlaceShopOrderCommand(
        payload({
          buyer: {
            firstName: " Camille ",
            email: "  Camille@Exemple.FR ",
            // Le numéro passe par la même mise en forme : les blancs multiples
            // se réduisent, et c'est ce qui est écrit qui est comparé.
            phone: " 06  00 00 00 00 ",
          },
        }),
      ),
    );

    expect(buyers.registered[0]).toEqual({
      firstName: "Camille",
      email: "camille@exemple.fr",
      phone: "06 00 00 00 00",
    });
  });

  it("REFUSE une identité que le domaine ne reconnaît pas, et REND la clé", async () => {
    // Le contrôleur valide une forme ; l'invariant est au domaine, et il tient
    // sur tous les chemins d'entrée. La clé rendue est ce qui permet au client
    // de corriger et de renvoyer.
    const { handler, keys, buyers } = scene();

    await expect(
      handler.execute(
        new PlaceShopOrderCommand(
          // Le téléphone est VALABLE : sans ça, le refus pourrait venir de lui
          // (obligatoire depuis D9) et ce cas ne prouverait plus ce qu'il dit.
          payload({ buyer: { firstName: "Camille", email: "camille", phone: "0600000000" } }),
        ),
      ),
    ).rejects.toBeInstanceOf(InvalidEmailError);
    expect(buyers.registered).toEqual([]);
    expect(keys.released).toEqual([KEY]);
  });
});

describe("PlaceShopOrderHandler — la commande produite", () => {
  it("est PUBLIQUE et sans société", async () => {
    // D5 : `OrderClientele` vaut `pro | public`, et l'agrégat la déduit de
    // l'absence de société. Elle est figée à la passation — jamais relue depuis
    // une société qui peut changer ou disparaître.
    const { handler, sink } = scene();

    await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(sink.placed?.clientele).toBe("public");
    expect(sink.placed?.companyId).toBeNull();
  });

  it("publie le fait de domaine avec le porteur inscrit — c'est lui qui déclenche le courriel", async () => {
    // Le gain décisif de cette voie (§5) : le porteur a une adresse, donc la
    // confirmation et le QR de retrait partent vraiment. Sans `User`, les deux
    // envois sortaient en silence, sans destinataire.
    const { handler, published, sink } = scene();

    await handler.execute(new PlaceShopOrderCommand(payload()));

    // Le montant est celui que l'agrégat a calculé — relu de ce qui a été écrit
    // plutôt que « n'importe quel nombre » : un événement qui annoncerait un
    // total différent de la commande fausserait le journal de croissance sans
    // qu'aucune assertion ne le voie.
    const total = sink.placed?.totalCents ?? 0;
    expect(total).toBeGreaterThan(0);
    expect(published.published).toEqual([
      new OrderPlacedEvent("order_public_1", "ORD-PUBLIC", "user_guest", null, total),
    ]);
  });

  it("résout la clé dans la même unité de travail que l'écriture", async () => {
    const { handler, keys } = scene();

    await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(keys.resolved).toEqual([{ key: KEY, orderId: "order_public_1" }]);
  });
});

describe("PlaceShopOrderHandler — le règlement", () => {
  it("demande une carte, TOUJOURS, et sans société", async () => {
    // Le compte se négocie avec une société cliente ; un panier n'en est pas
    // une. Le contrat public ne porte donc aucun `settlement` à lire.
    const { handler, paid, sink } = scene();

    const placed = await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(paid.intent).toEqual({
      amountCents: sink.placed?.totalCents,
      currency: "eur",
      companyId: null,
    });
    expect(placed.payment).toEqual({
      clientSecret: "pi_public_secret",
      publishableKey: "pk_test_123",
      amountCents: sink.placed?.totalCents,
    });
    expect(sink.placed?.paymentStatus).toBe("pending");
  });
});

describe("PlaceShopOrderHandler — le rejeu", () => {
  /**
   * ⚠️ **Le rejeu lui-même s'éprouve en e2e** (`test/shop-order.e2e-spec.ts`),
   * pas ici, et ce n'est pas un renoncement : il rend une commande RELUE, donc
   * une `OrderView` entière. La fabriquer à la main demanderait de l'inventer
   * champ par champ — c'est-à-dire d'affirmer une forme que la base est seule à
   * produire, et de la voir diverger au premier champ ajouté.
   *
   * Ce qui se prouve là-bas : deux appels sous la même clé ne font qu'une
   * commande, et le second ne porte **aucun** secret de paiement.
   */
  it("REFUSE la même clé sur un panier différent", async () => {
    // Sans ce refus, une correction renverrait l'ancienne commande et le front
    // viderait le panier corrigé en silence.
    const { handler } = scene({ claim: { kind: "mismatch" } });

    await expect(handler.execute(new PlaceShopOrderCommand(payload()))).rejects.toBeInstanceOf(
      IdempotencyKeyReusedError,
    );
  });

  it("REFUSE un appel encore en vol", async () => {
    const { handler } = scene({ claim: { kind: "in_flight" } });

    await expect(handler.execute(new PlaceShopOrderCommand(payload()))).rejects.toBeInstanceOf(
      OrderAlreadyInFlightError,
    );
  });
});

describe("PlaceShopOrderHandler — ce qui échoue avant l'écriture", () => {
  it("REND la clé quand la composition refuse", async () => {
    // Le critère est la POSITION, jamais la nature de l'erreur : un SKU inconnu
    // tombe avant la persistance, donc le client doit pouvoir corriger et
    // renvoyer sous la même clé.
    const { handler, keys, sink } = scene();

    await expect(
      handler.execute(
        new PlaceShopOrderCommand(payload({ lines: [{ sku: "INCONNU", quantity: 1 }] })),
      ),
    ).rejects.toBeInstanceOf(UnknownSkuError);
    expect(keys.released).toEqual([KEY]);
    expect(sink.placed).toBeNull();
  });

  it("réclame la clé AVANT de toucher au prestataire de paiement", async () => {
    // L'intention Stripe est créée avant la persistance : un garde posé plus bas
    // laisserait déjà passer une seconde intention pour un double clic.
    const { handler, paid } = scene({ claim: { kind: "in_flight" } });

    await expect(handler.execute(new PlaceShopOrderCommand(payload()))).rejects.toThrow();
    expect(paid.intent).toBeNull();
  });
});

/**
 * 🔴 **LA LIVRAISON SANS COMPTE EST UNE DÉCISION D'ADMIN** (Hugo, 2026-09-21).
 *
 * Le front cache la porte du coursier quand la clé est fermée — mais masquer
 * n'est pas fermer, et le dépôt écrit la différence dans son catalogue de clés :
 * `hidden` ne ferme rien, `closed` si. Sans ce refus, une requête recopiée
 * depuis l'onglet réseau ferait livrer quand même, et l'admin qui a « fermé »
 * la livraison croirait l'avoir fermée.
 */
describe("PlaceShopOrderHandler — la porte de la livraison publique", () => {
  const LIVRAISON = payload({
    fulfillmentMethod: "delivery",
    pickupAddressId: null,
    deliveryAddress: {
      label: "Chalet",
      ligne1: "12 chemin des Barmettes",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
    },
  });

  it("🔴 refuse une livraison quand la clé est fermée", async () => {
    const { handler } = scene({ publicDelivery: "closed" });

    await expect(handler.execute(new PlaceShopOrderCommand(LIVRAISON))).rejects.toBeInstanceOf(
      PublicDeliveryClosedError,
    );
  });

  /**
   * ⚠️ **ET LA CLÉ D'IDEMPOTENCE N'EST PAS RÉCLAMÉE.** Le refus se prononce sur
   * le seul contenu du corps, avant toute écriture : une clé réclamée puis
   * relâchée laisserait une trace et ferait porter au client un rejeu qui
   * n'aurait jamais dû commencer.
   */
  it("🔴 refuse SANS réclamer la clé d'idempotence", async () => {
    const { handler, keys } = scene({ publicDelivery: "closed" });

    await expect(handler.execute(new PlaceShopOrderCommand(LIVRAISON))).rejects.toThrow();

    expect(keys.claimed).toEqual([]);
    expect(keys.released).toEqual([]);
  });

  /** Le RETRAIT ne dépend pas de cette clé : elle ne parle que de livraison. */
  it("laisse passer un retrait, clé fermée", async () => {
    const { handler, sink } = scene({ publicDelivery: "closed" });

    await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(sink.placed).not.toBeNull();
  });

  /**
   * ⚠️ **Ce test s'arrête à la PORTE, pas à la commande.** La scène de ce
   * fichier ne sert aucune zone de livraison — la passation échoue donc plus
   * bas, sur « aucune zone ne dessert ce code postal ». C'est exactement ce
   * qu'on veut montrer : clé ouverte, le refus qui survient n'est plus le
   * NÔTRE. Monter une zone ici ferait de ce cas un test de tarification, qui a
   * déjà le sien.
   */
  it("laisse passer la porte quand la clé est ouverte", async () => {
    const { handler } = scene({ publicDelivery: "open" });

    await expect(handler.execute(new PlaceShopOrderCommand(LIVRAISON))).rejects.not.toBeInstanceOf(
      PublicDeliveryClosedError,
    );
  });
});
