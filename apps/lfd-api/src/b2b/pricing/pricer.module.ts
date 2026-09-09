import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { PricingModule } from "./pricing.module.js";
import { Pricer } from "./application/pricer.js";

/**
 * **La façade de lecture du prix**, dans son propre module.
 *
 * ## Pourquoi pas dans `PricingModule`
 *
 * Le `Pricer` résout le **catalogue** — c'est ce qui lui permet de répondre à
 * un SKU nu plutôt qu'à un article déjà chargé —, et `CatalogModule` importe
 * `PricingModule` depuis que la vitrine tarife (R22). Le ranger dans
 * `PricingModule` fermerait donc le cycle.
 *
 * ⚠️ Ce paragraphe disait « le catalogue vit dans `OrdersModule` ». Il y vivait
 * par accident d'histoire : son port descend dans `catalog/` le 2026-09-09,
 * avec la source qu'il traduit.
 *
 * ⚠️ Un appelant qui a **déjà** ses articles et ses matériaux ne passe pas par
 * ici : il s'adresse au `LoadedPricer`, qui est pur et n'a pas de module. C'est
 * le cas de la caisse et de l'écran de tarification — leur faire relire le
 * catalogue serait le N+1 que tout ce dossier combat.
 *
 * ## Pourquoi pas dans `PricingAdminModule`
 *
 * Parce que ce module-là existe pour **empêcher** le chemin qui facture
 * d'écrire une règle : il porte les dépôts d'écriture. Le `Pricer` est en
 * lecture seule et s'adresse à tout le monde — y ranger une façade de lecture
 * lui ferait traîner les écritures dans son sillage, et lui interdirait d'être
 * consommé par une surface publique.
 *
 * Un module à un provider, donc, et c'est le prix d'un graphe où les flèches
 * disent quelque chose.
 */
@Module({
  imports: [CatalogModule, PricingModule],
  providers: [Pricer],
  exports: [Pricer],
})
export class PricerModule {}
