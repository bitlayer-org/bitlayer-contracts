const hre = require("hardhat");
const {BigNumber} = require("ethers");


async function getLatestTimestamp() {
    let block = await hre.ethers.provider.send("eth_getBlockByNumber", ['latest', false])
    return block.timestamp;
}

async function getLatestCoinbase() {
    return await hre.ethers.provider.send("eth_coinbase",[])
}

async function mineEmptyBlock() {
    await hre.ethers.provider.send("evm_mine");
}

function ethToGwei(value) {
    let gwei = hre.ethers.parseUnits(value, 18);
    return gwei;
}

function ethToWei(value) {
    let wei = hre.ethers.parseUnits(value, 18);
    return wei;
}

function weiToEth(value) {
    let eth = hre.ethers.formatUnits(value, 18);
    return eth;
}

function weiToGWei(value) {
    let eth = hre.ethers.formatUnits(value, 9);
    return eth;
}

function gweiToWei(value) {
    // Just because ether to Gwei is the same multiple as Gwei to Wei, this is lazy
    return hre.ethers.parseUnits(value, 9);
}
module.exports = {getLatestTimestamp, getLatestCoinbase, ethToGwei, ethToWei, weiToGWei, weiToEth, gweiToWei, mineEmptyBlock}