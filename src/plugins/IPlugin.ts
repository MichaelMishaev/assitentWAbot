/**
 * Plugin Interface - Core abstraction for extensibility
 *
 * All plugins (processors, extractors, validators, AI models) implement this interface.
 * This enables:
 * - Hot-swappable components
 * - Easy testing (mock plugins)
 * - Third-party extensions
 * - Version management
 */

export type PluginType = 'processor' | 'extractor' | 'validator' | 'ai-model' | 'external-api';

export interface IPlugin<TInput = any, TOutput = any, TConfig = any> {
  // Metadata
  readonly name: string;
  readonly version: string;
  readonly type: PluginType;
  readonly description: string;

  // Lifecycle hooks
  initialize(config?: TConfig): Promise<void>;
  execute(input: TInput, context: PluginContext): Promise<TOutput>;
  shutdown(): Promise<void>;

  // Introspection
  getSupportedCapabilities(): string[];
  getConfiguration(): TConfig;
  healthCheck(): Promise<PluginHealth>;
}

/**
 * Context passed to plugins during execution
 */
export interface PluginContext {
  userId: string;
  messageId: string;
  timestamp: Date;
  metadata: Record<string, any>;

  // Services available to plugins
  logger: {
    info: (message: string, meta?: any) => void;
    warn: (message: string, meta?: any) => void;
    error: (message: string, meta?: any) => void;
  };

  // Cost tracking
  trackCost?: (cost: number, model: string) => void;
}

/**
 * Plugin health status
 */
export interface PluginHealth {
  healthy: boolean;
  message?: string;
  lastCheck: Date;
  metrics?: {
    successRate: number;
    averageLatency: number;
    errorCount: number;
  };
}

/**
 * Base abstract class for plugins
 * Provides default implementations for common functionality
 */
export abstract class BasePlugin<TInput = any, TOutput = any, TConfig = any>
  implements IPlugin<TInput, TOutput, TConfig> {

  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly type: PluginType;
  abstract readonly description: string;

  protected config: TConfig | undefined;
  protected initialized: boolean = false;

  async initialize(config?: TConfig): Promise<void> {
    this.config = config;
    this.initialized = true;
  }

  abstract execute(input: TInput, context: PluginContext): Promise<TOutput>;

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  getSupportedCapabilities(): string[] {
    return [];
  }

  getConfiguration(): TConfig {
    return this.config as TConfig;
  }

  async healthCheck(): Promise<PluginHealth> {
    return {
      healthy: this.initialized,
      message: this.initialized ? 'Plugin operational' : 'Plugin not initialized',
      lastCheck: new Date()
    };
  }

  protected assertInitialized(): void {
    if (!this.initialized) {
      throw new Error(`Plugin ${this.name} not initialized. Call initialize() first.`);
    }
  }
}
