import { Global, Module } from "@nestjs/common";

import { OpsCapabilitiesController } from "./ops-capabilities.controller.js";
import { StartupReport } from "./startup-report.service.js";

/**
 * Le bulletin de démarrage, **global** : n'importe quel module doit pouvoir
 * signaler une capacité éteinte sans qu'on réimporte une chaîne de modules pour
 * ça. Le coût d'un signalement doit rester nul, sinon il ne sera pas fait — et
 * c'est précisément l'absence de signalement qu'on corrige ici.
 *
 * Il porte aussi la route qui **rejoue** ce bulletin à la demande : un constat
 * imprimé une seule fois se manque, et se manquer une fois a coûté une demi-
 * heure d'enquête le 2026-08-16.
 */
@Global()
@Module({
  controllers: [OpsCapabilitiesController],
  providers: [StartupReport],
  exports: [StartupReport],
})
export class StartupModule {}
