import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NO_PROMOTION_ADMITTED } from "../../domain/entities/mercuriale-promotion-policy.js";
import { PolicyPromotionNamesReader } from "../../domain/ports/policy-promotion-names.reader.js";
import { namedPolicy } from "./promotion-policy-support.js";
import { PricedDecisionsReader } from "../../domain/ports/priced-decisions.reader.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { PricedCompanyReader } from "../../domain/ports/priced-company.reader.js";
import { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeRepository } from "../../domain/ports/company-mercuriale.repository.js";
import {
  PricedCompanyNotFoundError,
  PricedPeriodIsSealedError,
  RunningMercurialeError,
} from "../../domain/pricing-errors.js";
import type { PricingAct } from "../../domain/pricing-act.js";
import { MercurialeDraftStore } from "../ports/mercuriale-draft.store.js";
import { describeMercuriale } from "./company-mercuriale-support.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { assertNotReservedElsewhere, assertOnSale } from "./sale-reference-support.js";
import { ReservedElsewhereReader } from "../../domain/ports/reserved-elsewhere.reader.js";
import { PoseCompanyMercurialeCommand } from "./pose-company-mercuriale.command.js";
import { VolumeCommitmentReader } from "../../domain/ports/volume-commitment.reader.js";
import { assertNoVolumeCommitmentUnder, generalDiscountOf } from "./general-discount-support.js";
import { MERCURIALE_GESTURES, POSED_LINES_REPLAY } from "./mercuriale-intent-support.js";

@CommandHandler(PoseCompanyMercurialeCommand)
export class PoseCompanyMercurialeHandler implements ICommandHandler<
  PoseCompanyMercurialeCommand,
  number
> {
  constructor(
    private readonly companies: PricedCompanyReader,
    private readonly mercuriales: CompanyMercurialeRepository,
    private readonly ids: IdGenerator,
    private readonly drafts: MercurialeDraftStore,
    private readonly priced: PricedDecisionsReader,
    private readonly references: SaleReferenceReader,
    private readonly reservations: ReservedElsewhereReader,
    private readonly promotionNames: PolicyPromotionNamesReader,
    private readonly commitments: VolumeCommitmentReader,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
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
   * @throws {SaleReferenceNotOnSaleError} une ligne vise une référence qui ne se vend pas.
   * @throws {SaleReferenceWithdrawnError} une ligne vise un article retiré.
   * @throws {ReservedArticleRefusedError} une ligne vise un article réservé à un autre compte.
   * @throws les refus de `namedPolicy` (politique de promotions de départ).
   * @throws {GeneralDiscountOverVolumeCommitmentError} une remise générale chez
   *   un client dont un engagement de volume recouvre la période (Q2).
   *
   * ## Une fois par intention
   *
   * Sujet : la société. Un second envoi de même clé rend le nombre d'origine
   * sans reposer ni réécrire le journal ; la clé est résolue dans la même
   * transaction que la pose.
   *
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a servi pour un autre geste ou une autre société.
   */
  execute(command: PoseCompanyMercurialeCommand): Promise<number> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: MERCURIALE_GESTURES.pose,
        subject: command.companyId,
      },
      POSED_LINES_REPLAY,
      (seal) => this.pose(command, seal),
    );
  }

  private async pose(
    command: PoseCompanyMercurialeCommand,
    seal: (posedLines: number) => Promise<void>,
  ): Promise<number> {
    const { companyId, payload, staffUserId } = command;
    await this.assertCompanyExists(companyId);
    // Une ligne sur une référence hors vente ne mordrait jamais (L5).
    await assertOnSale(
      this.references,
      payload.lines.map((line) => line.sku),
      "pro",
    );
    // Ni sur un article réservé à un autre compte (Q1).
    await assertNotReservedElsewhere(
      this.reservations,
      companyId,
      payload.lines.map((line) => line.sku),
    );

    const validFrom = new Date(payload.validFrom);
    // Sans fin, elle court jusqu'à ce qu'on la close.
    const validTo = payload.validTo === null ? null : new Date(payload.validTo);
    // La politique de promotions de départ (`plan-la-mercuriale-decide.md`,
    // § 8) — absente, « Aucune », le défaut d'une mercuriale neuve.
    const promotions = await namedPolicy(
      this.promotionNames,
      payload.promotionPolicy ?? NO_PROMOTION_ADMITTED,
    );

    const generalDiscount =
      payload.generalDiscount == null ? null : generalDiscountOf(payload.generalDiscount);
    if (generalDiscount !== null) {
      await assertNoVolumeCommitmentUnder(this.commitments, companyId, validFrom, validTo);
    }

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
        promotionPolicy: promotions.policy,
        generalDiscount,
      },
      staffUserId,
    );

    await this.uow.run(async () => {
      await this.mercuriales.save(
        mercuriale,
        actOfPose(mercuriale, staffUserId, promotions.phrase),
      );
      await seal(mercuriale.lines.length);
    });

    // Le brouillon a servi : il est devenu une décision. APRÈS l'écriture,
    // jamais avant — jeter un brouillon n'est pas ce qu'on veut annuler si la
    // pose échoue ; c'est au contraire le moment où il faut le garder. Hors
    // de la transaction aussi : un brouillon qui résiste ne défait pas la pose.
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

/** L'acte `posed`, daté de la prise d'effet. */
function actOfPose(
  mercuriale: CompanyMercuriale,
  actor: string,
  promotionPhrase: string,
): PricingAct {
  return {
    subjectType: "mercuriale",
    subjectId: mercuriale.id,
    kind: "posed",
    actor,
    at: mercuriale.toPersistence().validFrom,
    // Aucun motif : l'écran n'en demande pas pour ce geste ; la phrase et le
    // type disent déjà l'acte.
    reason: null,
    summary: `${describeMercuriale(mercuriale)} ; ${promotionPhrase}`,
    subjectLabel: mercuriale.label,
  };
}
