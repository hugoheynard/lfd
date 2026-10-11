import type { SyncOperation } from "@lfd/catalog-sync";

import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const PIM_OPERATION_IMAGE_CHANGED = "pim.operation_image_changed";

/** L'image d'une opération à la forme du fil : URL, alternative de l'opération, point focal. */
export type OperationImageOnWire = SyncOperation["image"];

/**
 * **L'image d'une opération a changé** — remplacée (A → B) ou redécrite
 * (point focal) à la médiathèque, ou posée, changée, retirée sur l'opération
 * au référentiel — fait DURABLE que le référentiel déclare dans son canal
 * vers la plateforme (cf. `documentation/mediatheque/mediatheque.md` §7 bis,
 * 2026-10-11). `image: null` = l'opération n'en affiche plus.
 *
 * Avant lui, l'annonce en boutique (`catalog_operations.image_*`) ne suivait
 * qu'au push du catalogue : une copie restait sur l'ancienne image, et le
 * compte des porteurs l'empêchait seulement de casser.
 *
 * ## Le contrat
 *
 * `{ operationKey, gestureId, image }` : l'image telle que le fil v11 la
 * porte (`SyncOperation["image"]`), figée au geste. L'alternative est celle
 * de l'OPÉRATION — elle reste la sienne au remplacement —, le point focal
 * celui de la médiathèque. Clé `pim.operation_image_changed:<clé>:<geste>` :
 * deux gestes sur la même opération sont deux faits, et le commerce garde le
 * plus récent (`image_gesture_id`).
 *
 * ⚠️ **Il ne se journalise pas** : la décision est `media_asset.replaced` ou
 * `media_asset.described` à la médiathèque, `operation.edited` au
 * référentiel. ⚠️ **Il ne remplace pas le
 * push** : il ne porte que l'image ; dates, sélection et clientèle ne
 * traversent qu'au push.
 */
export class OperationImageChangedFact implements DurableEvent {
  constructor(
    readonly operationKey: string,
    /** Identifiant du geste (UUID v7), tiré par l'émetteur : il ordonne les faits. */
    readonly gestureId: string,
    /** `null` = l'opération n'affiche plus d'image. */
    readonly image: OperationImageOnWire,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PIM_OPERATION_IMAGE_CHANGED,
      key: `${PIM_OPERATION_IMAGE_CHANGED}:${this.operationKey}:${this.gestureId}`,
      payload: {
        operationKey: this.operationKey,
        gestureId: this.gestureId,
        image: this.image,
      },
    };
  }

  /** @throws {OperationImageChangedPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OperationImageChangedFact {
    const operationKey = payload["operationKey"];
    const gestureId = payload["gestureId"];
    const image = imageOf(payload["image"]);
    if (!isFilled(operationKey) || !isFilled(gestureId) || image === undefined) {
      throw new OperationImageChangedPayloadError();
    }
    return new OperationImageChangedFact(operationKey, gestureId, image);
  }
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFraction(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

/** L'image relue : `null` si absente, `undefined` si hors forme. */
function imageOf(value: unknown): OperationImageOnWire | undefined {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || !isFilled(value["url"]) || typeof value["alt"] !== "string") {
    return undefined;
  }
  const focal = focalOf(value["focal"]);
  return focal === undefined ? undefined : { url: value["url"], alt: value["alt"], focal };
}

/** Le point relu : `null` si absent, `undefined` si hors forme. */
function focalOf(value: unknown): { readonly x: number; readonly y: number } | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value) || !isFraction(value["x"]) || !isFraction(value["y"])) {
    return undefined;
  }
  return { x: value["x"], y: value["y"] };
}

/** Un fait « image d'opération changée » illisible : l'annonce garde l'ancienne image. */
export class OperationImageChangedPayloadError extends TechnicalError {
  constructor() {
    super(
      "pim_operation_image_changed.payload_invalid",
      "Le fait « image d'une opération changée » reçu par le catalogue marchand est illisible " +
        "(clé, geste ou image hors forme) : l'annonce en boutique garde l'ancienne image. Le " +
        "message reste dans la boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la " +
        "carte de santé, ou republier le catalogue.",
    );
  }
}
