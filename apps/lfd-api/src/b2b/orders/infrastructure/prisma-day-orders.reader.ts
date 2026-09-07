import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
  type ServiceDay,
} from "../../../production/channels/commerce/index.js";

/**
 * **Ce que le commerce rend à la production**, et rien de plus.
 *
 * ## Pourquoi cet adaptateur vit ici, et pas chez la production
 *
 * Le port est **déclaré** par la production — c'est elle qui dit ce dont elle a
 * besoin — et **implémenté** par le commerce, qui seul sait ce que ses statuts
 * veulent dire. `appBootstrap` relie les deux. C'est le DIP appliqué à une
 * frontière de contexte : le fournil dépend d'une abstraction qu'il possède, et
 * le commerce se plie à ce qu'on lui demande sans rien exposer d'autre.
 *
 * ⚠️ **La règle « producible » appartient au commerce.** Une commande annulée ou
 * en brouillon n'entre pas — mais c'est ici qu'on le décide, parce que la
 * production n'a pas à connaître l'énuméré des statuts d'une commande. Le jour
 * où un statut s'ajoute, un seul fichier bouge.
 *
 * ## Ce qui ne franchit PAS ce port
 *
 * Aucun montant, aucun statut, aucun jeton, aucune `OrderView`. Le fournil
 * reçoit ce qu'il fabrique et où ça va. Lui donner la vue du commerce aurait
 * remplacé une jointure SQL par une jointure de types — le même couplage, écrit
 * autrement.
 */
@Injectable()
export class PrismaDayOrdersReader extends DayOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async producibleFor(day: ServiceDay): Promise<readonly ProducibleOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        // La colonne est un `date` Postgres, lu par Prisma à minuit UTC : on
        // compose la borne de la même façon, comme `listForProduction` le fait
        // déjà. C'est exactement la conversion que le schéma `production` a
        // supprimée de son côté en gardant le jour en texte.
        requestedDeliveryDate: new Date(`${day.value}T00:00:00.000Z`),
        status: { notIn: ["cancelled", "draft"] },
      },
      orderBy: { orderNumber: "asc" },
      select: {
        id: true,
        orderNumber: true,
        fulfillmentMethod: true,
        pickupAddress: true,
        deliveryAddressSnapshot: true,
        company: { select: { enseigne: true, raisonSociale: true } },
        placedBy: { select: { firstName: true, lastName: true, email: true } },
        lines: { select: { sku: true, productNameSnapshot: true, quantity: true } },
      },
    });

    return rows.map((row) => ({
      orderId: row.id,
      reference: row.orderNumber,
      customerLabel: labelOf(row.company, row.placedBy),
      fulfillmentMethod: row.fulfillmentMethod === "delivery" ? "delivery" : "pickup",
      destination: destinationOf(
        row.fulfillmentMethod,
        row.pickupAddress,
        row.deliveryAddressSnapshot,
      ),
      lines: row.lines.map((line) => ({
        sku: line.sku,
        productName: line.productNameSnapshot,
        quantity: line.quantity,
      })),
    }));
  }
}

/**
 * De quoi poser la feuille sur la bonne pile.
 *
 * L'ENSEIGNE d'abord : c'est le nom qu'on crie au fournil. La raison sociale
 * ensuite, puis la personne — une commande zéro friction n'a pas de société, et
 * une feuille anonyme est une feuille qu'on ne peut pas classer.
 */
function labelOf(
  company: { readonly enseigne: string | null; readonly raisonSociale: string } | null,
  placedBy: { readonly firstName: string; readonly lastName: string; readonly email: string },
): string {
  if (company !== null) {
    const enseigne = company.enseigne ?? "";
    return enseigne === "" ? company.raisonSociale : enseigne;
  }
  const fullName = `${placedBy.firstName} ${placedBy.lastName}`.trim();
  return fullName === "" ? placedBy.email : fullName;
}

/**
 * Le lieu, **déjà résolu en une ligne**.
 *
 * La production reçoit un mot, pas une adresse structurée : elle n'a pas à
 * savoir qu'un retrait porte un point et une livraison un instantané postal.
 * Ce qui charge un véhicule, c'est « Le Labo » ou « 12 rue du Four, Tignes ».
 */
function destinationOf(method: string, pickup: unknown, delivery: unknown): string {
  const source = method === "delivery" ? delivery : pickup;
  if (typeof source !== "object" || source === null) {
    return "";
  }
  const read = (key: string): string => {
    const value = key in source ? (source as Record<string, unknown>)[key] : undefined;
    return typeof value === "string" ? value : "";
  };
  const label = read("label");
  const street = read("ligne1");
  const city = read("ville");
  const parts = method === "delivery" ? [street, city] : [label === "" ? street : label];
  return parts.filter((part) => part !== "").join(", ");
}
