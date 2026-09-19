import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PricedDecisionsReader } from "../../domain/ports/priced-decisions.reader.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { PricedCompanyReader } from "../../domain/ports/priced-company.reader.js";
import { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeRepository } from "../../domain/ports/company-mercuriale.repository.js";
import {
  PricedCompanyNotFoundError,
  PricedPeriodIsSealedError,
  RunningMercurialeError,
} from "../../domain/pricing-errors.js";
import { MercurialeDraftStore } from "../ports/mercuriale-draft.store.js";
import { describeMercuriale } from "./company-mercuriale-support.js";
import { PoseCompanyMercurialeCommand } from "./pose-company-mercuriale.command.js";

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
    const { companyId, payload, staffUserId } = command;
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
      staffUserId,
    );

    await this.mercuriales.save(mercuriale, {
      subjectType: "mercuriale",
      subjectId: mercuriale.id,
      kind: "posed",
      actor: staffUserId,
      at: mercuriale.toPersistence().validFrom,
      // Aucun motif : l'écran n'en demande pas pour ce geste. La paraphrase
      // que l'API écrivait ici (« Mercuriale « X » posée… ») n'en était pas un —
      // elle redisait l'acte, que le type et la phrase disent déjà (TODO des
      // phrases du journal, 2026-09-19). Les lignes d'avant la gardent.
      reason: null,
      summary: describeMercuriale(mercuriale),
      subjectLabel: mercuriale.label,
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
