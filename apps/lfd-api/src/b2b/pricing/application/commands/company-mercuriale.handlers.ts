import type {
  CloseCompanyMercurialePayload,
  PoseCompanyMercurialePayload,
  RenameCompanyMercurialePayload,
} from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PricedDecisionsReader } from "../../domain/ports/priced-decisions.reader.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { PricedCompanyReader } from "../../domain/ports/priced-company.reader.js";
import { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";
import { CompanyMercurialeRepository } from "../../domain/ports/company-mercuriale.repository.js";
import {
  PricedCompanyNotFoundError,
  PosedMercurialeNotFoundError,
  PricedPeriodIsSealedError,
  RunningMercurialeError,
} from "../../domain/pricing-errors.js";
import { MercurialeDrafts } from "../mercuriale-drafts.store.js";

/**
 * **Établir la mercuriale d'un compte**, la clore, la renommer.
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

/** Poser une mercuriale chez ce client, sur une fenêtre datée aux deux bouts. */
export class PoseCompanyMercurialeCommand {
  constructor(
    readonly companyId: string,
    readonly payload: PoseCompanyMercurialePayload,
    readonly staffSub: string,
  ) {}
}

/** Clore une mercuriale : elle est archivée, jamais effacée. */
export class CloseCompanyMercurialeCommand {
  constructor(
    readonly companyId: string,
    readonly payload: CloseCompanyMercurialePayload,
    readonly staffSub: string,
  ) {}
}

/** Renommer une mercuriale. Le libellé ne participe à aucun calcul. */
export class RenameCompanyMercurialeCommand {
  constructor(
    readonly companyId: string,
    readonly payload: RenameCompanyMercurialePayload,
    readonly staffSub: string,
  ) {}
}

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
async function designated(
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

@CommandHandler(PoseCompanyMercurialeCommand)
export class PoseCompanyMercurialeHandler implements ICommandHandler<
  PoseCompanyMercurialeCommand,
  number
> {
  constructor(
    private readonly companies: PricedCompanyReader,
    private readonly mercuriales: CompanyMercurialeRepository,
    private readonly ids: IdGenerator,
    private readonly drafts: MercurialeDrafts,
    private readonly priced: PricedDecisionsReader,
  ) {}

  /**
   * Rend le nombre d'articles posés.
   *
   * ## Deux protections, et elles ne font pas le même travail
   *
   * **Le pré-contrôle** cherche une mercuriale déjà en cours sur cette période
   * et refuse en la **nommant** : la contrainte d'exclusion, elle, dirait
   * seulement « recouvrement », et le commercial n'aurait pas la phrase à dire
   * au client. C'est aussi lui qui rend praticable « on clôt d'abord ».
   *
   * **La contrainte** couvre la course que le pré-contrôle ne peut pas fermer :
   * deux commerciaux sur le même compte au même instant. Elle refuse la seconde
   * écriture, et l'adaptateur traduit son refus dans la même phrase.
   *
   * ⚠️ Le pré-contrôle est désormais **plus large** qu'avant : il refusait un
   * recouvrement sur les SEULS articles de la nouvelle grille, ce qui laissait
   * deux mercuriales coexister chez un client si elles portaient sur des
   * articles disjoints. C'est une capacité retirée, et assumée : une mercuriale
   * est le tarif d'un client, pas un tarif par rayon.
   *
   * @throws {PricedCompanyNotFoundError} l'identifiant ne désigne aucune société.
   * @throws {RunningMercurialeError} une mercuriale couvre déjà cette période.
   */
  async execute(command: PoseCompanyMercurialeCommand): Promise<number> {
    const { companyId, payload, staffSub } = command;
    await this.assertCompanyExists(companyId);

    const validFrom = new Date(payload.validFrom);
    const validTo = new Date(payload.validTo);

    const running = await this.mercuriales.runningFor(companyId, validFrom, validTo);
    if (running !== null) {
      const state = running.toPersistence();
      throw new RunningMercurialeError(state.label, state.validFrom, state.validTo);
    }

    // 🔴 **Le second recouvrement, celui que la base ne voit pas.**
    //
    // La contrainte d'exclusion est PARTIELLE (`WHERE archived_at IS NULL`) :
    // elle protège du chevauchement avec une mercuriale en cours, jamais avec
    // une close. Depuis que clore BORNE la fenêtre (R17), une close garde
    // pourtant sa place dans le passé — et poser par-dessus donnerait deux
    // tarifs à la même date : celui qui a été payé, figé sur la commande, et
    // celui qu'une relecture datée rendrait.
    //
    // ⚠️ Le refus vise **« a facturé »**, pas « est passé ». Une mercuriale
    // close que personne n'a citée ne bloque rien : la reposer sur sa période
    // est le geste ordinaire « je me suis trompé, je recommence ». Interdire
    // toute pose rétroactive aurait supprimé cet usage — attesté par un e2e —
    // pour protéger un cas qui ne se produisait pas.
    const closed = await this.mercuriales.archivedOverlapping(companyId, validFrom, validTo);
    if (closed.length > 0 && (await this.priced.anyPriced(closed))) {
      throw new PricedPeriodIsSealedError("mercuriale", validFrom);
    }

    const mercuriale = CompanyMercuriale.pose(
      this.ids.next(),
      {
        companyId,
        label: payload.label,
        // Le prix fixe est porté comme le seul palier de sa ligne : c'est la
        // forme que le modèle connaît, et la seule. La distinction « fixe /
        // paliers » vit dans le contrat et l'écran, pas en base.
        lines: payload.lines.map((line) => ({
          sku: line.sku,
          tiers: [{ minQuantity: 1, unitPriceMillicents: line.unitPriceMillicents }],
        })),
        validFrom,
        validTo,
      },
      staffSub,
    );

    await this.mercuriales.save(mercuriale, {
      subjectType: "mercuriale",
      subjectId: mercuriale.id,
      kind: "posed",
      actor: staffSub,
      at: mercuriale.toPersistence().validFrom,
      reason: `Mercuriale « ${payload.label} » posée sur la fiche du compte`,
      summary: describe(mercuriale),
    });

    // Le brouillon a servi : il est devenu une décision. APRÈS l'écriture,
    // jamais avant — jeter un brouillon n'est pas ce qu'on veut annuler si la
    // pose échoue ; c'est au contraire le moment où il faut le garder.
    await this.drafts.discard(companyId);
    return mercuriale.lines.length;
  }

  /**
   * 🔴 **Par le port, et non par Prisma.** Ce contrôle était écrit deux fois —
   * ici et dans `CompanyPricingQuery` — et les deux lisaient `companies` en
   * Prisma direct depuis la couche application. C'est la frontière que
   * `CLAUDE.md` §3 décrit comme franchie quand même : le graphe d'imports ne
   * voit pas une table interrogée sans import, et il écrit que « c'est arrivé
   * deux fois ». C'en était une troisième (2026-09-09, R21).
   */
  private async assertCompanyExists(companyId: string): Promise<void> {
    if (!(await this.companies.exists(companyId))) {
      throw new PricedCompanyNotFoundError(companyId);
    }
  }
}

@CommandHandler(CloseCompanyMercurialeCommand)
export class CloseCompanyMercurialeHandler implements ICommandHandler<
  CloseCompanyMercurialeCommand,
  number
> {
  constructor(
    private readonly mercuriales: CompanyMercurialeRepository,
    private readonly reader: CompanyMercurialeReader,
    private readonly clock: Clock,
  ) {}

  /**
   * Archive la mercuriale, et rend le nombre d'articles qu'elle portait.
   *
   * **Archiver et non borner.** Les deux se défendent ; archiver est celui qui
   * rend sa place dans la contrainte d'exclusion, donc le seul qui permette de
   * reposer sur la même période — ce qu'on vient précisément faire. Rien n'est
   * perdu : une lecture datée d'avant la clôture la retrouve, et ce qu'elle a
   * facturé est figé sur les commandes.
   *
   * @throws {PosedMercurialeNotFoundError} rien ne correspond chez ce client.
   * @throws {ArchivedMercurialeIsSealedError} elle est déjà close.
   */
  async execute(command: CloseCompanyMercurialeCommand): Promise<number> {
    const { companyId, payload, staffSub } = command;
    const mercuriale = await designated(this.reader, companyId, payload);
    const now = this.clock.now();
    const closed = mercuriale.close(staffSub, now, payload.reason);

    await this.mercuriales.update(closed, {
      subjectType: "mercuriale",
      subjectId: closed.id,
      kind: "archived",
      actor: staffSub,
      at: now,
      reason: payload.reason,
      // Le résumé décrit la mercuriale d'AVANT, comme partout dans ce journal :
      // ce qu'on relit est ce qui a été clos.
      summary: describe(mercuriale),
    });
    return mercuriale.lines.length;
  }
}

@CommandHandler(RenameCompanyMercurialeCommand)
export class RenameCompanyMercurialeHandler implements ICommandHandler<
  RenameCompanyMercurialeCommand,
  number
> {
  constructor(
    private readonly mercuriales: CompanyMercurialeRepository,
    private readonly reader: CompanyMercurialeReader,
    private readonly clock: Clock,
  ) {}

  /**
   * Renomme, et rend le nombre d'articles — la réponse garde sa forme.
   *
   * **Aucun prix ne bouge**, et plus rien ne l'empêche de le prouver : le
   * libellé est une colonne, l'adaptateur n'écrit qu'elle.
   *
   * Le refus d'homonymie a disparu avec l'identité. Il n'existait que parce que
   * deux mercuriales de même nom et de même fenêtre se seraient confondues à la
   * lecture suivante — c'était la contrepartie d'une identité déduite.
   *
   * @throws {PosedMercurialeNotFoundError} rien ne correspond chez ce client.
   * @throws {ArchivedMercurialeIsSealedError} elle est close : une décision
   *   terminée garde la phrase qu'elle portait.
   */
  async execute(command: RenameCompanyMercurialeCommand): Promise<number> {
    const { companyId, payload, staffSub } = command;
    const mercuriale = await designated(this.reader, companyId, payload);
    const label = payload.newLabel.trim();
    const renamed = mercuriale.rename(label);

    await this.mercuriales.rename(renamed, {
      subjectType: "mercuriale",
      subjectId: renamed.id,
      kind: "renamed",
      actor: staffSub,
      at: this.clock.now(),
      reason: `Mercuriale « ${mercuriale.label} » renommée « ${label} »`,
      summary: describe(mercuriale),
    });
    return mercuriale.lines.length;
  }
}

/**
 * La phrase figée au moment de l'acte.
 *
 * Figée et non recalculée : la mercuriale peut avoir été close, ou renommée. Un
 * journal qui rendrait la phrase d'aujourd'hui pour un acte d'hier raconterait
 * l'histoire à l'envers.
 */
function describe(mercuriale: CompanyMercuriale): string {
  const state = mercuriale.toPersistence();
  const to = state.validTo === null ? "sans terme" : state.validTo.toISOString().slice(0, 10);
  return `Mercuriale « ${state.label} » — ${String(state.lines.length)} article(s), du ${state.validFrom.toISOString().slice(0, 10)} au ${to}`;
}
