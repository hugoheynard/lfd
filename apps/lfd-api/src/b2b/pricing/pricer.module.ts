import { Module } from "@nestjs/common";

import { OrdersModule } from "../orders/orders.module.js";
import { PricingModule } from "./pricing.module.js";
import { Pricer } from "./application/pricer.js";

/**
 * **La façade de lecture du prix**, dans son propre module.
 *
 * ## Pourquoi pas dans `PricingModule`
 *
 * Le `Pricer` résout le **catalogue** — c'est ce qui lui permet de répondre à
 * un SKU nu plutôt qu'à un article déjà chargé —, et le catalogue vit dans
 * `OrdersModule`, qui importe déjà `PricingModule`. Le ranger là-bas aurait
 * fermé le cycle, exactement comme pour le lecteur de l'écran de tarification :
 * l'en-tête de `PricingAdminModule` écrit cette contrainte depuis le début.
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
  imports: [OrdersModule, PricingModule],
  providers: [Pricer],
  exports: [Pricer],
})
export class PricerModule {}
