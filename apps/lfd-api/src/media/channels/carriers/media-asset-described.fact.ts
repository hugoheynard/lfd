import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const MEDIA_ASSET_DESCRIBED = "media.asset_described";

/**
 * **Ce que les porteurs montrent d'une image a changé** — fait DURABLE que la
 * médiathèque DÉCLARE dans son canal vers les porteurs, et écrit dans la
 * transaction de `SaveMediaDetailsHandler` (L4 de
 * `documentation/mediatheque/plan-la-mediatheque-amelioree.md`, 2026-10-10).
 *
 * Sans lui, déplacer le point focal à la médiathèque ne changeait rien en
 * boutique : la vitrine garde une COPIE des visuels, et seuls un
 * enregistrement de la fiche ou un push la rafraîchissaient. Le référentiel
 * l'écoute et réannonce les fiches qui portent l'image.
 *
 * ## Ce qu'il porte, et ce qu'il ne porte pas
 *
 * L'URL — l'identité de l'image — et le geste. **Pas** le point focal ni
 * l'alternative : l'abonné relit la médiathèque par son canal
 * (`ImageCatalogue`), après la validation. Un fait rejoué tard republie donc
 * l'état d'aujourd'hui, jamais celui d'un geste dépassé.
 *
 * ⚠️ **Il ne se journalise PAS.** `media_asset.described` est la DÉCISION ;
 * ceci en est la conséquence.
 *
 * ## Pourquoi il vit dans `channels/carriers/`
 *
 * `pim → media` n'est permis que par ce canal (`lint:context-boundaries`) :
 * c'est déjà celui qui parle aux porteurs. La médiathèque publie sans savoir
 * qui écoute — la vitrine du commerce pourrait s'y abonner demain.
 */
export class MediaAssetDescribedFact implements DurableEvent {
  constructor(
    readonly url: string,
    /** Identifiant du geste, tiré par l'émetteur : il rend la clé unique par enregistrement. */
    readonly gestureId: string,
  ) {}

  durableFact(): DurableFact {
    return {
      type: MEDIA_ASSET_DESCRIBED,
      key: `${MEDIA_ASSET_DESCRIBED}:${this.gestureId}`,
      payload: { url: this.url, gestureId: this.gestureId },
    };
  }

  /** @throws {MediaAssetDescribedPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): MediaAssetDescribedFact {
    const url = payload["url"];
    const gestureId = payload["gestureId"];
    if (!isFilled(url) || !isFilled(gestureId)) {
      throw new MediaAssetDescribedPayloadError();
    }
    return new MediaAssetDescribedFact(url, gestureId);
  }
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Un fait « image décrite » illisible : les porteurs gardent l'ancienne description. */
export class MediaAssetDescribedPayloadError extends TechnicalError {
  constructor() {
    super(
      "media_asset_described.payload_invalid",
      "Le fait « image décrite à la médiathèque » est illisible (URL ou geste manquant) : la " +
        "boutique garde l'ancien cadrage. Le message reste dans la boîte d'envoi ; corriger " +
        "l'émetteur puis le rejouer depuis la carte de santé, ou réenregistrer les visuels de la fiche.",
    );
  }
}
