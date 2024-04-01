// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
contract BTR is ERC20, ERC20Permit {
    constructor (
        address[] memory accounts,
        uint256[] memory amounts
    ) ERC20("BTR Token","BTR") ERC20Permit("BTR Token"){
        uint256 tokenAmount = 1_000_000_000 ether;
        require(accounts.length == amounts.length,"Length Not Match");
        for(uint256 i = 0 ; i < accounts.length; i++){
            _mint(accounts[i], amounts[i]);
        }
        require(totalSupply() == tokenAmount, "TotalSupply is not Distributed");
    }
}