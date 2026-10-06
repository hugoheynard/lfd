import { billingAddressPayloadSchema, type BillingAddressPayload } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  DayOrdersReader,
  type OrderSheetDetails,
  type ProducibleOrder,
  type ServiceDay,
} from "../../../production/channels/commerce/index.js";
import { dueClockOf } from "../domain/services/deadline-thresholds.js";
import { contactOf, pickupLabelOf } from "./atelier-sheet-parts.js";
import { fulfillmentOf } from "./order-fulfillment.parse.js";
import { planWhere } from "./plan-filter.js";

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
        // 🔴 **Le fragment PARTAGÉ** (2026-09-17, « rassemble les règles »). Ce
        // filtre posait ses valeurs à la main, comme les trois autres surfaces
        // de production — et c'est précisément ce qui les avait laissées
        // diverger. `planWhere` porte la règle et sa raison ; la seule chose qui
        // reste propre à ce lecteur est la journée.
        ...planWhere(),
      },
      orderBy: { orderNumber: "asc" },
      select: {
        id: true,
        orderNumber: true,
        fulfillmentMethod: true,
        fulfillment: true,
        pickupAddress: true,
        deliveryAddressSnapshot: true,
        note: true,
        fromSubscriptionId: true,
        placedByStaffId: true,
        clientele: true,
        company: {
          select: {
            enseigne: true,
            raisonSociale: true,
            // Le détenteur : le repli du contact, comme sur la fiche de l'écran.
            memberships: {
              where: { role: "owner" },
              take: 1,
              select: { user: { select: { firstName: true, lastName: true, phone: true } } },
            },
          },
        },
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
      dueAt: dueAtOf(row.fulfillment),
      // La colonne figée par l'agrégat, telle quelle : un `NULL` d'avant la
      // distinction reste inconnu, il n'est pas redéduit de `company_id`.
      clientele: row.clientele,
      lines: row.lines.map((line) => ({
        sku: line.sku,
        productName: line.productNameSnapshot,
        quantity: line.quantity,
      })),
      sheetDetails: sheetDetailsOf(row),
    }));
  }
}

/**
 * L'échéance remise au fournil — la fenêtre lue par le parseur partagé, réduite
 * par la règle du compte à rebours. `null` = aucune fenêtre convenue.
 */
function dueAtOf(fulfillment: Parameters<typeof fulfillmentOf>[0]): string | null {
  const window = fulfillmentOf(fulfillment).window.value;
  return window === null ? null : dueClockOf(window);
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

/** Ce que la requête rend d'une commande, réduit à ce que le bon lit. */
interface SheetSource {
  readonly fulfillmentMethod: string;
  readonly fulfillment: Parameters<typeof fulfillmentOf>[0];
  readonly pickupAddress: unknown;
  readonly deliveryAddressSnapshot: unknown;
  readonly note: string;
  readonly fromSubscriptionId: string | null;
  readonly placedByStaffId: string | null;
  readonly company:
    | (Parameters<typeof contactOf>[1] & {
        readonly enseigne: string | null;
        readonly raisonSociale: string;
      })
    | null;
  readonly placedBy: {
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
  };
}

/**
 * **Le reste du bon, résolu ici** (E1b, 2026-10-06) — les mêmes règles que la
 * fiche de l'écran (`listForProduction`), par les mêmes fonctions
 * (`atelier-sheet-parts.ts`) : le dossier envoyé à l'arrêt et l'impression de
 * l'écran sont le même papier.
 *
 * L'origine se réduit à « passée par un abonnement », la seule qui apprenne
 * quelque chose au fournil — la règle d'`orderOriginOf` : une commande saisie
 * par l'équipe n'est pas récurrente, même tirée d'un abonnement.
 */
function sheetDetailsOf(row: SheetSource): OrderSheetDetails {
  const agreed = fulfillmentOf(row.fulfillment);
  const pickup = addressOf(row.pickupAddress);
  const address =
    row.fulfillmentMethod === "delivery" ? addressOf(row.deliveryAddressSnapshot) : pickup;
  const window = agreed.window.value;
  return {
    tradeName: row.company?.enseigne ?? "",
    legalName: legalNameOf(row),
    pickupLabel: pickupLabelOf(pickup),
    address:
      address === null
        ? null
        : {
            line1: address.ligne1,
            line2: address.ligne2,
            postalCode: address.codePostal,
            city: address.ville,
          },
    window: window === null ? null : { start: window.start, end: window.end },
    contact: contactOf(agreed, row.company),
    signatureRequired: agreed.signatureRequired.value,
    note: row.note,
    recurring: row.placedByStaffId === null && row.fromSubscriptionId !== null,
  };
}

/** La raison sociale — ou la personne, sur une commande sans société (`customerLabelOf`). */
function legalNameOf(row: SheetSource): string {
  if (row.company !== null && row.company.raisonSociale !== "") {
    return row.company.raisonSociale;
  }
  const fullName = `${row.placedBy.firstName} ${row.placedBy.lastName}`.trim();
  return fullName === "" ? row.placedBy.email : fullName;
}

/**
 * Le snapshot postal, validé. Un JSON d'une autre forme rend `null` plutôt que
 * de faire échouer l'arrêt : une adresse illisible ne vaut pas une journée
 * qu'on ne peut pas arrêter, et le bon garde sa destination en une ligne.
 */
function addressOf(value: unknown): BillingAddressPayload | null {
  const parsed = billingAddressPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
