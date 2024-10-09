import { task, vars } from "hardhat/config";
import { promises as fsp } from "fs";
import { parse as yamlParse } from "yaml";
import registry from "../configs/registry.json";
import { ethers } from "ethers"

import type { TaskArguments } from "hardhat/types";

import {
  WarpRouteDeployConfig
} from '@hyperlane-xyz/sdk';

import { HardhatRuntimeEnvironment } from "hardhat/types";

import { ICreateX } from "../types";

import { CallLib } from "../types/contracts/OwnableMulticallFactory";

const chainIds = {
  "optimismsepolia": 11155420,
  "basesepolia": 84532,
  "arbitrumsepolia": 421614,
  "sepolia": 11155111
}

const chainNames = {
   11155420: "optimismsepolia",
   84532: "basesepolia",
   421614: "arbitrumsepolia",
   11155111: "sepolia"
}

task("warpDeploy", "Deploy multiple warp routes from a single chain")
.addParam("admin", "Address of the proxies admin")
.addParam("routersalt", "Salt for deploying the router implementation")
.addParam("proxysalt", "Salto for deploying the router proxy")
.setAction(async function (taskArguments: TaskArguments, hre) {
  let configYAML = await fsp.readFile("./configs/warp-route-deployment.yaml", {
    encoding: "utf8",
  });
  const config: WarpRouteDeployConfig = yamlParse(configYAML)

  const accounts = await hre.ethers.getSigners();
  const deployer = accounts[0];
  const deployerAddress = deployer.address;
  const localChainId: string = hre.network.config.chainId?.toString() || "11155420";

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

  console.log("Deployer's Multicall address:", deployerMulticallAddress);

  const remoteChainsNames = Object.keys(config).filter((e) => e != chainNames[parseInt(localChainId) as keyof typeof chainNames]);

  const remoteICAAddresses = await Promise.all(
    Object.keys(config).map((key: string) => chainIds[key as keyof typeof chainIds]).filter((e) => e != parseInt(localChainId)).map((id: number) => {
      return localRouterContract["getRemoteInterchainAccount(uint32,address)"](id, deployerMulticallAddress);
    })
  );

  const salts = remoteICAAddresses.map((addr: string) => {
    const routerSalt = encodeSalt(addr, taskArguments.routersalt);
    const routerGuardedSalt = efficientHash(ethers.zeroPadValue(addr, 32), routerSalt);
    const proxySalt = encodeSalt(addr, taskArguments.proxysalt);
    const proxyGuardedSalt = efficientHash(ethers.zeroPadValue(addr, 32), proxySalt);
    return { routerSalt, routerGuardedSalt, proxySalt, proxyGuardedSalt };
  })

  const localRouterSalt = encodeSalt(deployerMulticallAddress, taskArguments.routersalt);
  const localGuardedSalt = efficientHash(ethers.zeroPadValue(deployerMulticallAddress, 32), localRouterSalt);
  const localProxySalt = encodeSalt(deployerMulticallAddress, taskArguments.proxysalt);
  const localProxyGuardedSalt = efficientHash(ethers.zeroPadValue(deployerMulticallAddress, 32), localProxySalt);

  const localWarpRouteAddress = await createXContract["computeCreate3Address(bytes32)"](localGuardedSalt);
  const localWarpProxyAddress = await createXContract["computeCreate3Address(bytes32)"](localProxyGuardedSalt);

  const remoteWarpRouteAddresses = await Promise.all(salts.map((salt: { routerGuardedSalt: string; }) => {
    return createXContract["computeCreate3Address(bytes32)"](salt.routerGuardedSalt);
  }));
  const remoteWarpProxyAddresses = await Promise.all(salts.map((salt: { proxyGuardedSalt: string; }) => {
    return createXContract["computeCreate3Address(bytes32)"](salt.proxyGuardedSalt);
  }));

  const dataByChain = remoteChainsNames.reduce((acc: any, chainName: string, index: number) => {
    return {
      ...acc,
      [chainName]: {
        icaAddress: remoteICAAddresses[index],
        routerSalt: salts[index].routerSalt,
        proxySalt: salts[index].proxySalt,
        routerAddress: remoteWarpRouteAddresses[index],
        proxyAddress: remoteWarpProxyAddresses[index],
        config: config[chainName]
      }
    }
  }, {});


  const domains = Object.keys(config).map((key: string) => chainIds[key as keyof typeof chainIds]);
  const routerAddressesB32 = [ ethers.zeroPadValue(localWarpProxyAddress, 32), ...remoteWarpProxyAddresses.map((addr: string) => ethers.zeroPadValue(addr, 32)) ];

  let calls: CallLib.CallStruct[] = [];
  calls.push(
    ...await createWarpRouterCall(
      hre,
      createXContract,
      localWarpRouteAddress,
      localWarpProxyAddress,
      config,
      chainNames[parseInt(localChainId) as keyof typeof chainNames],
      localRouterSalt,
      localProxySalt,
      taskArguments.admin,
      deployerMulticallAddress,
      domains,
      routerAddressesB32
    ));

  let remoteICACalls: CallLib.CallStruct[] =
    await Promise.all(
      Object.keys(dataByChain).map(async (name: string) => {
        let data = dataByChain[name];
        let createCalls: CallLib.CallStruct[] = await createWarpRouterCall(
          hre,
          createXContract,
          data.routerAddress,
          data.proxyAddress,
          config,
          name,
          data.routerSalt,
          data.proxySalt,
          taskArguments.admin,
          data.icaAddress,
          domains,
          routerAddressesB32
        )

        let message = ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "bytes32", "tuple(bytes32,uint256,bytes)[]"],
          [
            addressToBytes32(deployerMulticallAddress),
            addressToBytes32(registry[localChainId as keyof typeof registry].interchainAccountIsm),
            createCalls.map(call => [call.to, call.value, call.data])
          ]
        );

        let gasPayment = await localRouterContract["quoteGasPayment(uint32,bytes,uint256)"](chainIds[name as keyof typeof chainIds], message, 2456224); // TODO - gas limit

        return {
          to: addressToBytes32(await localRouterContract.getAddress()),
          value: gasPayment,
          data: localRouterContract.interface.encodeFunctionData(
            "callRemote(uint32,(bytes32,uint256,bytes)[],bytes)",
            [
              chainIds[name as keyof typeof chainIds],
              createCalls,
              overrideGasLimit(2456224, deployerMulticallAddress)
            ]
          )
        } as CallLib.CallStruct;
      })
    );

    let totalGasPayment = remoteICACalls.reduce((acc: bigint, call: CallLib.CallStruct) => {
      return acc + ethers.toBigInt(call.value);
    }, 0n);

    let tx;
    const multicallCode = await hre.ethers.provider.getCode(deployerMulticallAddress);

    if (multicallCode != "0x") {
      console.log("Multicall contract already deployed, using multicall");
      const userMulticallContract = await hre.ethers.getContractAt(
        "TransferrableOwnableMulticall",
        deployerMulticallAddress,
        deployer
      );

      tx = await userMulticallContract.multicall([...calls, ...remoteICACalls], { value: totalGasPayment });
    } else {
      console.log("Multicall contract not deployed, deploying and using multicall");
      tx = await multicallFactoryContract.deployAndCall([...calls, ...remoteICACalls], { value: totalGasPayment });
    }

    const receipt = await tx.wait();

    if (receipt) {
      console.log("Transaction receipt:", receipt.hash);
      const messagesData = await parseDispatchIdEvent(receipt);
      showResults(chainNames[parseInt(localChainId) as keyof typeof chainNames], deployerMulticallAddress, localWarpRouteAddress, localWarpProxyAddress);

      for (const chainName of Object.keys(messagesData)) {
        showResults(chainName, dataByChain[chainName].icaAddress, dataByChain[chainName].routerAddress, dataByChain[chainName].proxyAddress, messagesData[chainName]);
      }
    }
});

async function parseDispatchIdEvent(receipt: ethers.TransactionReceipt): Promise<any> {
  // Define the event fragment for the DispatchId event
  const eventFragment = new ethers.Interface([
    "event GasPayment(bytes32 indexed messageId, uint32 indexed destinationDomain, uint256 gasAmount, uint256 payment)"
  ]);

  let messagesData: any = {};

  for (const log of receipt.logs) {
    try {
      // Attempt to parse the log using the event fragment
      const parsedLog = eventFragment.parseLog(log);

      // Check if the event name matches GasPayment
      if (parsedLog?.name === "GasPayment") {
        const destinationChainName = chainNames[parsedLog.args.destinationDomain as keyof typeof chainNames];
        messagesData[destinationChainName] = {
          messageId: parsedLog.args.messageId,
          destinationDomain: parsedLog.args.destinationDomain,
          gasAmount: parsedLog.args.gasAmount,
          payment: parsedLog.args.payment
        }
      }
    } catch (error) {
      // The log doesn't match the DispatchId event, skip it
    }
  }

  return messagesData;
}

function addressToBytes32(addr: string): string {
  return ethers.zeroPadValue(addr, 32)
}

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

async function createWarpRouterCall(
  hre:  HardhatRuntimeEnvironment,
  createXContract: ICreateX,
  routerAddress: string,
  proxyAddress: string,
  config: WarpRouteDeployConfig,
  chainName: string,
  routerSalt: string,
  proxySalt: string,
  admin: string,
  owner: string,
  domains: number[],
  routerAddressesB32: string[]
): Promise<CallLib.CallStruct[]> {

  const TransparentUpgradeableProxyArtifact = await hre.ethers.getContractFactory("TransparentUpgradeableProxy");

  let warpRouterByteCode: string;
  let routerConstructorArgs: string;
  let routerInitCall: string;
  let enrollRoutersCall: string;

  if (config[chainName].type == "collateral") {
    const HypERC20CollateralArtifact = await hre.ethers.getContractFactory("HypERC20Collateral");
    const warpRouterCreationCode = await HypERC20CollateralArtifact.bytecode
    // Encode the proxy constructor arguments
    routerConstructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address'],
      [
        config[chainName].token,
        config[chainName].mailbox
      ]
    );

    warpRouterByteCode = hre.ethers.concat([
      warpRouterCreationCode,
      routerConstructorArgs
    ]);

    routerInitCall = HypERC20CollateralArtifact.interface.encodeFunctionData("initialize(address,address,address)", [
      hre.ethers.ZeroAddress, // use default ISM
      hre.ethers.ZeroAddress, // use default Hook
      owner
    ]);

    enrollRoutersCall = HypERC20CollateralArtifact.interface.encodeFunctionData("enrollRemoteRouters", [
      domains, routerAddressesB32
    ]);
  } else {// synthetic
    const HypERC20Artifact = await hre.ethers.getContractFactory("HypERC20");
    const warpRouterCreationCode = await HypERC20Artifact.bytecode
    // Encode the proxy constructor arguments
    routerConstructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint8', 'address'],
      [
        config[chainName].decimals,
        config[chainName].mailbox
      ]
    );

    warpRouterByteCode = hre.ethers.concat([
      warpRouterCreationCode,
      routerConstructorArgs
    ]);

    routerInitCall = HypERC20Artifact.interface.encodeFunctionData("initialize(uint256,string,string,address,address,address)", [
      config[chainName].totalSupply,
      config[chainName].name,
      config[chainName].symbol,
      hre.ethers.ZeroAddress, // use default ISM
      hre.ethers.ZeroAddress, // use default Hook
      owner
    ]);

    enrollRoutersCall = HypERC20Artifact.interface.encodeFunctionData("enrollRemoteRouters", [
      domains, routerAddressesB32
    ]);
  }

  const proxyCreationCode = TransparentUpgradeableProxyArtifact.bytecode;
  const proxyConstructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'bytes'],
    [
      routerAddress, // pre computed router implementation address
      admin,
      "0x"
    ]
  );

  const proxyByteCode = hre.ethers.concat([proxyCreationCode, proxyConstructorArgs]);

  return [
    { // deploy router implementation
      to: ethers.zeroPadValue(await createXContract.getAddress(), 32),
      value: 0,
      data: createXContract.interface.encodeFunctionData("deployCreate3(bytes32,bytes)", [routerSalt, warpRouterByteCode])
    },
    { // deploy TransparentUpgradeableProxy using router implementation
      to: ethers.zeroPadValue(await createXContract.getAddress(), 32),
      value: 0,
      data: createXContract.interface.encodeFunctionData("deployCreate3(bytes32,bytes)", [proxySalt, proxyByteCode])
    },
    { // initialize router
      to: ethers.zeroPadValue(proxyAddress, 32),
      value: 0,
      data: routerInitCall
    },
    { // enroll remote routers
      to: ethers.zeroPadValue(proxyAddress, 32),
      value: 0,
      data: enrollRoutersCall
    }
  ]
}

function overrideGasLimit(gasLimit: number, refundAddress: string): string {
  return ethers.solidityPacked(["uint16", "uint256", "uint256", "address", "bytes"], [
    1, // VARIANT
    0, // _msgValue
    gasLimit,// _gasLimit
    refundAddress, // _refundAddress
    "0x"// _customMetadata
  ])
}

function showResults(chainName: string, icaAddress: string, routerAddress: string, proxyAddress: string, messageData: any = null) {
  if (!messageData) {
    console.log(
      `
      ${chainName}:
        ICA Address: ${icaAddress}
        Router Implementation: ${routerAddress}
        Router Proxy: ${proxyAddress}
      `
    );
  } else {
    console.log(
      `
      ${chainName}:
        ICA Address: ${icaAddress}
        Router Implementation: ${routerAddress}
        Router Proxy: ${proxyAddress}
        Message data:
          messageId: ${messageData.messageId}
          gasAmount: ${messageData.gasAmount}
          payment: ${messageData.payment}
      `
    );
  }
}
