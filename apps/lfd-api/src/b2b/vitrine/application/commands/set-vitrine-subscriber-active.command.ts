/** Couper ou rallumer un abonné. */
export class SetVitrineSubscriberActiveCommand {
  constructor(
    readonly subscriberId: string,
    readonly active: boolean,
  ) {}
}
