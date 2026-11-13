/** Les compteurs de remise du cockpit commercial pour un jour (`AAAA-MM-JJ`). */
export class GetCockpitHandoversQuery {
  constructor(readonly day: string) {}
}
