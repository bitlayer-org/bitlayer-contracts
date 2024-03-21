import { ethers, network } from "hardhat";
import { ERC20Permit } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

async function getPermitSignature(
  signer: SignerWithAddress,
  token: ERC20Permit,
  spender: string,
  value: string,
  deadline: string
) {
  const [nonce, name, version, chainId] = await Promise.all([
    token.nonces(signer.address),
    token.name(),
    "1",
    network.config.chainId,
  ]);
  const signature = await signer.signTypedData(
    {
      name,
      version,
      chainId,
      verifyingContract: await token.getAddress(),
    },
    {
      Permit: [
        {
          name: "owner",
          type: "address",
        },
        {
          name: "spender",
          type: "address",
        },
        {
          name: "value",
          type: "uint256",
        },
        {
          name: "nonce",
          type: "uint256",
        },
        {
          name: "deadline",
          type: "uint256",
        },
      ],
    },
    {
      owner: signer.address,
      spender,
      value,
      nonce,
      deadline,
    }
  );
  const splitSig = ethers.Signature.from(signature)
  return splitSig;
}


export default getPermitSignature;