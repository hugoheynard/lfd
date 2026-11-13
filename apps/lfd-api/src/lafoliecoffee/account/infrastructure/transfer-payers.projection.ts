import type { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  collectionMeansAt,
  type PayerMeansEntry,
} from "../../accounting/domain/services/collection-means-timeline.js";
import { payerMeansEntryOf } from "../../accounting/infrastructure/collection-means.mapper.js";

const TRANSFER = "bank_transfer";

/**
 * **Les payeurs qui règlent par virement à `now`**, parmi `payerIds` — deux
 * lectures pour tout le lot (les entités, puis les segments), jamais une par
 * société : la galerie et le compteur du menu parcourent tout le portefeuille.
 *
 * Le moyen se lit par entité juridique avec la règle de la comptabilité
 * (`collectionMeansAt` : le dernier segment vivant entré en vigueur, sinon le
 * prélèvement). Un payeur n'est « au virement » que s'il l'est chez **toutes**
 * les entités : un mandat reste utile dès qu'une seule entité le prélève, et
 * une entité où il n'a jamais rien changé le prélève. Le crédit accordé
 * (`granted_terms`) n'est pas rangé par entité, d'où ce choix prudent : on
 * préfère un avertissement de trop à un prélèvement sans mandat.
 */
export async function transferPayersAmong(
  prisma: PrismaService,
  payerIds: readonly string[],
  now: Date,
): Promise<ReadonlySet<string>> {
  if (payerIds.length === 0) {
    return new Set();
  }
  const [entities, rows] = await Promise.all([
    prisma.legalEntity.findMany({ select: { id: true } }),
    prisma.payerCollectionMeans.findMany({
      where: { payerCompanyId: { in: [...new Set(payerIds)] } },
    }),
  ]);
  if (entities.length === 0) {
    return new Set();
  }
  const byKey = new Map<string, PayerMeansEntry[]>();
  for (const row of rows) {
    const key = `${row.payerCompanyId}|${row.legalEntityId}`;
    byKey.set(key, [...(byKey.get(key) ?? []), payerMeansEntryOf(row)]);
  }
  const payers = new Set(rows.map((row) => row.payerCompanyId));
  return new Set(
    [...payers].filter((payerId) =>
      entities.every(
        (entity) =>
          collectionMeansAt(byKey.get(`${payerId}|${entity.id}`) ?? [], now).means === TRANSFER,
      ),
    ),
  );
}

/**
 * Le payeur d'une société à `now` : le principal qu'elle suit en `billing`
 * (période ouverte, entrée en vigueur), sinon elle-même — la règle de
 * `collectionMeansPayerOf`, sur les colonnes que la projection lit déjà.
 */
export function warningPayerOf(
  companyId: string,
  openBillingFollows: readonly { readonly parentId: string; readonly validFrom: Date }[],
  now: Date,
): string {
  const follow = openBillingFollows.find((f) => f.validFrom.getTime() <= now.getTime());
  return follow?.parentId ?? companyId;
}
