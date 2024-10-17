// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.25;

import { ProxyAdmin as OzProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

contract ProxyAdmin is OzProxyAdmin {
    constructor(address _owner) {
        _transferOwnership(_owner);
    }
}
