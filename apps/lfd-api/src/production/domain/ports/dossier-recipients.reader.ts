/**
 * **La liste des destinataires du dossier**, côté lecture (plan
 * `dossier-prod-du-jour.md`, E2) — un port à part du dépôt (ISP) : l'écran
 * lit des lignes, il ne garde aucun invariant.
 */
export abstract class DossierRecipientsReader {
  /** Les lignes vivantes, dans l'ordre d'inscription. */
  abstract list(): Promise<readonly StoredDossierRecipient[]>;
}

/** Une ligne telle qu'elle est rangée : une fiche n'y porte que sa référence. */
export type StoredDossierRecipient =
  | { readonly id: string; readonly kind: "staff"; readonly staffUserId: string }
  | {
      readonly id: string;
      readonly kind: "external";
      readonly email: string;
      readonly firstName: string;
      readonly lastName: string;
      readonly jobTitle: string | null;
    };
