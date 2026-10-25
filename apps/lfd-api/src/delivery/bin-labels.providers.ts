import type { Provider, Type } from "@nestjs/common";

import { BinLabelsPrint } from "./application/bin-labels-print.js";
import { GetBinLabelSpecimenHandler } from "./application/queries/get-bin-label-specimen.handler.js";
import { GetOrderBinLabelsPdfHandler } from "./application/queries/get-order-bin-labels-pdf.handler.js";
import { GetTransferBinLabelsPdfHandler } from "./application/queries/get-transfer-bin-labels-pdf.handler.js";
import { AdminBinLabelSpecimenController } from "./http/admin-bin-label-specimen.controller.js";
import { DeliveryBinLabelsController } from "./http/delivery-bin-labels.controller.js";

/**
 * **Les étiquettes de bacs en PDF** (2026-10-25), rangées à part pour que
 * `delivery.module.ts` reste lisible. `BinLabelColorsReader` vient du fil
 * relié dans `appBootstrap/delivery-feed.module.ts` ; `BrandLogoSource` du
 * `BrandModule` importé par le module ; `Clock` du `ContextModule` global.
 */
export const BIN_LABELS_CONTROLLERS: readonly Type[] = [
  DeliveryBinLabelsController,
  AdminBinLabelSpecimenController,
];

export const BIN_LABELS_PROVIDERS: readonly Provider[] = [
  BinLabelsPrint,
  GetOrderBinLabelsPdfHandler,
  GetTransferBinLabelsPdfHandler,
  GetBinLabelSpecimenHandler,
];
