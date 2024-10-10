import path from "path";
import { promises as fsp } from "fs";
import { parse as yamlParse } from "yaml";
import { WarpRouteDeployConfig } from "@hyperlane-xyz/sdk";

import { OwnableMulticallFactory, InterchainAccountRouter, ICreateX } from "../../types";
import { CallLib } from "../../types/contracts/OwnableMulticallFactory";

import registry from "../../configs/registry.json";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "ethers";

export const chainIds = {
    optimismsepolia: 11155420,
    basesepolia: 84532,
    arbitrumsepolia: 421614,
    sepolia: 11155111,
};

export const chainNames = {
    11155420: "optimismsepolia",
    84532: "basesepolia",
    421614: "arbitrumsepolia",
    11155111: "sepolia",
};

export const getWarpDeployConfig = async (): Promise<WarpRouteDeployConfig> => {
    let configYAML = await fsp.readFile(path.resolve(__dirname, "../../configs/warp-route-deployment.yaml"), {
        encoding: "utf8",
    });

    return yamlParse(configYAML) as WarpRouteDeployConfig;
};

type Contracts = {
    multicallFactoryContract: OwnableMulticallFactory;
    localRouterContract: InterchainAccountRouter;
    createXContract: ICreateX;
};

export const getContracts = async (
    hre: HardhatRuntimeEnvironment,
    deployer: HardhatEthersSigner,
): Promise<Contracts> => {
    if (!hre.network.config.chainId) throw new Error("Chain ID not found in network config");
    const localChainId: keyof typeof registry = hre.network.config.chainId.toString() as keyof typeof registry;

    const [multicallFactoryContract, localRouterContract, createXContract] = await Promise.all([
        hre.ethers.getContractAt(
            "OwnableMulticallFactory",
            registry[localChainId as keyof typeof registry].multicallFactory,
            deployer,
        ),
        hre.ethers.getContractAt(
            "InterchainAccountRouter",
            registry[localChainId as keyof typeof registry].interchainAccountRouter,
            deployer,
        ),
        hre.ethers.getContractAt("ICreateX", registry[localChainId as keyof typeof registry].createX, deployer),
    ]);

    return {
        multicallFactoryContract,
        localRouterContract,
        createXContract,
    };
};

export const parseDispatchIdEvent = async (receipt: ethers.TransactionReceipt): Promise<any> => {
    // Define the event fragment for the DispatchId event
    const eventFragment = new ethers.Interface([
        "event GasPayment(bytes32 indexed messageId, uint32 indexed destinationDomain, uint256 gasAmount, uint256 payment)",
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
                    payment: parsedLog.args.payment,
                };
            }
        } catch (error) {
            // The log doesn't match the DispatchId event, skip it
        }
    }

    return messagesData;
};

export function addressToBytes32(addr: string): string {
    return ethers.zeroPadValue(addr, 32);
}

export function encodeSalt(addr: string, str: string): string {
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

export function efficientHash(a: string, b: string): string {
    return ethers.keccak256(ethers.concat([a, b]));
}

export async function createWarpRouterCall(
    hre: HardhatRuntimeEnvironment,
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
    routerAddressesB32: string[],
): Promise<CallLib.CallStruct[]> {
    const TransparentUpgradeableProxyArtifact = await hre.ethers.getContractFactory("TransparentUpgradeableProxy");

    let warpRouterByteCode: string;
    let routerConstructorArgs: string;
    let routerInitCall: string;
    let enrollRoutersCall: string;

    if (config[chainName].type == "collateral") {
        const HypERC20CollateralArtifact = await hre.ethers.getContractFactory("HypERC20Collateral");
        const warpRouterCreationCode = await HypERC20CollateralArtifact.bytecode;
        // Encode the proxy constructor arguments
        routerConstructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address"],
            [config[chainName].token, config[chainName].mailbox],
        );

        warpRouterByteCode = hre.ethers.concat([warpRouterCreationCode, routerConstructorArgs]);

        routerInitCall = HypERC20CollateralArtifact.interface.encodeFunctionData(
            "initialize(address,address,address)",
            [
                hre.ethers.ZeroAddress, // use default ISM
                hre.ethers.ZeroAddress, // use default Hook
                owner,
            ],
        );

        enrollRoutersCall = HypERC20CollateralArtifact.interface.encodeFunctionData("enrollRemoteRouters", [
            domains,
            routerAddressesB32,
        ]);
    } else {
        // synthetic
        const HypERC20Artifact = await hre.ethers.getContractFactory("HypERC20");
        const warpRouterCreationCode = await HypERC20Artifact.bytecode;
        // Encode the proxy constructor arguments
        routerConstructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint8", "address"],
            [config[chainName].decimals, config[chainName].mailbox],
        );

        warpRouterByteCode = hre.ethers.concat([warpRouterCreationCode, routerConstructorArgs]);

        routerInitCall = HypERC20Artifact.interface.encodeFunctionData(
            "initialize(uint256,string,string,address,address,address)",
            [
                config[chainName].totalSupply,
                config[chainName].name,
                config[chainName].symbol,
                hre.ethers.ZeroAddress, // use default ISM
                hre.ethers.ZeroAddress, // use default Hook
                owner,
            ],
        );

        enrollRoutersCall = HypERC20Artifact.interface.encodeFunctionData("enrollRemoteRouters", [
            domains,
            routerAddressesB32,
        ]);
    }

    const proxyCreationCode = TransparentUpgradeableProxyArtifact.bytecode;
    const proxyConstructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "bytes"],
        [
            routerAddress, // pre computed router implementation address
            admin,
            "0x",
        ],
    );

    const proxyByteCode = hre.ethers.concat([proxyCreationCode, proxyConstructorArgs]);

    return [
        {
            // deploy router implementation
            to: ethers.zeroPadValue(await createXContract.getAddress(), 32),
            value: 0,
            data: createXContract.interface.encodeFunctionData("deployCreate3(bytes32,bytes)", [
                routerSalt,
                warpRouterByteCode,
            ]),
        },
        {
            // deploy TransparentUpgradeableProxy using router implementation
            to: ethers.zeroPadValue(await createXContract.getAddress(), 32),
            value: 0,
            data: createXContract.interface.encodeFunctionData("deployCreate3(bytes32,bytes)", [
                proxySalt,
                proxyByteCode,
            ]),
        },
        {
            // initialize router
            to: ethers.zeroPadValue(proxyAddress, 32),
            value: 0,
            data: routerInitCall,
        },
        {
            // enroll remote routers
            to: ethers.zeroPadValue(proxyAddress, 32),
            value: 0,
            data: enrollRoutersCall,
        },
    ];
}

export function overrideGasLimit(gasLimit: number, refundAddress: string): string {
    return ethers.solidityPacked(
        ["uint16", "uint256", "uint256", "address", "bytes"],
        [
            1, // VARIANT
            0, // _msgValue
            gasLimit, // _gasLimit
            refundAddress, // _refundAddress
            "0x", // _customMetadata
        ],
    );
}

export function showResults(
    chainName: string,
    icaAddress: string,
    routerAddress: string,
    proxyAddress: string,
    messageData: any = null,
) {
    if (!messageData) {
        console.log(
            `
      ${chainName}:
        ICA Address: ${icaAddress}
        Router Implementation: ${routerAddress}
        Router Proxy: ${proxyAddress}
      `,
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
      `,
        );
    }
}
