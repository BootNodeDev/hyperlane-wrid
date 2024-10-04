/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Interface, type ContractRunner } from "ethers";
import type {
  IMessageRecipient,
  IMessageRecipientInterface,
} from "../../../../../@hyperlane-xyz/core/contracts/interfaces/IMessageRecipient";

const _abi = [
  {
    inputs: [
      {
        internalType: "uint32",
        name: "_origin",
        type: "uint32",
      },
      {
        internalType: "bytes32",
        name: "_sender",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "_message",
        type: "bytes",
      },
    ],
    name: "handle",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

export class IMessageRecipient__factory {
  static readonly abi = _abi;
  static createInterface(): IMessageRecipientInterface {
    return new Interface(_abi) as IMessageRecipientInterface;
  }
  static connect(
    address: string,
    runner?: ContractRunner | null
  ): IMessageRecipient {
    return new Contract(address, _abi, runner) as unknown as IMessageRecipient;
  }
}
