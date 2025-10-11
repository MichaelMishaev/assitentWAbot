/**
 * Plugin Manager - Central registry and orchestrator for all plugins
 *
 * Responsibilities:
 * - Register/unregister plugins
 * - Execute plugins with error handling
 * - Health monitoring
 * - Plugin discovery
 */

import logger from '../utils/logger.js';
import { IPlugin, PluginContext, PluginType, PluginHealth } from './IPlugin.js';

export class PluginManager {
  private plugins: Map<string, IPlugin> = new Map();
  private pluginsByType: Map<PluginType, Set<IPlugin>> = new Map();
  private executionMetrics: Map<string, ExecutionMetrics> = new Map();

  /**
   * Register a plugin
   */
  async registerPlugin(plugin: IPlugin, config?: any): Promise<void> {
    try {
      // Check if already registered
      if (this.plugins.has(plugin.name)) {
        throw new Error(`Plugin ${plugin.name} already registered`);
      }

      // Initialize plugin
      await plugin.initialize(config);

      // Health check
      const health = await plugin.healthCheck();
      if (!health.healthy) {
        throw new Error(`Plugin ${plugin.name} health check failed: ${health.message}`);
      }

      // Register
      this.plugins.set(plugin.name, plugin);

      // Index by type
      if (!this.pluginsByType.has(plugin.type)) {
        this.pluginsByType.set(plugin.type, new Set());
      }
      this.pluginsByType.get(plugin.type)!.add(plugin);

      // Initialize metrics
      this.executionMetrics.set(plugin.name, {
        successCount: 0,
        errorCount: 0,
        totalLatency: 0,
        lastExecution: null
      });

      logger.info(`✅ Plugin registered: ${plugin.name} v${plugin.version} (${plugin.type})`);
    } catch (error) {
      logger.error(`❌ Failed to register plugin: ${plugin.name}`, { error });
      throw error;
    }
  }

  /**
   * Unregister a plugin
   */
  async unregisterPlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      logger.warn(`Plugin not found: ${pluginName}`);
      return;
    }

    try {
      await plugin.shutdown();
      this.plugins.delete(pluginName);

      // Remove from type index
      this.pluginsByType.get(plugin.type)?.delete(plugin);

      logger.info(`Plugin unregistered: ${pluginName}`);
    } catch (error) {
      logger.error(`Failed to unregister plugin: ${pluginName}`, { error });
      throw error;
    }
  }

  /**
   * Execute a specific plugin
   */
  async executePlugin<TInput, TOutput>(
    pluginName: string,
    input: TInput,
    context: PluginContext
  ): Promise<TOutput> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    const startTime = Date.now();
    const metrics = this.executionMetrics.get(pluginName)!;

    try {
      const result = await plugin.execute(input, context);

      // Update metrics
      metrics.successCount++;
      metrics.totalLatency += Date.now() - startTime;
      metrics.lastExecution = new Date();

      return result as TOutput;
    } catch (error) {
      metrics.errorCount++;
      logger.error(`Plugin execution failed: ${pluginName}`, { error, input });
      throw error;
    }
  }

  /**
   * Get all plugins of a specific type
   */
  getPluginsByType(type: PluginType): IPlugin[] {
    return Array.from(this.pluginsByType.get(type) || []);
  }

  /**
   * Get plugin by name
   */
  getPlugin(pluginName: string): IPlugin | undefined {
    return this.plugins.get(pluginName);
  }

  /**
   * Get all registered plugin names
   */
  getAllPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Health check all plugins
   */
  async healthCheckAll(): Promise<Map<string, PluginHealth>> {
    const results = new Map<string, PluginHealth>();

    for (const [name, plugin] of this.plugins) {
      try {
        const health = await plugin.healthCheck();
        results.set(name, health);
      } catch (error) {
        results.set(name, {
          healthy: false,
          message: `Health check error: ${error}`,
          lastCheck: new Date()
        });
      }
    }

    return results;
  }

  /**
   * Get execution metrics for a plugin
   */
  getMetrics(pluginName: string): ExecutionMetrics | undefined {
    return this.executionMetrics.get(pluginName);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Map<string, ExecutionMetrics> {
    return new Map(this.executionMetrics);
  }

  /**
   * Shutdown all plugins
   */
  async shutdownAll(): Promise<void> {
    logger.info('Shutting down all plugins...');

    const shutdownPromises = Array.from(this.plugins.values()).map(plugin =>
      plugin.shutdown().catch(error => {
        logger.error(`Failed to shutdown plugin: ${plugin.name}`, { error });
      })
    );

    await Promise.all(shutdownPromises);

    this.plugins.clear();
    this.pluginsByType.clear();
    this.executionMetrics.clear();

    logger.info('All plugins shut down');
  }
}

/**
 * Execution metrics for a plugin
 */
interface ExecutionMetrics {
  successCount: number;
  errorCount: number;
  totalLatency: number;
  lastExecution: Date | null;
}

/**
 * Singleton instance
 */
export const pluginManager = new PluginManager();
