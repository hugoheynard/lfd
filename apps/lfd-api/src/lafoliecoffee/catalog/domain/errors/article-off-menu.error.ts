import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Un article hors de la carte du site**, demandé pour ce sous-compte
 * (`documentation/comptes-client/plan-carte-des-sites.md`, § 3.7) — la carte
 * est réglée « visible, verrouillé », le site l'a vu et la phrase doit dire
 * pourquoi la demande échoue. En `hidden`, le refus reste celui d'un article
 * inconnu : un hors-carte invisible ne se distingue pas d'un inexistant.
 *
 * Levée par le chemin qui facture (devis, passation, saisie staff, lignes
 * ajoutées d'une révision) et par la garde de l'abonnement. L'équipe n'y
 * déroge pas (décision de Hugo du 2026-11-20, Q2).
 */
export class ArticleOffMenuError extends BusinessError {
  constructor(readonly sku: string) {
    super(
      "catalog.article_off_menu",
      `L'article ${sku} n'est pas ouvert à ce site par son compte principal : retirez-le de la demande, ou demandez au compte principal de l'ajouter à la carte du site.`,
    );
  }
}
