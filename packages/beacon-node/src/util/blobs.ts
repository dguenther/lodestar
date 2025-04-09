import {digest as sha256Digest} from "@chainsafe/as-sha256";
import {Tree} from "@chainsafe/persistent-merkle-tree";
import {ChainForkConfig} from "@lodestar/config";
import {
  ForkAll,
  ForkPostDeneb,
  ForkName,
  KZG_COMMITMENTS_GINDEX,
  KZG_COMMITMENT_GINDEX0,
  NUMBER_OF_COLUMNS,
  VERSIONED_HASH_VERSION_KZG,
} from "@lodestar/params";
import {signedBlockToSignedHeader} from "@lodestar/state-transition";
import {
  BeaconBlockBody,
  SSZTypesFor,
  SignedBeaconBlock,
  SignedBeaconBlockHeader,
  deneb,
  fulu,
  ssz,
} from "@lodestar/types";
import {ckzg} from "./kzg.js";

type VersionHash = Uint8Array;

export function kzgCommitmentToVersionedHash(kzgCommitment: deneb.KZGCommitment): VersionHash {
  const hash = sha256Digest(kzgCommitment);
  // Equivalent to `VERSIONED_HASH_VERSION_KZG + hash(kzg_commitment)[1:]`
  hash[0] = VERSIONED_HASH_VERSION_KZG;
  return hash;
}

export function computeInclusionProof(
  fork: ForkName,
  body: BeaconBlockBody,
  index: number
): deneb.KzgCommitmentInclusionProof {
  const bodyView = (ssz[fork].BeaconBlockBody as SSZTypesFor<ForkAll, "BeaconBlockBody">).toView(body);
  const commitmentGindex = KZG_COMMITMENT_GINDEX0 + index;
  return new Tree(bodyView.node).getSingleProof(BigInt(commitmentGindex));
}

export function computeKzgCommitmentsInclusionProof(
  fork: ForkName,
  body: BeaconBlockBody
): fulu.KzgCommitmentsInclusionProof {
  const bodyView = (ssz[fork].BeaconBlockBody as SSZTypesFor<ForkAll, "BeaconBlockBody">).toView(body);
  return new Tree(bodyView.node).getSingleProof(BigInt(KZG_COMMITMENTS_GINDEX));
}

export function computeBlobSidecars(
  config: ChainForkConfig,
  signedBlock: SignedBeaconBlock,
  contents: deneb.Contents & {kzgCommitmentInclusionProofs?: deneb.KzgCommitmentInclusionProof[]}
): deneb.BlobSidecars {
  const blobKzgCommitments = (signedBlock as deneb.SignedBeaconBlock).message.body.blobKzgCommitments;
  if (blobKzgCommitments === undefined) {
    throw Error("Invalid block with missing blobKzgCommitments for computeBlobSidecars");
  }

  const signedBlockHeader = signedBlockToSignedHeader(config, signedBlock);
  const fork = config.getForkName(signedBlockHeader.message.slot);

  return blobKzgCommitments.map((kzgCommitment, index) => {
    const blob = contents.blobs[index];
    const kzgProof = contents.kzgProofs[index];
    const kzgCommitmentInclusionProof =
      contents.kzgCommitmentInclusionProofs?.[index] ?? computeInclusionProof(fork, signedBlock.message.body, index);

    return {index, blob, kzgCommitment, kzgProof, signedBlockHeader, kzgCommitmentInclusionProof};
  });
}

/**
 * Turns a SignedBeaconBlock and an array of Blobs from a given slot into an array of
 * DataColumnSidecars that are ready to be served by gossip and req/resp.
 *
 * Implementation of get_data_column_sidecars
 * https://github.com/ethereum/consensus-specs/blob/dev/specs/_features/eip7594/das-core.md#get_data_column_sidecars
 */
export function computeDataColumnSidecars(
  config: ChainForkConfig,
  signedBlock: SignedBeaconBlock,
  contents: deneb.Contents & {kzgCommitmentsInclusionProof?: fulu.KzgCommitmentsInclusionProof}
): fulu.DataColumnSidecars {
  const blobKzgCommitments = (signedBlock as deneb.SignedBeaconBlock).message.body.blobKzgCommitments;
  if (blobKzgCommitments === undefined) {
    throw Error("Invalid block with missing blobKzgCommitments for computeBlobSidecars");
  }
  if (blobKzgCommitments.length === 0) {
    return [];
  }
  const {blobs} = contents;
  const fork = config.getForkName(signedBlock.message.slot);
  const signedBlockHeader = signedBlockToSignedHeader(config, signedBlock);
  const kzgCommitmentsInclusionProof =
    contents.kzgCommitmentsInclusionProof ?? computeKzgCommitmentsInclusionProof(fork, signedBlock.message.body);
  const cellsAndProofs = blobs.map((blob) => ckzg.computeCellsAndKzgProofs(blob));

  return Array.from({length: NUMBER_OF_COLUMNS}, (_, columnIndex) => {
    // columnIndex'th column
    const column = Array.from({length: blobs.length}, (_, rowNumber) => cellsAndProofs[rowNumber][0][columnIndex]);
    const kzgProofs = Array.from({length: blobs.length}, (_, rowNumber) => cellsAndProofs[rowNumber][1][columnIndex]);
    return {
      index: columnIndex,
      column,
      kzgCommitments: blobKzgCommitments,
      kzgProofs,
      signedBlockHeader,
      kzgCommitmentsInclusionProof,
    };
  });
}

/**
 * Given a blob and cell proofs, computes the cells for each blob and combines them with the proofs.
 * Similar to the computeMatrix function described below.
 *
 * SPEC FUNCTION (note: spec currently computes proofs, but we already have them)
 * https://github.com/ethereum/consensus-specs/blob/dev/specs/fulu/das-core.md#compute_matrix
 */
export function getCellsAndProofs(blobs: fulu.BlobAndProofV2[]): [Uint8Array[], Uint8Array[]][] {
  return blobs.map((blob) => {
    const cells = ckzg.computeCells(blob.blob);
    const proofs = blob.proofs;
    return [cells, proofs];
  });
}

/**
 * Given a signed block header and the commitments, inclusion proof, cells/proofs associated with
 * each blob in the block, assemble the sidecars which can be distributed to peers.
 *
 * SPEC FUNCTION
 * https://github.com/ethereum/consensus-specs/blob/dev/specs/fulu/validator.md#get_data_column_sidecars
 */
export function getDataColumnSidecars(
  signedBlockHeader: SignedBeaconBlockHeader,
  kzgCommitments: deneb.KZGCommitment[],
  kzgCommitmentsInclusionProof: fulu.KzgCommitmentsInclusionProof,
  cellsAndKzgProofs: [Uint8Array[], Uint8Array[]][]
): fulu.DataColumnSidecars {
  if (cellsAndKzgProofs.length !== kzgCommitments.length) {
    throw Error("Invalid cellsAndKzgProofs length for getDataColumnSidecars");
  }

  const sidecars: fulu.DataColumnSidecars = [];
  for (let columnIndex = 0; columnIndex < NUMBER_OF_COLUMNS; columnIndex++) {
    const columnCells = [];
    const columnProofs = [];
    for (const [cells, proofs] of cellsAndKzgProofs) {
      columnCells.push(cells[columnIndex]);
      columnProofs.push(proofs[columnIndex]);
    }
    sidecars.push({
      index: columnIndex,
      column: columnCells,
      kzgCommitments,
      kzgProofs: columnProofs,
      signedBlockHeader,
      kzgCommitmentsInclusionProof,
    });
  }
  return sidecars;
}

/**
 * Given a signed block and the cells/proofs associated with each blob in the
 * block, assemble the sidecars which can be distributed to peers.
 *
 * SPEC FUNCTION
 * https://github.com/ethereum/consensus-specs/blob/dev/specs/fulu/validator.md#get_data_column_sidecars_from_block
 */
export function getDataColumnSidecarsFromBlock(
  config: ChainForkConfig,
  signedBlock: fulu.SignedBeaconBlock,
  cellsAndKzgProofs: [Uint8Array[], Uint8Array[]][]
): fulu.DataColumnSidecars {
  const blobKzgCommitments = (signedBlock as deneb.SignedBeaconBlock).message.body.blobKzgCommitments;
  const fork = config.getForkName(signedBlock.message.slot);
  const signedBlockHeader = signedBlockToSignedHeader(config, signedBlock);

  const kzgCommitmentsInclusionProof = computeKzgCommitmentsInclusionProof(fork, signedBlock.message.body);

  return getDataColumnSidecars(signedBlockHeader, blobKzgCommitments, kzgCommitmentsInclusionProof, cellsAndKzgProofs);
}

/**
 * Given a DataColumnSidecar and the cells/proofs associated with each blob corresponding
 * to the commitments it contains, assemble all sidecars for distribution to peers.
 *
 * SPEC FUNCTION
 * https://github.com/ethereum/consensus-specs/blob/dev/specs/fulu/validator.md#get_data_column_sidecars_from_column_sidecar
 */
export function getDataColumnSidecarsFromColumnSidecar(
  sidecar: fulu.DataColumnSidecar,
  cellsAndKzgProofs: [Uint8Array[], Uint8Array[]][]
): fulu.DataColumnSidecars {
  return getDataColumnSidecars(
    sidecar.signedBlockHeader,
    sidecar.kzgCommitments,
    sidecar.kzgCommitmentsInclusionProof,
    cellsAndKzgProofs
  );
}
