const hre = require("hardhat");
const {BigNumber} = require("ethers");
const {expect} = require("chai");
const ethers = hre.ethers;
const utils = require("./utils");
const { exitCode } = require("process");
const { ecsign } = require("ethereumjs-util");
import  getPermitSignature from "./signPermit";

describe("BTR test", function(){
    
    let owner;
    let account1;
    let account2;
    let account3;
    let account4;
    let account5;
    let BTR;

    before( async function(){
        const signers = await hre.ethers.getSigners();
        owner =  signers[0];
        account1 = signers[1];
        account2 = signers[2];
        account3 = signers[3];
        account4 = signers[4];
        account5 = signers[5];

        BTR = await hre.ethers.getContractFactory("BTR")
    })
    it("less than totalsupply when construct",async function(){
        await expect(BTR.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("100000000",18),ethers.parseUnits("100000000",18),ethers.parseUnits("100000000",18),ethers.parseUnits("100000000",18),ethers.parseUnits("100000000",18)])).to.be.revertedWith("TotalSupply is not Distributed");
    })

    it("more than totalsupply when construct",async function(){
        
        await expect(BTR.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("300000000",18)])).to.be.revertedWith("TotalSupply is not Distributed");
    })

    it("accounts.length is bigger then amounts.length",async function(){
        
        await expect(BTR.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18)])).to.be.revertedWith("Length Not Match");
    })

    it("accounts.length is less then amounts.length",async function(){
        
        await expect(BTR.deploy([owner,account1,account2,account3],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("300000000",18)])).to.be.revertedWith("Length Not Match");
    })

    it("construct balance is correct",async function(){
        const btr = await BTR.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18)]);
        // console.log(btr.target);
        const bao = await btr.balanceOf(account4.address);
        // console.log(bao.toString())
        expect(await btr.balanceOf(owner.address)).to.equal(ethers.parseUnits("200000000",18).toString());
    })
    it("BTR token details is correct",async function(){
        const btr = await BTR.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18)]);
        var name = await btr.name();
        var symbol = await btr.symbol();
        var decimal = await btr.decimals();

        expect(name).to.equal("BTR Token");
        expect(symbol).to.equal("BTR");
        expect(decimal).to.equal(18);

    })

    it("tranfer if correct",async function(){
        const btr = await BTR.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18)]);
        // console.log(btr.target);
        const bao = await btr.balanceOf(account4.address);
        // console.log(bao.toString())
        await btr.transfer(account4.address,ethers.parseUnits("100000000",18));
        expect(await btr.balanceOf(account4.address)).to.equal(ethers.parseUnits("300000000",18).toString());
        expect(await btr.balanceOf(owner.address)).to.equal(ethers.parseUnits("100000000",18).toString());
    })
    it("tranferFrom if correct",async function(){
        const btr = await BTR.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18)]);
        // console.log(btr.target);
        await btr.connect(account4).approve(owner.address,ethers.parseUnits("200000000",18));


        await btr.transferFrom(account4.address,account1.address,ethers.parseUnits("100000000",18));
        expect(await btr.balanceOf(account4.address)).to.equal(ethers.parseUnits("100000000",18).toString());
        expect(await btr.balanceOf(owner.address)).to.equal(ethers.parseUnits("200000000",18).toString());
        expect(await btr.balanceOf(account1.address)).to.equal(ethers.parseUnits("300000000",18).toString());
        expect(await btr.allowance(account4.address,owner.address)).to.equal(ethers.parseUnits("100000000",18).toString());
    })
    it('permit test',async function(){
        const btr = await BTR.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18)]);

        var nonce = await btr.nonces(owner.address);
        expect(nonce).to.be.equal(0);
        var domainSeparator = await btr.DOMAIN_SEPARATOR();
        // console.log(domainSeparator.toString());
     
        const deadline = await utils.getLatestTimestamp();
        const value = 100;

        const DDL0 = deadline + 700 ;
        var signature = await getPermitSignature(owner,btr,account5.address,value.toString(),DDL0.toString())
        

        await expect(btr.connect(account1).permit(
            owner.address,
            account5.address,
            value,
            DDL0,
            signature.v, 
            signature.r, 
            signature.s
        )).to.not.be.reverted;

        const allowance = await btr.allowance(owner.address,account5.address)
        expect(allowance).to.be.equal(100);

        var DDL1 = deadline - 700;
        var signature = await getPermitSignature(owner,btr,account5.address,value.toString(),DDL1.toString())

        await expect(btr.connect(account1).permit(
            owner.address,
            account5.address,
            value,
            DDL1,
            signature.v, 
            signature.r, 
            signature.s
        )).to.be.revertedWith("ERC20Permit: expired deadline");

        const DDL2 = deadline + 900;
        var signature = await getPermitSignature(owner,btr,account5.address,value.toString(),DDL2.toString())

        await expect(btr.connect(account1).permit(
            account1.address,
            account5.address,
            value,
            DDL2,
            signature.v, 
            signature.r, 
            signature.s
        )).to.be.revertedWith("ERC20Permit: invalid signature");
    })
})
