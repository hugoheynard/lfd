import type { BundleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { BundleNotFoundError } from "../../domain/errors/bundle-errors.js";
import { BundleChoiceCatalogue } from "../../domain/ports/bundle-choice.catalogue.js";
import { BundleReader } from "../../domain/ports/bundle.reader.js";
import { bundleViews } from "./bundle-view.js";
import { GetBundleQuery } from "./get-bundle.query.js";

/** Une formule, retirée comprise. @throws {BundleNotFoundError} aucune ne porte cette clé. */
@QueryHandler(GetBundleQuery)
export class GetBundleHandler implements IQueryHandler<GetBundleQuery, BundleView> {
  constructor(
    private readonly bundles: BundleReader,
    private readonly catalogue: BundleChoiceCatalogue,
  ) {}

  async execute(query: GetBundleQuery): Promise<BundleView> {
    const snapshot = await this.bundles.find(query.key);
    if (snapshot === null) {
      throw new BundleNotFoundError(query.key);
    }
    const [view] = await bundleViews([snapshot], this.catalogue);
    if (view === undefined) {
      throw new BundleNotFoundError(query.key);
    }
    return view;
  }
}
