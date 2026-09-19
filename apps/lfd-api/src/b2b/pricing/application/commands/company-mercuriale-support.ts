import { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";
import { describeArticleCount, describeWindowOf } from "../../domain/pricing-act.js";
import { PosedMercurialeNotFoundError } from "../../domain/pricing-errors.js";

/**
 * **Établir la mercuriale d'un compte**, la clore, la renommer — ce que les
 * trois gestes partagent : la désignation par l'écran, et la phrase figée du
 * journal.
 *
 * ## Une écriture, là où il en fallait N
 *
 * Ces trois gestes écrivaient chacun N lignes : poser en écrivait une par
 * article et par palier, clore les archivait une à une, renommer les réécrivait
 * toutes sous transaction — avec un refus d'homonymie pour empêcher deux
 * mercuriales de fusionner à la lecture, puisque le libellé servait de clé.
 *
 * La mercuriale étant un objet depuis le 2026-09-08, tout ça tombe. Poser est
 * un `INSERT`, clore un `UPDATE`, renommer un `UPDATE` d'une colonne. Le refus
 * d'homonymie disparaît : deux mercuriales peuvent porter le même nom, elles ne
 * se confondent plus.
 *
 * ## Prix fixe uniquement, et c'est une décision d'ÉCRAN
 *
 * Le contrat de cette surface ne porte pas de paliers : une ligne, un prix. Le
 * modèle, lui, en porte — une mercuriale statique EST la grille à un seul
 * palier, à partir de 1. Les mercuriales à paliers arriveront donc comme une
 * forme de plus dans le contrat, **sans migration**.
 */

/**
 * **Retrouver la mercuriale que l'écran désigne.**
 *
 * Par son identifiant, ou — le temps d'un déploiement — par son ancienne
 * désignation `(libellé, fenêtre)`. Un onglet ouvert sur le bundle d'avant le
 * 2026-09-08 ne peut pas envoyer un identifiant qu'il n'a jamais reçu, et le
 * refuser fermerait l'écran de quelqu'un qui n'a rien fait de mal.
 *
 * Le repli filtre **en mémoire** plutôt qu'en base : un client a quelques
 * mercuriales, pas des milliers, et une seconde clause SQL destinée à
 * disparaître aurait été une seconde chose à retirer.
 *
 * @throws {PosedMercurialeNotFoundError} rien ne correspond chez ce client.
 */
export async function designated(
  mercuriales: CompanyMercurialeReader,
  companyId: string,
  // `?: T | undefined` et non `?: T` : `exactOptionalPropertyTypes` distingue
  // « absent » de « présent et indéfini », et zod rend le second.
  payload: {
    id?: string | undefined;
    label?: string | undefined;
    validFrom?: string | undefined;
    validTo?: string | null | undefined;
  },
): Promise<CompanyMercuriale> {
  const candidates = await mercuriales.listFor(companyId);
  const found =
    payload.id === undefined
      ? candidates.find((entry) => matchesLegacyKey(entry, payload))
      : candidates.find((entry) => entry.id === payload.id);
  if (found === undefined) {
    throw new PosedMercurialeNotFoundError(payload.id ?? payload.label ?? "?");
  }
  return found;
}

/** L'ancienne clé : libellé **et** fenêtre, les deux bouts. */
function matchesLegacyKey(
  mercuriale: CompanyMercuriale,
  payload: {
    label?: string | undefined;
    validFrom?: string | undefined;
    validTo?: string | null | undefined;
  },
): boolean {
  if (payload.label === undefined || payload.validFrom === undefined) {
    return false;
  }
  const state = mercuriale.toPersistence();
  const to = payload.validTo ?? null;
  return (
    state.label === payload.label &&
    state.validFrom.getTime() === new Date(payload.validFrom).getTime() &&
    (state.validTo?.toISOString() ?? null) === (to === null ? null : new Date(to).toISOString())
  );
}

/**
 * La phrase figée au moment de l'acte.
 *
 * Figée et non recalculée : la mercuriale peut avoir été close, ou renommée. Un
 * journal qui rendrait la phrase d'aujourd'hui pour un acte d'hier raconterait
 * l'histoire à l'envers.
 */
export function describeMercuriale(mercuriale: CompanyMercuriale): string {
  const state = mercuriale.toPersistence();
  // Elle écrivait « du 2026-09-01 au sans terme » : les dates en ISO, et une
  // fenêtre ouverte qui cassait la phrase. Les mots de la fenêtre sont ceux
  // des règles et des barèmes (plan des phrases du journal, lot D).
  return `Mercuriale « ${state.label} » — ${describeArticleCount(state.lines.length)}, ${describeWindowOf(state.validFrom, state.validTo)}`;
}
