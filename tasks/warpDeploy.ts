import { task, vars } from "hardhat/config";
import { promises as fsp } from "fs";
import { parse as yamlParse } from "yaml";
import registry from "../configs/registry.json";
import { ethers } from "ethers"

import {
  WarpRouteDeployConfig
} from '@hyperlane-xyz/sdk';

const chainIds = {
  "optimismsepolia": 11155420,
  "basesepolia": 84532,
  "arbitrumsepolia": 421614,
  "sepolia": 11155111
}

task("warpDeploy", "Deploy multiple warp routes from a single chain", async (_taskArgs, hre) => {
  let configYAML = await fsp.readFile("./configs/warp-route-deployment.yaml", {
    encoding: "utf8",
  });
  const config: WarpRouteDeployConfig = yamlParse(configYAML)

  const accounts = await hre.ethers.getSigners();
  const deployer = accounts[0];
  const deployerAddress = deployer.address;
  const localChainId: any = hre.network.config.chainId?.toString() || "11155420";

  console.log(localChainId)

  const multicallFactoryContract = await hre.ethers.getContractAt(
    "OwnableMulticallFactory",
    registry[localChainId as keyof typeof registry].multicallFactory,
    deployer
  );

  const localRouterContract = await hre.ethers.getContractAt(
    "InterchainAccountRouter",
    registry[localChainId as keyof typeof registry].interchainAccountRouter,
    deployer
  );

  const createXContract = await hre.ethers.getContractAt("ICreateX", registry[localChainId as keyof typeof registry].createX, deployer);

  const deployerMulticallAddress = await multicallFactoryContract.getMulticallAddress(deployerAddress);

  console.log(deployerMulticallAddress);

  const remoteICAAddresses = await Promise.all(
    Object.keys(config).map((key: string) => chainIds[key as keyof typeof chainIds]).filter((e) => e != localChainId).map((id: number) => {
      return localRouterContract["getRemoteInterchainAccount(uint32,address)"](id, deployerMulticallAddress);
    })
  );

  console.log(remoteICAAddresses);

  const salts = remoteICAAddresses.map((addr: string) => {
    const routerSalt = encodeSalt(addr, "WARPROUTE-3"); // TODO - make this a task param
    const guardedSalt = efficientHash(ethers.zeroPadValue(addr, 32), routerSalt);
    return { routerSalt, guardedSalt };
  })

  console.log(salts);

  const localRouterSalt = encodeSalt(deployerMulticallAddress, "WARPROUTE-3"); // TODO - make this a task param
  const localGuardedSalt = efficientHash(ethers.zeroPadValue(deployerMulticallAddress, 32), localRouterSalt);

  const localWarpRouteAddress = await createXContract["computeCreate3Address(bytes32)"](localGuardedSalt);
  const repoteWarpRouteAddresses = await Promise.all(salts.map((salt: { routerSalt: string; guardedSalt: string; }) => {
    return createXContract["computeCreate3Address(bytes32)"](salt.guardedSalt);
  }));

  console.log(localWarpRouteAddress);
  console.log(repoteWarpRouteAddresses);

  const domains = Object.keys(config).map((key: string) => chainIds[key as keyof typeof chainIds]);
  const routerAddressesB32 = [ ethers.zeroPadValue(localWarpRouteAddress, 32), ...repoteWarpRouteAddresses.map((addr: string) => ethers.zeroPadValue(addr, 32)) ];

  console.log(domains);
  console.log(routerAddressesB32);


  // build milticall data
  // calls
    // create local warp route
      // deploy router implementation with constructor params - TOD need to pre-compute the address
      // deploy proxy using prev implementation, do not call initialze in the same call so the multicall call in next call it and receives the initial supply
      // initialize
      // enrollRemoteRouters

  // quote remote calls payment

  // build calls for remote deployment
    // create local warp route
    // deploy router implementation with constructor params - TOD need to pre-compute the address
    // deploy proxy using prev implementation, do not call initialze in the same call so the multicall call in next call it and receives the initial supply
    // initialize
    // enrollRemoteRouters

  // add call to local ICA with remote deployment calls

  // execute multicall
});

function encodeSalt(addr: string, str: string): string {
  if (ethers.toUtf8Bytes(str).length > 11) {
    throw new Error("String must be 11 bytes or less");
  }

  // Step 1: Add the address (20 bytes)
  let encoded = BigInt(addr);
  encoded = encoded << 96n;

  // Step 2: Add the 0 byte in the 21st position (already 0, so no need to set it)

  // Step 3: Add the string (11 bytes max)
  const strBytes = ethers.toUtf8Bytes(str);
  for (let i = 0; i < strBytes.length; i++) {
    encoded |= BigInt(strBytes[i]) << BigInt(8 * (10 - i));
  }

  return ethers.zeroPadValue(ethers.toBeHex(encoded), 32);
}

function efficientHash(a: string, b: string): string {
  return ethers.keccak256(ethers.concat([a, b]));
}
