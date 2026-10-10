import type { SyncMedia } from "@lfd/catalog-sync";

import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const PIM_PRODUCT_MEDIA_CHANGED = "pim.product_media_changed";

/**
 * **Les visuels d'une fiche ont changé** — fait DURABLE que le référentiel
 * DÉCLARE dans son canal vers la plateforme, et écrit dans la transaction de
 * `SetProductMediaHandler` (lot E5, 2026-10-10,
 * `documentation/journalisation/plan-evenements-durables.md` §7 quater).
 *
 * Il remplace `ProductMediaChangedEvent`, publié en mémoire APRÈS la
 * transaction et lu par la projection du catalogue marchand : un redémarrage
 * entre les deux laissait la boutique sur l'ancienne photo jusqu'au prochain
 * push, sans que personne le sache (`lint:durable-cross-block`). `pim → b2b`
 * reste interdit : la plateforme écoute un fait du canal, le référentiel ne
 * sait pas qui l'écoute.
 *
 * ## Ce qu'il n'est pas
 *
 * ⚠️ **Il ne se journalise PAS.** Le référentiel trace déjà
 * `product.media_saved` : c'est la DÉCISION. Ceci en est la conséquence, et un
 * second fait au journal ferait deux lignes d'historique pour un seul geste.
 *
 * ⚠️ **Il ne remplace pas le push.** La projection sert la FRAÎCHEUR, le push
 * la RÉPARATION. 🔴 Un instantané fabriqué AVANT un changement de photo et
 * ingéré APRÈS annulera cette projection — correct au sens du modèle, mais ça
 * se lira comme un défaut.
 *
 * ## Pourquoi il vit dans le CANAL
 *
 * Un fait qu'un autre bloc consomme fait partie de la surface publiée, au même
 * titre qu'un port (`lint:context-boundaries`). Un consommateur qui
 * atteindrait `catalogue/product/domain/` connaîtrait un chemin intérieur.
 *
 * ## Le contrat
 *
 * `{ productId, gestureId, image, thumbnail }` : les deux visuels que le fil
 * transporte — point focal compris depuis L4, facultatif à la relecture (`SyncMedia`, le vocabulaire du FIL que le référentiel parle déjà
 * en émetteur), figés au geste. L'abonné ne rappelle pas le référentiel — il
 * ne le peut pas. Clé `pim.product_media_changed:<productId>:<gestureId>` :
 * UN fait par enregistrement de la section, tiré une fois par le handler ;
 * deux gestes successifs sur la même fiche sont deux faits.
 */
export class ProductMediaChangedFact implements DurableEvent {
  constructor(
    readonly productId: string,
    /** Identifiant du geste, tiré par l'émetteur : il rend la clé unique par enregistrement. */
    readonly gestureId: string,
    /** L'ouverture de fiche — le `hero`. `null` = la fiche n'en porte pas. */
    readonly image: SyncMedia | null,
    /** La vignette de rayon — le `thumbnail`. `null` = pas désignée. */
    readonly thumbnail: SyncMedia | null,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PIM_PRODUCT_MEDIA_CHANGED,
      key: `${PIM_PRODUCT_MEDIA_CHANGED}:${this.productId}:${this.gestureId}`,
      payload: {
        productId: this.productId,
        gestureId: this.gestureId,
        image: this.image,
        thumbnail: this.thumbnail,
      },
    };
  }

  /** @throws {ProductMediaChangedPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): ProductMediaChangedFact {
    const productId = payload["productId"];
    const gestureId = payload["gestureId"];
    const image = mediaOf(payload["image"]);
    const thumbnail = mediaOf(payload["thumbnail"]);
    if (
      !isFilled(productId) ||
      !isFilled(gestureId) ||
      image === undefined ||
      thumbnail === undefined
    ) {
      throw new ProductMediaChangedPayloadError();
    }
    return new ProductMediaChangedFact(productId, gestureId, image, thumbnail);
  }
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDimension(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value > 0);
}

/** Un visuel relu, `null` s'il est absent, `undefined` s'il est hors forme. */
function mediaOf(value: unknown): SyncMedia | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const { url, alt, width, height } = value;
  const focal = focalOf(value["focal"]);
  if (
    !isFilled(url) ||
    typeof alt !== "string" ||
    !isDimension(width) ||
    !isDimension(height) ||
    focal === undefined
  ) {
    return undefined;
  }
  return { url, alt, width, height, focal };
}

function isFraction(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

/**
 * Le point focal relu : `null` s'il est absent ou nul, `undefined` s'il est
 * hors forme.
 *
 * 🔴 **L'ABSENCE se lit `null`** (L4, 2026-10-10). Un fait écrit avant que le
 * point focal ne voyage dort peut-être encore dans la boîte d'envoi — en
 * attente, ou en lettre morte qu'on rejouera. Le refuser ferait d'un ajout de
 * champ une panne de projection ; il se lit « personne ne s'est prononcé »,
 * ce qui était exact au moment où il a été écrit.
 */
function focalOf(value: unknown): { readonly x: number; readonly y: number } | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value) || !isFraction(value["x"]) || !isFraction(value["y"])) {
    return undefined;
  }
  return { x: value["x"], y: value["y"] };
}

/** Un fait « visuels changés » illisible : la boutique garde l'ancienne photo. */
export class ProductMediaChangedPayloadError extends TechnicalError {
  constructor() {
    super(
      "pim_product_media_changed.payload_invalid",
      "Le fait « visuels d'une fiche changés » reçu par le catalogue marchand est illisible " +
        "(produit, geste ou visuel hors forme) : la boutique garde l'ancienne photo. Le message " +
        "reste dans la boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de " +
        "santé, ou republier le catalogue.",
    );
  }
}
