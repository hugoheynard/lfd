import type { SyncOperation } from "@lfd/catalog-sync";
import { CommandBus } from "@nestjs/cqrs";

import { PrepareOperationCommand } from "../src/b2b/operations/application/commands/prepare-operation.command.js";
import { SetOperationSelectionCommand } from "../src/b2b/operations/application/commands/set-operation-selection.command.js";
import { SetOperationVisibilityCommand } from "../src/b2b/operations/application/commands/set-operation-visibility.command.js";
import { scheduleOf } from "../src/b2b/operations/http/operation-payloads.js";
import type { E2eContext } from "./e2e-harness.js";

/**
 * **Une opération datée, écrite AU COMMERCE** — là où elle vit depuis la
 * bascule (lot 3 de `plan-l-operation-passe-au-commerce.md`), et le seul
 * chemin depuis X1 (2026-10-17) : un push n'en apporte plus.
 *
 * Les suites qui recevaient leurs opérations dans un instantané gardent leur
 * fixture (`SyncOperation`) : elle passe par les VRAIS cas d'usage du
 * commerce — préparer, puis choisir la sélection —, hors requête
 * (`writtenBy: null`). L'image, s'il y en a une, doit être au fonds de la
 * médiathèque : c'est l'agrégat qui la refuse sinon.
 */
export async function prepareAtCommerce(
  ctx: E2eContext,
  operation: SyncOperation,
  options: { readonly hidden?: boolean } = {},
): Promise<void> {
  const commands = ctx.app.get(CommandBus);
  await commands.execute(
    new PrepareOperationCommand(
      {
        key: operation.key,
        name: operation.name,
        lede: operation.lede,
        image: operation.image === null ? null : { url: operation.image.url },
        schedule: scheduleOf(operation),
        audience: operation.audience,
      },
      null,
    ),
  );
  if (operation.skus.length > 0) {
    await commands.execute(new SetOperationSelectionCommand(operation.key, operation.skus, null));
  }
  if (options.hidden === true) {
    await commands.execute(new SetOperationVisibilityCommand(operation.key, true, null));
  }
  await ctx.drain();
}
