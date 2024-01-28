// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const {expect, use} = require("chai");
const exp = require("constants");
const {BigNumber} = require("ethers");
const hre = require("hardhat");
const ethers = hre.ethers;
const utils = require("./utils");

describe("LockingContract contract test", function () {


    let owner;
    let account1;
    let account2;
    let account3;
    let account4;
    let account5;

    let  = ethers.parseEther('1000',18);
    let periodTime = 50;
    let BLT;
    let blt;
    let cliffPeriods = 12;
    let vestingPeriods = 30;
    let StakingToken;
    let lockingContract;
    before(async function () {

        [owner, account1, account2, account3, account4, account5] = await hre.ethers.getSigners();
        BLT = await hre.ethers.getContractFactory("BLT");
        blt = await BLT.deploy(
            [owner.address],
            [ethers.parseUnits("1000000000",18)]
        );
        console.log("BLT: ",blt.target);

        StakingToken = blt.target;

        LockingContract = await hre.ethers.getContractFactory("LockingContract");

        // await blt.transfer(lockingContract.target, utils.ethToWei('40000000'))
    })

    it('should contract constuct success', async function () {
        lockingContract = await LockingContract.deploy(
            [
                owner.address,
                account1.address,
                account2.address,
                account3.address
            ],
            [
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000')
            ],
            cliffPeriods,
            vestingPeriods,
            periodTime,
            StakingToken
        );
        console.log("LockingContract:: ",lockingContract.target);
        // failed to with 0
        expect(await lockingContract.cliffPeriods()).to.be.eq(cliffPeriods);

        expect(await lockingContract.vestingPeriods()).to.be.eq(vestingPeriods);

        expect(await lockingContract.periodTime()).to.be.eq(periodTime);

        expect(await lockingContract.StakingToken()).to.be.eq(StakingToken);

        const vestingSchedule = await lockingContract.vestingSchedules(owner.address)
        expect(vestingSchedule.totalStakingAmount).to.be.eq(utils.ethToWei('300000'));

        expect(vestingSchedule.releasedAmount).to.be.eq(0);

        expect(vestingSchedule.isActive).to.be.eq(true);
        

        const timestamp = await lockingContract.startTimestamp();
        console.log("tmp:",timestamp);
    });
    // --------------------- change new Beneficiary ----------------------
    it("should not change the Beneficiary when the oldBeneficiary not exist",async function(){
        lockingContract = await LockingContract.deploy(
            [
                owner.address,
                account1.address,
                account2.address,
                account3.address
            ],
            [
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000')
            ],
            cliffPeriods,
            vestingPeriods,
            periodTime,
            StakingToken
        );
        console.log("LockingContract:: ",lockingContract.target);
        await expect(lockingContract.getVestingAmount(account5.address)).to.be.revertedWith("No active vesting schedule found");
        await expect(lockingContract.connect(account5).changeBeneficiary(account4.address)).to.be.revertedWith("No active vesting schedule found");
    })

    it("should not change the Beneficiary when the newBeneficiary exist",async function(){
        lockingContract = await LockingContract.deploy(
            [
                owner.address,
                account1.address,
                account2.address,
                account3.address
            ],
            [
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000')
            ],
            cliffPeriods,
            vestingPeriods,
            periodTime,
            StakingToken
        );
        console.log("LockingContract:: ",lockingContract.target);
        expect(await lockingContract.getVestingAmount(account1.address)).to.be.eq(0);
        await expect(lockingContract.connect(account1).changeBeneficiary(account2.address)).to.be.revertedWith("NewBeneficiary is Active");
    })

    it("change to new Beneficiary and Claim tokens",async function(){
        lockingContract = await LockingContract.deploy(
            [
                owner.address,
                account1.address,
                account2.address,
                account3.address
            ],
            [
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000')
            ],
            cliffPeriods,
            vestingPeriods,
            periodTime,
            StakingToken
        );
        console.log("LockingContract:: ",lockingContract.target);
        await blt.transfer(lockingContract.target, utils.ethToWei('1200000'))
        await hre.network.provider.send('evm_increaseTime', [periodTime * 13])
        await utils.mineEmptyBlock();
        await lockingContract.connect(account1).changeBeneficiary(account4.address);
        
        await expect(lockingContract.getVestingAmount(account1.address)).to.be.revertedWith("No active vesting schedule found");
        await expect(lockingContract.connect(account1).claim()).to.be.revertedWith("No active vesting schedule found");

        expect(await lockingContract.getVestingAmount(account4.address)).to.be.eq(utils.ethToWei('10000'));
        expect(await blt.balanceOf(account4.address)).to.be.eq(0);
        await lockingContract.connect(account4).claim()
        expect(await blt.balanceOf(account4.address)).to.be.eq(utils.ethToWei('10000'));
    })
    // --------------------- Claim  ----------------------

    it("should not be claim when in the cliffTime",async function(){
        lockingContract = await LockingContract.deploy(
            [
                owner.address,
                account1.address,
                account2.address,
                account3.address
            ],
            [
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000')
            ],
            cliffPeriods,
            vestingPeriods,
            periodTime,
            StakingToken
        );
        console.log("LockingContract:: ",lockingContract.target);
        await blt.transfer(lockingContract.target, utils.ethToWei('1200000'))
        await hre.network.provider.send('evm_increaseTime', [periodTime])
        await utils.mineEmptyBlock();
        expect(await lockingContract.getVestingAmount(owner.address)).to.be.eq(0);
        await expect(lockingContract.claim()).to.be.revertedWith("Cliff period has not ended yet");
    })

    it("should not be claim when account not exist",async function(){
        lockingContract = await LockingContract.deploy(
            [
                owner.address,
                account1.address,
                account2.address,
                account3.address
            ],
            [
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000')
            ],
            cliffPeriods,
            vestingPeriods,
            periodTime,
            StakingToken
        );
        console.log("LockingContract:: ",lockingContract.target);
        await blt.transfer(lockingContract.target, utils.ethToWei('1200000'))
        await hre.network.provider.send('evm_increaseTime', [periodTime])
        await utils.mineEmptyBlock();
        await expect(lockingContract.getVestingAmount(account5.address)).to.be.revertedWith("No active vesting schedule found");
        await expect(lockingContract.connect(account5).claim()).to.be.revertedWith("No active vesting schedule found");
    })

    it("should not be claim when in the cliffTime",async function(){
        lockingContract = await LockingContract.deploy(
            [
                owner.address,
                account1.address,
                account2.address,
                account3.address
            ],
            [
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000')
            ],
            cliffPeriods,
            vestingPeriods,
            periodTime,
            StakingToken
        );
        console.log("LockingContract:: ",lockingContract.target);
        await blt.transfer(lockingContract.target, utils.ethToWei('1200000'))
        await hre.network.provider.send('evm_increaseTime', [periodTime])
        await utils.mineEmptyBlock();
        expect(await lockingContract.getVestingAmount(owner.address)).to.be.eq(0);
        await expect(lockingContract.claim()).to.be.revertedWith("Cliff period has not ended yet");
    })

    it("should not be claim when in the cliffTime",async function(){
        lockingContract = await LockingContract.deploy(
            [
                owner.address,
                account1.address,
                account2.address,
                account3.address
            ],
            [
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000')
            ],
            cliffPeriods,
            vestingPeriods,
            periodTime,
            StakingToken
        );
        console.log("LockingContract:: ",lockingContract.target);
        await blt.transfer(lockingContract.target, utils.ethToWei('1200000'))
        await hre.network.provider.send('evm_increaseTime', [periodTime * 12])
        await utils.mineEmptyBlock();
        expect(await lockingContract.getVestingAmount(owner.address)).to.be.eq(0);
        await expect(lockingContract.claim()).to.be.revertedWith("Cliff period has not ended yet");
    })

    it("should calim 13 period vesting token",async function(){
        lockingContract = await LockingContract.deploy(
            [
                owner.address,
                account1.address,
                account2.address,
                account3.address
            ],
            [
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000')
            ],
            cliffPeriods,
            vestingPeriods,
            periodTime,
            StakingToken
        );
        console.log("LockingContract:: ",lockingContract.target);
        await blt.transfer(lockingContract.target, utils.ethToWei('1200000'))
        console.log(await blt.balanceOf(lockingContract.target));
        await hre.network.provider.send('evm_increaseTime', [periodTime * 13])
        await utils.mineEmptyBlock();
        //utils.ethToWei('300000'),
        expect(await lockingContract.getVestingAmount(owner.address)).to.be.eq(utils.ethToWei('10000'));
        expect(await blt.balanceOf(account2.address)).to.be.eq(0);
        await lockingContract.connect(account2).claim()
        expect(await blt.balanceOf(account2.address)).to.be.eq(utils.ethToWei('10000'));
        await expect(lockingContract.connect(account2).claim()).to.be.revertedWith("No tokens available for release");
    })

    it("should calim 42 period vesting token",async function(){
        lockingContract = await LockingContract.deploy(
            [
                owner.address,
                account1.address,
                account2.address,
                account3.address
            ],
            [
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000')
            ],
            cliffPeriods,
            vestingPeriods,
            periodTime,
            StakingToken
        );
        console.log("LockingContract:: ",lockingContract.target);
        await blt.transfer(lockingContract.target, utils.ethToWei('1200000'))
        console.log(await blt.balanceOf(lockingContract.target));
        await hre.network.provider.send('evm_increaseTime', [periodTime * 42])
        await utils.mineEmptyBlock();
        //utils.ethToWei('300000'),
        expect(await lockingContract.getVestingAmount(account2.address)).to.be.eq(utils.ethToWei('300000'));
        const beforeAmount = await blt.balanceOf(account2.address);
        await lockingContract.connect(account2).claim()
        const afterAmount = await blt.balanceOf(account2.address);
        expect(afterAmount - beforeAmount).to.be.eq(utils.ethToWei('300000'));
        await expect(lockingContract.connect(account2).claim()).to.be.revertedWith("No tokens available for release");
    })

    it("should calim 43 period vesting token",async function(){
        lockingContract = await LockingContract.deploy(
            [
                owner.address,
                account1.address,
                account2.address,
                account3.address
            ],
            [
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000')
            ],
            cliffPeriods,
            vestingPeriods,
            periodTime,
            StakingToken
        );
        console.log("LockingContract:: ",lockingContract.target);
        await blt.transfer(lockingContract.target, utils.ethToWei('1200000'))
        console.log(await blt.balanceOf(lockingContract.target));
        await hre.network.provider.send('evm_increaseTime', [periodTime * 43])
        await utils.mineEmptyBlock();
        //utils.ethToWei('300000'),
        expect(await lockingContract.getVestingAmount(account2.address)).to.be.eq(utils.ethToWei('300000'));
        const beforeAmount = await blt.balanceOf(account2.address);
        await lockingContract.connect(account2).claim()
        const afterAmount = await blt.balanceOf(account2.address);
        expect(afterAmount - beforeAmount).to.be.eq(utils.ethToWei('300000'));
        await expect(lockingContract.connect(account2).claim()).to.be.revertedWith("No tokens available for release");
    })

    it("should calim 43 + 2  period vesting token",async function(){
        lockingContract = await LockingContract.deploy(
            [
                owner.address,
                account1.address,
                account2.address,
                account3.address
            ],
            [
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000'),
                utils.ethToWei('300000')
            ],
            cliffPeriods,
            vestingPeriods,
            periodTime,
            StakingToken
        );
        console.log("LockingContract:: ",lockingContract.target);
        await blt.transfer(lockingContract.target, utils.ethToWei('1200000'))
        console.log(await blt.balanceOf(lockingContract.target));
        await hre.network.provider.send('evm_increaseTime', [periodTime * 43])
        await utils.mineEmptyBlock();
        //utils.ethToWei('300000'),
        expect(await lockingContract.getVestingAmount(account2.address)).to.be.eq(utils.ethToWei('300000'));
        const beforeAmount = await blt.balanceOf(account2.address);
        await lockingContract.connect(account2).claim()
        const afterAmount = await blt.balanceOf(account2.address);
        expect(afterAmount - beforeAmount).to.be.eq(utils.ethToWei('300000'));
        await expect(lockingContract.connect(account2).claim()).to.be.revertedWith("No tokens available for release");
    })
})

