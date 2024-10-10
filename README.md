# Interchain Warp Routes Deployer

This repo contains a Hardhat script that can be used for deploying a set of Hyperlane Warp Routes executing a single
transaction in only one chain by reading the resulting `warp-route-deployment.yaml` file generated with Hyperlane CLI
`hyperlane warp init` command, created as a POC for solving
https://github.com/hyperlane-xyz/hyperlane-monorepo/issues/3498

The solution makes use of Hyperlane `InterchainAccountRouter` for sending the routes creation tx's to the destination
chains and `CreateX` for precomputing resulting addresses and deploying.

They say a picture is worth a thousand words, so I'll try to explain the whole process with the following:

![the process](/imgs/interchain-warp-deploy.png)

## How to use it

-   Install dependencies

```bash
npm install
```

-   Set required Hardhat configuration variables

`PK` deployer's private key

```bash
npx hardhat vars set PK
```

`ALCHEMY_API_KEY` your Alchemy API KEY

```bash
npx hardhat vars set ALCHEMY_API_KEY
```

-   Run the script After running Hyperlane CLI `hyperlane warp init` command copy the resulting
    `warp-route-deployment.yaml` file into the `configs` folder.

I you are going to deploy some `synthetic` routes you need to add `decimals`, `name`, `symbol` and `totalSupply`
attributes in the configuration file since Hyperlane CLI doesn't do it.

```bash
npm run warpDeploy -- --admin PROXY_ADMIN_ADDRESS --routersalt SOME_SALT_FOR_ROUTER_IMPL --proxysalt SOME_SALT_FOR_ROUTER_PROXY
```

There are some required params you need:

-   `PROXY_ADMIN_ADDRESS` The warp routes are deployed using `TransparentUpgradeableProxy` so you need to set its admin
    address.

-   `SOME_SALT_FOR_ROUTER_IMPL` A single use salt for deploying the router implementation. Max 11 characters

-   `SOME_SALT_FOR_ROUTER_PROXY` A single use salt for deploying the router proxy. Max 11 characters

## Limitations

This solution is a POC so it contains several limitation:

### Networks

It only supports the following testnets

-   Base Sepolia
-   Optimism Sepolia
-   Arbitrum Sepolia
-   Sepolia

### Warp Routes Types

It only supports `Synthetix` and `Collateral` warp routes.

### Gas payment

Gas payment is calculated using a 2456224 as gas limit.

### Audits

The solution make use of some smart contracts that were not audited.

### Verification

The solution does not provide a way to verify the created smart contracts. Using
`npx hardhat verify --network NETWORK_NAME CONTRACT_ADDRESS CONSTRUCTOR_PARAMS` should work.

### Status checking

It does't check the status of the messages. But at the end it prints some useful information, like `messageId` of all
`InterchainAccountRouter` calls that you can use on https://explorer.hyperlane.xyz

### Config file results

It doesn't write results to the configuration files.

### Technical debts

Like every good peace of software it contains technical debts
