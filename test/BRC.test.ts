const hre = require("hardhat");
const {BigNumber} = require("ethers");
const {expect} = require("chai");
const ethers = hre.ethers;
const utils = require("./utils");
const { exitCode } = require("process");
const { ecsign } = require("ethereumjs-util");
import  getPermitSignature from "./signPermit";

describe("BRC test", function(){
    
    let owner;
    let account1;
    let account2;
    let account3;
    let account4;
    let account5;
    let BRC;

    before( async function(){
        const signers = await hre.ethers.getSigners();
        owner =  signers[0];
        account1 = signers[1];
        account2 = signers[2];
        account3 = signers[3];
        account4 = signers[4];
        account5 = signers[5];

        BRC = await hre.ethers.getContractFactory("BRC")
    })
    it("less than totalsupply when construct",async function(){
        await expect(BRC.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("100000000",18),ethers.parseUnits("100000000",18),ethers.parseUnits("100000000",18),ethers.parseUnits("100000000",18),ethers.parseUnits("100000000",18)])).to.be.revertedWith("TotalSupply is not Distributed");
    })

    it("more than totalsupply when construct",async function(){
        
        await expect(BRC.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("300000000",18)])).to.be.revertedWith("TotalSupply is not Distributed");
    })

    it("accounts.length is bigger then amounts.length",async function(){
        
        await expect(BRC.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18)])).to.be.revertedWith("Length Not Match");
    })

    it("accounts.length is less then amounts.length",async function(){
        
        await expect(BRC.deploy([owner,account1,account2,account3],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("300000000",18)])).to.be.revertedWith("Length Not Match");
    })

    it("construct balance is correct",async function(){
        const brc = await BRC.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18)]);
        console.log(brc.target);
        const bao = await brc.balanceOf(account4.address);
        console.log(bao.toString())
        expect(await brc.balanceOf(owner.address)).to.equal(ethers.parseUnits("200000000",18).toString());
    })
    it("BRC token details is correct",async function(){
        const brc = await BRC.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18)]);
        var name = await brc.name();
        var symbol = await brc.symbol();
        var decimal = await brc.decimals();

        expect(name).to.equal("BRC Token");
        expect(symbol).to.equal("BRC");
        expect(decimal).to.equal(18);

    })

    it("tranfer if correct",async function(){
        const brc = await BRC.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18)]);
        console.log(brc.target);
        const bao = await brc.balanceOf(account4.address);
        console.log(bao.toString())
        await brc.transfer(account4.address,ethers.parseUnits("100000000",18));
        expect(await brc.balanceOf(account4.address)).to.equal(ethers.parseUnits("300000000",18).toString());
        expect(await brc.balanceOf(owner.address)).to.equal(ethers.parseUnits("100000000",18).toString());
    })
    it("tranferFrom if correct",async function(){
        const brc = await BRC.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18)]);
        console.log(brc.target);
        await brc.connect(account4).approve(owner.address,ethers.parseUnits("200000000",18));


        await brc.transferFrom(account4.address,account1.address,ethers.parseUnits("100000000",18));
        expect(await brc.balanceOf(account4.address)).to.equal(ethers.parseUnits("100000000",18).toString());
        expect(await brc.balanceOf(owner.address)).to.equal(ethers.parseUnits("200000000",18).toString());
        expect(await brc.balanceOf(account1.address)).to.equal(ethers.parseUnits("300000000",18).toString());
        expect(await brc.allowance(account4.address,owner.address)).to.equal(ethers.parseUnits("100000000",18).toString());
    })
    it('permit test',async function(){
        const brc = await BRC.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18)]);
        
        var nonce = await brc.nonces(owner.address);
        expect(nonce).to.be.equal(0);
        var domainSeparator = await brc.DOMAIN_SEPARATOR();
        console.log(domainSeparator.toString());
     
        const deadline = await utils.getLatestTimestamp();
        const value = 100;

        const DDL0 = deadline + 700 ;
        var signature = await getPermitSignature(owner,brc,account5.address,value.toString(),DDL0.toString())
        

        await expect(brc.connect(account1).permit(
            owner.address,
            account5.address,
            value,
            DDL0,
            signature.v, 
            signature.r, 
            signature.s
        )).to.not.be.reverted;

        const allowance = await brc.allowance(owner.address,account5.address)
        expect(allowance).to.be.equal(100);

        var DDL1 = deadline - 700;
        var signature = await getPermitSignature(owner,brc,account5.address,value.toString(),DDL1.toString())

        await expect(brc.connect(account1).permit(
            owner.address,
            account5.address,
            value,
            DDL1,
            signature.v, 
            signature.r, 
            signature.s
        )).to.be.revertedWith("ERC20Permit: expired deadline");

        const DDL2 = deadline + 900;
        var signature = await getPermitSignature(owner,brc,account5.address,value.toString(),DDL2.toString())

        await expect(brc.connect(account1).permit(
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
