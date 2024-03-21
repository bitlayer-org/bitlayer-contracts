import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import  getPermitSignature from "./signPermit";
const hre = require("hardhat");
describe("TokenFactory", function () {

  async function deployer() {
    const [owner, admin1, admin2, player1, player2] = await ethers.getSigners();

    const tfactory = await ethers.deployContract('TokenFactory', [owner.address, [admin1.address]])
    await tfactory.waitForDeployment();

    return { tfactory, owner, admin1, admin2, player1, player2};
  }

  it("deploy & mint erc20", async function () {
    const { owner, player2, tfactory, player1, admin1 } = await loadFixture(deployer);
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

    const block = await hre.ethers.provider.send("eth_getBlockByNumber", ['latest', false])
  
    
    const deadline =  block.timestamp;
    const value = 100;

    const ddl0 = deadline + 600;
    var signature = await getPermitSignature(owner,erc20,player1.address,value.toString(),ddl0.toString())
        

    await expect(erc20.connect(player2).permit(
      owner.address,
      player1.address,
      value,        
      ddl0,
      signature.v, 
      signature.r, 
      signature.s
    )).to.not.be.reverted;

    const allowance = await erc20.allowance(owner.address,player1.address);
    expect(allowance).to.be.equal(100);

    const ddl = deadline - 7000;

    var signature = await getPermitSignature(owner,erc20,player1.address,value.toString(),ddl.toString())
    await expect(erc20.connect(player2).permit(
      owner.address,
      player1.address,
      value,
      ddl,
      signature.v, 
      signature.r, 
      signature.s
    )).to.be.revertedWith("ERC20Permit: expired deadline");

    const ddl1 = deadline + 700;
    var signature = await getPermitSignature(owner,erc20,player1.address,value.toString(),ddl1.toString())

    await expect(erc20.connect(player2).permit(
      player2.address,
      player1.address,
      value,
      ddl1,
      signature.v, 
      signature.r, 
      signature.s
    )).to.be.revertedWith("ERC20Permit: invalid signature");
  });

  it("transfer ownership", async function() {
    const { tfactory,owner, player1, admin1, admin2 } = await loadFixture(deployer);
    const AdminRole = await tfactory.AdminRole();

    await expect(
      tfactory.connect(player1).grantRole(AdminRole, admin2.address)
    ).to.reverted;

    await tfactory.connect(owner).transferOwnership(player1.address);

    await expect(
      tfactory.connect(owner).grantRole(AdminRole, admin2.address)
    ).to.reverted;

    await tfactory.connect(player1).grantRole(AdminRole, admin2.address)

    expect(
      await tfactory.hasRole(AdminRole, admin2.address)
    ).to.be.true;
  });
});
