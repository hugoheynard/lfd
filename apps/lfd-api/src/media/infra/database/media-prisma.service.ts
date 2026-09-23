import type { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **L'accès de la médiathèque à la base — et rien qu'à SA table.**
 *
 * 🔴 Même mécanique et même raison que `PimPrismaService` : une base unique, un
 * seul client, et une **surface énumérée** qui dit ce que ce bloc atteint.
 * Aliaser le client complet rendrait `product`, `company`, `order` et les
 * autres lisibles depuis n'importe quel dépôt de la médiathèque — un mur tombé
 * sans que personne ne l'écrive.
 *
 * Ici, la surface tient en DEUX lignes, et c'est exactement ce qu'on voulait
 * démontrer : la bibliothèque ne connaît QUE ce qui est à elle — ses images, et
 * les dépôts qu'elle a refusés. Elle ne lit ni `product_media` ni
 * `category_media` — ce sont les tables des porteurs, et elle leur pose la
 * question par `MediaCarriers`.
 *
 * ⚠️ Elle empruntait `PimPrismaService` jusqu'au 2026-09-23, quand sa table
 * vivait encore dans le schéma `pim`. Ce n'était pas qu'un détail de câblage :
 * tant qu'elle passait par la surface du référentiel, elle pouvait atteindre
 * les 47 modèles que celle-ci déclare.
 */
export abstract class MediaPrismaService {
  abstract readonly mediaAsset: PrismaService["mediaAsset"];
  /** L'historique des dépôts refusés — des TENTATIVES, pas des images. */
  abstract readonly mediaUploadFailure: PrismaService["mediaUploadFailure"];
}
