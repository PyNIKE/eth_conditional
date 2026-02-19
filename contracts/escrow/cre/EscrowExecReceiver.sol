// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Интерфейс Consumer, который может вызывать KeystoneForwarder (CRE secure write)
/// @dev Часто forwarder зовёт onReport(metadata, report)
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @notice Минимальный интерфейс escrow для выполнения условия
/// @dev Важно: executeIfSatisfied НЕ должен быть payable
interface IEscrowManager {
    function executeIfSatisfied(uint256 id) external;
}

/// @title EscrowExecReceiver
/// @notice Consumer для Chainlink CRE secure write:
/// KeystoneForwarder -> onReport -> escrow.executeIfSatisfied(id)
contract EscrowExecReceiver is IReceiver {
    /// @notice Единственный разрешенный отправитель репортов
    address public immutable forwarder;

    /// @notice Escrow, который выполняет payout при удовлетворенном условии
    IEscrowManager public immutable escrow;

    /// @dev События для дебага / видео
    event ReportReceived(address indexed caller, uint256 indexed agreementId, bytes report);
    event EscrowExecutionAttempt(uint256 indexed agreementId);

    error OnlyForwarder(address caller);
    error BadReport();

    constructor(address _forwarder, address _escrow) {
        require(_forwarder != address(0), "forwarder=0");
        require(_escrow != address(0), "escrow=0");
        forwarder = _forwarder;
        escrow = IEscrowManager(_escrow);
    }

    /// @notice Вариант, который часто использует KeystoneForwarder: (metadata, report)
    function onReport(bytes calldata, bytes calldata report) external override {
        _handleReport(report);
    }

    /// @notice На всякий случай поддерживаем и вариант onReport(report)
    function onReport(bytes calldata report) external {
        _handleReport(report);
    }

    function _handleReport(bytes calldata report) internal {
        if (msg.sender != forwarder) revert OnlyForwarder(msg.sender);

        // report должен быть abi.encode(uint256)
        if (report.length < 32) revert BadReport();

        uint256 id = abi.decode(report, (uint256));

        emit ReportReceived(msg.sender, id, report);

        // Escrow сам решает: выполнить выплату или мягко "skip" (без revert)
        escrow.executeIfSatisfied(id);

        emit EscrowExecutionAttempt(id);
    }
}
