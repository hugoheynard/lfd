import { QuietBootLogger } from "../../shared/quiet-boot-logger.js";
import { RECENT_LOGS, type RecordedLog } from "./log-buffer.js";

/**
 * Le logger de l'application : il écrit sur la sortie standard **et** garde en
 * mémoire les lignes qui comptent.
 *
 * La sortie standard reste la destination normale — en local, en test, et le
 * jour où la plateforme saura enfin la capter. Le tampon n'est pas un
 * remplacement : c'est le seul moyen d'y accéder aujourd'hui depuis un
 * container Cloudflare (cf. {@link RECENT_LOGS}).
 *
 * **Seuls `error` et `warn` sont gardés.** Un incident se lit dans ce qui a
 * échoué ou alerté ; tout garder ferait tourner un tampon de 300 lignes en
 * quelques minutes de trafic normal, et noierait précisément ce qu'on cherche.
 */
export class RecordingLogger extends QuietBootLogger {
  override error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(message, ...optionalParams);
    RECENT_LOGS.record(entryOf("error", message, optionalParams));
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(message, ...optionalParams);
    RECENT_LOGS.record(entryOf("warn", message, optionalParams));
  }
}

/**
 * Compose l'entrée gardée.
 *
 * Nest passe le contexte en **dernier** paramètre, et parfois une pile
 * d'exécution avant lui. On garde le contexte (le nom de la classe, qui oriente
 * tout de suite) et le message ; la pile est écartée — elle est volumineuse, et
 * ce tampon sert à savoir QUOI a échoué, pas à rejouer un plantage.
 */
function entryOf(
  level: RecordedLog["level"],
  message: unknown,
  optionalParams: readonly unknown[],
): RecordedLog {
  const last = optionalParams[optionalParams.length - 1];
  return {
    at: new Date().toISOString(),
    level,
    context: typeof last === "string" && !last.includes("\n") ? last : null,
    message: typeof message === "string" ? message : JSON.stringify(message),
  };
}
