import { Module } from "@nestjs/common";

import { DevSeedService } from "./dev-seed.service.js";
import { DevSeedController } from "./http/dev-seed.controller.js";

/**
 * **L'outillage de développement** — aujourd'hui le rechargement du jeu de
 * données, et rien d'autre.
 *
 * Il est monté **en toutes circonstances**, y compris en production, et c'est un
 * choix. Un module conditionnel se décide à l'instanciation du décorateur, donc
 * avant que la configuration soit lue : on aurait remplacé une serrure lisible
 * par une lecture d'environnement à un endroit où elle n'a pas de garde-fou.
 *
 * Ce qui protège n'est donc pas l'absence du module mais l'**impossibilité du
 * geste** : le service refuse toute base qui n'est pas un Postgres direct et
 * local, et l'URL de production est une URL Accelerate. Ajouté à cela le mur
 * staff du contrôleur et le refus sur `NODE_ENV=production`.
 */
@Module({
  controllers: [DevSeedController],
  providers: [DevSeedService],
})
export class DevModule {}
