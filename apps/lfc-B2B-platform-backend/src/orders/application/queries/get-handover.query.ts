/** Ce que le staff voit après avoir scanné un QR de retrait, avant de confirmer. */
export class GetHandoverQuery {
  constructor(readonly token: string) {}
}
