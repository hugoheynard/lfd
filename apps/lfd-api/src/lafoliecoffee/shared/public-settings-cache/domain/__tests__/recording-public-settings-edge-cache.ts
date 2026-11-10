import { PublicSettingsEdgeCache } from "../ports/public-settings-edge-cache.js";

/** Une bordure qui compte ses purges, et peut échouer comme un Worker injoignable. */
export class RecordingPublicSettingsEdgeCache extends PublicSettingsEdgeCache {
  purges = 0;
  fails = false;

  purge(): Promise<void> {
    this.purges += 1;
    return this.fails ? Promise.reject(new RangeError("Worker injoignable")) : Promise.resolve();
  }
}
