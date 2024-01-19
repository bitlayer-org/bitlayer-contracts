import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-solpp";

const prodConfig = {
  Mainnet: true,
}

const devConfig = {
  Mainnet: false,
}

const contractDefs: { [key: string]: object } = {
  mainnet: prodConfig,
  devnet: devConfig
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  solpp: {
    defs: contractDefs[process.env.NET]
  },
};

export default config;
