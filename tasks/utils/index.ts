import path from "path";
import { promises as fsp } from "fs";
import { parse as yamlParse } from "yaml";
import { WarpRouteDeployConfig } from "@hyperlane-xyz/sdk";

import { OwnableMulticallFactory, InterchainAccountRouter, ICreateX } from "../../types";
import { CallLib } from "../../types/contracts/OwnableMulticallFactory";

import registry from "../../configs/registry.json";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import createXDeployments from "createx/deployments/deployments.json";
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

export const getWarpDeployConfig = async (hre: HardhatRuntimeEnvironment): Promise<WarpRouteDeployConfig> => {
    let configYAML = await fsp.readFile(path.resolve(__dirname, "../../configs/warp-route-deployment.yaml"), {
        encoding: "utf8",
    });

    const config = yamlParse(configYAML) as WarpRouteDeployConfig;

    return validateConfig(hre, config);
};

// Ideally this should be using Hyperlane SDK to validate the config, but it's not possible at the moment given that
// the SDK is a ESM and Hardhat is quite brittle with ESM, so this would be a very simple/rough implementation
// According to HH docs https://hardhat.org/hardhat-runner/docs/advanced/using-esm:
// You can write your scripts and tests as both CommonJS and ES modules. However, your Hardhat config, and any file
// imported by it, must be CommonJS modules.
const validateConfig = async (
    hre: HardhatRuntimeEnvironment,
    config: WarpRouteDeployConfig,
): Promise<WarpRouteDeployConfig> => {
    const entries = Object.entries(config);
    const isValid =
        entries.some(([_, config]) => config.type === "collateral") ||
        entries.every(([_, config]) => hasTokenMetadata(config));

    if (!isValid) {
        throw new Error("Config must include Native or Collateral OR all synthetics must define token metadata");
    }

    return completeConfigMetadata(hre, config);
};

const completeConfigMetadata = async (
    hre: HardhatRuntimeEnvironment,
    config: WarpRouteDeployConfig,
): Promise<WarpRouteDeployConfig> => {
    const entries = Object.entries(config);
    const collateral = entries.find(([_, config]) => config.type === "collateral");
    const synthetics = entries.filter(([_, config]) => config.type === "synthetic");

    const updatedConfig = structuredClone(config);

    if (collateral) {
        const [network, route] = collateral;

        if (!hre.network.config.chainId) throw new Error("Chain ID not found in network config");
        const localChainId: string = hre.network.config.chainId.toString();
        if (chainNames[parseInt(localChainId) as keyof typeof chainNames] !== network)
            throw new Error("Collateral should be defined for the local chain");

        let tokenAddress: string = "";
        if ("token" in route) {
            tokenAddress = route.token;
        }

        if (!tokenAddress) throw new Error("Token address is required for collateral");

        let name: string = "";
        let symbol: string = "";
        let decimals: BigInt = 0n;

        if (route.isNft) {
            const token = await hre.ethers.getContractAt("IERC721Metadata", tokenAddress);
            name = await token.name();
            symbol = await token.symbol();
        } else {
            const token = await hre.ethers.getContractAt("IERC20Metadata", tokenAddress);
            name = await token.name();
            symbol = await token.symbol();
            decimals = await token.decimals();
        }

        for (const [net, route] of synthetics) {
            if (!hasTokenMetadata(route)) {
                updatedConfig[net].name = name;
                updatedConfig[net].symbol = symbol;
                updatedConfig[net].decimals = Number(decimals);
                updatedConfig[net].totalSupply = 0;
            }
        }
    }

    return updatedConfig;
};

const hasTokenMetadata = (config: any): boolean => {
    return config.name && config.symbol && config.decimals;
};

//workaround for for using the @hyperlane-xyz/registry which is an ESM but Hardhat is quite brittle with ESM
// According to HH docs https://hardhat.org/hardhat-runner/docs/advanced/using-esm:
// You can write your scripts and tests as both CommonJS and ES modules. However, your Hardhat config, and any file
// imported by it, must be CommonJS modules.
export const getHyperlaneRegistry = async (chainName: string): Promise<any> => {
    const registry = await import(`@hyperlane-xyz/registry/chains/${chainName}/addresses.json`);

    return registry;
};

export const createXAddress = async (chainId: number): Promise<string> => {
    const isCreateXDeployed = createXDeployments.findIndex((d: any) => d.chainId == chainId);
    if (isCreateXDeployed < 0) throw new Error("CreateX not deployed on this chain");
    return "0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed";
}

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

    const hyperlaneRegistry = await getHyperlaneRegistry(
        chainNames[hre.network.config.chainId as keyof typeof chainNames],
    );

    const [multicallFactoryContract, localRouterContract, createXContract] = await Promise.all([
        hre.ethers.getContractAt(
            "OwnableMulticallFactory",
            registry[localChainId as keyof typeof registry].multicallFactory,
            deployer,
        ),
        hre.ethers.getContractAt("InterchainAccountRouter", hyperlaneRegistry.interchainAccountRouter, deployer),
        hre.ethers.getContractAt("ICreateX", await createXAddress(hre.network.config.chainId), deployer),
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
    proxyAdminAddress: string,
    proxyAddress: string,
    config: WarpRouteDeployConfig,
    chainName: string,
    routerSalt: string,
    proxyAdminSalt: string,
    proxySalt: string,
    admin: string,
    owner: string,
    domains: number[],
    routerAddressesB32: string[],
): Promise<CallLib.CallStruct[]> {
    const ProxyAdminArtifact = await hre.ethers.getContractFactory("contracts/ProxyAdmin.sol:ProxyAdmin");
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

    const proxyAdminCreationCode = ProxyAdminArtifact.bytecode;
    const proxyAdminConstructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [admin]);

    const proxyAdminByteCode = hre.ethers.concat([proxyAdminCreationCode, proxyAdminConstructorArgs]);

    const proxyCreationCode = TransparentUpgradeableProxyArtifact.bytecode;
    const proxyConstructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "bytes"],
        [
            routerAddress, // pre computed router implementation address
            proxyAdminAddress, // pre computed proxy admin address
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
            // deploy ProxyAdmin
            to: ethers.zeroPadValue(await createXContract.getAddress(), 32),
            value: 0,
            data: createXContract.interface.encodeFunctionData("deployCreate3(bytes32,bytes)", [
                proxyAdminSalt,
                proxyAdminByteCode,
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
    proxyAdminAddress: string,
    proxyAddress: string,
    messageData: any = null,
) {
    if (!messageData) {
        console.log(
            `
      ${chainName}:
        ICA Address: ${icaAddress}
        Router Implementation: ${routerAddress}
        Proxy Admin: ${proxyAdminAddress}
        Router Proxy: ${proxyAddress}
      `,
        );
    } else {
        console.log(
            `
      ${chainName}:
        ICA Address: ${icaAddress}
        Router Implementation: ${routerAddress}
        Proxy Admin: ${proxyAdminAddress}
        Router Proxy: ${proxyAddress}
        Message data:
          messageId: ${messageData.messageId}
          gasAmount: ${messageData.gasAmount}
          payment: ${messageData.payment}
      `,
        );
    }
}
