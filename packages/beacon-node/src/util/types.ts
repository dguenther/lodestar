import {ContainerType, ListBasicType, ListCompositeType, ValueOf} from "@chainsafe/ssz";
import {BeaconConfig, ChainForkConfig} from "@lodestar/config";
import {ForkName} from "@lodestar/params";
import {ssz} from "@lodestar/types";

// Misc SSZ types used only in the beacon-node package, no need to upstream to types

export const signedBLSToExecutionChangeVersionedType = new ContainerType(
  {
    // Assumes less than 256 forks, sounds reasonable in our lifetime
    preCapella: ssz.Boolean,
    data: ssz.capella.SignedBLSToExecutionChange,
  },
  {jsonCase: "eth2", typeName: "SignedBLSToExecutionChangeVersionedType"}
);
export type SignedBLSToExecutionChangeVersioned = ValueOf<typeof signedBLSToExecutionChangeVersionedType>;

export const BlobSidecarsByRootRequestType = (fork: ForkName, config: BeaconConfig) =>
  new ListCompositeType(ssz.deneb.BlobIdentifier, config.getMaxRequestBlobSidecars(fork));
export type BlobSidecarsByRootRequest = ValueOf<ReturnType<typeof BlobSidecarsByRootRequestType>>;

export const DataColumnSidecarsByRangeRequestType = (config: ChainForkConfig) =>
  new ContainerType(
    {
      startSlot: ssz.Slot,
      count: ssz.UintNum64,
      columns: new ListBasicType(ssz.ColumnIndex, config.NUMBER_OF_COLUMNS),
    },
    {typeName: "DataColumnSidecarsByRangeRequestType", jsonCase: "eth2"}
  );
export type DataColumnSidecarsByRangeRequest = ValueOf<ReturnType<typeof DataColumnSidecarsByRangeRequestType>>;

export const DataColumnSidecarsByRootRequestType = (config: ChainForkConfig) =>
  new ListCompositeType(ssz.fulu.DataColumnIdentifier, config.MAX_REQUEST_DATA_COLUMN_SIDECARS);
export type DataColumnSidecarsByRootRequest = ValueOf<ReturnType<typeof DataColumnSidecarsByRootRequestType>>;

export const DataColumnSidecarsType = (config: ChainForkConfig) =>
  new ListCompositeType(ssz.fulu.DataColumnSidecar, config.NUMBER_OF_COLUMNS);
export type DataColumnSidecars = ValueOf<ReturnType<typeof DataColumnSidecarsType>>;
