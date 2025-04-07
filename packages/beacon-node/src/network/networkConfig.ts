import {PeerId} from "@libp2p/interface";
import {BeaconConfig} from "@lodestar/config";
import {CustodyConfig} from "../util/dataColumns";
import {NodeId, computeNodeId} from "./subnets";

/**
 * Store shared data for different modules in the network stack.
 * TODO: consider moving similar shared data, for example PeersData, under NetworkConfig.
 */
export class NetworkConfig {
  private readonly nodeId: NodeId;
  private readonly config: BeaconConfig;
  private custodyConfig: CustodyConfig;
  constructor(peerId: PeerId, config: BeaconConfig) {
    this.nodeId = computeNodeId(peerId);
    this.config = config;
    this.custodyConfig = new CustodyConfig(this.nodeId, config);
  }

  getConfig(): BeaconConfig {
    return this.config;
  }

  getNodeId(): NodeId {
    return this.nodeId;
  }

  /**
   * Consumer should never mutate returned CustodyConfig
   */
  getCustodyConfig(): CustodyConfig {
    return this.custodyConfig;
  }

  /**
   * Recompute CustodyConfig based on connected validators.
   */
  recomputeCustodyConfig(): void {
    // TODO - das
  }
}
