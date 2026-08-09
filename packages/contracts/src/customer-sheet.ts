/**
 * Contrat de la **fiche client, version commerciale** : ce qu'un commercial doit
 * avoir sous les yeux quand il décroche — qui est en face, ce que le compte pèse,
 * et ce qu'il peut faire dans la foulée.
 *
 * Trois blocs, et pas un de plus : l'**identité** (à qui je parle), les
 * **chiffres** (est-ce un gros compte, progresse-t-il), les **commandes
 * récentes** (de quoi il va me parler). Tout le reste est à un clic sur la fiche
 * complète — une fiche qui dit tout ne se lit pas pendant un appel.
 */
import { z } from "zod";

/**
 * État commercial d'un compte. Déclaré ici parce que c'est la fiche qui le fait
 * enfin traverser la frontière — jusque-là il ne vivait qu'en base et dans un
 * type recopié côté admin.
 */
export const companyStatusSchema = z.enum(["pending", "active", "suspended", "terminated"]);
export type CompanyStatus = z.infer<typeof companyStatusSchema>;

/** Une commande, réduite à ce qui se lit en ligne dans une file. */
export interface CustomerOrderLine {
  readonly id: string;
  readonly orderNumber: string;
  /** Instant de la commande (ISO UTC). */
  readonly placedAt: string;
  readonly status: string;
  /** Total **TTC** encaissé, en centimes. */
  readonly totalCents: number;
}

/**
 * L'**évolution** des 30 derniers jours face aux 30 précédents.
 *
 * `percent` vaut `null` quand la période précédente est à zéro : on ne divise pas
 * par rien, et « +∞ % » ne dit rien à personne. La direction, elle, reste
 * lisible — passer de 0 à quelque chose, c'est monter.
 */
export interface CustomerSpendTrend {
  readonly last30Cents: number;
  readonly previous30Cents: number;
  readonly percent: number | null;
  readonly direction: "up" | "down" | "flat";
}

/** Les quatre chiffres qui disent le poids d'un compte. */
export interface CustomerStats {
  /** Tout ce que le compte a dépensé, commandes annulées exclues. */
  readonly totalSpentCents: number;
  readonly ordersCount: number;
  /** Paniers récurrents **actifs** des membres de la société. */
  readonly recurringBasketsCount: number;
  /** Panier moyen — `0` tant qu'aucune commande n'a été passée. */
  readonly averageTicketCents: number;
  readonly trend: CustomerSpendTrend;
}

/** La fiche complète rendue au commercial. */
export interface CustomerSheetView {
  readonly companyId: string;
  readonly reference: string;
  readonly raisonSociale: string;
  readonly enseigne: string;
  /** Code NAF — la **catégorie** d'activité, vide tant qu'inconnue. */
  readonly nafCode: string;
  readonly status: CompanyStatus;
  /** Inscription (création du compte) et activation commerciale, ISO UTC. */
  readonly createdAt: string;
  readonly activatedAt: string | null;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly stats: CustomerStats;
  readonly recentOrders: readonly CustomerOrderLine[];
}

/**
 * Ce que le commercial peut faire de l'**état** du compte depuis sa fiche.
 *
 * `suspend` met en pause (le compte existe, il n'achète plus) ; `terminate`
 * résilie (état terminal) ; `reactivate` ramène un compte suspendu à l'actif —
 * une résiliation, elle, ne se défait pas : on rouvre un compte, on ne
 * ressuscite pas l'ancien.
 */
export const companyStatusActionSchema = z.enum(["suspend", "reactivate", "terminate"]);
export type CompanyStatusAction = z.infer<typeof companyStatusActionSchema>;

const REASON_MAX = 200;

/**
 * Suspendre ou résilier **exige un motif** : ce sont les deux gestes qu'on
 * relira dans six mois en se demandant pourquoi, et un motif qu'on ne demande
 * pas au moment du geste ne se retrouve jamais après coup.
 */
export const companyStatusPayloadSchema = z
  .object({
    action: companyStatusActionSchema,
    reason: z.string().trim().max(REASON_MAX, "motif trop long").default(""),
  })
  .superRefine((value, ctx) => {
    if (value.action !== "reactivate" && value.reason === "") {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "un motif est attendu" });
    }
  });
export type CompanyStatusPayload = z.infer<typeof companyStatusPayloadSchema>;
