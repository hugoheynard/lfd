import { Injectable } from '@nestjs/common';
import {
  catalogIngestionReportSchema,
  type CatalogIngestionReport,
  type CatalogSnapshot,
} from '@lfd/catalog-sync';

import { AppConfig } from '../../../infra/config/app-config.js';
import { TechnicalError } from '../../../shared/errors/app-error.js';

/**
 * Le **transport** du snapshot vers la plateforme B2B, derrière une abstraction.
 *
 * Deux pilotes concrets, comme pour Shopify : une simulation qui ne sort pas du
 * process, et un envoi réel. Le service de push choisit ; il ne sait pas lequel
 * il tient, et c'est ce qui rend le chemin testable sans réseau.
 */
export abstract class B2bCatalogDriver {
  abstract readonly mode: 'dry-run' | 'live';
  abstract send(snapshot: CatalogSnapshot): Promise<CatalogIngestionReport>;
}

/** Le contact avec la plateforme a échoué, ou elle a refusé le snapshot. */
export class CatalogPushFailedError extends TechnicalError {
  constructor(reason: string) {
    super(
      'channel.b2b.push_failed',
      `La plateforme a refusé le push : ${reason}`,
    );
  }
}

/** Le canal n'est pas configuré — capacité éteinte, pas panne. */
export class CatalogChannelNotConfiguredError extends TechnicalError {
  constructor() {
    super(
      'channel.b2b.not_configured',
      "Le canal plateforme B2B n'est pas configuré : il manque l'URL d'ingestion ou son secret.",
    );
  }
}

/**
 * Simulation : projette, compte, et ne sort pas du process.
 *
 * Le rapport rendu est **cohérent avec ce qui partirait** plutôt que vide — un
 * aperçu qui annonce zéro n'apprend rien à celui qui s'apprête à pousser. Seul
 * `removedSkus` reste vide, et c'est correct : lui seul suppose de connaître
 * l'état de l'autre côté.
 */
@Injectable()
export class DryRunB2bCatalogDriver extends B2bCatalogDriver {
  readonly mode = 'dry-run' as const;

  send(snapshot: CatalogSnapshot): Promise<CatalogIngestionReport> {
    return Promise.resolve({
      acceptedProducts: snapshot.products.length,
      acceptedVariants: snapshot.products.reduce(
        (total, product) => total + product.variants.length,
        0,
      ),
      acceptedCategories: snapshot.categories.length,
      removedSkus: [],
      appliedAt: snapshot.generatedAt,
    });
  }
}

/**
 * Envoi réel : un `POST` porteur du **secret partagé**.
 *
 * Le secret prouve l'identité de l'appelant, il ne garde pas la porte : les deux
 * backends sont déjà derrière la passerelle (`workers.dev` fermé). Ce qu'il
 * empêche, c'est qu'un appelant **déjà admis** réécrive le catalogue vendu.
 *
 * La réponse est **revalidée** contre le schéma. Faire confiance à un rapport
 * mal formé reviendrait à enregistrer « 92 produits acceptés » sur la foi d'un
 * corps qu'on n'a pas lu.
 */
@Injectable()
export class LiveB2bCatalogDriver extends B2bCatalogDriver {
  readonly mode = 'live' as const;

  constructor(private readonly config: AppConfig) {
    super();
  }

  async send(snapshot: CatalogSnapshot): Promise<CatalogIngestionReport> {
    const target = this.config.b2bCatalogPush();
    if (target === null) {
      throw new CatalogChannelNotConfiguredError();
    }

    const response = await fetch(target.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-lfc-catalog-secret': target.secret,
      },
      body: JSON.stringify(snapshot),
    });

    if (!response.ok) {
      throw new CatalogPushFailedError(`HTTP ${response.status}`);
    }

    const parsed = catalogIngestionReportSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      throw new CatalogPushFailedError('rapport d’ingestion illisible');
    }
    return parsed.data;
  }
}
