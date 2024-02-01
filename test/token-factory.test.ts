import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("TokenFactory", function () {

  async function deployer() {
    const [owner, admin1, admin2, player1, player2] = await ethers.getSigners();

    const tfactory = await ethers.deployContract('TokenFactory', [owner.address, [admin1.address]])
    await tfactory.waitForDeployment();

    return { tfactory, owner, admin1, admin2, player1, player2};
  }

  it("deploy & mint erc20", async function () {
    const { tfactory, player1, admin1 } = await loadFixture(deployer);
    const name = "Test USDT";
    const symbol = "TUSDT";
    const decimal = 6;

    const account = await tfactory.getTokenAddress(name, symbol, decimal);
    await expect(
      tfactory.connect(admin1).createErc20Token(name, symbol, decimal)
    ).to.emit(tfactory, "TokenDeployed")
    .withArgs(symbol, account);

    await expect(
      tfactory.connect(admin1).createErc20Token(name, symbol, decimal)
    ).to.revertedWith('symbol deployed already');

    const accounts = await tfactory.getDeployedTokens(0, 10);
    expect(accounts[0].account).to.equal(account);

    const erc20 = await ethers.getContractAt('CustomERC20', account);
    const balanceBefore = await erc20.balanceOf(player1.address);

    const mintAmount = ethers.parseUnits("125", decimal);
    await tfactory.connect(admin1).mintTo(symbol, player1.address, mintAmount);

    const balanceAfter = await erc20.balanceOf(player1.address);
    expect(balanceAfter - balanceBefore).to.equal(mintAmount);
  });

});
