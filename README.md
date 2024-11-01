# Warp Routes Interchain Deployer

This repo contains a Hardhat script that can be used for deploying a set of Hyperlane Warp Routes executing a single
transaction in only one chain by reading the resulting `warp-route-deployment.yaml` file generated with Hyperlane CLI
`hyperlane warp init` command. It was created as a POC for solving
https://github.com/hyperlane-xyz/hyperlane-monorepo/issues/3498

The solution makes use of Hyperlane `InterchainAccountRouter` for sending the routes creation tx's to the destination
chains and `CreateX` for precomputing resulting addresses and deploying.

They say a picture is worth a thousand words, so I'll try to explain the whole process with the following:

![the process](/imgs/interchain-warp-deploy.png)

## How to use it

1.  Install dependencies

```bash
npm install
```

2.  Set required Hardhat configuration variables

`PK` deployer's private key

```bash
npx hardhat vars set PK
```

`ALCHEMY_API_KEY` your Alchemy API KEY

```bash
npx hardhat vars set ALCHEMY_API_KEY
```

3.  Run the script

After running Hyperlane CLI `hyperlane warp init` command copy the resulting `warp-route-deployment.yaml` file into the
`configs` folder.

If you are going to deploy some `synthetic` routes you need to add `decimals`, `name`, `symbol` and `totalSupply`
attributes in the configuration file since Hyperlane CLI doesn't do it.

```bash
npm run warpDeploy -- --network NETWORK_NAME --routersalt SOME_SALT_FOR_ROUTER_IMPL --proxyadminsalt SOME_SALT_FOR_PROXY_ADMIN --proxysalt SOME_SALT_FOR_ROUTER_PROXY
```

There are some required params you need:

-   `NETWORK_NAME` Name of the network from which the task is going to run.

-   `SOME_SALT_FOR_ROUTER_IMPL` A single use salt for deploying the router implementation. Max 11 characters address.

-   `SOME_SALT_FOR_PROXY_ADMIN` A single use salt for deploying the ProxyAdmin which will be set as the
    `TransparentUpgradeableProxy` admin. Ownership of the ProxyRouter is assigned to user ICA. Max 11 characters

-   `SOME_SALT_FOR_ROUTER_PROXY` A single use salt for deploying the router proxy. Max 11 characters

## Supported Networks

For running the task on a given network it is required the presence of 3 smart contracts, Hyperlane
[`InterchainAccountRouter`](https://docs.hyperlane.xyz/docs/reference/applications/interchain-account),
`MulticallFactory` and [`CreateX`](https://github.com/pcaversaccio/createx).

This repository already supports the following networks:

-   Base Sepolia
-   Optimism Sepolia
-   Arbitrum Sepolia
-   Sepolia

I you need to run this from a different chain you would need to make sure that [`InterchainAccountRouter`](https://github.com/hyperlane-xyz/hyperlane-registry/tree/main/chains) and [`CreateX`](https://github.com/pcaversaccio/createx/blob/main/deployments/deployments.json)
deployed and deploy a new `MulticallFactory` by following the next steps:

1. Add the network configs on the [`hardhat.config.ts`](hardhat.config.ts) file

2. Run

```bash
npm run multicallFactory -- --network YOUR_NETWORK
```

3. Add the resulting address into the [`registry.json`](configs/registry.json) file,
   like

```json
{
    ... OTHER NETWORKS,
    "YOR NETWORK ID": {
        "multicallFactory": "RESULTING ADDRESS"
    }
}
```

## Limitations

This solution is a POC so it contains several limitation:

### Warp Routes Types

It only supports `Synthetix` and `Collateral` warp routes.

### Gas payment

Gas payment is calculated using a 2456224 as gas limit.

### Audits

The solution make use of some smart contracts that were not audited.

### Verification

It does not provide a way to verify the created smart contracts. Using
`npx hardhat verify --network NETWORK_NAME CONTRACT_ADDRESS CONSTRUCTOR_PARAMS` should work.

### Status checking

It does no check the status of the messages. But at the end it prints some useful information, like `messageId` of all
`InterchainAccountRouter` calls that you can use on https://explorer.hyperlane.xyz

### Config file results

It does not write results to the configuration files.

### Technical debts

Like every good piece of software it contains technical debts.
