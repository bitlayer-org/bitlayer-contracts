const hre = require("hardhat");
const { BigNumberish } = require("ethers");
const { expect } = require("chai");
const ethers = hre.ethers;
const utils = require("./utils");
const exp = require("constants");

const State = {
    Idle: 0,
    Ready: 1,
    Jail: 2,
    Exit: 3
}

const params = {
    MaxValidators: 21,

    MaxStakes: 24000000,
    OverMaxStakes: 24000001,
    ThresholdStakes: 50000,
    MinSelfStakes: 50000,
    StakeUnit: 1,
    FounderLock: 3600,
    releasePeriod: 60,
    releaseCount: 100,

    totalRewards: utils.ethToWei("25000000"),
    rewardsPerBlock: utils.ethToWei("10"),
    epoch: 2,
    ruEpoch: 5,

    singleValStake: utils.ethToWei("2000000"),

    ValidatorFeePercent: 80,
    BackupValidatorFeePercent: 24,
    ActiveValidatorFeePercent: 56,
    LazyPunishThreshold: 3,
    DecreaseRate: 1,

    LazyPunishFactor: 1,
    EvilPunishFactor: 10,
    PunishBase: 1000,
}

describe("Staking test", function () {
    let signers
    let owner
    let factory
    let staking //  contract

    let commissionRate = 50;
    let currTotalStake = utils.ethToWei("0");


    let valFactory;

    before(async function () {
        // runs once before the first test in this block
        signers = await hre.ethers.getSigners();
        owner = signers[0];
        vSigner = signers[1];
        fundation = signers[2];
        account4 = signers[3];
        account5 = signers[4];
        vaddr = vSigner.address;

        BRC = await hre.ethers.getContractFactory("BRC");
        brc = await BRC.deploy(
            [account5.address],
            [ethers.parseUnits("1000000000", 18)]
        );

        factory = await hre.ethers.getContractFactory("Staking");
        staking = await factory.deploy();
        console.log(staking.target);
        expect(staking.target).to.be.properAddress
        valFactory = await hre.ethers.getContractFactory("cache/solpp-generated-contracts/builtin/Validator.sol:Validator", owner);
    });

    it('1. initialize', async () => {
        let balance = params.singleValStake * BigInt('24');
        balance = balance + params.totalRewards;
        // console.log(utils.weiToEth(balance))

        // address _admin,
        // address _brcAddress,
        // uint256 _epoch,
        // address payable _foundationPool
        await staking.initialize(
            owner,
            brc.target,
            params.epoch,
            fundation.address
        );

        expect(await staking.admin()).to.eq(owner);
        expect(await staking.brcToken()).to.eq(brc.target);
        expect(await staking.blockEpoch()).to.eq(params.epoch);
        expect(await staking.foundationPool()).to.eq(fundation);
    });

    it('2. initValidator', async () => {
        for (let i = 1; i < 25; i++) {
            let val = signers[i];
            let admin = signers[25 + i];
            let tx = await staking.initValidator(val, admin, 50, true);
            let receipt = await tx.wait();
            expect(receipt.status).equal(1);
        }
        expect(await staking.totalStakes()).to.eq(0);

        for (let i = 1; i < 4; i++) {
            let addr = await staking.allValidatorAddrs(i - 1);
            expect(signers[i]).to.eq(addr);
            expect(await staking.valMaps(addr)).to.be.properAddress;
            let valContractAddr = await staking.valMaps(addr);
            let val = valFactory.attach(valContractAddr);
            expect(await val.totalStake()).to.eq(utils.ethToWei("0"));
            expect(await val.totalUnWithdrawn()).to.eq(utils.ethToWei("0"));
        }

        await expect(staking.initValidator(signers[1], signers[1], 50, true)).to.be.revertedWith("E07");
    });

    it('3. check removePermission', async () => {
        expect(await staking.isOpened()).to.eq(false);
        await expect(staking.removePermission()).to
            .emit(staking, "PermissionLess")
            .withArgs(true);
        expect(await staking.isOpened()).to.eq(true);
        await expect(staking.removePermission()).to.be.revertedWith("E16");
    });

    it('4. check getTopValidators', async () => {
        let topValidators = await staking.getTopValidators(0);
        expect(topValidators.length).to.eq(params.MaxValidators);
        topValidators = await staking.getTopValidators(10);
        expect(topValidators.length).to.eq(10);
        topValidators = await staking.getTopValidators(24);
        expect(topValidators.length).to.eq(24);
        topValidators = await staking.getTopValidators(100);
        expect(topValidators.length).to.eq(24);
    });

    it('5. check Validator contract', async () => {
        for (let i = 1; i < 25; i++) {
            let valAddress = signers[i];
            let adminAddress = signers[25 + i];
            let valContractAddr = await staking.valMaps(valAddress);
            let val = valFactory.attach(valContractAddr);
            expect(await val.owner()).to.eq(staking.target);
            expect(await val.validator()).to.eq(valAddress);
            expect(await val.manager()).to.eq(adminAddress);
            expect(await val.selfStake()).to.eq(utils.ethToWei("0"));
            expect(await val.totalStake()).to.eq(utils.ethToWei("0"));
            expect(await val.totalUnWithdrawn()).to.eq(utils.ethToWei("0"));
            expect(await val.state()).to.eq(State.Ready);
        }
    });

    it('6. check updateActiveValidatorSet', async () => {
        let activeValidators = await staking.getActiveValidators();
        expect(activeValidators.length).to.eq(0);

        let topValidators = await staking.getTopValidators(0);
        const len = topValidators.length;
        console.log(topValidators);
        expect(len).to.be.eq(params.MaxValidators);

        while (true) {
            let number = await ethers.provider.getBlockNumber();
            if ((number + 1) % params.epoch !== 0) {
                await utils.mineEmptyBlock();
            } else {
                break;
            }
        }
        // const newset = [
        //     '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        //     '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        //     '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
        //     '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
        //     '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
        //     '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
        //     '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
        //     '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
        //     '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
        //     '0xBcd4042DE499D14e55001CcbB24a551F3b954096',
        //     '0x71bE63f3384f5fb98995898A86B02Fb2426c5788',
        //     '0xFABB0ac9d68B0B445fB7357272Ff202C5651694a',
        //     '0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec',
        //     '0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097',
        //     '0xcd3B766CCDd6AE721141F452C550Ca635964ce71',
        //     '0x2546BcD3c84621e976D8185a91A922aE77ECEc30',
        //     '0xbDA5747bFD65F08deb54cb465eB87D40e51B197E',
        //     '0xdD2FD4581271e230360230F9337D5c0430Bf44C0',
        //     '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        //     '0x09DB0a93B389bEF724429898f539AEB7ac2Dd55f',
        //     '0x02484cb50AAC86Eae85610D6f4Bf026f30f6627D'
        //   ];

        let newset = Array.from(topValidators);
        await staking.updateActiveValidatorSet(newset);

        activeValidators = await staking.getActiveValidators();

        expect(activeValidators.length).to.eq(params.MaxValidators);
    });

    it('7. calc rewards', async () => {
        // update accRewardsPerStake by updateRewardsInfo
        while (true) {
            let number = await ethers.provider.getBlockNumber();
            if ((number + 1) % params.ruEpoch !== 0) {
                await utils.mineEmptyBlock();
            } else {
                break;
            }
        }


        let number = await ethers.provider.getBlockNumber();

        console.log("currTotalStake:", currTotalStake);
        let stake = params.singleValStake;
        // let totalStake = stake.mul(3);
        currTotalStake = currTotalStake + stake;
        let expectAccRPS = params.rewardsPerBlock * BigInt(number);
        expectAccRPS = expectAccRPS / currTotalStake;
        console.log("currTotalStake:", currTotalStake);
        //console.log(expectAccRPS)
        // validator claimable
        let claimable = expectAccRPS * stake;
        let amount = await staking.anyClaimable(signers[1].address, signers[1 + 25].address)
        expect(amount[1]).to.eq(claimable);
        console.log("claimable:", claimable);
        // console.log("blockNumber: ", await ethers.provider.getBlockNumber())

        // claim any
        // when sending a transaction, there will be a new block, so the rewards increase
        // Notice: how many times to calculate and when to calculate, should be exactly the same in the contract,
        // so to avoids the inaccurate integer calculation. For example: 300/3 == 100, but 100/3 + 100/3 + 100/3 == 99
        expectAccRPS = params.rewardsPerBlock * BigInt(number + 1);
        expectAccRPS = expectAccRPS / currTotalStake;
        //console.log(expectAccRPS)
        let valContractAddr = await staking.valMaps(signers[1].address);
        let val = valFactory.attach(valContractAddr);
        console.log("currTotalStake:", currTotalStake);

        let staking2 = staking.connect(signers[1 + 25]);
        claimable = expectAccRPS * stake;
        await brc.connect(account5).transfer(staking.target, claimable * BigInt(10));

        let amount1 = await staking.anyClaimable(signers[1].address, signers[1].address)
        expect(amount1[1]).to.eq(claimable);
        console.log(amount1[1]);
        let tx = await staking2.validatorClaimAny(signers[1].address);
        //console.log("accRewardsPerStake ", await staking2.accRewardsPerStake());
        // await expect(tx).to
        //     .emit(val, "RewardsWithdrawn")
        //     .withArgs(signers[1].address,signers[1 + 25].address, claimable);
        await expect(tx).to
            .emit(staking, "ClaimWithoutUnboundStake")
            .withArgs(signers[1].address)
    });

    it('8. check distributeBlockFee', async () => {
        let activeValidators = await staking.getActiveValidators();
        let backupValidators = await staking.getBackupValidators();
        // console.log({ bakCnt: backupValidators.length });
        let cnt = activeValidators.length;
        let balances = [];
        for (let i = 0; i < cnt; i++) {
            let val = await staking.valMaps(activeValidators[i]);
            balances[i] = await ethers.provider.getBalance(val);
        }
        let bakBalances = [];
        for (let i = 0; i < backupValidators.length; i++) {
            let val = await staking.valMaps(backupValidators[i]);
            bakBalances[i] = await ethers.provider.getBalance(val);
            // console.log({ Idx: i, balance: bakBalances[i] });
        }

        let stake = utils.ethToWei("100");
        let blockFee = stake * BigInt(cnt);

        while (true) {
            let number = await ethers.provider.getBlockNumber();
            if ((number + 2) % params.epoch !== 0) {
                await utils.mineEmptyBlock();
            } else {
                break;
            }
        }

        let tx = await staking.distributeBlockFee({ value: blockFee });
        let receipt = await tx.wait();
        expect(receipt.status).equal(1);

        let feePerActiveValidator = blockFee * BigInt(params.ActiveValidatorFeePercent) / BigInt(100) / BigInt(cnt)
        let feePerBakValidator = blockFee * BigInt(params.BackupValidatorFeePercent) / BigInt(100) / BigInt(backupValidators.length)

        for (let i = 0; i < activeValidators.length; i++) {
            let val = await staking.valMaps(activeValidators[i]);
            let balance = await ethers.provider.getBalance(val);
            expect(balance - balances[i]).equal(feePerActiveValidator);
        }
        for (let i = 0; i < backupValidators.length; i++) {
            let val = await staking.valMaps(backupValidators[i]);
            let balance = await ethers.provider.getBalance(val);
            expect(balance - bakBalances[i], i).equal(feePerBakValidator);
        }

    });

    it('9. check lazyPunish', async () => {
        let activeValidators = await staking.getActiveValidators();
        let cnt = activeValidators.length;

        for (let i = 0; i < cnt; i++) {
            let tx = await staking.lazyPunish(activeValidators[i]);
            let receipt = await tx.wait();
            expect(receipt.status).equal(1);
        }

        for (let i = 0; i < cnt; i++) {
            let lazyVal = await staking.lazyPunishedValidators(i);
            expect(await staking.getPunishRecord(activeValidators[i])).equal(1);
            expect(lazyVal).equal(activeValidators[i]);
        }
        let topVals = await staking.getTopValidators(100);
        let valContractAddr = await staking.valMaps(activeValidators[0]);
        let val = valFactory.attach(valContractAddr);
        let oldInfo = { stake: await val.totalStake(), unWithdrawn: await val.totalUnWithdrawn() };
        let oldtotalStake = await staking.totalStakes();
        for (let i = 1; i < params.LazyPunishThreshold; i++) {
            let tx = await staking.lazyPunish(activeValidators[0]);
            let receipt = await tx.wait();
            expect(receipt.status).equal(1);
            if (i < params.LazyPunishThreshold - 1) {
                let missedBlocksCounter = await staking.getPunishRecord(activeValidators[0]);
                expect(missedBlocksCounter).equal(i + 1);
            } else { // doSlash
                // console.log("doSlash")
                // remove from ranking immediately
                expect(await staking.getPunishRecord(activeValidators[0])).equal(0);
                let newTopVals = await staking.getTopValidators(100);
                expect(newTopVals.length).equal(topVals.length - 1);
                for (let i = 0; i < newTopVals.length; i++) {
                    expect(activeValidators[0] !== newTopVals[i]).equal(true);
                }

                let slashAmount = oldInfo.unWithdrawn * BigInt(params.LazyPunishFactor) / BigInt(params.PunishBase);
                let amountFromCurrStakes = slashAmount;
                if (oldInfo.stake < slashAmount) {
                    amountFromCurrStakes = oldInfo.stake;
                }
                let newInfo = { stake: await val.totalStake(), unWithdrawn: await val.totalUnWithdrawn() };
                expect(newInfo.stake).to.eq(oldInfo.stake - BigInt(amountFromCurrStakes));
                expect(newInfo.unWithdrawn).to.eq(oldInfo.unWithdrawn - (slashAmount));
                expect(await staking.totalStakes()).to.eq(oldtotalStake - (amountFromCurrStakes));
            }
        }
    });

    it('10. Multiple crimes during punishment', async () => {
        let oldtotalStake = await staking.totalStakes();
        let activeValidators = await staking.getActiveValidators();
        let valAddr = activeValidators[1];
        let valContractAddr = await staking.valMaps(valAddr);
        let val = valFactory.attach(valContractAddr);
        let oldInfo = { stake: await val.totalStake(), unWithdrawn: await val.totalUnWithdrawn() };
        for (let i = 0; i < params.LazyPunishThreshold; i++) {
            let tx = await staking.lazyPunish(valAddr);
            let receipt = await tx.wait();
            expect(receipt.status).equal(1);
        }
        let slashAmount = oldInfo.unWithdrawn * BigInt(params.LazyPunishFactor) / BigInt(params.PunishBase);
        let amountFromCurrStakes = slashAmount;
        if (oldInfo.stake < slashAmount) {
            amountFromCurrStakes = oldInfo.stake;
        }
        let newInfo = { stake: await val.totalStake(), unWithdrawn: await val.totalUnWithdrawn() };
        expect(newInfo.stake).to.eq(oldInfo.stake - BigInt(amountFromCurrStakes));
        // let accRewardsPerStake = await staking.accRewardsPerStake();
        // expect(newInfo.debt).to.eq(accRewardsPerStake * newInfo.stake);
        expect(newInfo.unWithdrawn).to.eq(oldInfo.unWithdrawn - BigInt(slashAmount));
        expect(await staking.totalStakes()).to.eq(oldtotalStake - BigInt(amountFromCurrStakes));
    });

    it('11. check registerValidator', async () => {
        let signer = signers[51];
        let admin = signers[52];
        let val = signer.address;
        let valAdmin = admin.address;

        let stakeWei = utils.ethToWei(params.MinSelfStakes.toString());
        let oldtotalStake = await staking.totalStakes();
        let oldLength = await staking.getAllValidatorsLength();

        // address _val,
        // address _manager,
        // uint _rate,
        // uint _stakeAmount,
        // bool _acceptDelegation
        await brc.connect(account5).transfer(valAdmin, params.singleValStake);
        console.log(await brc.balanceOf(valAdmin));
        console.log(stakeWei);
        await brc.connect(admin).approve(staking.target, params.singleValStake);
        let tx = await staking.registerValidator(val, valAdmin, 50, stakeWei, true);
        let receipt = await tx.wait();
        expect(receipt.status).equal(1);

        await expect(tx).to
            .emit(staking, "ValidatorRegistered")
            .withArgs(val, valAdmin, 50, utils.ethToWei(params.MinSelfStakes.toString()), State.Ready);
        await expect(tx).to
            .emit(staking, "TotalStakesChanged")
            .withArgs(val, oldtotalStake, oldtotalStake + utils.ethToWei(params.MinSelfStakes.toString()))

        let newLength = await staking.getAllValidatorsLength();
        expect(newLength).equal(oldLength + BigInt(1));

        let lastAddVal = await staking.allValidatorAddrs(newLength - BigInt(1));
        expect(lastAddVal).equal(val);
    });

    it('12. check addStake', async () => {
        let signer = signers[1];
        let admin = signers[25 + 1];
        let val = signer.address;
        let valAdmin = admin.address;


        let stakeWei = utils.ethToWei(params.MinSelfStakes.toString());
        let diffWei = utils.ethToWei((params.ThresholdStakes - params.MinSelfStakes).toString());

        let stakingErrorAdmin = staking.connect(signers[2]);
        await expect(stakingErrorAdmin.addStake("0x0000000000000000000000000000000000000000", stakeWei)).to.be.revertedWith("E08");
        await expect(stakingErrorAdmin.addStake(val, stakeWei)).to.be.revertedWith("E02");

        let stakingLocked = staking.connect(admin);
        // brc not approve
        await expect(stakingLocked.addStake(val, stakeWei)).to.be.revertedWith("E43");
        // amount ==0 
        await expect(stakingLocked.addStake(val, diffWei)).to.be.revertedWith("E14");

        let signerUnlocked = signers[51];
        let adminUnlocked = signers[52];
        let stakingUnlocked = staking.connect(adminUnlocked);
        let oldtotalStake = await staking.totalStakes();

        let valContractAddr = await staking.valMaps(signerUnlocked.address);
        let valContract = valFactory.attach(valContractAddr);
        let oldValTotalStake = await valContract.totalStake();

        await brc.connect(account5).transfer(adminUnlocked.address, params.singleValStake);
        console.log(await brc.balanceOf(adminUnlocked.address));
        await brc.connect(adminUnlocked).approve(staking.target, params.singleValStake);

        let tx = await stakingUnlocked.addStake(signerUnlocked.address, stakeWei / BigInt(2));
        let receipt = await tx.wait();
        expect(receipt.status).equal(1);
        await expect(tx).to
            .emit(staking, "TotalStakesChanged")
            .withArgs(signerUnlocked.address, oldtotalStake, oldtotalStake + stakeWei / BigInt(2))
        await expect(tx).to
            .emit(valContract, "StakesChanged")
            .withArgs(signerUnlocked.address, adminUnlocked.address, oldValTotalStake + stakeWei / BigInt(2))

        let delegator = signers[53];
        let stakingDelegator = staking.connect(delegator);
        // 0 address
        await expect(stakingErrorAdmin.addDelegation("0x0000000000000000000000000000000000000000", stakeWei)).to.be.revertedWith("E08");

        // brc not approve 
        await expect(stakingDelegator.addDelegation(signerUnlocked.address, stakeWei / BigInt(2))).to.be.revertedWith("E43");


        await brc.connect(account5).transfer(delegator.address, params.singleValStake);
        console.log(await brc.balanceOf(delegator.address));
        await brc.connect(delegator).approve(staking.target, params.singleValStake);

        tx = await stakingDelegator.addDelegation(signerUnlocked.address, stakeWei / BigInt(2));
        receipt = await tx.wait();
        expect(receipt.status).equal(1);
        await expect(tx).to
            .emit(staking, "TotalStakesChanged")
            .withArgs(signerUnlocked.address, oldtotalStake + stakeWei / BigInt(2), oldtotalStake + stakeWei)

        await expect(tx).to
            .emit(valContract, "StakesChanged")
            .withArgs(signerUnlocked.address, delegator.address, oldValTotalStake + stakeWei)
    });

    it('13. check subStake', async () => {
        // locking == true
        let signer2 = signers[2];
        let admin2 = signers[27];
        // locking == false
        let signer50 = signers[51];
        let admin50 = signers[52];

        let deltaEth = 20000;

        // Do substake when the node is in the locking == true
        let stakingLocked = staking.connect(admin2);
        // address(0) 
        await expect(stakingLocked.subStake("0x0000000000000000000000000000000000000000", deltaEth)).to.be.revertedWith("E08");
        await expect(stakingLocked.subStake(signer50.address, deltaEth)).to.be.revertedWith("E02");
        await expect(stakingLocked.subStake(signer2.address, deltaEth)).to.be.revertedWith("E28");

        let valContractAddr = await staking.valMaps(signer2.address);
        let val = valFactory.attach(valContractAddr);
        console.log("stake2", val.totalStake());

        // Calculate the upper limit of substake in advance
        // canRelease = 2000000 / 100
        let forceTimeDiff = params.releasePeriod;
        // let tx = await staking.testReduceBasicLockEnd(forceTimeDiff);
        // let receipt = await tx.wait();
        // expect(receipt.status).equal(1);

        let oldtotalStake = await staking.totalStakes();
        expect(await val.state()).equal(2); //Jail
        await expect(stakingLocked.subStake(signer2.address, deltaEth + 1)).to.be.revertedWith("E28");

        let signer20 = signers[20];
        let admin20 = signers[45];
        stakingLocked = staking.connect(admin20);
        valContractAddr = await staking.valMaps(signer20.address);
        val = valFactory.attach(valContractAddr);
        expect(await val.state()).equal(1);

        await brc.connect(account5).transfer(admin20.address, params.singleValStake);
        console.log(await brc.balanceOf(admin20.address));
        await brc.connect(admin20).approve(staking.target, params.singleValStake);

        await stakingLocked.addStake(signer20.address, params.singleValStake);

        oldtotalStake = await staking.totalStakes();
        console.log("stake", val.totalStake());

        tx = await stakingLocked.subStake(signer20.address, utils.ethToWei(deltaEth.toString()));


        receipt = await tx.wait();
        expect(receipt.status).equal(1);

        await expect(tx).to
            .emit(staking, "TotalStakesChanged")
            .withArgs(signer20.address, oldtotalStake, oldtotalStake - utils.ethToWei(deltaEth.toString()))

        tx = await stakingLocked.subStake(signer20.address, utils.ethToWei(deltaEth.toString()));
        receipt = await tx.wait();
        expect(receipt.status).equal(1);

        await expect(tx).to
            .emit(staking, "TotalStakesChanged")
            .withArgs(signer20.address, oldtotalStake - utils.ethToWei(deltaEth.toString()), oldtotalStake - utils.ethToWei(deltaEth.toString()) * BigInt(2))


        // locking == false; Unlimited amount of subStake
        oldtotalStake = await staking.totalStakes();
        // Do substake when the node is in the locking == false
        let stakingUnLocked = staking.connect(admin50);

        await expect(stakingUnLocked.subStake(signer50.address, utils.ethToWei((deltaEth * 2).toString()))).to.be.revertedWith("E31");


    });

    it('14. check subDelegation', async () => {
        // It will not be restricted because of the locked state of the node
        let delegator = signers[53];
        let stakingDelegator = staking.connect(delegator);
        let signer20 = signers[20];
        let admin20 = signers[45];

        let signer15 = signers[15];
        let admin15 = signers[40];

        let diffWei = utils.ethToWei((params.MinSelfStakes).toString());
        let valContractAddr = await staking.valMaps(signer20.address);
        let valContract = valFactory.attach(valContractAddr);
        let oldtotalStake = await staking.totalStakes();
        console.log("oldtotalStake", oldtotalStake);
        let oldValTotalStake = await valContract.totalStake();
        console.log("oldValTotalStake", oldValTotalStake);
        console.log("state", await valContract.state());


        let valContractAddr15 = await staking.valMaps(signer15.address);
        let valContract15 = valFactory.attach(valContractAddr15);

        console.log("state15", await valContract15.state());

        let tx = await stakingDelegator.addDelegation(signer20.address, diffWei / BigInt(2));
        let receipt = await tx.wait();
        expect(receipt.status).equal(1);
        await expect(tx).to
            .emit(staking, "TotalStakesChanged")
            .withArgs(signer20.address, oldtotalStake, oldtotalStake + diffWei / BigInt(2))

        await expect(tx).to
            .emit(valContract, "StakesChanged")
            .withArgs(signer20.address, delegator.address, oldValTotalStake + diffWei / BigInt(2))

        await expect(stakingDelegator.subDelegation("0x0000000000000000000000000000000000000000", diffWei / BigInt(2))).to.be.revertedWith("E08");
        await expect(stakingDelegator.subDelegation(signer20.address, diffWei)).to.be.revertedWith("E24");
        await expect(stakingDelegator.subDelegation(signer20.address, 0)).to.be.revertedWith("E23");
        tx = await stakingDelegator.subDelegation(signer20.address, diffWei / BigInt(2));
        receipt = await tx.wait();
        expect(receipt.status).equal(1);

        await expect(tx).to
            .emit(staking, "TotalStakesChanged")
            .withArgs(signer20.address, oldtotalStake + diffWei / BigInt(2), oldtotalStake)
    });

    it('15. check exitStaking', async () => {
        // locking == true && Jail
        let signer2 = signers[2];
        let admin2 = signers[27];
        // locking == true
        let signer20 = signers[20];
        let admin20 = signers[45];

        let staking2 = staking.connect(admin2);

        let staking20 = staking.connect(admin20);

        // Forced arrival at the end of the lock period

        // Jail
        tx = await staking2.exitStaking(signer2.address);
        receipt = await tx.wait();
        expect(receipt.status).equal(1);

        let diffWei = utils.ethToWei((params.MinSelfStakes).toString());

        valContractAddr = await staking.valMaps(signer2.address);
        valContract = valFactory.attach(valContractAddr);
        await expect(tx).to
            .emit(valContract, "StateChanged")
            .withArgs(signer2.address, admin2.address, State.Jail, State.Exit)

        // Initialize some data in advance to verify the delegatorClaimAny
        let delegator = signers[53];

        valContractAddr = await staking.valMaps(signer20.address);
        valContract = valFactory.attach(valContractAddr);
        let oldValTotalStake = await valContract.totalStake();

        let stakingDelegator = staking.connect(delegator);
        tx = await stakingDelegator.addDelegation(signer20.address, diffWei / BigInt(2));
        receipt = await tx.wait();
        expect(receipt.status).equal(1);
        await expect(tx).to
            .emit(valContract, "StakesChanged")
            .withArgs(signer20.address, delegator.address, oldValTotalStake + diffWei / BigInt(2))

        // Idle
        staking20 = staking.connect(admin20);
        tx = await staking20.exitStaking(signer20.address);
        receipt = await tx.wait();
        expect(receipt.status).equal(1);
        await expect(tx).to
            .emit(valContract, "StateChanged")
            .withArgs(signer20.address, admin20.address, State.Ready, State.Exit)

        await expect(staking20.addStake(signer20.address, diffWei / BigInt(2))).to.be.revertedWith("E43");
    });

    it('16. check exitDelegation', async () => {
        let diffWei = utils.ethToWei((params.MinSelfStakes).toString());
        // Jail
        let signer2 = signers[2];
        let admin2 = signers[27];
        // Exit
        let signer20 = signers[20];
        let admin20 = signers[45];
        // Idle
        let signer50 = signers[51];
        let admin50 = signers[52];

        let delegator = signers[53];
        let stakingDelegator = staking.connect(delegator);

        // Add some data in advance
        await expect(stakingDelegator.addDelegation(signer2.address, diffWei / BigInt(2))).to.be.revertedWith("E28");

        tx = await stakingDelegator.addDelegation(signer50.address, diffWei / BigInt(2));
        receipt = await tx.wait();
        expect(receipt.status).equal(1);

        // Jail
        await expect(stakingDelegator.exitDelegation(signer2.address)).to.be.revertedWith("E28");
        // Exit
        await expect(stakingDelegator.exitDelegation(signer20.address)).to.be.revertedWith("E28");

        // Idle
        tx = await stakingDelegator.exitDelegation(signer50.address);
        receipt = await tx.wait();
        expect(receipt.status).equal(1);

        valContractAddr = await staking.valMaps(signer50.address);
        valContract = valFactory.attach(valContractAddr);


        // locking == false
        let staking50 = staking.connect(admin50);
        tx = await staking50.exitStaking(signer50.address);
        receipt = await tx.wait();
        expect(receipt.status).equal(1);
        await expect(tx).to
            .emit(valContract, "StateChanged")
            .withArgs(signer50.address, admin50.address, State.Ready, State.Exit)
    });

    it('17. check reStaking', async () => {
        let diffWei = utils.ethToWei((params.MinSelfStakes).toString());
        // Ready
        let signer5 = signers[5];
        let admin5 = signers[30];


        // Ready
        let signer50 = signers[51];
        let admin50 = signers[52];

        let signer2 = signers[2];
        let admin2 = signers[27];
        // Exit
        let signer20 = signers[20];
        let admin20 = signers[45];



        valContractAddr = await staking.valMaps(signer5.address);
        valContract = valFactory.attach(valContractAddr);
        let oldValTotalStake = await valContract.totalStake();

        console.log("oldValTotalStake5", oldValTotalStake);

        await brc.connect(account5).transfer(admin5.address, params.singleValStake);
        console.log(await brc.balanceOf(admin5.address));
        await brc.connect(admin5).approve(staking.target, params.singleValStake);

        await staking.connect(admin5).addStake(signer5.address, diffWei * BigInt(2));

        let valTotalStake = await valContract.totalStake();

        console.log("ValTotalStake5", valTotalStake);

        let oldtotalStake = await staking.totalStakes();

        let blockFee = diffWei * BigInt(100);

        await staking.distributeBlockFee({ value: blockFee });

        // old val exit
        await expect(staking.connect(admin20).reStaking(signer20.address, signer50.address, diffWei)).to.be.revertedWith("E28");
        // new val exit

        await expect(staking.connect(admin5).reStaking(signer5.address, signer20.address, diffWei)).to.be.revertedWith("E28");

        await expect(staking.connect(admin2).reStaking(signer2.address, signer50.address, diffWei)).to.be.revertedWith("E28");

        let rewards = await staking.anyClaimable(signer5.address, admin5.address);

        console.log(rewards);

        let tx = await staking.connect(admin5).reStaking(signer5.address, signers[16].address, diffWei);


        await expect(tx).to
            .emit(staking, "TotalStakesChanged")
            .withArgs(signer5.address, oldtotalStake, oldtotalStake - diffWei);

        await expect(tx).to
            .emit(staking, "TotalStakesChanged")
            .withArgs(signers[16].address, oldtotalStake - diffWei, oldtotalStake);

        await expect(tx).to
            .emit(staking, "ClaimWithoutUnboundStake")
            .withArgs(signer5.address);


    });

    it('18. check reDelegation', async () => {
        let diffWei = utils.ethToWei((params.MinSelfStakes).toString());
        // Ready
        let signer5 = signers[5];
        let admin5 = signers[30];


        // Ready
        let signer50 = signers[51];
        let admin50 = signers[52];

        let signer2 = signers[2];
        let admin2 = signers[27];
        // Exit
        let signer20 = signers[20];
        let admin20 = signers[45];



        valContractAddr = await staking.valMaps(signer5.address);
        valContract = valFactory.attach(valContractAddr);
        let oldValTotalStake = await valContract.totalStake();

        console.log("oldValTotalStake5", oldValTotalStake);

        await brc.connect(account5).transfer(admin5.address, params.singleValStake);
        console.log(await brc.balanceOf(admin5.address));
        await brc.connect(admin5).approve(staking.target, params.singleValStake);

        await staking.connect(admin5).addDelegation(signers[14].address, diffWei * BigInt(2));

        let valTotalStake = await valContract.totalStake();

        console.log("ValTotalStake5", valTotalStake);

        let oldtotalStake = await staking.totalStakes();

        let blockFee = diffWei * BigInt(100);

        await staking.distributeBlockFee({ value: blockFee });

        // old val exit
        await expect(staking.connect(admin20).reDelegation(signer20.address, signer50.address, diffWei)).to.be.revertedWith("E28");
        // new val exit

        await expect(staking.connect(admin5).reDelegation(signers[14].address, signer20.address, diffWei)).to.be.revertedWith("E28");

        await expect(staking.connect(admin2).reDelegation(signers[14].address, signer50.address, diffWei)).to.be.revertedWith("E24");

        let rewards = await staking.anyClaimable(signer5.address, admin5.address);

        console.log(rewards);

        let tx = await staking.connect(admin5).reDelegation(signers[14].address, signers[16].address, diffWei);


        await expect(tx).to
            .emit(staking, "TotalStakesChanged")
            .withArgs(signers[14].address, oldtotalStake, oldtotalStake - diffWei);

        // await expect(tx).to
        // .emit(staking,"TotalStakesChanged")
        // .withArgs(signers[16].address, oldtotalStake - diffWei, oldtotalStake);

        await expect(tx).to
            .emit(staking, "ClaimWithoutUnboundStake")
            .withArgs(signers[14].address);
    });

    it('19. Bypass the stacking contract and call the verifier contract directly', async () => {
        let signer50 = signers[51];
        valContractAddr = await staking.valMaps(signer50.address);
        valContract = valFactory.attach(valContractAddr);
        await expect(valContract.addStake(1000)).to.be.revertedWith("E01");
    });
})