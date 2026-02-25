// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DemoConfig {
    mapping(uint256 => uint256) private _cfg;

    event ConfigSet(uint256 indexed key, uint256 value);

    function setConfig(uint256 key, uint256 value) external {
        _cfg[key] = value;
        emit ConfigSet(key, value);
    }

    function getConfig(uint256 key) external view returns (uint256) {
        return _cfg[key];
    }
}