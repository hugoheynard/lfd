import { Global, Module } from "@nestjs/common";

import { StartupReport } from "./startup-report.service.js";

/**
 * Le bulletin de démarrage, **global** : n'importe quel module doit pouvoir
 * signaler une capacité éteinte sans qu'on réimporte une chaîne de modules pour
 * ça. Le coût d'un signalement doit rester nul, sinon il ne sera pas fait — et
 * c'est précisément l'absence de signalement qu'on corrige ici.
 */
@Global()
@Module({
  providers: [StartupReport],
  exports: [StartupReport],
})
export class StartupModule {}
