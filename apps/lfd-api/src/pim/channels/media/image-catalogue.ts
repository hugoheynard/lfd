/**
 * Le port `ImageCatalogue` tel que la médiathèque l'implémente.
 *
 * Il est DÉCLARÉ par le catalogue (`catalogue/shared/domain/ports/image-catalogue.ts`),
 * qui est celui qui a besoin de décrire ses images ; ce fichier n'en est que la
 * porte publiée : un bloc extérieur n'atteint le référentiel que par `channels/`
 * (`lint:context-boundaries`), et la classe — donc le jeton d'injection — est la
 * même des deux côtés.
 */
export {
  ImageCatalogue,
  UnknownImageError,
  type CatalogueFocal,
  type CatalogueImage,
} from "../../catalogue/shared/domain/ports/image-catalogue.js";
