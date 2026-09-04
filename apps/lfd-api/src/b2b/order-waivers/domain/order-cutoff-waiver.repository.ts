import type { OrderCutoffWaiverPayload, OrderCutoffWaiverView } from "@lfd/contracts";

/**
 * Port des **dérogations d'heure limite** — la surface d'administration.
 *
 * Sans mur d'entreprise : ces autorisations sont accordées PAR le staff, et le
 * mur qui compte est celui de l'accès staff, tenu par le contrôleur. Le
 * `companyId` y est une **donnée** de la décision, pas un filtre de lecture.
 *
 * Le contexte `orders` n'utilise pas ce port-ci mais un port à lui, plus
 * étroit : composer une commande n'autorise pas à accorder une dérogation.
 */
export abstract class OrderCutoffWaiverRepository {
  /** Les dérogations d'un client, la plus récente d'abord. */
  abstract listFor(companyId: string): Promise<readonly OrderCutoffWaiverView[]>;

  /**
   * Accorde la dérogation. Rend son identifiant.
   *
   * @throws {OpenWaiverAlreadyExistsError} une autorisation ouverte existe déjà.
   */
  abstract grant(payload: OrderCutoffWaiverPayload, grantedByStaffId: string): Promise<string>;

  /**
   * Retire une dérogation **qui n'a pas encore servi**.
   *
   * Une dérogation consommée ne se retire pas : elle atteste ce qui s'est passé,
   * et une commande passée ne se dépasse pas. C'est le pendant exact de « pas de
   * DELETE physique » — ici l'archivage n'a pas lieu d'être, c'est la
   * consommation qui rend la ligne immuable.
   */
  abstract revoke(id: string): Promise<void>;
}
