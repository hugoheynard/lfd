import type { AdminCompanyDetailView, AdminCompanyView } from "@lfd/contracts";

/**
 * Les vues de la société côté staff vivent dans `@lfd/contracts` : l'app admin
 * en rendait sa propre copie, un fichier de 207 lignes. On les RÉ-EXPORTE ici
 * pour que rien du domaine ne bouge — le port reste le port, il ne possède
 * simplement plus la forme.
 */
export type {
  CompanyOwnerView,
  AdminCompanyView,
  AdminCompanyDetailView,
  AdminKbisView,
  StaffActorView,
  AdminCompanyFicheView,
  ActivationTraceView,
} from "@lfd/contracts";

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
 * Les adresses détaillées et l'obligation de TVA relèvent de la **fiche**
 * ({@link AdminCompanyDetailView}), pas de la liste — une liste reste scannable.
 */

/**
 * Port de **lecture admin** des sociétés — **cross-tenant assumé** : contrairement
 * à `AccountReader` (qui part de `user → memberships → company`), on lit
 * directement `company.findMany`, sans mur `company_id`. L'accès est gardé en
 * amont par l'authentification **staff** (cf. `AdminAuthGuard`), pas par la query.
 */
export abstract class AdminCompanyReader {
  abstract listAll(): Promise<readonly AdminCompanyView[]>;

  /**
   * La fiche d'une société par son id, ou `null` si aucune société ne porte cet
   * id. Cross-tenant comme {@link listAll} — l'auth staff est le seul mur.
   */
  abstract byId(companyId: string): Promise<AdminCompanyDetailView | null>;
}
