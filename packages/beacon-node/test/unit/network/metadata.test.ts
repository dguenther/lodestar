import {ssz} from "@lodestar/types";
import {toHex} from "@lodestar/utils";
import {describe, expect, it, vi} from "vitest";
import {ENRKey, MetadataController, getENRForkID} from "../../../src/network/metadata.js";
import {NetworkConfig} from "../../../src/network/networkConfig.js";
import {serializeCgc} from "../../../src/util/metadata.js";
import {config} from "../../utils/config.js";
import {getValidPeerId} from "../../utils/peer.js";

describe("network / metadata", () => {
  describe("getENRForkID", () => {
    // At 0, next fork is altair
    const currentEpoch = 0;
    const enrForkID = getENRForkID(config, currentEpoch);

    it("enrForkID.nextForkVersion", () => {
      expect(toHex(enrForkID.nextForkVersion)).toBe(toHex(config.ALTAIR_FORK_VERSION));
    });

    it("enrForkID.nextForkEpoch", () => {
      expect(enrForkID.nextForkEpoch).toBe(config.ALTAIR_FORK_EPOCH);
    });

    it("it's possible to serialize enr fork id", () => {
      ssz.phase0.ENRForkID.hashTreeRoot(enrForkID);
    });
  });

  describe("MetadataController", () => {
    it("should call onSetValue with the correct cgc", () => {
      const onSetValue = vi.fn();
      const networkConfig = new NetworkConfig(getValidPeerId(), config);
      const metadata = new MetadataController({}, {onSetValue, networkConfig});
      metadata.cgc = 128;
      expect(onSetValue).toHaveBeenCalledWith(ENRKey.cgc, serializeCgc(128));
    });
  });
});
