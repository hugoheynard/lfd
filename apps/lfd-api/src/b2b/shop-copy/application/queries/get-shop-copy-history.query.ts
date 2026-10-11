import type { ShopCopyHistoryQuery } from "@lfd/contracts";

/** Query : les publications passées, telles que le journal les garde. */
export class GetShopCopyHistoryQuery {
  constructor(readonly filters: ShopCopyHistoryQuery) {}
}
