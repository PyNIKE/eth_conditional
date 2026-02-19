// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IEscrowCondition } from "../interfaces/IEscrowCondition.sol";

/**
 * @notice Condition: satisfied if the current block timestamp is >= unlockTime.
 * @dev data must be abi.encode(uint256 unlockTime)
 */
contract TimeCondition is IEscrowCondition {
    function isSatisfied(address, bytes calldata data) external view returns (bool) {
        uint256 unlockTime = abi.decode(data, (uint256));
        return block.timestamp >= unlockTime;
    }
}