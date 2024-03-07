// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


contract BRC is ERC20 {
    constructor (
        address[] memory accounts,
        uint256[] memory amounts
    ) public ERC20("BRC Token","BRC"){
        uint256 tokenAmount = 1000000000 ether;
        require(accounts.length == amounts.length,"Length Not Match");
        for(uint256 i = 0 ; i < accounts.length; i++){
            _mint(accounts[i], amounts[i]);
        }
        require(totalSupply() == tokenAmount, "TotalSupply is not Distributed");
    }    
}