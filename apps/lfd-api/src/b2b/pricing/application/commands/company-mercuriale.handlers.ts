import type {
  CloseCompanyMercurialePayload,
  PoseCompanyMercurialePayload,
  RenameCompanyMercurialePayload,
} from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PricingRule } from "../../domain/entities/pricing-rule.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import {
  MercurialeNameTakenError,
  PricedCompanyNotFoundError,
  PosedMercurialeNotFoundError,
  RunningMercurialeError,
} from "../../domain/pricing-errors.js";
import { describeRule } from "../../domain/pricing-act.js";
import { templateToRules } from "../../domain/services/template-to-rules.js";
import { ruleStateFromRow } from "../../infrastructure/price-rows.js";
import { MercurialeDrafts } from "../mercuriale-drafts.store.js";

/**
 * **Établir une mercuriale depuis la fiche d'un compte**, et la clore.
 *
 * ## Pourquoi ces gestes ne passent pas par un gabarit
 *
 * Un gabarit est une grille qu'on prépare **pour plusieurs clients**. Ici on
 * négocie avec un client nommé, sur son dossier, en regardant ce qu'il paie
 * déjà : passer par un gabarit obligerait à nommer et ranger un objet dont
 * personne ne veut, juste pour atteindre le seul client visé.
 *
 * Ce qui est partagé, en revanche, est **la façon dont une mercuriale devient
 * des règles** : `templateToRules`. Elle seule sait que l'étage est
 * `mercuriale`, que l'audience est la société, que le libellé voyage sur chaque
 * règle et que rien ne s'empile par-dessus. La dupliquer aurait donné deux
 * chemins qui divergent au premier changement de cette décision.
 *
 * ## Prix fixe uniquement
 *
 * Le contrat ne porte pas de paliers (cf. `companyMercurialeLineSchema`). Chaque
 * ligne devient **une** règle, au seuil `1`. Les mercuriales à paliers
 * arriveront comme une forme de plus.
 */

/** Poser une mercuriale chez ce client, sur une fenêtre datée aux deux bouts. */
export class PoseCompanyMercurialeCommand {
  constructor(
    readonly companyId: string,
    readonly payload: PoseCompanyMercurialePayload,
    readonly staffSub: string,
  ) {}
}

/**
 * Renommer une mercuriale posée : **toutes** ses règles changent de libellé.
 *
 * Elle est désignée par ce qui la fait exister — libellé et fenêtre — comme la
 * clôture, et pour la même raison : c'est la seule clé disponible.
 */
export class RenameCompanyMercurialeCommand {
  constructor(
    readonly companyId: string,
    readonly payload: RenameCompanyMercurialePayload,
    readonly staffSub: string,
  ) {}
}

/** Clore une mercuriale en cours : ses règles sont archivées, jamais effacées. */
export class CloseCompanyMercurialeCommand {
  constructor(
    readonly companyId: string,
    readonly payload: CloseCompanyMercurialePayload,
    readonly staffSub: string,
  ) {}
}

@CommandHandler(PoseCompanyMercurialeCommand)
export class PoseCompanyMercurialeHandler implements ICommandHandler<
  PoseCompanyMercurialeCommand,
  number
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: PricingRuleRepository,
    private readonly ids: IdGenerator,
    private readonly drafts: MercurialeDrafts,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /**
   * Rend le nombre de règles posées — une ligne, une règle, tant que la
   * mercuriale est à prix fixe.
   *
   * ## Deux protections, et elles ne font pas le même travail
   *
   * **Le pré-contrôle** cherche, avant d'écrire quoi que ce soit, une mercuriale
   * déjà posée chez ce client sur un de ces articles pendant cette fenêtre. Il
   * refuse en la **nommant** : la contrainte d'exclusion, elle, dirait seulement
   * « chevauchement », et le commercial n'aurait pas la phrase à dire au client.
   * C'est aussi lui qui rend praticable la règle « on clôt d'abord, on repose
   * ensuite » — sans lui, il faudrait deviner ce qu'il y a à clore.
   *
   * **La transaction** couvre la course que le pré-contrôle ne peut pas fermer :
   * deux commerciaux sur le même compte au même instant. La contrainte
   * d'exclusion refuse alors la règle qui arrive seconde, et tout ce qui a été
   * posé avant elle est annulé. C'est le point : la pose d'un gabarit, elle,
   * écrit une par une hors transaction et laisse un client à moitié tarifé
   * quand elle échoue à mi-parcours.
   *
   * ⚠️ **La transaction est longue** — deux écritures et un ajout au journal par
   * ligne, sur quatre-vingt-douze articles au plus. Si elle dépasse le délai
   * d'une transaction interactive (Accelerate en production), **rien** n'est
   * posé et l'appel échoue. C'est l'échec qu'on veut : « rien n'est passé » se
   * répare en recommençant, « la moitié est passée » ne se répare pas sans
   * savoir laquelle.
   *
   * @throws {PricedCompanyNotFoundError} l'identifiant ne désigne aucune société.
   * @throws {RunningMercurialeError} une mercuriale couvre déjà cette période.
   */
  async execute(command: PoseCompanyMercurialeCommand): Promise<number> {
    const { companyId, payload, staffSub } = command;
    await this.assertCompanyExists(companyId);

    const validFrom = new Date(payload.validFrom);
    const validTo = new Date(payload.validTo);
    await this.assertNothingRunning(companyId, payload, validFrom, validTo);

    const drafts = templateToRules(
      // Le prix fixe est porté comme le seul palier de sa ligne : c'est la forme
      // que `templateToRules` sait déplier, et la seule que la base connaisse.
      // La distinction « fixe / paliers » vit dans le contrat et l'écran, pas
      // dans ce que le moteur résout.
      payload.lines.map((line) => ({
        sku: line.sku,
        tiers: [{ minQuantity: 1, unitPriceMillicents: line.unitPriceMillicents }],
        plannedVolume: null,
      })),
      companyId,
      { validFrom, validTo },
      payload.label,
    );

    const at = this.clock.now();
    await this.uow.run(async () => {
      for (const draft of drafts) {
        const rule = PricingRule.create(this.ids.next(), draft, staffSub);
        await this.rules.save(rule, {
          subjectType: "rule",
          subjectId: rule.id,
          kind: "posed",
          actor: staffSub,
          at,
          // Le journal dit d'OÙ vient la règle. Six mois plus tard, « pourquoi ce
          // prix ? » se répond mieux par « la mercuriale posée sur sa fiche le
          // 8 septembre » que par une règle isolée.
          reason: `Mercuriale « ${payload.label} » posée sur la fiche du compte`,
          summary: describeRule(rule.asPriceRule),
        });
      }
    });
    // Le brouillon a servi : il est devenu une décision. Le garder ferait
    // rouvrir l'écran sur une négociation déjà close, et la prochaine
    // sauvegarde écraserait sans qu'on sache laquelle des deux fait foi.
    //
    // APRÈS la transaction, jamais dedans : jeter un brouillon n'est pas une
    // écriture qu'on veut annuler si la pose échoue — au contraire, c'est
    // exactement le moment où il faut le garder.
    await this.drafts.discard(companyId);
    return drafts.length;
  }

  private async assertCompanyExists(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (company === null) {
      throw new PricedCompanyNotFoundError(companyId);
    }
  }

  /**
   * Une mercuriale de ce client couvre-t-elle déjà un de ces articles sur cette
   * fenêtre ?
   *
   * Les bornes suivent la convention du contexte — basse **incluse**, haute
   * **exclue** — donc deux fenêtres qui se succèdent à la même date ne se
   * chevauchent pas, et poser au 1er janvier ce qui remplace une mercuriale
   * close au 1er janvier passe sans rien clore.
   */
  private async assertNothingRunning(
    companyId: string,
    payload: PoseCompanyMercurialePayload,
    validFrom: Date,
    validTo: Date,
  ): Promise<void> {
    const clashes = await this.prisma.priceRule.findMany({
      where: {
        stage: "mercuriale",
        audienceType: "company",
        audienceId: companyId,
        archivedAt: null,
        scopeId: { in: payload.lines.map((line) => line.sku) },
        validFrom: { lt: validTo },
        OR: [{ validTo: null }, { validTo: { gt: validFrom } }],
      },
      take: 1,
    });
    const [clash] = clashes;
    if (clash !== undefined) {
      const state = ruleStateFromRow(clash);
      throw new RunningMercurialeError(state.label, state.validFrom, state.validTo);
    }
  }
}

@CommandHandler(CloseCompanyMercurialeCommand)
export class CloseCompanyMercurialeHandler implements ICommandHandler<
  CloseCompanyMercurialeCommand,
  number
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: PricingRuleRepository,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /**
   * Archive toutes les règles de cette mercuriale, et rend combien.
   *
   * **Archiver et non borner.** Les deux se défendent ; archiver est celui qui
   * rend sa place dans la contrainte d'exclusion, donc le seul qui permette de
   * reposer sur la même période — ce qu'on vient précisément faire. Rien n'est
   * perdu : une lecture datée d'avant la clôture les retrouve, et ce qu'elles
   * ont facturé est figé sur les commandes.
   *
   * La mercuriale est désignée par **(libellé, fenêtre)**, la même clé que celle
   * qui l'a fait apparaître à l'écran : ce qu'on clôt ne peut donc pas être
   * autre chose que ce qu'on lit. La limite du regroupement vaut ici aussi —
   * deux poses de même libellé sur la même fenêtre se ferment ensemble.
   *
   * @throws {PosedMercurialeNotFoundError} rien ne correspond à cette clé.
   */
  async execute(command: CloseCompanyMercurialeCommand): Promise<number> {
    const { companyId, payload, staffSub } = command;
    const rows = await this.prisma.priceRule.findMany({
      where: {
        stage: "mercuriale",
        audienceType: "company",
        audienceId: companyId,
        label: payload.label,
        validFrom: new Date(payload.validFrom),
        validTo: payload.validTo === null ? null : new Date(payload.validTo),
        archivedAt: null,
      },
      select: { id: true },
    });
    if (rows.length === 0) {
      throw new PosedMercurialeNotFoundError(payload.label);
    }

    const now = this.clock.now();
    await this.uow.run(async () => {
      for (const { id } of rows) {
        const rule = await this.rules.load(id);
        // Disparue entre la liste et la boucle : quelqu'un d'autre l'a archivée.
        // Rien à faire, et surtout rien à signaler — le résultat voulu est
        // atteint. Compter la règle serait mentir sur ce que ce geste a fait.
        if (rule === null) {
          continue;
        }
        await this.rules.update(rule.archive(staffSub, now, payload.reason), {
          subjectType: "rule",
          subjectId: rule.id,
          kind: "archived",
          actor: staffSub,
          at: now,
          reason: payload.reason,
          summary: describeRule(rule.asPriceRule),
        });
      }
    });
    return rows.length;
  }
}

@CommandHandler(RenameCompanyMercurialeCommand)
export class RenameCompanyMercurialeHandler implements ICommandHandler<
  RenameCompanyMercurialeCommand,
  number
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: PricingRuleRepository,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /**
   * Renomme toutes les règles de cette mercuriale, et rend combien.
   *
   * ## Pourquoi ça ne change rien, et pourquoi ça change tout
   *
   * **Rien, côté calcul.** Le libellé n'entre dans aucune résolution de prix :
   * `resolvePrice` trie par étage, audience et seuil, jamais par nom. Les
   * commandes déjà passées portent leur montant figé, et le journal garde le
   * résumé de chaque acte tel qu'il était au moment où il a eu lieu.
   *
   * **Tout, côté identité.** Une mercuriale n'existe pas en base : elle est
   * recollée par **(libellé, fenêtre)**. Le nom n'est pas posé À CÔTÉ de
   * l'objet, il en est la moitié. D'où les deux exigences ci-dessous, dont
   * aucune ne serait nécessaire si la pose portait son propre identifiant — le
   * trou T2 de l'état des lieux.
   *
   * 1. **Tout ou rien** — la transaction. Renommer la moitié des règles couperait
   *    la mercuriale en deux à la lecture suivante : deux lignes à l'écran, deux
   *    grilles partielles, et aucune façon de les recoller.
   * 2. **Pas de nom déjà pris** sur la même fenêtre chez ce client. Deux
   *    mercuriales homonymes fusionneraient irréversiblement, puisque ce qui les
   *    distinguait était le nom.
   *
   * ⚠️ Les règles **archivées** ne sont pas touchées : `PricingRule.rename` les
   * refuse, et c'est la bonne lecture. Une mercuriale close est une décision
   * terminée ; la relire six mois plus tard doit rendre la phrase qu'elle
   * portait, pas celle qu'on aurait préféré écrire.
   *
   * @throws {PosedMercurialeNotFoundError} rien ne correspond à cette clé.
   * @throws {MercurialeNameTakenError} le nouveau nom est déjà pris sur cette
   *   fenêtre.
   */
  async execute(command: RenameCompanyMercurialeCommand): Promise<number> {
    const { companyId, payload, staffSub } = command;
    const validFrom = new Date(payload.validFrom);
    const validTo = payload.validTo === null ? null : new Date(payload.validTo);
    const newLabel = payload.newLabel.trim();

    const rows = await this.findRules(companyId, payload.label, validFrom, validTo);
    if (rows.length === 0) {
      throw new PosedMercurialeNotFoundError(payload.label);
    }
    // Renommer en soi-même n'est pas une erreur, et ce test est ce qui le rend
    // vrai : sans lui, le contrôle d'homonymie ci-dessous se heurterait aux
    // règles qu'on s'apprête justement à renommer.
    if (newLabel !== payload.label) {
      await this.assertNameFree(companyId, newLabel, validFrom, validTo);
    }

    const now = this.clock.now();
    await this.uow.run(async () => {
      for (const { id } of rows) {
        const rule = await this.rules.load(id);
        // Disparue entre la liste et la boucle : quelqu'un l'a archivée. Rien à
        // faire — une règle qui ne porte plus le tarif n'a pas à porter son nom.
        if (rule === null) {
          continue;
        }
        await this.rules.rename(rule.rename(newLabel), {
          subjectType: "rule",
          subjectId: rule.id,
          kind: "renamed",
          actor: staffSub,
          at: now,
          reason: `Mercuriale « ${payload.label} » renommée « ${newLabel} »`,
          // Le résumé décrit la règle d'AVANT, comme partout ailleurs dans ce
          // journal : ce qu'on relit est ce qui a été renommé.
          summary: describeRule(rule.asPriceRule),
        });
      }
    });
    return rows.length;
  }

  private async findRules(
    companyId: string,
    label: string,
    validFrom: Date,
    validTo: Date | null,
  ): Promise<readonly { readonly id: string }[]> {
    return this.prisma.priceRule.findMany({
      where: {
        stage: "mercuriale",
        audienceType: "company",
        audienceId: companyId,
        label,
        validFrom,
        validTo,
        archivedAt: null,
      },
      select: { id: true },
    });
  }

  private async assertNameFree(
    companyId: string,
    newLabel: string,
    validFrom: Date,
    validTo: Date | null,
  ): Promise<void> {
    const taken = await this.findRules(companyId, newLabel, validFrom, validTo);
    if (taken.length > 0) {
      throw new MercurialeNameTakenError(newLabel);
    }
  }
}
