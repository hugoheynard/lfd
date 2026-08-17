import type { AdminPlaceOrderPayload, PickupAddressView } from "@lfd/contracts";

import { DeliveryZoneRepository } from "../../../../delivery-zones/domain/delivery-zone.repository.js";
import { AppConfig } from "../../../../infra/config/app-config.js";
import { DomainEventPublisher } from "../../../../infra/events/domain-event-publisher.js";
import {
  PaymentGateway,
  type CreateIntentParams,
} from "../../../../payments/domain/payment-gateway.js";
import { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import type { OrderToPlace } from "../../../domain/entities/order.js";
import {
  AccountSettlementNotGrantedError,
  OrderCompanyNotFoundError,
} from "../../../domain/errors/order-errors.js";
import { OrderPlacedEvent } from "../../../domain/events/order-placed.event.js";
import {
  OrderGuardReader,
  type OrderCompanyStatus,
  type OrderRole,
} from "../../../domain/ports/order-guard.reader.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import {
  type CatalogItem,
  ProductCatalogReader,
} from "../../../domain/ports/product-catalog.reader.js";
import {
  type DeliveryDefaults,
  DeliveryDefaultsReader,
  NO_DELIVERY_DEFAULTS,
} from "../../../domain/ports/delivery-defaults.reader.js";
import { PriceFloorReader } from "../../../../pricing/domain/ports/price-floor.reader.js";
import { SkuVolumeReader } from "../../../../pricing/domain/ports/sku-volume.reader.js";
import { PriceRuleReader } from "../../../../pricing/domain/ports/price-rule.reader.js";
import { OrderDrafting } from "../../services/order-drafting.service.js";

/**
 * Aucun réglage d'adresse : tout ce que la commande porte y est donc un choix.
 * Les cas de préremplissage sont couverts par `agreed-fulfillment.spec` — ici on
 * exerce le handler, pas la règle de provenance.
 */
function noDeliveryDefaults(): DeliveryDefaultsReader {
  return { of: (): Promise<DeliveryDefaults> => Promise.resolve(NO_DELIVERY_DEFAULTS) };
}
import { PlaceOrderForCustomerCommand } from "../place-order-for-customer.command.js";
import { PlaceOrderForCustomerHandler } from "../place-order-for-customer.handler.js";

/**
 * Catalogue **sans règle tarifaire** : le comportement du système avant qu'une
 * seule règle n'existe. Ces suites éprouvent la commande, pas le prix — la
 * résolution a ses propres tests, purs et exhaustifs.
 */
const noPriceRules: PriceRuleReader = {
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

/** Aucune limite posée : le prix sort du pipeline tel quel. */
const noPriceFloors: PriceFloorReader = {
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

/**
 * Aucune vente mesurée. Sans plancher dynamique conditionné au volume, ce port
 * n'est jamais appelé — le double existe pour que la construction reste possible,
 * pas parce que ces suites mesurent quoi que ce soit.
 */
const noSkuVolumes: SkuVolumeReader = { volumesFor: () => Promise.resolve(new Map()) };

const CATALOG: Record<string, CatalogItem> = {
  "VIE-001": {
    sku: "VIE-001",
    name: "Croissant",
    unitPriceCents: 200,
    vatRate: 0,
    category: "viennoiserie",
  },
};

const catalog: ProductCatalogReader = {
  resolve: (sku) => CATALOG[sku] ?? null,
  all: () => Object.values(CATALOG),
};

const LABO: PickupAddressView = {
  id: "pickup_1",
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "75002",
  ville: "Paris",
  pays: "France",
  isDefault: true,
  discount: null,
  // Aucune heure déclarée : le point n'oppose alors rien à la tranche demandée.
  // Les cas d'ouverture sont couverts par `agreed-fulfillment.spec`.
  opening: { publicOpening: null, proPickup: null },
};

/**
 * Garde doublée. `roleOf` est appelée avec l'ACHETEUR : c'est tout l'objet du
 * mur de cette surface, et le double le capture pour qu'un test puisse vérifier
 * qu'on n'a pas interrogé le commercial par mégarde.
 */
function guard(
  role: OrderRole | null,
  status: OrderCompanyStatus | null = "active",
  onAccount = true,
  asked: { userId: string | null } = { userId: null },
): OrderGuardReader {
  return {
    roleOf: (userId) => {
      asked.userId = userId;
      return Promise.resolve(role);
    },
    companyStatusOf: () => Promise.resolve(status),
    settlesOnAccount: () => Promise.resolve(onAccount),
  };
}

const pickups: PickupAddressRepository = {
  list: () => Promise.resolve([]),
  resolve: () => Promise.resolve(LABO),
  create: () => Promise.resolve("pickup_1"),
  update: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  setDefault: () => Promise.resolve(),
};

const zones: DeliveryZoneRepository = {
  list: () => Promise.resolve([]),
  findById: () => Promise.resolve(null),
  resolveForPostalCode: () => Promise.resolve(null),
  create: () => Promise.resolve("zone_1"),
  update: () => Promise.resolve(),
  remove: () => Promise.resolve(),
};

function payments(sink: { intent: CreateIntentParams | null } = { intent: null }): PaymentGateway {
  return {
    createIntent: (params) => {
      sink.intent = params;
      return Promise.resolve({ paymentIntentId: "pi_1", clientSecret: "pi_1_secret" });
    },
    retrieveIntent: () => Promise.resolve({ paymentIntentId: "pi_1", clientSecret: "pi_1_secret" }),
    retrieveIntent: () => Promise.resolve({ paymentIntentId: "pi_1", clientSecret: "pi_1_secret" }),
    publishableKey: () => "pk_test_123",
    parseWebhook: () => ({ kind: "ignored" }),
  };
}

class FakeEvents extends DomainEventPublisher {
  readonly published: object[] = [];
  publish(event: object): void {
    this.published.push(event);
  }
}

function repo(sink: { placed: OrderToPlace | null }): OrderRepository {
  return {
    place: (order) => {
      sink.placed = order.toPersistence();
      return Promise.resolve({ id: "order_1", orderNumber: "ORD-1" });
    },
    markPaid: () => Promise.resolve(),
    markPaymentFailed: () => Promise.resolve(),
    markHandedOver: () => Promise.resolve(true),
  };
}

/** Une racine cliente configurée — le cas nominal du lien de règlement. */
class FakeConfig extends AppConfig {
  constructor(private readonly root: string | null) {
    super();
  }

  override clientBaseUrl(): string | null {
    return this.root;
  }
}

function payload(over: Partial<AdminPlaceOrderPayload> = {}): AdminPlaceOrderPayload {
  return {
    companyId: "c1",
    buyerUserId: "buyer_1",
    settlement: "account",
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    pickupAddressId: null,
    requestedDeliveryDate: null,
    note: "",
    lines: [{ sku: "VIE-001", quantity: 2 }],
    ...over,
  };
}

function handler(
  guardDouble: OrderGuardReader,
  sink: { placed: OrderToPlace | null },
  options: {
    readonly payments?: PaymentGateway;
    readonly events?: FakeEvents;
    readonly clientBaseUrl?: string | null;
  } = {},
): PlaceOrderForCustomerHandler {
  // `in` et non `??` : `null` est une valeur que les tests passent EXPRÈS, et
  // `??` la remplacerait par le défaut — le test aurait alors vérifié le cas
  // nominal en croyant vérifier l'absence de racine.
  const clientBaseUrl =
    "clientBaseUrl" in options ? (options.clientBaseUrl ?? null) : "https://boutique.lfc.fr";
  return new PlaceOrderForCustomerHandler(
    guardDouble,
    new OrderDrafting(
      catalog,
      noPriceRules,
      noPriceFloors,
      noSkuVolumes,
      pickups,
      zones,
      noDeliveryDefaults(),
    ),
    repo(sink),
    options.payments ?? payments(),
    options.events ?? new FakeEvents(),
    new FakeConfig(clientBaseUrl),
  );
}

describe("PlaceOrderForCustomerHandler — le mur", () => {
  it("vérifie l'appartenance de L'ACHETEUR, pas celle du commercial", async () => {
    // Le piège de cette surface : un commercial n'est membre d'aucune société
    // cliente. Vérifier son appartenance refuserait toutes les commandes ;
    // l'oublier les autoriserait toutes.
    const asked = { userId: null as string | null };
    const sink = { placed: null as OrderToPlace | null };

    await handler(guard("orders", "active", true, asked), sink).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload()),
    );

    expect(asked.userId).toBe("buyer_1");
  });

  it("refuse par un 404 non-divulguant quand l'acheteur n'est pas membre", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await expect(
      handler(guard(null), sink).execute(new PlaceOrderForCustomerCommand("staff_1", payload())),
    ).rejects.toBeInstanceOf(OrderCompanyNotFoundError);
    expect(sink.placed).toBeNull();
  });
});

describe("PlaceOrderForCustomerHandler — la trace", () => {
  it("porte la commande au nom du client ET marque qui l'a saisie", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await handler(guard("orders"), sink).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload()),
    );

    expect(sink.placed).toMatchObject({
      companyId: "c1",
      placedByUserId: "buyer_1",
      placedByStaffId: "staff_1",
    });
  });

  it("publie l'événement au nom de l'ACHETEUR — le journal compte des clients", async () => {
    const events = new FakeEvents();
    const sink = { placed: null as OrderToPlace | null };

    await handler(guard("orders"), sink, { events }).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload()),
    );

    const [event] = events.published;
    expect(event).toBeInstanceOf(OrderPlacedEvent);
    expect((event as OrderPlacedEvent).placedByUserId).toBe("buyer_1");
  });
});

describe("PlaceOrderForCustomerHandler — le règlement", () => {
  it("au compte : rien à encaisser quand le crédit est accordé", async () => {
    const intents = { intent: null as CreateIntentParams | null };
    const sink = { placed: null as OrderToPlace | null };

    const result = await handler(guard("orders", "active", true), sink, {
      payments: payments(intents),
    }).execute(new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "account" })));

    expect(sink.placed?.paymentStatus).toBe("not_required");
    expect(intents.intent).toBeNull();
    expect(result.paymentUrl).toBeUndefined();
  });

  it("REFUSE le compte à une société sans crédit — le mur de cette surface", async () => {
    // Sans ce refus, un écran de back-office suffirait à accorder un délai de
    // paiement que personne n'a négocié.
    const sink = { placed: null as OrderToPlace | null };

    await expect(
      handler(guard("orders", "active", false), sink).execute(
        new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "account" })),
      ),
    ).rejects.toBeInstanceOf(AccountSettlementNotGrantedError);
    expect(sink.placed).toBeNull();
  });

  it("REFUSE aussi le compte à une société non active", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await expect(
      handler(guard("orders", "pending", true), sink).execute(
        new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "account" })),
      ),
    ).rejects.toBeInstanceOf(AccountSettlementNotGrantedError);
  });

  it("lien : crée l'intention sur le total et rend l'adresse à transmettre", async () => {
    const intents = { intent: null as CreateIntentParams | null };
    const sink = { placed: null as OrderToPlace | null };

    const result = await handler(guard("orders"), sink, { payments: payments(intents) }).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "link" })),
    );

    expect(intents.intent).toEqual({ amountCents: 400, currency: "eur", companyId: "c1" });
    expect(sink.placed?.paymentStatus).toBe("pending");
    expect(result.paymentUrl).toBe("https://boutique.lfc.fr/commandes/order_1/regler");
  });

  it("lien SANS racine cliente configurée : la commande passe, sans lien", async () => {
    // On préfère « pas de lien » à une URL inventée : le commercial le dit au
    // client plutôt que de lui dicter une adresse qui ne mène nulle part.
    const sink = { placed: null as OrderToPlace | null };

    const result = await handler(guard("orders"), sink, { clientBaseUrl: null }).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "link" })),
    );

    expect(sink.placed?.paymentStatus).toBe("pending");
    expect(result.paymentUrl).toBeUndefined();
  });

  it("le lien ne demande pas un règlement quand il n'y a rien à encaisser", async () => {
    const intents = { intent: null as CreateIntentParams | null };
    const sink = { placed: null as OrderToPlace | null };

    // Une remise de retrait qui ramène le total à zéro n'existe pas au seed ;
    // on passe par un catalogue à prix nul, seul moyen d'atteindre ce total.
    const gratuit: ProductCatalogReader = {
      resolve: () => ({
        sku: "VIE-001",
        name: "Croissant offert",
        unitPriceCents: 0,
        vatRate: 0,
        category: "viennoiserie",
      }),
      all: () => [],
    };
    const free = new PlaceOrderForCustomerHandler(
      guard("orders"),
      new OrderDrafting(
        gratuit,
        noPriceRules,
        noPriceFloors,
        noSkuVolumes,
        pickups,
        zones,
        noDeliveryDefaults(),
      ),
      repo(sink),
      payments(intents),
      new FakeEvents(),
      new FakeConfig("https://boutique.lfc.fr"),
    );

    const result = await free.execute(
      new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "link" })),
    );

    expect(intents.intent).toBeNull();
    expect(sink.placed?.paymentStatus).toBe("not_required");
    expect(result.paymentUrl).toBeUndefined();
  });
});
