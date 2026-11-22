import { Global, Module } from "@nestjs/common";

import {
  LinkableSubjects,
  RegisteredLinkableSubjects,
} from "../payment/channels/subjects/index.js";

/**
 * **Le fil des liens de paiement, relié** (plan
 * `documentation/comptabilite/liens-de-paiement/plan-le-lien-vers-un-sujet.md`,
 * §2.2) — la figure de `CardPaymentFeedModule` : `payment` DÉCLARE
 * `LinkableSubjects`, la racine de composition y range les implémenteurs.
 *
 * Vide aujourd'hui : la régularisation (`free_charge`) et la facture
 * (`invoice`) l'implémenteront à leur lot. Un lien ne s'ouvre donc encore
 * sur aucun sujet — `PayLinks.open` le refuse en le disant.
 */
@Global()
@Module({
  providers: [{ provide: LinkableSubjects, useValue: new RegisteredLinkableSubjects([]) }],
  exports: [LinkableSubjects],
})
export class PayLinkFeedModule {}
