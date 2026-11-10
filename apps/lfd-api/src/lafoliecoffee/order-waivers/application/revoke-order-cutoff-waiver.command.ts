/** Retire une dérogation qui n'a pas encore servi. */
export class RevokeOrderCutoffWaiverCommand {
  constructor(readonly id: string) {}
}
