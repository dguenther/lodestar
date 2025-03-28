import {ValidatorIndex} from "@lodestar/types";
import {MapDef} from "@lodestar/utils";

/** Information about a validator connected to the local node */
type RegisteredValidator = {
  /** Last time this validator was registered as active */
  lastRegisteredTimeMs: number;
};

/**
 * Tracks validators connected to the local node.
 * Maintains a list of validators that are actively participating through this
 * node, regardless of whether metrics are enabled.
 *
 * TODO: consider deduplication validator storage between this class and ValidatorMonitor
 */
export class LocalValidatorRegistry {
  /** The validators that require additional monitoring */
  private validators = new MapDef<ValidatorIndex, RegisteredValidator>(() => ({
    lastRegisteredTimeMs: 0,
  }));

  /** Time after which to consider a validator inactive (12 hours) */
  private static readonly RETAIN_REGISTERED_VALIDATORS_MS = 12 * 3600 * 1000;

  /**
   * Register a validator as active on this node
   */
  registerLocalValidator(index: ValidatorIndex): void {
    this.validators.getOrDefault(index).lastRegisteredTimeMs = Date.now();
  }

  /**
   * Get the indices of all validators currently registered with this node
   */
  getLocalValidatorIndices(): ValidatorIndex[] {
    return Array.from(this.validators.keys());
  }

  /**
   * Prune validators that haven't been registered recently
   */
  pruneInactiveValidators(): void {
    const now = Date.now();
    for (const [index, validator] of this.validators.entries()) {
      if (now - validator.lastRegisteredTimeMs > LocalValidatorRegistry.RETAIN_REGISTERED_VALIDATORS_MS) {
        this.validators.delete(index);
      }
    }
  }
} 