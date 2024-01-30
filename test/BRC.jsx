const hre = require("hardhat");
const {BigNumber} = require("ethers");
const {expect} = require("chai");
const ethers = hre.ethers;
const utils = require("./utils");
const { exitCode } = require("process");

describe("BRC test", function(){
    
    let owner;
    let account1;
    let account2;
    let account3;
    let account4;
    let mockToken;

    before( async function(){
        signers = await hre.ethers.getSigners();
        owner =  signers[0];
        account1 = signers[1];
        account2 = signers[2];
        account3 = signers[3];
        account4 = signers[4];

        BRC = await hre.ethers.getContractFactory("BRC")
    })
    it("less than totalsupply when construct",async function(){
        await expect(BRC.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("100000000",18),ethers.parseUnits("100000000",18),ethers.parseUnits("100000000",18),ethers.parseUnits("100000000",18),ethers.parseUnits("100000000",18)])).to.be.revertedWith("TotalSupply is not Distributed");
    })

    it("more than totalsupply when construct",async function(){
        
        await expect(BRC.deploy([owner,account1,account2,account3,account4],[ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("200000000",18),ethers.parseUnits("300000000",18)])).to.be.revertedWith("TotalSupply OverFlow");
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
})
