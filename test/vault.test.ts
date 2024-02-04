import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Vault", function () {

  async function deployer() {
    const [owner, admin1, admin2, player1, player2] = await ethers.getSigners();

    const vault = await ethers.deployContract('Vault', [owner.address, [admin1.address]])
    await vault.waitForDeployment();

    return { vault, owner, admin1, admin2, player1, player2};
  }

  it("deposit over max deposit", async function () {
    const { vault, owner, admin1 } = await loadFixture(deployer);
    const BalaneNeed = ethers.parseEther('22000000');
    const MaxDeposit = ethers.parseEther('21000000');
    await ethers.provider.send("hardhat_setBalance", [
      admin1.address,
      '0x'+ BalaneNeed.toString(16),
    ]);

    await admin1.sendTransaction({ to: vault.target,  value: MaxDeposit});

    await expect(admin1.sendTransaction({ to: vault.target,  value: ethers.parseEther('1.0')}))
      .to.revertedWith('over max deposit')
  });

  it("add & remove whitelist", async function () {
    const { vault, owner, admin1, player1, player2 } = await loadFixture(deployer);

    await admin1.sendTransaction({ to: vault.target,  value: ethers.parseEther('100')});

    await vault.connect(admin1).addWhitelist([player1.address]);

    await expect(
      vault.connect(admin1).releaseTreasure(player2.address, ethers.parseEther('200'))
    ).to.revertedWith('receiver not whitelist');

    await expect(
      vault.connect(admin1).releaseTreasure(player1.address, ethers.parseEther('200'))
    ).to.revertedWith('not enougt balance');

    const balanceBefore = await ethers.provider.getBalance(player1.address);
    await vault.connect(admin1).releaseTreasure(player1.address, ethers.parseEther('50'))
    const balanceAfter = await ethers.provider.getBalance(player1.address);

    expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther('50'));

    await vault.connect(admin1).removeWhitelist([player1.address]);
    await expect(
      vault.connect(admin1).releaseTreasure(player1.address, ethers.parseEther('50'))
    ).to.revertedWith('receiver not whitelist');

  });

  it("grant and remove admin", async function () {
    const { vault, owner, admin1, admin2, player1, player2 } = await loadFixture(deployer);
    const AdminRole = await vault.AdminRole();
    await expect(
      vault.connect(admin1).grantRole(AdminRole, admin2.address)
    ).to.reverted;

    await vault.connect(owner).grantRole(AdminRole, admin2.address);

    await admin1.sendTransaction({ to: vault.target,  value: ethers.parseEther('100')});
    await vault.connect(admin2).addWhitelist([player1.address]);

    await vault.connect(owner).revokeRole(AdminRole, admin2.address);
    await expect(
      vault.connect(admin2).removeWhitelist([player1.address])
    ).to.reverted;
  });

  it("transfer ownership", async function() {
    const { vault, owner, admin1, admin2, player1, player2 } = await loadFixture(deployer);
    const AdminRole = await vault.AdminRole();

    await expect(
      vault.connect(player1).grantRole(AdminRole, admin2.address)
    ).to.reverted;

    await vault.connect(owner).transferOwnership(player1.address);

    await expect(
      vault.connect(owner).grantRole(AdminRole, admin2.address)
    ).to.reverted;

    await vault.connect(player1).grantRole(AdminRole, admin2.address)

    expect(
      await vault.hasRole(AdminRole, admin2.address)
    ).to.be.true;
  })
});
