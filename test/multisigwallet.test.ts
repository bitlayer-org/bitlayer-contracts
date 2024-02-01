import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { AddressLike, BytesLike} from "ethers";

interface Tx {
  to:    AddressLike;
  value: bigint;
  data:  BytesLike;
  salt:  BytesLike;
}

describe("MultiSigWallet", function () {

  async function deployer() {
    const [owner, signer1, signer2, signer3, player1] = await ethers.getSigners();

    const wallet = await ethers.deployContract('MultiSigWallet', [[signer1.address, signer2.address, signer3.address], 2])
    await wallet.waitForDeployment();

    const TUSDT = await ethers.deployContract('TestUSDT');
    await TUSDT.waitForDeployment();

    await TUSDT.mint(wallet.target, ethers.parseEther('100'));

    return { wallet, owner, signer1, signer2, signer3, player1, TUSDT};
  }

  it("start & sign & execute", async function () {
    const { wallet, owner, signer1, signer2, signer3, player1, TUSDT } = await loadFixture(deployer);

    const transferAmount = ethers.parseEther('100');
    const transferData = TUSDT.interface.encodeFunctionData('transfer', [player1.address, transferAmount]);
    const startTx: Tx = {
      to: TUSDT.target,
      value: 0n,
      data: transferData,
      salt: ethers.keccak256("0x1337")
    };

    await wallet.connect(signer1).startTx(startTx);
    const txHash = await wallet.getTxHash(startTx);
    expect(await wallet.getTxSignedCount(txHash)).to.equal(1);

    await expect(
      wallet.connect(owner).signTx(txHash)
    ).to.revertedWith("only signer");

    await expect(
      wallet.connect(signer1).signTx(txHash)
    ).to.revertedWith("already signed");

    await expect(
      wallet.connect(signer2).signTx(txHash.replace('2', '3'))
    ).to.revertedWith("tx not exist");

    await expect(
      wallet.connect(owner).execute(txHash)
    ).to.revertedWith("not enough signed");

    await wallet.connect(signer2).signTx(txHash);

    const balanceBefore = await TUSDT.balanceOf(player1.address);
    await wallet.execute(txHash);
    const balanceAfter = await TUSDT.balanceOf(player1.address);
    expect(balanceAfter - balanceBefore).to.equal(transferAmount);

    await expect(
      wallet.connect(signer3).signTx(txHash)
    ).to.revertedWith("tx finished");

    await expect(
      wallet.connect(player1).execute(txHash)
    ).to.revertedWith("tx finished");
  });

  it("execute failed & finished", async function () {
    const { wallet, owner, signer1, signer2, signer3, player1, TUSDT } = await loadFixture(deployer);

    expect(await wallet.threshold()).to.equal(2);

    const transferAmount = ethers.parseEther('200'); // over balance, make it execute fail
    const transferData = TUSDT.interface.encodeFunctionData('transfer', [player1.address, transferAmount]);
    const startTx: Tx = {
      to: TUSDT.target,
      value: 0n,
      data: transferData,
      salt: ethers.keccak256("0x1337")
    };
    const txHash = await wallet.getTxHash(startTx);

    await wallet.connect(signer1).startTx(startTx);
    await wallet.connect(signer2).signTx(txHash);
    expect(await wallet.getTxSignedCount(txHash)).to.equal(2);

    const balanceBefore = await TUSDT.balanceOf(player1.address);
    await wallet.execute(txHash);
    const balanceAfter = await TUSDT.balanceOf(player1.address);
    expect(balanceAfter - balanceBefore).to.equal(0); // execute failed, receiver got nothing

    expect(await wallet.txFinished(txHash)).to.be.true;
  });

  it("transfer native token", async function () {
    const { wallet, owner, signer1, signer2, signer3, player1, TUSDT } = await loadFixture(deployer);

    await owner.sendTransaction({ to: wallet.target,  value: ethers.parseEther('10')});
    expect(await ethers.provider.getBalance(wallet.target)).to.equal(ethers.parseEther('10'));

    const startTx: Tx = {
      to: player1.address,
      value: ethers.parseEther('5'),
      data: '0x',
      salt: ethers.keccak256("0x1337")
    };
    const txHash = await wallet.getTxHash(startTx);

    await wallet.connect(signer1).startTx(startTx);
    await wallet.connect(signer2).signTx(txHash);
    expect(await wallet.getTxSignedCount(txHash)).to.equal(2);

    const balanceBefore = await ethers.provider.getBalance(player1.address);
    await wallet.execute(txHash);
    const balanceAfter = await ethers.provider.getBalance(player1.address);
    expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther('5'));

    expect(await ethers.provider.getBalance(wallet.target)).to.equal(ethers.parseEther('5'));

    expect(await wallet.txFinished(txHash)).to.be.true;
  });

  it("manage: set new threshold", async function () {
    const { wallet, owner, signer1, signer2, signer3, player1, TUSDT } = await loadFixture(deployer);

    expect(await wallet.threshold()).to.equal(2);

    const setThresholdData = wallet.interface.encodeFunctionData('changeThreshold', [1]);
    const startTx: Tx = {
      to: wallet.target,
      value: 0n,
      data: setThresholdData,
      salt: ethers.keccak256("0x1337")
    };
    const txHash = await wallet.getTxHash(startTx);

    await wallet.connect(signer1).startTx(startTx);
    await wallet.connect(signer2).signTx(txHash);
    expect(await wallet.getTxSignedCount(txHash)).to.equal(2);

    await wallet.execute(txHash);

    expect(await wallet.threshold()).to.equal(1);
    expect(await wallet.txFinished(txHash)).to.be.true;
  });

  it("manage: add & remove signer", async function () {
    const { wallet, owner, signer1, signer2, signer3, player1, TUSDT } = await loadFixture(deployer);

    expect(await wallet.threshold()).to.equal(2);

    let data = wallet.interface.encodeFunctionData('removeSigner', [[signer2.address]]);
    const startTx: Tx = {
      to: wallet.target,
      value: 0n,
      data,
      salt: ethers.keccak256("0x1337")
    };
    let txHash = await wallet.getTxHash(startTx);

    await wallet.connect(signer1).startTx(startTx);
    await wallet.connect(signer2).signTx(txHash);
    expect(await wallet.getTxSignedCount(txHash)).to.equal(2);

    await wallet.execute(txHash);

    let signers = await wallet.getSigners();
    expect(signers.includes(signer1.address)).to.be.true;
    expect(signers.includes(signer2.address)).to.be.false;
    expect(signers.includes(signer3.address)).to.be.true;
    expect(await wallet.txFinished(txHash)).to.be.true;

    // remove failed, lower than threshold
    data = wallet.interface.encodeFunctionData('removeSigner', [[signer3.address]]);
    startTx.data = data;
    startTx.salt = ethers.keccak256('0x1338');
    txHash = await wallet.getTxHash(startTx);

    await wallet.connect(signer1).startTx(startTx);
    await wallet.connect(signer3).signTx(txHash);

    await wallet.execute(txHash);
    signers = await wallet.getSigners();
    expect(signers.includes(signer1.address)).to.be.true;
    expect(signers.includes(signer2.address)).to.be.false;
    expect(signers.includes(signer3.address)).to.be.true;
    // to add singer
    data = wallet.interface.encodeFunctionData('addSigner', [[player1.address]]);
    startTx.data = data;
    startTx.salt = ethers.keccak256('0x1339');
    txHash = await wallet.getTxHash(startTx);

    await wallet.connect(signer1).startTx(startTx);
    await wallet.connect(signer3).signTx(txHash);

    await wallet.execute(txHash);
    signers = await wallet.getSigners();
    expect(signers.includes(signer1.address)).to.be.true;
    expect(signers.includes(signer2.address)).to.be.false;
    expect(signers.includes(signer3.address)).to.be.true;
    expect(signers.includes(player1.address)).to.be.true;
  });
});
