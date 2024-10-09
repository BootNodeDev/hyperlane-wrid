// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { MinimalProxy } from "@hyperlane-xyz/core/contracts/libs/MinimalProxy.sol";
import { CallLib } from "@hyperlane-xyz/core/contracts/middleware/libs/Call.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

import { TransferrableOwnableMulticall } from "./TransferrableOwnableMulticall.sol";

contract OwnableMulticallFactory {
    address public immutable implementation;
    bytes32 public immutable bytecodeHash;

    event MulticallCreated(address indexed owner, address indexed multicall);

    constructor() {
        implementation = address(new TransferrableOwnableMulticall(address(this)));
        // cannot be stored immutably because it is dynamically sized
        bytes memory _bytecode = MinimalProxy.bytecode(implementation);
        bytecodeHash = keccak256(_bytecode);
    }

    function deployAndCall(CallLib.Call[] calldata _calls)
        external
        payable
        returns (address payable multicall, bytes[] memory returnData)
    {
        bytes32 _salt = _getSalt(msg.sender);

        bytes memory _bytecode = MinimalProxy.bytecode(implementation);
        multicall = payable(Create2.deploy(0, _salt, _bytecode));

        TransferrableOwnableMulticall(multicall).initialize(address(this));

        emit MulticallCreated(msg.sender, multicall);

        if (_calls.length > 0) {
            returnData = TransferrableOwnableMulticall(multicall).multicall{value: msg.value}(_calls);
        }

        TransferrableOwnableMulticall(multicall).transferOwnership(msg.sender);
    }

    function getMulticallAddress(address _owner) public view returns (address) {
        return _getMulticallAddress(_getSalt(_owner));
    }

    function _getSalt(address _owner) private view returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), _owner));
    }

    function _getMulticallAddress(bytes32 _salt) private view returns (address payable) {
        return payable(Create2.computeAddress(_salt, bytecodeHash));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable { }
}
