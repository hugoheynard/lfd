import type { SupervisedOrder } from "../../ports/day-supervision.reader.js";
import type { HandoverQueueWindow } from "../../ports/order.reader.js";
import {
  latenessOf,
  READY_BEFORE_WINDOW_MINUTES,
  stageOf,
  superviseDay,
} from "../day-supervision.js";

/**
 * Les dates d'ici ne sont comparées qu'entre elles : `now` est passé en
 * argument, jamais lu au mur (CLAUDE.md §5, la seule exception admise).
 * Novembre = UTC+1 : 08:00 à Paris est 07:00Z.
 */
const DAY = "2026-11-10";
const at = (utc: string): Date => new Date(`${DAY}T${utc}:00.000Z`);

const PROMISED: HandoverQueueWindow = { start: "07:00", end: "08:00", source: "override" };
const NO_START: HandoverQueueWindow = { start: null, end: "08:00", source: "override" };
const OPENING_HOURS: HandoverQueueWindow = { start: "07:00", end: "08:00", source: "default" };

describe("stageOf", () => {
  it("compte `in_production` en production, avec `confirmed`", () => {
    expect(stageOf("in_production")).toBe("in_production");
    expect(stageOf("confirmed")).toBe("in_production");
  });

  it("écarte le brouillon, qui n'est pas une commande", () => {
    expect(stageOf("draft")).toBeNull();
  });

  it("range `fulfilled` en retirée / livrée", () => {
    expect(stageOf("fulfilled")).toBe("handed_over");
  });
});

describe("latenessOf — pas retirée après son créneau", () => {
  it("ne signale rien pile à la fin du créneau", () => {
    expect(latenessOf("ready", PROMISED, DAY, at("07:00"))).toBeNull();
  });

  it("signale une minute après la fin du créneau", () => {
    expect(latenessOf("ready", PROMISED, DAY, at("07:01"))).toBe("not_handed_over_after_window");
  });

  it("prime sur l'approche : pas prête ET créneau passé = pas retirée", () => {
    expect(latenessOf("placed", PROMISED, DAY, at("07:01"))).toBe("not_handed_over_after_window");
  });

  it("ne signale jamais une commande retirée", () => {
    expect(latenessOf("handed_over", PROMISED, DAY, at("12:00"))).toBeNull();
  });

  it("ne signale jamais une commande annulée", () => {
    expect(latenessOf("cancelled", PROMISED, DAY, at("12:00"))).toBeNull();
  });
});

describe("latenessOf — pas prête à l'approche du créneau", () => {
  // Début 07:00 Paris = 06:00Z ; la marge ramène le seuil à 05:00Z.
  const threshold = at("06:00").getTime() - READY_BEFORE_WINDOW_MINUTES * 60_000;
  const minutesAfter = (minutes: number): Date => new Date(threshold + minutes * 60_000);

  it("ne signale rien pile au seuil", () => {
    expect(latenessOf("in_production", PROMISED, DAY, minutesAfter(0))).toBeNull();
  });

  it("signale une minute après le seuil, commandée ou en production", () => {
    expect(latenessOf("placed", PROMISED, DAY, minutesAfter(1))).toBe("not_ready_before_window");
    expect(latenessOf("in_production", PROMISED, DAY, minutesAfter(1))).toBe(
      "not_ready_before_window",
    );
  });

  it("ne signale pas une commande déjà prête avant la fin du créneau", () => {
    expect(latenessOf("ready", PROMISED, DAY, minutesAfter(1))).toBeNull();
  });

  it("prend la fin comme repère quand le créneau n'a pas de début", () => {
    const endThreshold = at("07:00").getTime() - READY_BEFORE_WINDOW_MINUTES * 60_000;
    expect(latenessOf("placed", NO_START, DAY, new Date(endThreshold))).toBeNull();
    expect(latenessOf("placed", NO_START, DAY, new Date(endThreshold + 60_000))).toBe(
      "not_ready_before_window",
    );
  });
});

describe("latenessOf — ce qui n'est jamais jugé", () => {
  it("un créneau nul", () => {
    expect(latenessOf("placed", null, DAY, at("23:00"))).toBeNull();
  });

  it("une heure d'ouverture recopiée (`source: default`)", () => {
    expect(latenessOf("placed", OPENING_HOURS, DAY, at("23:00"))).toBeNull();
  });

  it("une heure qui n'existe pas ce jour-là (passage à l'heure d'été)", () => {
    // Le 2027-03-28, 02:30 n'existe pas à Paris : `localToInstant` rend `null`.
    const missing: HandoverQueueWindow = { start: null, end: "02:30", source: "override" };
    expect(latenessOf("placed", missing, "2027-03-28", new Date("2027-03-28T20:00:00.000Z"))).toBe(
      null,
    );
  });
});

describe("superviseDay", () => {
  const order = (
    id: string,
    status: SupervisedOrder["status"],
    fulfillmentMethod: SupervisedOrder["fulfillmentMethod"] = "pickup",
    window: HandoverQueueWindow | null = null,
  ): SupervisedOrder => ({
    orderId: id,
    reference: `CMD-${id}`,
    customerName: "Boulangerie du Col",
    fulfillmentMethod,
    status,
    window,
  });

  it("compte par acheminement et par étape, les annulées à part, les brouillons nulle part", () => {
    const { flow } = superviseDay(
      DAY,
      [
        order("1", "placed"),
        order("2", "confirmed"),
        order("3", "in_production"),
        order("4", "ready"),
        order("5", "fulfilled"),
        order("6", "cancelled"),
        order("7", "draft"),
        order("8", "ready", "delivery"),
      ],
      at("03:00"),
    );

    expect(flow).toEqual([
      {
        fulfillmentMethod: "pickup",
        placed: 1,
        inProduction: 2,
        ready: 1,
        handedOver: 1,
        cancelled: 1,
      },
      {
        fulfillmentMethod: "delivery",
        placed: 0,
        inProduction: 0,
        ready: 1,
        handedOver: 0,
        cancelled: 0,
      },
    ]);
  });

  it("garde une ligne par acheminement même sans commande", () => {
    expect(superviseDay(DAY, [], at("03:00")).flow.map((line) => line.fulfillmentMethod)).toEqual([
      "pickup",
      "delivery",
    ]);
  });

  it("ne liste en retard que les créneaux promis, avec leur règle", () => {
    const { late } = superviseDay(
      DAY,
      [
        order("1", "ready", "pickup", PROMISED),
        order("2", "ready", "pickup", OPENING_HOURS),
        order("3", "fulfilled", "pickup", PROMISED),
        order("4", "placed", "delivery", null),
      ],
      at("09:00"),
    );

    expect(late.map((entry) => [entry.order.orderId, entry.stage, entry.rule])).toEqual([
      ["1", "ready", "not_handed_over_after_window"],
    ]);
  });
});
