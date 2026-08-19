import { ConsoleLogger } from "@nestjs/common";

/**
 * Contextes de démarrage bruyants : l'énumération des routes et des modules. En
 * `nest start --watch`, ces `LOG` se répètent à chaque rebuild et noient les
 * vraies infos.
 */
const NOISY_BOOT_CONTEXTS = new Set(["RouterExplorer", "RoutesResolver", "InstanceLoader"]);

/**
 * Logger de démarrage **silencieux sur le bruit, loud sur les échecs**.
 *
 * On masque uniquement les `LOG` des contextes ci-dessus (les centaines de
 * « Mapped {…} route »). On NE touche PAS aux niveaux `error`/`warn` : un module
 * ou une route qui ne monte pas reste parfaitement visible — c'est le fail fast
 * qu'on veut. Le message « Nest application successfully started » passe aussi
 * (son contexte est `NestApplication`, pas filtré).
 */
export class QuietBootLogger extends ConsoleLogger {
  override log(message: unknown, ...optionalParams: unknown[]): void {
    const context = optionalParams[optionalParams.length - 1];
    if (typeof context === "string" && NOISY_BOOT_CONTEXTS.has(context)) {
      return;
    }
    super.log(message, ...optionalParams);
  }
}
