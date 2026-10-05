import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Un site prélevé sur le compte de son principal ne prépare pas son mandat
 * depuis son espace** (`plan-sous-comptes.md` §3).
 *
 * Le papier d'un tel mandat imprime l'IBAN du principal : aucune route client
 * d'un site ne résout vers le principal, et celle-ci le ferait. Le mandat se
 * prépare avec l'équipe — ou depuis le site en « RIB propre », dont le compte
 * est le sien.
 */
export class SiteDebitsPayerAccountError extends BusinessError {
  constructor(
    readonly companyId: string,
    readonly payerName: string,
  ) {
    super(
      "payments.mandate.payer_account",
      `Ce site est prélevé sur le compte de « ${payerName} » : son mandat ne se prépare pas depuis cet espace. Demandez-le à La Folie Douce, ou déposez le RIB propre du site.`,
    );
  }
}

/**
 * **Le brouillon nomme un autre compte que celui qu'on imprimerait.**
 *
 * La forme de prélèvement du site a changé depuis la frappe (RIB du principal
 * → RIB propre, ou l'inverse) : imprimer ce brouillon ferait signer une RUM
 * frappée pour un compte sur l'IBAN d'un autre. La sortie est de révoquer le
 * brouillon et d'en frapper un neuf.
 */
export class MandateAccountChangedError extends BusinessError {
  constructor(readonly reference: string) {
    super(
      "payments.mandate.account_changed",
      `Le brouillon ${reference} a été frappé pour un autre compte que celui que ce site débite aujourd'hui : révoquez-le et frappez-en un nouveau.`,
    );
  }
}
