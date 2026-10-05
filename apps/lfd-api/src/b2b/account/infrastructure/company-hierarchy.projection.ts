import type {
  CompanyFollowAspect,
  CompanyHierarchyView,
  FollowedAspectView,
  SubAccountView,
} from "@lfd/contracts";

import type { PrismaService } from "../../../platform/database/prisma.service.js";

/** Une période de suivi telle que la fiche la lit. */
interface FollowRow {
  readonly aspect: CompanyFollowAspect;
  readonly validFrom: Date;
  readonly validTo: Date | null;
}

/** Ce que la ligne `companies` apporte déjà à la projection. */
export interface HierarchyRow {
  readonly id: string;
  readonly groupWithoutDelivery: boolean;
  readonly parentCompany: {
    readonly id: string;
    readonly enseigne: string;
    readonly status: CompanyHierarchyView["subAccounts"][number]["status"];
  } | null;
}

/** Les périodes ouvertes — `findMany` filtre, `inForce` tranche à l'instant. */
const OPEN_FOLLOWS = {
  where: { validTo: null },
  select: { aspect: true, validFrom: true, validTo: true },
  orderBy: { validFrom: "asc" },
} as const;

/**
 * **La place d'une société dans la hiérarchie**, pour la fiche staff (plan
 * `plan-sous-comptes.md`, §4) : principal, sous-comptes (enseigne, ville,
 * statut, aspects suivis) et aspects suivis en cours avec leur date.
 *
 * Lecture **cross-tenant** assumée, comme le reste de la fiche staff.
 */
export async function readHierarchy(
  prisma: PrismaService,
  row: HierarchyRow,
  now: Date,
): Promise<CompanyHierarchyView> {
  const [follows, children, form] = await Promise.all([
    prisma.companyFollow.findMany({ ...OPEN_FOLLOWS, where: { companyId: row.id, validTo: null } }),
    prisma.company.findMany({
      where: { parentCompanyId: row.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        enseigne: true,
        raisonSociale: true,
        status: true,
        addresses: {
          where: { kind: "delivery", archivedAt: null },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: { ville: true },
          take: 1,
        },
        follows: OPEN_FOLLOWS,
      },
    }),
    // La forme qui couvre `now` (début inclus, fin exclue) — un sous-compte seulement.
    row.parentCompany === null
      ? Promise.resolve(null)
      : prisma.companyCollectionForm.findFirst({
          where: {
            companyId: row.id,
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gt: now } }],
          },
          select: { form: true, validFrom: true },
        }),
  ]);
  return {
    parent: row.parentCompany,
    subAccounts: children.map((child): SubAccountView => ({
      id: child.id,
      enseigne: child.enseigne === "" ? child.raisonSociale : child.enseigne,
      city: child.addresses[0]?.ville ?? null,
      status: child.status,
      followedAspects: inForce(child.follows, now).map((follow) => follow.aspect),
    })),
    follows: inForce(follows, now),
    groupWithoutDelivery: row.groupWithoutDelivery,
    collectionForm: form === null ? null : { form: form.form, since: form.validFrom.toISOString() },
  };
}

/** Les suivis qui agissent à `now` — une période posée pour plus tard n'en est pas un. */
function inForce(rows: readonly FollowRow[], now: Date): FollowedAspectView[] {
  return rows
    .filter((follow) => follow.validFrom.getTime() <= now.getTime())
    .map((follow) => ({ aspect: follow.aspect, since: follow.validFrom.toISOString() }));
}

/**
 * Ce sous-compte est-il facturé au nom d'un principal ACTIF à `now` ? C'est
 * la règle du §2.1 bis, telle que la galerie d'avertissements la lit sur la
 * liste — la fiche la relit, elle, dans `activationGate`.
 */
export function billingCarriedAt(
  parent: { readonly status: string } | null,
  openBillingFollows: readonly { readonly validFrom: Date }[],
  now: Date,
): boolean {
  return (
    parent !== null &&
    parent.status === "active" &&
    openBillingFollows.some((follow) => follow.validFrom.getTime() <= now.getTime())
  );
}
