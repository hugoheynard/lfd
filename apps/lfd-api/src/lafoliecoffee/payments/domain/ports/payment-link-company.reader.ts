/**
 * Le nom d'une société cliente, pour un lien qui lui est adressé — ou `null`
 * si elle n'existe pas. Port d'une méthode (ISP) : créer un lien n'a besoin que
 * de savoir à qui il s'adresse, et de le nommer dans le journal et sur Stripe.
 */
export abstract class PaymentLinkCompanyReader {
  abstract nameOf(companyId: string): Promise<string | null>;
}
