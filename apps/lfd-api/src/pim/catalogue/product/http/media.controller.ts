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

/** Voir `MediaLibraryController` — même garde, dupliquée le temps de l'alias. */
const IMAGE_UPLOAD_HARD_LIMIT = 25 * 1024 * 1024;

interface UploadedFilePart {
  readonly buffer: Buffer;
}

/**
 * 🔴 **ALIAS DÉPRÉCIÉ** de `POST /pim/media` (posé le 2026-09-23).
 *
 * La bibliothèque a quitté `catalogue/` : une route sous le référentiel
 * produit affirmait une propriété qu'il n'a pas. Sa surface est désormais
 * `media` (`MediaLibraryController`).
 *
 * Cette route reste parce qu'un contrat déjà servi ne se casse pas dans le même
 * déploiement (`CLAUDE.md` §0) : le back-office et l'API se déploient
 * séparément, donc un front encore en ligne appelle encore ce chemin pendant
 * quelques minutes. Elle ne porte QUE le dépôt — la lecture de la bibliothèque
 * n'a jamais été servie ici.
 *
 * ⚠️ **À supprimer au déploiement suivant**, une fois le back-office en ligne
 * sur `media`. Son unique appelant était `ProductHttpApi.uploadImage`,
 * qui vise déjà la nouvelle adresse.
 */
@AdminSurface("pim_catalog")
@Controller("catalogue/media")
export class MediaController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: IMAGE_UPLOAD_HARD_LIMIT } }))
  async upload(@UploadedFile() file: UploadedFilePart | undefined): Promise<UploadedMediaView> {
    if (file === undefined) {
      throw new UnsupportedImageError("aucun fichier reçu.");
    }
    return this.commands.execute<UploadProductImageCommand, UploadProductImageResult>(
      new UploadProductImageCommand(file.buffer),
    );
  }
}
