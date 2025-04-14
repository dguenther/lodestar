import {PeerId, PrivateKey} from "@libp2p/interface";
import {peerIdFromPrivateKey} from "@libp2p/peer-id";
import {BeaconConfig} from "@lodestar/config";
import {CustodyConfig, computeCustodyConfig} from "../util/dataColumns.js";
import {NodeId, computeNodeId} from "./subnets/interface.js";

/**
 * Store shared data for different modules in the network stack.
 * TODO: consider moving similar shared data, for example PeersData, under NetworkConfig.
 */
export class NetworkConfig {
  private readonly nodeId: NodeId;
  private readonly peerId: PeerId;
  private readonly config: BeaconConfig;
  private custodyConfig: CustodyConfig;

  constructor(privateKey: PrivateKey, config: BeaconConfig) {
    this.peerId = peerIdFromPrivateKey(privateKey);
    this.nodeId = computeNodeId(this.peerId);
    this.config = config;
    this.custodyConfig = computeCustodyConfig(this.nodeId, config);
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
