import { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **L'accès du référentiel à la base**, sous son propre jeton d'injection.
 *
 * Il y avait ici un SECOND client Prisma, sur une seconde base. B4 l'a retiré :
 * le référentiel vit désormais dans le schéma `pim` de la base commune, avec
 * `public`, `growth` et `ops` — une connexion, un client, un historique de
 * migrations.
 *
 * **Mais le jeton reste, et ce n'est pas de la nostalgie.** `PimDatabaseModule`
 * n'est pas `@Global`, à la différence de son homologue : seul `src/pim/` peut
 * l'injecter. C'est la frontière de contexte, et elle survit à la fusion des
 * bases — partager un serveur n'est pas partager une permission. Résoudre
 * directement `PrismaService` dans les 22 dépôts du référentiel aurait été plus
 * court d'un fichier, et aurait rendu la base commune atteignable depuis
 * n'importe où : exactement la god app qu'on essaie de ne pas fabriquer.
 *
 * `abstract` : ce n'est plus une implémentation, seulement un nom. Le module le
 * fait pointer sur l'unique `PrismaService` par `useExisting`, de sorte qu'il
 * n'y a jamais deux connexions — et que les opérations du référentiel sont
 * comptées comme les autres (cf. `schema-ops.counter.ts`).
 */
export abstract class PimPrismaService extends PrismaService {}
