// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.25;

import { InterchainAccountRouter } from "@hyperlane-xyz/core/contracts/middleware/InterchainAccountRouter.sol";
import { InterchainAccountMessage } from "@hyperlane-xyz/core/contracts/middleware/libs/InterchainAccountMessage.sol";
import { IMailbox } from "@hyperlane-xyz/core/contracts/interfaces/IMailbox.sol";
import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { HypERC20 } from "@hyperlane-xyz/core/contracts/token/HypERC20.sol";
import { HypERC20Collateral } from "@hyperlane-xyz/core/contracts/token/HypERC20Collateral.sol";
import { HypNative } from "@hyperlane-xyz/core/contracts/token/HypNative.sol";
