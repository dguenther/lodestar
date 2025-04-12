import {BlobsBundle} from "../../execution/index.js";
import {ckzg} from "../../util/kzg.js";
import {CELLS_PER_EXT_BLOB, ForkName, ForkSeq} from "@lodestar/params";

/**
 * Validate blobsBundle according to spec
 * https://github.com/ethereum/execution-apis/blob/cad4194e3fa37359a1be95e4aad2752d69691077/src/engine/osaka.md#specification
 */
export function validateBlobsBundle(fork: ForkName, blobsBundle: BlobsBundle): void {
  if (blobsBundle.commitments.length !== blobsBundle.blobs.length) {
    throw Error(
      `Invalid BlobsBundle: commitments.length ${blobsBundle.commitments.length} != blobs.length ${blobsBundle.blobs.length}`
    );
  }

  if (ForkSeq[fork] >= ForkSeq.fulu) {
    const expectedProofsLength = blobsBundle.blobs.length * CELLS_PER_EXT_BLOB;
    if (blobsBundle.proofs.length !== expectedProofsLength) {
      throw Error(
        `Invalid proofs length for BlobsBundleV2 format: expected ${expectedProofsLength}, got ${blobsBundle.proofs.length}`
      );
    }

    const commitmentBytes = blobsBundle.commitments.flatMap((commitment) => Array(CELLS_PER_EXT_BLOB).fill(commitment));
    const cellIndices = Array.from({length: blobsBundle.blobs.length}).flatMap(() =>
      Array.from({length: CELLS_PER_EXT_BLOB}, (_, i) => i)
    );
    const cells = blobsBundle.blobs.flatMap((blob) => ckzg.computeCells(blob));
    const proofBytes = blobsBundle.proofs.flat();

    try {
      ckzg.verifyCellKzgProofBatch(commitmentBytes, cellIndices, cells, proofBytes);
    } catch {
      throw new Error("Error in verifyCellKzgProofBatch");
    }
  } else {
    if (blobsBundle.proofs.length !== blobsBundle.blobs.length) {
      throw new Error(`Invalid proofs length for BlobsBundleV1 format: expected ${blobsBundle.blobs.length}, got ${blobsBundle.proofs.length}`);
    }
  }
}
