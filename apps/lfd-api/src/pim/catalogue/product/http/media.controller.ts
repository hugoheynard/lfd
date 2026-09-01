import { Controller, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CommandBus } from "@nestjs/cqrs";
import type { UploadedMediaView } from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import {
  UploadProductImageCommand,
  type UploadProductImageResult,
} from "../application/upload-product-image.js";
import { UnsupportedImageError } from "../domain/value-objects/product-image.js";

/**
 * Garde-fou DoS du multipart, **très au-dessus** de la limite métier (le
 * domaine tranche à 10 Mo). Les deux ne disent pas la même chose : celui-ci
 * empêche de saturer la mémoire du processus, celui du domaine énonce ce qu'est
 * un visuel de catalogue acceptable.
 */
const IMAGE_UPLOAD_HARD_LIMIT = 25 * 1024 * 1024;

/** Le peu qu'on lit du fichier Multer. Le nom d'origine ne sert à RIEN ici :
 *  la clé vient du hachage du contenu, et le type des octets. */
interface UploadedFilePart {
  readonly buffer: Buffer;
}

/**
 * La **bibliothèque de visuels** — les fichiers, indépendamment des produits.
 *
 * Une surface à part de `catalogue/products` parce qu'un visuel n'appartient à
 * aucun produit tant qu'on ne l'a pas attaché : le modèle sépare depuis
 * toujours le fichier (`MediaAsset`) de son emploi (`ProductMedia`). C'est
 * aussi ce qui permet d'illustrer un produit qu'on est en train de créer.
 *
 * Même mur que le reste du catalogue (`@AdminSurface("pim_catalog")`) : identité
 * vérifiée contre l'annuaire, puis périmètre.
 */
@AdminSurface("pim_catalog")
@Controller("catalogue/media")
export class MediaController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * Dépose une image et rend son entrée de bibliothèque.
   *
   * Aucune validation ici : le contrôleur ne fait que le transport. C'est
   * `productImage` qui décide, en relisant les octets — ni le `Content-Type`
   * annoncé, ni l'extension ne sont crus.
   */
  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: IMAGE_UPLOAD_HARD_LIMIT } }))
  async upload(@UploadedFile() file: UploadedFilePart | undefined): Promise<UploadedMediaView> {
    if (file === undefined) {
      throw new UnsupportedImageError("aucun fichier reçu.");
    }
    const media = await this.commands.execute<UploadProductImageCommand, UploadProductImageResult>(
      new UploadProductImageCommand(file.buffer),
    );
    return media;
  }
}
