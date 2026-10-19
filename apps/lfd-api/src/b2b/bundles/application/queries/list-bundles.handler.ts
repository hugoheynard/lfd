import type { BundleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { BundleChoiceCatalogue } from "../../domain/ports/bundle-choice.catalogue.js";
import { BundleReader } from "../../domain/ports/bundle.reader.js";
import { bundleViews } from "./bundle-view.js";
import { ListBundlesQuery } from "./list-bundles.query.js";

/** Les formules, la plus récemment écrite d'abord, chaque choix jugé par le catalogue. */
@QueryHandler(ListBundlesQuery)
export class ListBundlesHandler implements IQueryHandler<ListBundlesQuery, readonly BundleView[]> {
  constructor(
    private readonly bundles: BundleReader,
    private readonly catalogue: BundleChoiceCatalogue,
  ) {}

  async execute(): Promise<readonly BundleView[]> {
    return bundleViews(await this.bundles.list(), this.catalogue);
  }
}
