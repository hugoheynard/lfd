import type { OrderCutoffWaiverPayload, OrderCutoffWaiverView } from "@lfd/contracts";

import type { CutoffWaiverDecision } from "./order-cutoff-waiver.events.js";

/** Une dérogation qui vient d'être accordée : son id, et ce qu'elle décide. */
export interface GrantedCutoffWaiver {
  readonly id: string;
  readonly decision: CutoffWaiverDecision;
}

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
   * Accorde la dérogation. Rend son identifiant, et ce qu'elle décide — le
   * client nommé comme il l'est au moment de l'accord, pour que le journal le
   * garde (D5 du plan des phrases, 2026-09-19).
   *
   * @throws {OpenWaiverAlreadyExistsError} une autorisation ouverte existe déjà.
   */
  abstract grant(
    payload: OrderCutoffWaiverPayload,
    grantedByStaffId: string,
  ): Promise<GrantedCutoffWaiver>;

  /**
   * Retire une dérogation **qui n'a pas encore servi**.
   *
   * Une dérogation consommée ne se retire pas : elle atteste ce qui s'est passé,
   * et une commande passée ne se dépasse pas. C'est le pendant exact de « pas de
   * DELETE physique » — ici l'archivage n'a pas lieu d'être, c'est la
   * consommation qui rend la ligne immuable.
   *
   * Rend ce que la dérogation décidait : la ligne disparaît, et le journal est
   * la seule place où cette décision survivra (depuis le 2026-09-19).
   *
   * @throws {OrderCutoffWaiverNotFoundError} inconnue, ou déjà consommée.
   */
  abstract revoke(id: string): Promise<CutoffWaiverDecision>;
}
