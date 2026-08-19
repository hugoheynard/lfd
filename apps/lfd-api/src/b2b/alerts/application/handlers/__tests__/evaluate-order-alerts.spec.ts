import { ALERT_KINDS, type AccountAlertOverride } from "@lfd/contracts";

import type { Clock } from "../../../../../platform/time/clock.js";
import type { StoredOverride } from "../../../domain/account-alert-rules.js";
import type { StoredAlertRule } from "../../../domain/alert-rules.js";
import type { AlertEvaluationContext } from "../../../domain/detectors/context.js";
import type { AlertToRecord } from "../../../domain/ports/account-alert.repository.js";
import type { EvaluatedOrder } from "../../../domain/ports/evaluated-order.reader.js";
import type { AccountOrderHistory } from "../../../domain/ports/order-history.reader.js";
import type { AlertDraft } from "../../../domain/evaluate-order.js";
import type { AlertChannels } from "../../../domain/ports/alert-channels.js";
import { EvaluateBasket } from "../evaluate-basket.service.js";
import { EvaluateOrderAlerts } from "../evaluate-order-alerts.service.js";

const NOW = new Date("2026-08-11T09:00:00.000Z");
const SKU = "VIE-001";

const ORDER: EvaluatedOrder = {
  id: "order_1",
  orderNumber: "LFC-1042",
  companyId: "company_1",
  companyName: "Boulangerie Périn",
  companyActive: true,
  lines: [{ sku: SKU, productName: "Viennoiserie", quantity: 10 }],
};

/** Ports doublés : des objets qui implémentent l'interface, pas des mocks de module. */
function build(overrides: {
  readonly order?: EvaluatedOrder | null;
  readonly history?: Partial<AccountOrderHistory>;
  readonly stored?: readonly StoredAlertRule[];
  readonly accountOverrides?: readonly StoredOverride[];
}) {
  const recorded: AlertToRecord[] = [];
  const readCalls: unknown[] = [];
  const dispatched: AlertDraft[] = [];
  // L'évaluation (règles + historique + détecteurs) vit dans `EvaluateBasket` :
  // on la construit pour de vrai avec les mêmes doubles, plutôt que de la
  // doubler elle-même — c'est elle qui décide de la fenêtre et du nombre de
  // lectures, et ce sont ces décisions-là que ces tests vérifient.
  const basket = new EvaluateBasket(
    {
      readAll: () => Promise.resolve([...(overrides.stored ?? [])]),
      save: () => Promise.resolve(true),
    },
    {
      readForCompany: () => Promise.resolve([...(overrides.accountOverrides ?? [])]),
      save: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
    {
      read: (input) => {
        readCalls.push(input);
        return Promise.resolve({
          history: new Map(),
          everOrdered: new Set<string>(),
          previousOrderCount: 5,
          ...overrides.history,
        } satisfies AccountOrderHistory);
      },
    },
    { read: () => Promise.resolve(new Map() as AlertEvaluationContext["norms"]) },
  );
  const service = new EvaluateOrderAlerts(
    { read: () => Promise.resolve(overrides.order === undefined ? ORDER : overrides.order) },
    basket,
    {
      record: (alerts) => {
        recorded.push(...alerts);
        return Promise.resolve();
      },
      listForCompany: () => Promise.resolve([]),
      acknowledge: () => Promise.resolve(),
      countUnacknowledged: () => Promise.resolve(new Map()),
    },
    // Un port se double sans assertion : `satisfies` prouve la compatibilité, et
    // le jour où le port change, ce double cesse de compiler.
    {
      dispatch: (drafts: readonly AlertDraft[]) => {
        dispatched.push(...drafts);
        return Promise.resolve();
      },
    } satisfies AlertChannels,
    { now: () => NOW } satisfies Clock,
  );
  return { service, recorded, readCalls, dispatched };
}

describe("EvaluateOrderAlerts", () => {
  it("inscrit au journal ce qui se déclenche, daté par l'horloge", async () => {
    const { service, recorded } = build({});

    await service.evaluate("order_1");

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.kind).toBe("product.first_order");
    expect(recorded[0]?.orderNumber).toBe("LFC-1042");
    expect(recorded[0]?.occurredAt).toBe(NOW);
  });

  /**
   * Une commande zéro friction n'appartient à aucun compte : ni historique auquel
   * la comparer, ni fiche où loger l'alerte.
   */
  it("n'évalue pas une commande sans société", async () => {
    const { service, recorded, readCalls } = build({
      order: { ...ORDER, companyId: null },
    });

    await service.evaluate("order_1");

    expect(recorded).toHaveLength(0);
    expect(readCalls).toHaveLength(0);
  });

  it("n'évalue pas une société qui n'est pas active", async () => {
    // Un dossier en attente, suspendu ou résilié n'a pas d'habitudes à comparer,
    // et personne pour agir sur l'alerte.
    const { service, recorded } = build({ order: { ...ORDER, companyActive: false } });

    await service.evaluate("order_1");

    expect(recorded).toHaveLength(0);
  });

  it("ne s'effondre pas si la commande a disparu entre l'événement et la lecture", async () => {
    const { service, recorded } = build({ order: null });

    await expect(service.evaluate("order_1")).resolves.toBeUndefined();
    expect(recorded).toHaveLength(0);
  });

  it("respecte une dérogation qui éteint le type sur ce compte", async () => {
    const off: AccountAlertOverride = { kind: "product.first_order", mode: "off" };

    const { service, recorded } = build({
      accountOverrides: [{ readable: true, override: off, updatedAt: NOW }],
    });

    await service.evaluate("order_1");

    expect(recorded.map((alert) => alert.kind)).not.toContain("product.first_order");
  });

  it("lit l'historique UNE fois, sur la fenêtre la plus large demandée", async () => {
    // Une commande de quarante lignes ne doit pas produire quarante lectures, et
    // deux règles aux fenêtres différentes n'en justifient pas deux non plus.
    const { service, readCalls } = build({});

    await service.evaluate("order_1");

    expect(readCalls).toHaveLength(1);
    const call = readCalls[0] as { windowDays: number; now: Date; excludeOrderId: string };
    expect(call.windowDays).toBe(365);
    // La commande évaluée est exclue de son propre historique — sinon elle
    // tirerait sa propre moyenne vers elle.
    expect(call.excludeOrderId).toBe("order_1");
    expect(call.now).toBe(NOW);
  });

  it("n'écrit rien quand toutes les règles sont éteintes globalement", async () => {
    const stored: StoredAlertRule[] = (
      Object.keys(ALERT_KINDS) as (keyof typeof ALERT_KINDS)[]
    ).map((kind) => ({
      kind,
      readable: true,
      enabled: false,
      params: ALERT_KINDS[kind].defaults.params,
      delivery: ALERT_KINDS[kind].defaults.delivery,
      updatedAt: NOW,
    }));

    const { service, recorded, readCalls } = build({ stored });

    await service.evaluate("order_1");

    expect(recorded).toHaveLength(0);
    expect(readCalls).toHaveLength(0);
  });
});

describe("les canaux", () => {
  it("ne sont sollicités que pour ce qui s'est réellement déclenché", async () => {
    const { service, dispatched } = build({});

    await service.evaluate("order_1");

    expect(dispatched).toHaveLength(1);
  });

  it("ne sont pas sollicités quand rien ne se déclenche", async () => {
    // Le journal fait foi ; les canaux ne sont que ce qu'on fait en plus. Sans
    // alerte, il n'y a rien à annoncer — et surtout pas un e-mail vide.
    const { service, dispatched, recorded } = build({
      history: { everOrdered: new Set([SKU]) },
    });

    await service.evaluate("order_1");

    expect(recorded).toHaveLength(0);
    expect(dispatched).toHaveLength(0);
  });
});
