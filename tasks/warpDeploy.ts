import { task } from "hardhat/config";
import registry from "../configs/registry.json";
import { ethers } from "ethers";
import type { TaskArguments } from "hardhat/types";
import { WarpRouteDeployConfig } from "@hyperlane-xyz/sdk";
import { CallLib } from "../types/contracts/OwnableMulticallFactory";

import {
    chainIds,
    chainNames,
    getWarpDeployConfig,
    getContracts,
    encodeSalt,
    efficientHash,
    createWarpRouterCall,
    addressToBytes32,
    overrideGasLimit,
    parseDispatchIdEvent,
    showResults,
    getHyperlaneRegistry
} from "./utils";

task("warpDeploy", "Deploy multiple warp routes from a single chain")
    .addParam("admin", "Address of the proxies admin")
    .addParam("routersalt", "Salt for deploying the router implementation")
    .addParam("proxysalt", "Salto for deploying the router proxy")
    .setAction(async function (taskArguments: TaskArguments, hre) {
        const config: WarpRouteDeployConfig = await getWarpDeployConfig();
        const accounts = await hre.ethers.getSigners();
        const deployer = accounts[0];
        const deployerAddress = deployer.address;

        if (!hre.network.config.chainId) throw new Error("Chain ID not found in network config");

        const localChainId: string = hre.network.config.chainId.toString();

        const { multicallFactoryContract, localRouterContract, createXContract } = await getContracts(hre, deployer);

        const deployerMulticallAddress = await multicallFactoryContract.getMulticallAddress(deployerAddress);

        console.log("Deployer's Multicall address:", deployerMulticallAddress);

        const remoteChainsNames = Object.keys(config).filter(
            (e) => e != chainNames[parseInt(localChainId) as keyof typeof chainNames],
        );

        const remoteICAAddresses = await Promise.all(
            Object.keys(config)
                .map((key: string) => chainIds[key as keyof typeof chainIds])
                .filter((e) => e != parseInt(localChainId))
                .map((id: number) => {
                    return localRouterContract["getRemoteInterchainAccount(uint32,address)"](
                        id,
                        deployerMulticallAddress,
                    );
                }),
        );

        const salts = remoteICAAddresses.map((addr: string) => {
            const routerSalt = encodeSalt(addr, taskArguments.routersalt);
            const routerGuardedSalt = efficientHash(ethers.zeroPadValue(addr, 32), routerSalt);
            const proxySalt = encodeSalt(addr, taskArguments.proxysalt);
            const proxyGuardedSalt = efficientHash(ethers.zeroPadValue(addr, 32), proxySalt);
            return { routerSalt, routerGuardedSalt, proxySalt, proxyGuardedSalt };
        });

        const localRouterSalt = encodeSalt(deployerMulticallAddress, taskArguments.routersalt);
        const localGuardedSalt = efficientHash(ethers.zeroPadValue(deployerMulticallAddress, 32), localRouterSalt);
        const localProxySalt = encodeSalt(deployerMulticallAddress, taskArguments.proxysalt);
        const localProxyGuardedSalt = efficientHash(ethers.zeroPadValue(deployerMulticallAddress, 32), localProxySalt);

        const localWarpRouteAddress = await createXContract["computeCreate3Address(bytes32)"](localGuardedSalt);
        const localWarpProxyAddress = await createXContract["computeCreate3Address(bytes32)"](localProxyGuardedSalt);

        const remoteWarpRouteAddresses = await Promise.all(
            salts.map((salt: { routerGuardedSalt: string }) => {
                return createXContract["computeCreate3Address(bytes32)"](salt.routerGuardedSalt);
            }),
        );
        const remoteWarpProxyAddresses = await Promise.all(
            salts.map((salt: { proxyGuardedSalt: string }) => {
                return createXContract["computeCreate3Address(bytes32)"](salt.proxyGuardedSalt);
            }),
        );

        const dataByChain = remoteChainsNames.reduce((acc: any, chainName: string, index: number) => {
            return {
                ...acc,
                [chainName]: {
                    icaAddress: remoteICAAddresses[index],
                    routerSalt: salts[index].routerSalt,
                    proxySalt: salts[index].proxySalt,
                    routerAddress: remoteWarpRouteAddresses[index],
                    proxyAddress: remoteWarpProxyAddresses[index],
                    config: config[chainName],
                },
            };
        }, {});

        const domains = Object.keys(config).map((key: string) => chainIds[key as keyof typeof chainIds]);
        const routerAddressesB32 = [
            ethers.zeroPadValue(localWarpProxyAddress, 32),
            ...remoteWarpProxyAddresses.map((addr: string) => ethers.zeroPadValue(addr, 32)),
        ];

        let calls: CallLib.CallStruct[] = [];
        calls.push(
            ...(await createWarpRouterCall(
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
                routerAddressesB32,
            )),
        );

        let remoteICACalls: CallLib.CallStruct[] = await Promise.all(
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
                    routerAddressesB32,
                );

                let message = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["bytes32", "bytes32", "tuple(bytes32,uint256,bytes)[]"],
                    [
                        addressToBytes32(deployerMulticallAddress),
                        addressToBytes32(registry[localChainId as keyof typeof registry].interchainAccountIsm),
                        createCalls.map((call) => [call.to, call.value, call.data]),
                    ],
                );

                let gasPayment = await localRouterContract["quoteGasPayment(uint32,bytes,uint256)"](
                    chainIds[name as keyof typeof chainIds],
                    message,
                    2456224,
                ); // TODO - gas limit

                return {
                    to: addressToBytes32(await localRouterContract.getAddress()),
                    value: gasPayment,
                    data: localRouterContract.interface.encodeFunctionData(
                        "callRemote(uint32,(bytes32,uint256,bytes)[],bytes)",
                        [
                            chainIds[name as keyof typeof chainIds],
                            createCalls,
                            overrideGasLimit(2456224, deployerMulticallAddress),
                        ],
                    ),
                } as CallLib.CallStruct;
            }),
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
                deployer,
            );

            tx = await userMulticallContract.multicall([...calls, ...remoteICACalls], { value: totalGasPayment });
        } else {
            console.log("Multicall contract not deployed, deploying and using multicall");
            tx = await multicallFactoryContract.deployAndCall([...calls, ...remoteICACalls], {
                value: totalGasPayment,
            });
        }

        const receipt = await tx.wait();

        if (receipt) {
            console.log("Transaction receipt:", receipt.hash);
            const messagesData = await parseDispatchIdEvent(receipt);
            showResults(
                chainNames[parseInt(localChainId) as keyof typeof chainNames],
                deployerMulticallAddress,
                localWarpRouteAddress,
                localWarpProxyAddress,
            );

            for (const chainName of Object.keys(messagesData)) {
                showResults(
                    chainName,
                    dataByChain[chainName].icaAddress,
                    dataByChain[chainName].routerAddress,
                    dataByChain[chainName].proxyAddress,
                    messagesData[chainName],
                );
            }
        }
    });
