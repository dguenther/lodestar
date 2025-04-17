import {RootHex, Slot, SubnetID} from "@lodestar/types";
import {GossipActionError} from "./gossipValidation.js";

export enum DataColumnSidecarErrorCode {
  INVALID_SUBNET = "DATA_COLUMN_SIDECAR_ERROR_INVALID_SUBNET",

  // following errors are adapted from the block errors
  FUTURE_SLOT = "DATA_COLUMN_SIDECAR_ERROR_FUTURE_SLOT",
  PARENT_UNKNOWN = "DATA_COLUMN_SIDECAR_ERROR_PARENT_UNKNOWN",
  INCLUSION_PROOF_INVALID = "BLOB_SIDECAR_ERROR_INCLUSION_PROOF_INVALID",
}

export type DataColumnSidecarErrorType =
  | {code: DataColumnSidecarErrorCode.INVALID_SUBNET; columnIndex: number; gossipSubnet: SubnetID}
  | {code: DataColumnSidecarErrorCode.FUTURE_SLOT; blockSlot: Slot; currentSlot: Slot}
  | {code: DataColumnSidecarErrorCode.PARENT_UNKNOWN; parentRoot: RootHex}
  | {code: DataColumnSidecarErrorCode.INCLUSION_PROOF_INVALID; slot: Slot; columnIdx: number};

export class DataColumnSidecarGossipError extends GossipActionError<DataColumnSidecarErrorType> {}
