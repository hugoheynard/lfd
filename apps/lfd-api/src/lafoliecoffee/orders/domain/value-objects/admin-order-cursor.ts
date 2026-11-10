import { InvalidAdminOrderCursorError } from "../errors/admin-order-list-errors.js";

/**
 * **Où reprendre la liste staff des commandes** — la dernière ligne rendue,
 * par sa date de passation puis son identifiant.
 *
 * Le couple, pas la date seule : deux commandes peuvent tomber à la même
 * milliseconde, et une page qui couperait entre elles en perdrait une. L'ordre
 * de la liste est exactement celui-ci (`createdAt desc, id desc`), si bien que
 * « tout ce qui est strictement après le curseur » ne saute ni ne répète rien,
 * même si une commande est passée entre deux pages — elle est plus récente que
 * le curseur, donc hors des pages suivantes.
 *
 * Opaque pour l'écran (base64url) : il le renvoie tel quel, il ne le compose
 * pas. Ce n'est pas un secret — c'est une forme qu'on se réserve de changer.
 */
export class AdminOrderCursor {
  private constructor(
    readonly placedAt: Date,
    readonly orderId: string,
  ) {}

  /** Le curseur qui suit cette ligne. */
  static after(placedAt: Date, orderId: string): AdminOrderCursor {
    if (Number.isNaN(placedAt.getTime()) || orderId === "") {
      throw new InvalidAdminOrderCursorError();
    }
    return new AdminOrderCursor(placedAt, orderId);
  }

  /** Relit un curseur rendu par une page précédente. */
  static decode(token: string): AdminOrderCursor {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const separator = decoded.indexOf(SEPARATOR);
    if (separator <= 0) {
      throw new InvalidAdminOrderCursorError();
    }
    const placedAt = new Date(decoded.slice(0, separator));
    const orderId = decoded.slice(separator + SEPARATOR.length);
    // Relu à l'identique ou refusé : un jeton bricolé qui se parserait « à peu
    // près » reprendrait la liste au mauvais endroit sans le dire.
    if (
      Number.isNaN(placedAt.getTime()) ||
      placedAt.toISOString() !== decoded.slice(0, separator)
    ) {
      throw new InvalidAdminOrderCursorError();
    }
    return AdminOrderCursor.after(placedAt, orderId);
  }

  encode(): string {
    return Buffer.from(
      `${this.placedAt.toISOString()}${SEPARATOR}${this.orderId}`,
      "utf8",
    ).toString("base64url");
  }
}

/** Ne peut figurer ni dans une date ISO, ni dans un identifiant de commande. */
const SEPARATOR = "|";
