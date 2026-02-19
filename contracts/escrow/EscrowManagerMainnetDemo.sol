// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { Types } from "./Types.sol";
import { IEscrowCondition } from "./interfaces/IEscrowCondition.sol";

contract EscrowManagerMainnetDemo is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable weth;
    uint256 public protocolFeeBps = 0;
    address public feeRecipient;

    mapping(uint8 => address) public conditionImpl;
    mapping(uint256 => Types.Agreement) public agreements;
    uint256 public nextId = 1;

    event AgreementCreated(
        uint256 indexed id,
        address indexed payer,
        address indexed payee,
        uint256 wethAmount,
        uint256 deadline,
        uint8 conditionType,
        address conditionTarget
    );

    event Deposited(uint256 indexed id, address indexed payer, uint256 wethAmount, uint256 fee);
    event Executing(uint256 indexed id);
    event Completed(uint256 indexed id);
    event ExecutionSkipped(uint256 indexed id, string reason);
    event Refunded(uint256 indexed id);
    event ConditionImplSet(uint8 indexed conditionType, address indexed impl);
    event FeeConfigSet(uint256 feeBps, address indexed recipient);
    event EscrowSignal(uint256 indexed id);

    constructor(address _weth, address _owner) Ownable(_owner) {
        require(_weth != address(0), "weth=0");
        weth = IERC20(_weth);
        feeRecipient = _owner;
    }

    function setFeeConfig(uint256 feeBps, address recipient) external onlyOwner {
        require(feeBps <= 500, "fee too high");
        require(recipient != address(0), "recipient=0");

        protocolFeeBps = feeBps;
        feeRecipient = recipient;

        emit FeeConfigSet(feeBps, recipient);
    }

    function setConditionImpl(uint8 conditionType, address impl) external onlyOwner {
        require(impl != address(0), "impl=0");
        conditionImpl[conditionType] = impl;
        emit ConditionImplSet(conditionType, impl);
    }

    function createAgreement(
        address payee,
        uint256 wethAmount,
        uint256 deadline,
        Types.Condition calldata condition
    ) external returns (uint256 id) {
        require(payee != address(0), "payee=0");
        require(wethAmount > 0, "amount=0");
        require(deadline > block.timestamp, "bad deadline");
        require(condition.data.length > 0, "cond.data=empty");
        require(conditionImpl[condition.conditionType] != address(0), "condition not set");

        id = nextId;
        nextId = nextId + 1;

        Types.Agreement storage a = agreements[id];
        a.payer = msg.sender;
        a.payee = payee;
        a.token = address(weth);
        a.amount = wethAmount;
        a.createdAt = block.timestamp;
        a.deadline = deadline;
        a.condition = condition;
        a.state = Types.State.Created;

        emit AgreementCreated(
            id,
            msg.sender,
            payee,
            wethAmount,
            deadline,
            condition.conditionType,
            condition.target
        );

        emit EscrowSignal(id);
    }

    function deposit(uint256 id) external nonReentrant {
        Types.Agreement storage a = agreements[id];

        require(a.state == Types.State.Created, "bad state");
        require(msg.sender == a.payer, "not payer");

        uint256 fee = (a.amount * protocolFeeBps) / 10_000;
        uint256 total = a.amount + fee;

        weth.safeTransferFrom(msg.sender, address(this), total);

        if (fee > 0) {
            weth.safeTransfer(feeRecipient, fee);
        }

        a.state = Types.State.Funded;

        emit Deposited(id, msg.sender, a.amount, fee);
        emit EscrowSignal(id);
    }

    function executeIfSatisfied(uint256 id)
        external
        nonReentrant
        returns (bytes32 requestId)
    {
        Types.Agreement storage a = agreements[id];

        if (a.state != Types.State.Funded) {
            emit ExecutionSkipped(id, "state!=Funded");
            return bytes32(0);
        }

        if (block.timestamp > a.deadline) {
            emit ExecutionSkipped(id, "deadline passed");
            return bytes32(0);
        }

        address cond = conditionImpl[a.condition.conditionType];
        if (cond == address(0)) {
            emit ExecutionSkipped(id, "condition missing");
            return bytes32(0);
        }

        bool ok = IEscrowCondition(cond).isSatisfied(a.condition.target, a.condition.data);
        if (!ok) {
            emit ExecutionSkipped(id, "condition not satisfied");
            return bytes32(0);
        }

        a.state = Types.State.Executing;
        emit Executing(id);

        weth.safeTransfer(a.payee, a.amount);

        a.state = Types.State.Completed;
        emit Completed(id);

        return bytes32(0);
    }

    function refund(uint256 id) external nonReentrant {
        Types.Agreement storage a = agreements[id];

        require(a.state == Types.State.Funded, "bad state");
        require(block.timestamp > a.deadline, "deadline not reached");

        a.state = Types.State.Refunded;

        weth.safeTransfer(a.payer, a.amount);

        emit Refunded(id);
    }
}