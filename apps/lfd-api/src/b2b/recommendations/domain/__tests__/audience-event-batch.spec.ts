import { MAX_AUDIENCE_EVENTS_PER_BATCH } from "@lfd/contracts";

import { AudienceEventBatch } from "../audience-event-batch.js";
import {
  AudienceBatchTooLargeError,
  AudiencePlacementMismatchError,
  AudienceSourceMismatchError,
  EmptyAudienceBatchError,
  InvalidAudiencePlacementError,
  UnknownAudienceEventError,
  UnknownAudienceSourceError,
} from "../errors/recommendation-errors.js";

describe("AudienceEventBatch", () => {
  it("totalise les gestes identiques en une seule ligne : l'écriture n'en accepte qu'une par clé", () => {
    const batch = AudienceEventBatch.of([
      { sku: "CRO", event: "product_viewed" },
      { sku: "CRO", event: "product_viewed" },
      { sku: "CRO", event: "added_to_cart" },
      { sku: "PAC", event: "suggestion_shown", placement: "cart", source: "data" },
    ]);

    expect(batch.increments).toEqual([
      { sku: "CRO", event: "product_viewed", placement: "none", source: "none", count: 2 },
      { sku: "CRO", event: "added_to_cart", placement: "none", source: "none", count: 1 },
      { sku: "PAC", event: "suggestion_shown", placement: "cart", source: "data", count: 1 },
    ]);
    expect(batch.skus).toEqual(["CRO", "PAC"]);
  });

  it("refuse un lot vide", () => {
    expect(() => AudienceEventBatch.of([])).toThrow(EmptyAudienceBatchError);
  });

  it("refuse un lot au-delà de la borne, entier", () => {
    const events = Array.from({ length: MAX_AUDIENCE_EVENTS_PER_BATCH + 1 }, () => ({
      sku: "CRO",
      event: "product_viewed",
    }));
    expect(() => AudienceEventBatch.of(events)).toThrow(AudienceBatchTooLargeError);
  });

  it("accepte un lot exactement à la borne", () => {
    const events = Array.from({ length: MAX_AUDIENCE_EVENTS_PER_BATCH }, () => ({
      sku: "CRO",
      event: "product_viewed",
    }));
    expect(AudienceEventBatch.of(events).increments[0]?.count).toBe(MAX_AUDIENCE_EVENTS_PER_BATCH);
  });

  it("refuse un geste hors de l'énumération", () => {
    expect(() => AudienceEventBatch.of([{ sku: "CRO", event: "order_placed" }])).toThrow(
      UnknownAudienceEventError,
    );
  });

  it("refuse une vue qui nomme un emplacement, et une suggestion qui n'en nomme pas", () => {
    expect(() =>
      AudienceEventBatch.of([{ sku: "CRO", event: "product_viewed", placement: "cart" }]),
    ).toThrow(AudiencePlacementMismatchError);
    expect(() =>
      AudienceEventBatch.of([{ sku: "CRO", event: "suggestion_clicked", source: "staff" }]),
    ).toThrow(AudiencePlacementMismatchError);
  });

  it("refuse un emplacement mal formé", () => {
    expect(() =>
      AudienceEventBatch.of([
        { sku: "CRO", event: "suggestion_added", placement: "Cart page", source: "data" },
      ]),
    ).toThrow(InvalidAudiencePlacementError);
  });

  it("compte à part une même suggestion venue du calcul et du staff", () => {
    const batch = AudienceEventBatch.of([
      { sku: "CAF", event: "suggestion_added", placement: "cart", source: "data" },
      { sku: "CAF", event: "suggestion_added", placement: "cart", source: "staff" },
      { sku: "CAF", event: "suggestion_added", placement: "cart", source: "staff" },
    ]);

    expect(batch.increments).toEqual([
      { sku: "CAF", event: "suggestion_added", placement: "cart", source: "data", count: 1 },
      { sku: "CAF", event: "suggestion_added", placement: "cart", source: "staff", count: 2 },
    ]);
  });

  it("refuse une suggestion sans source, et une vue qui en nomme une", () => {
    expect(() =>
      AudienceEventBatch.of([{ sku: "CAF", event: "suggestion_shown", placement: "cart" }]),
    ).toThrow(AudienceSourceMismatchError);
    expect(() =>
      AudienceEventBatch.of([{ sku: "CAF", event: "product_viewed", source: "staff" }]),
    ).toThrow(AudienceSourceMismatchError);
  });

  it("refuse une source hors de l'énumération", () => {
    expect(() =>
      AudienceEventBatch.of([
        { sku: "CAF", event: "suggestion_shown", placement: "cart", source: "ai" },
      ]),
    ).toThrow(UnknownAudienceSourceError);
  });
});
