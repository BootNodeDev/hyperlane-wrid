import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MulticallFactory", (m) => {
    const factory = m.contract("OwnableMulticallFactory", []);

    return { factory };
});
