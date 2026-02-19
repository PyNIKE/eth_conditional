// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Interface for escrow condition checks.
 * Condition contract returns true when requirement is satisfied.
 */
interface IEscrowCondition {
    function isSatisfied(
        address target,
        bytes calldata data
    ) external view returns (bool);
}