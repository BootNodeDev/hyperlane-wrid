import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import type { HardhatUserConfig } from "hardhat/config";
import { vars } from "hardhat/config";
import type { NetworkUserConfig } from "hardhat/types";

import "./tasks/warpDeploy";

// Run 'npx hardhat vars setup' to see the list of variables that need to be set

const pk: string = vars.get("PK");
const alchemyApiKey: string = vars.get("ALCHEMY_API_KEY");

const chainIds = {
    "opt-sepolia": 11155420,
    "base-sepolia": 84532,
    "arb-sepolia": 421614,
    "eth-sepolia": 11155111,
    hardhat: 31337,
};

function getChainConfig(chain: keyof typeof chainIds): NetworkUserConfig {
    let jsonRpcUrl: string = `https://${chain}.g.alchemy.com/v2/${alchemyApiKey}`;

    return {
        accounts: [pk],
        chainId: chainIds[chain],
        url: jsonRpcUrl,
    };
}

const config: HardhatUserConfig = {
    defaultNetwork: "hardhat",
    namedAccounts: {
        deployer: 0,
    },
    etherscan: {
        apiKey: {
            arbitrumOne: vars.get("ARBISCAN_API_KEY", ""),
            optimisticEthereum: vars.get("OPTIMISM_API_KEY", ""),
            "optimism-sepolia": vars.get("OPTIMISM_API_KEY", ""),
            base: vars.get("BASESCAN_API_KEY", ""),
            "base-sepolia": vars.get("BASESCAN_API_KEY", ""),
            sepolia: vars.get("ETHERSCAN_API_KEY", ""),
        },
        customChains: [
            {
                network: "optimism-sepolia",
                chainId: 11155420,
                urls: {
                    apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
                    browserURL: "https://sepolia-optimism.etherscan.io/",
                },
            },
            {
                network: "base-sepolia",
                chainId: 84532,
                urls: {
                    apiURL: "https://api-sepolia.basescan.org/api",
                    browserURL: "https://sepolia.basescan.org/",
                },
            },
        ],
    },
    networks: {
        hardhat: {},
        "optimism-sepolia": getChainConfig("opt-sepolia"),
        "base-sepolia": getChainConfig("base-sepolia"),
        "arbitrum-sepolia": getChainConfig("arb-sepolia"),
        sepolia: getChainConfig("eth-sepolia"),
    },
    paths: {
        artifacts: "./artifacts",
        cache: "./cache",
        sources: "./contracts",
        tests: "./test",
    },
    solidity: {
        version: "0.8.27",
        settings: {
            metadata: {
                // Not including the metadata hash
                // https://github.com/paulrberg/hardhat-template/issues/31
                bytecodeHash: "none",
            },
            // Disable the optimizer when debugging
            // https://hardhat.org/hardhat-network/#solidity-optimizer-support
            optimizer: {
                enabled: true,
                runs: 800,
            },
        },
    },
    typechain: {
        outDir: "types",
        target: "ethers-v6",
    },
};

export default config;
