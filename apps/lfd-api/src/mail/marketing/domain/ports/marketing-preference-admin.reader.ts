import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import type { MarketingPreferenceSnapshot } from "../entities/marketing-preference-state.js";
import type { MarketingStatus } from "../value-objects/marketing-vocabulary.js";

/** Les filtres de la liste du staff (lot C4). */
export interface MarketingPreferenceAdminFilter {
  readonly space: MailBrandCode | null;
  readonly status: MarketingStatus | null;
}

/**
 * Port de LECTURE du registre pour le back-office (plan de désinscription,
 * règle 8, lot C4) — distinct du lecteur du contrôle à l'envoi (ISP) : lui
 * ne lit qu'un état par empreinte, celui-ci des pages. Il rend l'état
 * complet ; le masque de l'adresse est posé par l'application.
 */
export abstract class MarketingPreferenceAdminReader {
  /**
   * Au plus `limit` lignes, les plus récentes d'abord (identifiant ULID
   * décroissant), après `afterId` s'il est donné.
   */
  abstract page(
    filter: MarketingPreferenceAdminFilter,
    afterId: string | null,
    limit: number,
  ): Promise<readonly MarketingPreferenceSnapshot[]>;

  /**
   * Ces lignes-là, les plus récentes d'abord — les lignes trouvées par une
   * recherche. Une ligne effacée depuis est simplement absente.
   */
  abstract byIds(ids: readonly string[]): Promise<readonly MarketingPreferenceSnapshot[]>;

  /** `null` : la ligne n'est pas au registre. */
  abstract detail(id: string): Promise<MarketingPreferenceSnapshot | null>;
}
