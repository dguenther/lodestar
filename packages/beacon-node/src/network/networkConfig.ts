import {BeaconConfig} from "@lodestar/config";
import {NodeId, computeNodeId} from "./subnets/interface.js";
import {CustodyConfig} from "../util/dataColumns.js";
import {PeerId} from "@libp2p/interface";

/**
 * Store shared data for different modules in the network stack.
 * TODO: consider moving similar shared data, for example PeersData, under NetworkConfig.
 */
export class NetworkConfig {
  private readonly nodeId: NodeId;
  private readonly config: BeaconConfig;
  readonly custodyConfig: CustodyConfig;

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

  setTargetGroupCount(count: number): void {
    this.custodyConfig.updateTargetCustodyGroupCount(count);
  }

  setAdvertisedGroupCount(count: number): void {
    this.custodyConfig.updateAdvertisedCustodyGroupCount(count);
  }
}
