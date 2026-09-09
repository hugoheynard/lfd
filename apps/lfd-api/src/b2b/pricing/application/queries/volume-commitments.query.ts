import { Injectable } from "@nestjs/common";
import type { VolumeCommitmentView } from "@lfd/contracts";

import { CustomerVolumeReader } from "../../domain/ports/customer-volume.reader.js";
import { commitmentView } from "../volume-commitment-view.js";
import {
  VolumeCommitmentsReader,
  type StoredVolumeCommitment,
} from "../ports/volume-commitments.reader.js";

/**
 * **Le suivi des engagements d'un client** — la promesse, et où on en est.
 *
 * Le volume atteint est **mesuré**, jamais dérivé de la promesse : c'est l'écart
 * entre les deux qui serait toute l'information d'un écran. Un suivi qui
 * afficherait le promis comme s'il était acquis serait pire qu'aucun suivi.
 *
 * ⚠️ Cet écran **n'existe pas** : la route n'a aucun consommateur dans le dépôt,
 * seuls les e2e la traversent (vérifié le 2026-09-09). Ce qui presse sur les
 * engagements n'est donc pas le suivi, c'est la tarification.
 *
 * Une mesure par engagement, et c'est assumé : un client en a un, deux, rarement
 * plus. Les grouper supposerait une fenêtre commune, que deux engagements de
 * périodes différentes n'ont justement pas.
 */
@Injectable()
export class VolumeCommitmentsQuery {
  constructor(
    private readonly commitments: VolumeCommitmentsReader,
    private readonly volumes: CustomerVolumeReader,
  ) {}

  async forCompany(companyId: string): Promise<readonly VolumeCommitmentView[]> {
    const stored = await this.commitments.allFor(companyId);
    return Promise.all(
      stored.map(async (entry) => commitmentView(entry, await this.reached(entry))),
    );
  }

  /**
   * Le volume atteint sur la période, ou `null` s'il n'y a **rien à mesurer**.
   *
   * Sur une famille ou le catalogue entier il n'y a pas de SKU à compter, et la
   * seule mesure disponible compte par SKU.
   *
   * ⚠️ Ce commentaire affirmait que « le suivi s'abstient plutôt que d'inventer
   * un chiffre qui passerait pour une mesure ». L'intention était juste, le type
   * ne la permettait pas : la méthode rendait `0`, et la vue le présentait comme
   * une mesure sous un JSDoc qui disait « mesuré ». Depuis le 2026-09-09
   * l'abstention est **dicible**, donc réelle (R16).
   *
   * 🔴 Cela ne répare PAS la tarification : le tarificateur, lui, substitue
   * toujours le SKU de la ligne au périmètre de l'engagement, et fait un prix
   * avec. La décision de branche est au journal de remédiation.
   */
  private async reached({ state }: StoredVolumeCommitment): Promise<number | null> {
    const sku =
      state.scope.type === "product" || state.scope.type === "variant" ? state.scope.id : null;
    if (sku === null) {
      return null;
    }
    const measured = await this.volumes.volumesFor(state.companyId, [sku], {
      from: state.validFrom,
      to: state.validTo,
    });
    return measured.get(sku) ?? 0;
  }
}
