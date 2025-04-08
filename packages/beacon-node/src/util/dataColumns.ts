import {digest} from "@chainsafe/as-sha256";
import {ChainForkConfig} from "@lodestar/config";
import {
  DATA_COLUMN_SIDECAR_SUBNET_COUNT,
  EFFECTIVE_BALANCE_INCREMENT,
  NUMBER_OF_COLUMNS,
  NUMBER_OF_CUSTODY_GROUPS,
} from "@lodestar/params";
import {ColumnIndex, CustodyIndex, ValidatorIndex} from "@lodestar/types";
import {ssz} from "@lodestar/types";
import {bytesToBigInt} from "@lodestar/utils";
import {NodeId} from "../network/subnets/index.js";
import {CachedBeaconStateAllForks} from "@lodestar/state-transition";

export class CustodyConfig {
  /**
   * The number of custody groups the node should subscribe to
   */
  targetCustodyGroupCount: number;

  /**
   * The custody columns the node should subscribe to
   */
  custodyColumns: ColumnIndex[];

  /**
   * Custody columns map which column maps to which index in the array of columns custodied
   * with zero representing it is not custodied
   */
  custodyColumnsIndex: Uint8Array;

  /**
   * The number of custody groups the node will advertise to the network
   */
  advertisedCustodyGroupCount: number;

  /**
   * The number of custody groups the node will sample
   */
  sampledGroupCount: number;

  /**
   * Custody groups sampled by the node as part of custody sampling
   */
  sampleGroups: CustodyIndex[];

  /**
   * Data columns sampled by the node as part of custody sampling
   * https://github.com/ethereum/consensus-specs/blob/dev/specs/fulu/das-core.md#custody-sampling
   *
   * TODO: Consider race conditions if this updates during sync/backfill
   */
  sampledColumns: ColumnIndex[];

  /**
   * Subnets sampled by the node as part of custody sampling
   */
  sampledSubnets: number[];

  private config: ChainForkConfig;
  private nodeId: NodeId;

  constructor(nodeId: NodeId, config: ChainForkConfig) {
    this.config = config;
    this.nodeId = nodeId;
    this.targetCustodyGroupCount = Math.max(config.CUSTODY_REQUIREMENT, config.NODE_CUSTODY_REQUIREMENT);
    this.custodyColumns = getDataColumns(this.nodeId, this.targetCustodyGroupCount);
    this.custodyColumnsIndex = this.getCustodyColumnsIndex(this.custodyColumns);
    this.advertisedCustodyGroupCount = this.targetCustodyGroupCount;
    this.sampledGroupCount = Math.max(this.targetCustodyGroupCount, this.config.SAMPLES_PER_SLOT);
    this.sampleGroups = getCustodyGroups(this.nodeId, this.sampledGroupCount);
    this.sampledColumns = getDataColumns(this.nodeId, this.sampledGroupCount);
    this.sampledSubnets = this.sampledColumns.map(computeSubnetForDataColumn);
  }

  updateTargetCustodyGroupCount(targetCustodyGroupCount: number) {
    this.targetCustodyGroupCount = targetCustodyGroupCount;
    this.custodyColumns = getDataColumns(this.nodeId, this.targetCustodyGroupCount);
    this.custodyColumnsIndex = this.getCustodyColumnsIndex(this.custodyColumns);
    // TODO: Porting this over to match current behavior, but I think this incorrectly mixes units:
    // SAMPLES_PER_SLOT is in columns, and CUSTODY_GROUP_COUNT is in groups
    this.sampledGroupCount = Math.max(this.targetCustodyGroupCount, this.config.SAMPLES_PER_SLOT);
    this.sampleGroups = getCustodyGroups(this.nodeId, this.sampledGroupCount);
    this.sampledColumns = getDataColumns(this.nodeId, this.sampledGroupCount);
    this.sampledSubnets = this.sampledColumns.map(computeSubnetForDataColumn);
  }

  updateAdvertisedCustodyGroupCount(advertisedCustodyGroupCount: number) {
    this.advertisedCustodyGroupCount = advertisedCustodyGroupCount;
  }

  private getCustodyColumnsIndex(custodyColumns: ColumnIndex[]): Uint8Array {
    // custody columns map which column maps to which index in the array of columns custodied
    // with zero representing it is not custodied
    const custodyColumnsIndex = new Uint8Array(NUMBER_OF_COLUMNS);
    let custodyAtIndex = 1;
    for (const columnIndex of custodyColumns) {
      custodyColumnsIndex[columnIndex] = custodyAtIndex;
      custodyAtIndex++;
    }
    return custodyColumnsIndex;
  }
}

function computeSubnetForDataColumn(columnIndex: ColumnIndex): number {
  return columnIndex % DATA_COLUMN_SIDECAR_SUBNET_COUNT;
}

/**
 * Calculate the number of custody groups the node should subscribe to based on the node's effective balance
 *
 * SPEC FUNCTION
 * https://github.com/ethereum/consensus-specs/blob/dev/specs/fulu/validator.md#validator-custody
 */
export function getValidatorsCustodyRequirement(
  state: CachedBeaconStateAllForks,
  validatorIndices: ValidatorIndex[],
  config: ChainForkConfig
): number {
  if (validatorIndices.length === 0) {
    return config.CUSTODY_REQUIREMENT;
  }

  const totalNodeEffectiveBalance = validatorIndices.reduce((total, validatorIndex) => {
    return total + state.epochCtx.effectiveBalanceIncrements[validatorIndex] * EFFECTIVE_BALANCE_INCREMENT;
  }, 0);

  const count = Math.floor(totalNodeEffectiveBalance / config.BALANCE_PER_ADDITIONAL_CUSTODY_GROUP);
  return Math.min(Math.max(count, config.VALIDATOR_CUSTODY_REQUIREMENT), NUMBER_OF_CUSTODY_GROUPS);
}

/**
 * Converts a custody group to an array of column indices.  Should be 1-1 as long there are 128
 * columns and 128 custody groups.
 *
 * SPEC FUNCTION
 * https://github.com/ethereum/consensus-specs/blob/dev/specs/fulu/das-core.md#compute_columns_for_custody_group
 */
export function computeColumnsForCustodyGroup(custodyIndex: CustodyIndex): ColumnIndex[] {
  if (custodyIndex > NUMBER_OF_CUSTODY_GROUPS) {
    custodyIndex = NUMBER_OF_CUSTODY_GROUPS;
  }
  const columnsPerCustodyGroup = Number(NUMBER_OF_COLUMNS / NUMBER_OF_CUSTODY_GROUPS);
  const columnIndexes = [];
  for (let i = 0; i < columnsPerCustodyGroup; i++) {
    columnIndexes.push(NUMBER_OF_CUSTODY_GROUPS * i + custodyIndex);
  }
  columnIndexes.sort((a, b) => a - b);
  return columnIndexes;
}

/**
 * Converts nodeId and a the number of custody groups to an array of custody indices. Indexes must be
 * further converted to column indices
 *
 * SPEC FUNCTION
 * https://github.com/ethereum/consensus-specs/blob/dev/specs/fulu/das-core.md#get_custody_groups
 */
export function getCustodyGroups(nodeId: NodeId, custodyGroupCount: number): CustodyIndex[] {
  if (custodyGroupCount > NUMBER_OF_CUSTODY_GROUPS) {
    custodyGroupCount = NUMBER_OF_CUSTODY_GROUPS;
  }

  const custodyGroups: CustodyIndex[] = [];
  // nodeId is in bigendian and all computes are in little endian
  let currentId = bytesToBigInt(nodeId, "be");
  while (custodyGroups.length < custodyGroupCount) {
    // could be optimized
    const currentIdBytes = ssz.UintBn256.serialize(currentId);
    const custodyGroup = Number(
      ssz.UintBn64.deserialize(digest(currentIdBytes).slice(0, 8)) % BigInt(NUMBER_OF_CUSTODY_GROUPS)
    );

    if (!custodyGroups.includes(custodyGroup)) {
      custodyGroups.push(custodyGroup);
    }

    const willOverflow = currentIdBytes.reduce((acc, elem) => acc && elem === 0xff, true);
    if (willOverflow) {
      currentId = BigInt(0);
    } else {
      currentId++;
    }
  }

  custodyGroups.sort((a, b) => a - b);
  return custodyGroups;
}

export function getDataColumns(nodeId: NodeId, custodyGroupCount: number): ColumnIndex[] {
  return getCustodyGroups(nodeId, custodyGroupCount)
    .flatMap(computeColumnsForCustodyGroup)
    .sort((a, b) => a - b);
}
