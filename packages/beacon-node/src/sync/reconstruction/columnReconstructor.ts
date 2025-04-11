import {toHexString} from "@chainsafe/ssz";
import {isForkPostFulu} from "@lodestar/params";
import {RootHex, SignedBeaconBlock, fulu} from "@lodestar/types";
import {pruneSetToMax} from "@lodestar/utils";
import {CustodyConfig} from "../../util/dataColumns.js";
import {GossipedInputType} from "../../chain/blocks/types.js";
import {IExecutionEngine} from "../../execution/index.js";
import {
  getCellsAndProofs,
  getDataColumnSidecarsFromBlock,
  getDataColumnSidecarsFromColumnSidecar,
  kzgCommitmentToVersionedHash,
} from "../../util/blobs.js";
import {INetwork} from "../../network/index.js";
import {SeenGossipBlockInput} from "../../chain/seenCache/seenGossipBlockInput.js";
import {IBeaconChain} from "../../chain/interface.js";
import {promiseAllMaybeAsync} from "../../util/promises.js";

type ColumnReconstructorBlockInput =
  | {type: GossipedInputType.block; signedBlock: SignedBeaconBlock}
  | {
      type: GossipedInputType.dataColumn;
      dataColumnSidecar: fulu.DataColumnSidecar;
      dataColumnBytes: Uint8Array | null;
    };

const MAX_GOSSIPINPUT_CACHE = 5;

export class ColumnReconstructor {
  private readonly blockInputCache = new Set<RootHex>();
  private readonly custodyConfig: CustodyConfig;
  private readonly executionEngine: IExecutionEngine;
  private readonly network: INetwork;
  private readonly seenGossipBlockInput: SeenGossipBlockInput;
  private readonly chain: IBeaconChain;

  constructor(chain: IBeaconChain, network: INetwork) {
    this.chain = chain;
    this.custodyConfig = chain.custodyConfig;
    this.executionEngine = chain.executionEngine;
    this.network = network;
    this.seenGossipBlockInput = chain.seenGossipBlockInput;
  }

  prune(): void {
    pruneSetToMax(this.blockInputCache, MAX_GOSSIPINPUT_CACHE);
  }

  hasBlock(blockRoot: RootHex): boolean {
    return this.blockInputCache.has(blockRoot);
  }

  async reconstructColumns(input: ColumnReconstructorBlockInput): Promise<void> {
    const config = this.chain.config;
    const slot =
      input.type === GossipedInputType.block
        ? input.signedBlock.message.slot
        : input.dataColumnSidecar.signedBlockHeader.message.slot;
    const fork = config.getForkName(slot);

    // Only reconstruct columns for post-Fulu forks
    if (!isForkPostFulu(fork)) {
      return;
    }

    let blockHex: RootHex;
    if (input.type === GossipedInputType.block) {
      blockHex = toHexString(config.getForkTypes(slot).BeaconBlock.hashTreeRoot(input.signedBlock.message));
    } else if (input.type === GossipedInputType.dataColumn) {
      blockHex = toHexString(
        config.getForkTypes(slot).BeaconBlockHeader.hashTreeRoot(input.dataColumnSidecar.signedBlockHeader.message)
      );
    } else {
      throw new Error("Invalid gossipedInput type");
    }

    if (this.blockInputCache.has(blockHex)) {
      return;
    }

    // Store the block in cache
    this.blockInputCache.add(blockHex);

    // Process KZG commitments into versioned hashes
    let versionedHashes: Uint8Array[];

    if (input.type === GossipedInputType.block) {
      const block = input.signedBlock as fulu.SignedBeaconBlock;
      versionedHashes = block.message.body.blobKzgCommitments.map(kzgCommitmentToVersionedHash);
    } else if (input.type === GossipedInputType.dataColumn) {
      versionedHashes = input.dataColumnSidecar.kzgCommitments.map(kzgCommitmentToVersionedHash);
    } else {
      throw new Error("Invalid gossipedInput type");
    }

    if (versionedHashes.length === 0) {
      return;
    }

    // Get blobs from execution engine
    const blobs = await this.executionEngine.getBlobs(fork, versionedHashes);

    // Execution engine was unable to find one or more blobs
    // TODO: as of peerdas-devnet-6, reth currently sends an empty array if it doesn't have 1+ blobs, but spec says to return null.
    if (blobs === null || blobs.length === 0) {
      return;
    }

    let dataColumnSidecars: fulu.DataColumnSidecars;
    const cellsAndProofs = getCellsAndProofs(blobs);
    if (input.type === GossipedInputType.block) {
      dataColumnSidecars = getDataColumnSidecarsFromBlock(
        config,
        input.signedBlock as fulu.SignedBeaconBlock,
        cellsAndProofs
      );
    } else if (input.type === GossipedInputType.dataColumn) {
      dataColumnSidecars = getDataColumnSidecarsFromColumnSidecar(input.dataColumnSidecar, cellsAndProofs);
    } else {
      throw new Error("Invalid gossipedInput type");
    }

    // Publish columns if and only if subscribed to them
    const sampledColumns = this.custodyConfig.sampledColumns.map((columnIndex) => dataColumnSidecars[columnIndex]);

    const publishPromises = sampledColumns.map((column) => () => this.network.publishDataColumnSidecar(column));

    for (const column of sampledColumns) {
      this.seenGossipBlockInput.getGossipBlockInput(
        config,
        {
          type: GossipedInputType.dataColumn,
          dataColumnSidecar: column,
          // TODO: figure out what to use here
          dataColumnBytes: null,
        },
        // TODO: Pass in metrics. Should this use a different availability source?
        null
      );
    }

    await promiseAllMaybeAsync(publishPromises);
  }
}
