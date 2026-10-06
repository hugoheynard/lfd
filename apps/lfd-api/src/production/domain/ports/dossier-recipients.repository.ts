import type { DossierRecipients } from "../entities/dossier-recipients.js";

/**
 * **La liste des destinataires du dossier**, côté écriture (plan
 * `dossier-prod-du-jour.md`, E2) : l'agrégat se charge entier, fiches du
 * personnel résolues, et se sauve entier — ses ajouts s'insèrent, ses retraits
 * s'archivent.
 */
export abstract class DossierRecipientsRepository {
  abstract load(): Promise<DossierRecipients>;

  abstract save(recipients: DossierRecipients): Promise<void>;
}
