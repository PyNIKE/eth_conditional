// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Shared types for the conditional escrow MVP.
 * @dev Kept as a library to namespace structs/enums.
 */
library Types {
    /**
     * @notice Lifecycle states of an agreement.
     */
    enum State {
        None,       // 0) non-existent (default)
        Created,    // 1) created, not funded yet
        Funded,     // 2) WETH deposited into escrow
        Executing,  // 3) execution in progress (reentrancy / double-call lock)
        Completed,  // 4) paid out to payee
        Refunded,   // 5) refunded back to payer
        Disputed    // 6) reserved for future arbitration
    }

    /**
     * @notice Generic condition config.
     * conditionType -> which condition contract to use (e.g. 1 = TimeCondition)
     * target        -> optional address that condition may inspect (token/NFT/DAO/etc.)
     * data          -> ABI-encoded parameters for the condition
     */
    struct Condition {
        uint8 conditionType;
        address target; // can be address(0) for TimeCondition
        bytes data;     // e.g. abi.encode(unlockTime)
    }

    /**
     * @notice Main escrow agreement stored on-chain.
     */
    struct Agreement {
        // Parties
        address payer; // User A (depositor)
        address payee; // User B (worker)

        // Funds
        address token;   // WETH address (mainnet)
        uint256 amount;  // amount of WETH to pay out

        // Timing
        uint256 createdAt;
        uint256 deadline; // last moment to execute; after that refund is allowed

        // Condition
        Condition condition;

        // State machine
        State state;
    }
}