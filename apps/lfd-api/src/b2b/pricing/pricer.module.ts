import { Module } from "@nestjs/common";

import { PricingModule } from "./pricing.module.js";
import { Pricer } from "./application/pricer.js";

/**
 * **La façade de lecture du prix**, dans son propre module.
 *
 * ## Pourquoi pas dans `PricingModule`
 *
 * `PricingModule` porte les lecteurs et le chargeur ; y ranger la porte y
 * mettrait une façade de lecture au milieu des adaptateurs.
 *
 * ⚠️ Ce paragraphe a dit deux choses fausses avant d'être réécrit le
 * 2026-09-09. « Le catalogue vit dans `OrdersModule` » — il y vivait par
 * accident d'histoire, son port est descendu dans `catalog/`. Puis « le `Pricer`
 * résout le catalogue » — il ne le résout plus : il prend des articles déjà
 * scellés, et c'est ce qui lui permet d'être la porte de `catalog` sans en
 * dépendre.
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
  imports: [PricingModule],
  providers: [Pricer],
  exports: [Pricer],
})
export class PricerModule {}
