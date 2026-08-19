import { Global, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

/**
 * **Les bus, disponibles partout.** Un module dont c'est le seul objet :
 * rendre `CommandBus` et `QueryBus` injectables sans que chaque contexte
 * réimporte `CqrsModule`.
 *
 * Il n'y a rien à perdre à le globaliser, et c'est le point : l'enregistrement
 * des handlers **ne dépend pas** de cet import. L'explorateur de `@nestjs/cqrs`
 * parcourt tous les modules du conteneur et reconnaît les `@CommandHandler` /
 * `@QueryHandler` là où ils sont déclarés comme providers. L'import ne servait
 * donc qu'à injecter les bus — dix-sept fois la même ligne, qui ne disait rien
 * de plus que « ce contexte fait du CQRS », ce que ses handlers disent déjà.
 *
 * La règle qu'on ne franchit pas pour autant : un module **@Global n'est pas un
 * raccourci pour partager du métier**. Celui-ci ne publie qu'une mécanique de
 * framework, sans aucune connaissance de domaine — c'est ce qui le distingue
 * d'un contexte qu'on globaliserait pour s'éviter un port.
 */
@Global()
@Module({
  imports: [CqrsModule],
  exports: [CqrsModule],
})
export class BusModule {}
