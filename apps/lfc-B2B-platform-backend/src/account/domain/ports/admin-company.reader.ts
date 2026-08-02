import type { CompanyStatus } from "../value-objects/company-status.js";
import type { ContactView, KbisView, PaymentTerm } from "./account.reader.js";

/**
 * Une société vue **par le staff** (app admin), en lecture cross-tenant.
 *
 * C'est la vue complète de la société **moins le seul `role`** : le rôle vit
 * dans la *membership* de l'appelant, or le staff n'est membre d'aucune société.
 * Tout le reste — identité, statut, condition de règlement, **contact
 * principal** (l'interlocuteur facturation/livraison), KBIS — sont les données
 * **propres** de la société : la tenancy `company` isole les clients entre eux,
 * elle n'aveugle pas le staff.
 *
 * La liste des contacts additionnels et les adresses détaillées relèvent de la
 * **fiche** (à venir), pas de la liste — une liste reste scannable.
 */
export interface AdminCompanyView {
  readonly id: string;
  /** Référence humaine courte (`C-XXXXXX`), dictable au téléphone. */
  readonly reference: string;
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
  readonly siret: string;
  readonly tvaIntracom: string;
  readonly status: CompanyStatus;
  /** Condition de règlement **convenue** (écrite par le staff). */
  readonly paymentTerm: PaymentTerm;
  /** Terme **demandé** par le client, en attente ; `null` = aucune demande. */
  readonly requestedPaymentTerm: PaymentTerm | null;
  /** Contact principal — le futur interlocuteur du commercial. */
  readonly primaryContact: ContactView;
  /** KBIS déposé, ou `null`. `certified` = validé par le staff. */
  readonly kbis: KbisView | null;
  /**
   * Une demande de support **ouverte** (`handled_at = null`) est rattachée à la
   * société. Orthogonal au `status` : distingue, parmi les `pending`, celles où
   * le client **demande de l'assistance à la création** (à rappeler) de celles
   * simplement **en attente de vérification des pièces** (dossier auto-rempli).
   */
  readonly hasOpenSupportRequest: boolean;
  /** ISO. Ancienneté du compte (tri par défaut : plus récent d'abord). */
  readonly createdAt: string;
}

/**
 * Port de **lecture admin** des sociétés — **cross-tenant assumé** : contrairement
 * à `AccountReader` (qui part de `user → memberships → company`), on lit
 * directement `company.findMany`, sans mur `company_id`. L'accès est gardé en
 * amont par l'authentification **staff** (cf. `AdminAuthGuard`), pas par la query.
 */
export abstract class AdminCompanyReader {
  abstract listAll(): Promise<readonly AdminCompanyView[]>;
}
