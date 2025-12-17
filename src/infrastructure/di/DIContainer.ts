/**
 * Dependency Injection Container
 * Manages service instantiation and dependency resolution
 * Supports both transient and singleton lifecycles
 */

type ServiceFactory<T> = () => T | Promise<T>;

interface ServiceDefinition<T> {
  factory: ServiceFactory<T>;
  singleton: boolean;
  instance?: T;
}

export class DIContainer {
  private services: Map<string, ServiceDefinition<any>> = new Map();
  private singletons: Map<string, any> = new Map();
  private resolving: Set<string> = new Set();

  /**
   * Register a service with the container
   * @param name - Service name/key
   * @param factory - Factory function that creates the service
   * @param singleton - Whether to cache the instance (default: true)
   */
  register<T>(
    name: string,
    factory: ServiceFactory<T>,
    singleton = true
  ): void {
    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }

    this.services.set(name, {
      factory,
      singleton
    });
  }

  /**
   * Register a service class
   * @param name - Service name/key
   * @param ServiceClass - Service class to instantiate
   * @param singleton - Whether to cache the instance (default: true)
   */
  registerClass<T>(
    name: string,
    ServiceClass: new (...args: any[]) => T,
    singleton = true
  ): void {
    this.register(name, () => new ServiceClass(), singleton);
  }

  /**
   * Register a singleton instance
   * @param name - Service name/key
   * @param instance - Pre-created instance
   */
  registerInstance<T>(name: string, instance: T): void {
    this.services.set(name, {
      factory: () => instance,
      singleton: true,
      instance
    });
    this.singletons.set(name, instance);
  }

  /**
   * Resolve a service from the container
   * @param name - Service name/key
   * @returns The resolved service instance
   */
  resolve<T>(name: string): T {
    const definition = this.services.get(name);

    if (!definition) {
      throw new Error(`Service '${name}' is not registered`);
    }

    // Check for circular dependencies
    if (this.resolving.has(name)) {
      throw new Error(`Circular dependency detected for service '${name}'`);
    }

    // Return singleton if already created
    if (definition.singleton && this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    // Resolve the service
    this.resolving.add(name);
    try {
      const instance = definition.factory();

      // Cache singleton
      if (definition.singleton) {
        this.singletons.set(name, instance);
      }

      return instance;
    } finally {
      this.resolving.delete(name);
    }
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Clear all services and singletons
   * Useful for testing
   */
  clear(): void {
    this.services.clear();
    this.singletons.clear();
    this.resolving.clear();
  }

  /**
   * Get singleton instance count
   */
  getSingletonCount(): number {
    return this.singletons.size;
  }
}

/**
 * Global DI container instance
 */
let globalContainer: DIContainer | null = null;

/**
 * Get or create the global DI container
 */
export function getContainer(): DIContainer {
  if (!globalContainer) {
    globalContainer = new DIContainer();
  }
  return globalContainer;
}

/**
 * Set the global DI container
 * Useful for testing
 */
export function setContainer(container: DIContainer): void {
  globalContainer = container;
}

/**
 * Reset the global DI container
 * Useful for testing
 */
export function resetContainer(): void {
  globalContainer = null;
}
