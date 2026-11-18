/**
 * Le fait « visuels d'une fiche changés », tel que la plateforme l'écoute.
 *
 * Il est DÉCLARÉ par le catalogue (`catalogue/product/media/product-media-changed.fact.ts`),
 * qui l'écrit dans la transaction du geste ; ce fichier n'en est que la porte
 * publiée — un bloc extérieur n'atteint le référentiel que par `channels/`
 * (`lint:context-boundaries`). Le référentiel ne sait pas qui l'écoute.
 */
export {
  PIM_PRODUCT_MEDIA_CHANGED,
  ProductMediaChangedFact,
  ProductMediaChangedPayloadError,
} from "../../../catalogue/product/media/product-media-changed.fact.js";
