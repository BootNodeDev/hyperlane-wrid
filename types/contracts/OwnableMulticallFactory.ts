/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type {
  BaseContract,
  BigNumberish,
  BytesLike,
  FunctionFragment,
  Result,
  Interface,
  EventFragment,
  AddressLike,
  ContractRunner,
  ContractMethod,
  Listener,
} from "ethers";
import type {
  TypedContractEvent,
  TypedDeferredTopicFilter,
  TypedEventLog,
  TypedLogDescription,
  TypedListener,
  TypedContractMethod,
} from "../common";

export declare namespace CallLib {
  export type CallStruct = {
    to: BytesLike;
    value: BigNumberish;
    data: BytesLike;
  };

  export type CallStructOutput = [to: string, value: bigint, data: string] & {
    to: string;
    value: bigint;
    data: string;
  };
}

export interface OwnableMulticallFactoryInterface extends Interface {
  getFunction(
    nameOrSignature:
      | "bytecodeHash"
      | "deployAndCall"
      | "getMulticallAddress"
      | "implementation"
  ): FunctionFragment;

  getEvent(nameOrSignatureOrTopic: "MulticallCreated"): EventFragment;

  encodeFunctionData(
    functionFragment: "bytecodeHash",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "deployAndCall",
    values: [CallLib.CallStruct[]]
  ): string;
  encodeFunctionData(
    functionFragment: "getMulticallAddress",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "implementation",
    values?: undefined
  ): string;

  decodeFunctionResult(
    functionFragment: "bytecodeHash",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "deployAndCall",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getMulticallAddress",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "implementation",
    data: BytesLike
  ): Result;
}

export namespace MulticallCreatedEvent {
  export type InputTuple = [owner: AddressLike, multicall: AddressLike];
  export type OutputTuple = [owner: string, multicall: string];
  export interface OutputObject {
    owner: string;
    multicall: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export interface OwnableMulticallFactory extends BaseContract {
  connect(runner?: ContractRunner | null): OwnableMulticallFactory;
  waitForDeployment(): Promise<this>;

  interface: OwnableMulticallFactoryInterface;

  queryFilter<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TypedEventLog<TCEvent>>>;
  queryFilter<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TypedEventLog<TCEvent>>>;

  on<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    listener: TypedListener<TCEvent>
  ): Promise<this>;
  on<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    listener: TypedListener<TCEvent>
  ): Promise<this>;

  once<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    listener: TypedListener<TCEvent>
  ): Promise<this>;
  once<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    listener: TypedListener<TCEvent>
  ): Promise<this>;

  listeners<TCEvent extends TypedContractEvent>(
    event: TCEvent
  ): Promise<Array<TypedListener<TCEvent>>>;
  listeners(eventName?: string): Promise<Array<Listener>>;
  removeAllListeners<TCEvent extends TypedContractEvent>(
    event?: TCEvent
  ): Promise<this>;

  bytecodeHash: TypedContractMethod<[], [string], "view">;

  deployAndCall: TypedContractMethod<
    [_calls: CallLib.CallStruct[]],
    [[string, string[]] & { _multicall: string; returnData: string[] }],
    "payable"
  >;

  getMulticallAddress: TypedContractMethod<
    [_owner: AddressLike],
    [string],
    "view"
  >;

  implementation: TypedContractMethod<[], [string], "view">;

  getFunction<T extends ContractMethod = ContractMethod>(
    key: string | FunctionFragment
  ): T;

  getFunction(
    nameOrSignature: "bytecodeHash"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "deployAndCall"
  ): TypedContractMethod<
    [_calls: CallLib.CallStruct[]],
    [[string, string[]] & { _multicall: string; returnData: string[] }],
    "payable"
  >;
  getFunction(
    nameOrSignature: "getMulticallAddress"
  ): TypedContractMethod<[_owner: AddressLike], [string], "view">;
  getFunction(
    nameOrSignature: "implementation"
  ): TypedContractMethod<[], [string], "view">;

  getEvent(
    key: "MulticallCreated"
  ): TypedContractEvent<
    MulticallCreatedEvent.InputTuple,
    MulticallCreatedEvent.OutputTuple,
    MulticallCreatedEvent.OutputObject
  >;

  filters: {
    "MulticallCreated(address,address)": TypedContractEvent<
      MulticallCreatedEvent.InputTuple,
      MulticallCreatedEvent.OutputTuple,
      MulticallCreatedEvent.OutputObject
    >;
    MulticallCreated: TypedContractEvent<
      MulticallCreatedEvent.InputTuple,
      MulticallCreatedEvent.OutputTuple,
      MulticallCreatedEvent.OutputObject
    >;
  };
}
