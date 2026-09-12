import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { B2bCatalogPushService, type B2bPushSummary } from "../products/push.service.js";

/**
 * **Envoyer le catalogue vers la plateforme marchande** — ou le simuler.
 *
 * @param dryRun simuler plutôt qu'envoyer.
 * @param fingerprint l'empreinte rendue par la simulation qu'on vient de relire.
 *   Fournie, elle est exigée : si le catalogue a bougé depuis, rien ne part.
 * @param label **l'intention de cet envoi**, qui devient le nom de l'ancre.
 *
 *   Le push posait une ancre ANONYME à chaque fois, sans jamais interroger
 *   personne : c'est la cause directe des révisions sans intention. Le nom
 *   remonte donc depuis l'écran, avec les changements sous les yeux.
 *
 *   ⚠️ **Optionnel**, et c'est une étape, pas un état final : le front en ligne
 *   appelle déjà cette route sans lui, et un contrat servi ne se casse pas dans
 *   le même déploiement — une API resserrée avant que le front n'envoie le nom
 *   empêcherait toute publication le temps du décalage. Il passe obligatoire au
 *   troisième temps, exactement comme `fingerprint` avant lui.
 *
 *   Il ne s'applique qu'à une ancre **muette** : une ancre déjà nommée garde
 *   son nom, parce qu'il dit avec quelle intention un catalogue est parti.
 */
export class PushB2bCatalogCommand {
  constructor(
    readonly dryRun: boolean,
    readonly fingerprint: string | undefined,
    readonly label: string | null = null,
    /** Le POURQUOI, en clair. Facultatif : un envoi de routine n'a rien de plus à dire. */
    readonly note: string | null = null,
  ) {}
}

/**
 * Le cas d'usage **nommé** du push B2B.
 *
 * Il existe pour deux raisons, et la première n'est pas de la cérémonie :
 *
 * 1. **Un contrôleur n'injecte que des bus** (CLAUDE.md §4). La route injectait
 *    `B2bCatalogPushService` en direct — `lint:controller-buses` ne l'attrapait
 *    pas, la porte se limitant volontairement aux suffixes de port, mais la
 *    règle, elle, ne connaît pas cette limite.
 * 2. **Tout `@CommandHandler` du référentiel journalise.** Envoyer le catalogue
 *    dehors est le geste le plus conséquent de cet écran, et il n'avait aucune
 *    trace d'audit : `catalog_revision_publication` dit *ce qui est parti*, pas
 *    *qui l'a envoyé*.
 *
 * ⚠️ **La trace vient APRÈS l'exécution**, et c'est délibéré : son sujet est
 * l'ancre, que le service pose en chemin. Tracer avant obligerait à inventer un
 * sujet — et un fait dont le sujet est un identifiant fabriqué ne se relit pas.
 *
 * Le prix, dit plutôt que tu : **un push qui ÉCHOUE ne laisse pas de trace
 * ici**. Elle n'est pas perdue pour autant — `recordPublication` inscrit
 * l'échec en base avec son issue, et c'est la lecture qui répond à « qu'est-ce
 * qui est parti ». Le journal, lui, répond à « qui a agi », et sur un envoi
 * refusé par la destination il n'y a pas d'acte à imputer au staff.
 */
@CommandHandler(PushB2bCatalogCommand)
export class PushB2bCatalogHandler implements ICommandHandler<
  PushB2bCatalogCommand,
  B2bPushSummary
> {
  constructor(
    private readonly pushService: B2bCatalogPushService,
    private readonly journal: PimJournal,
  ) {}

  async execute(command: PushB2bCatalogCommand): Promise<B2bPushSummary> {
    const summary = await this.pushService.push(
      command.dryRun,
      command.fingerprint,
      command.label,
      command.note,
    );

    // Rien n'est parti, rien n'a été figé : il n'y a pas de fait à inscrire.
    // Un « push de zéro article » raconterait une intention, pas un acte.
    if (summary.revisionId === null) {
      return summary;
    }

    await this.journal.trace({
      type: PIM_EVENTS.catalogRevisionPushed,
      subjectType: "catalog_revision",
      subjectId: summary.revisionId,
      payload: {
        channel: "b2b",
        mode: summary.mode,
        candidates: summary.candidates,
        excluded: summary.excluded.length,
      },
      // Ce que ce push emporte : les produits publiés sur le canal au moment de
      // l'envoi. Les exclusions en font partie — elles étaient candidates.
      blast: { articles: summary.candidates },
    });

    return summary;
  }
}
