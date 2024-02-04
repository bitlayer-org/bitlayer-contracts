// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract Vault is AccessControl {
    using EnumerableSet for EnumerableSet.AddressSet;
    bytes32 constant public OwnerRole = keccak256("bitlayer.vault.owner");
    bytes32 constant public AdminRole = keccak256("bitlayer.vault.admin");
    uint256 constant public MaxDepoist = 21_000_000 ether;

    event WhitelistAdded(address indexed admin, address indexed whitelist);
    event WhitelistRemoved(address indexed admin, address indexed whitelist);
    event TreasureReleased(address indexed admin, address indexed receiver, uint amount);
    event TreasureDepoist(address indexed sender, uint256 amount);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    EnumerableSet.AddressSet whitelists;
    uint256 public totalDeposit;

    constructor(address owner, address[] memory admins) {
        for (uint i = 0; i < admins.length; ++i) {
            _grantRole(AdminRole, admins[i]);
        }

        _grantRole(OwnerRole, owner);
        _setRoleAdmin(AdminRole, OwnerRole);
    }

    receive() external payable {
        require(msg.value + totalDeposit <= MaxDepoist, "over max deposit");
        totalDeposit += msg.value;

        emit TreasureDepoist(msg.sender, msg.value);
    }

    function transferOwnership(
        address newOwner
    )
        external
        onlyRole(OwnerRole)
    {
        require(newOwner != msg.sender, "can not transfer to self");

        _grantRole(OwnerRole, newOwner);
        _revokeRole(OwnerRole, msg.sender);

        emit OwnershipTransferred(msg.sender, newOwner);
    }

    function addWhitelist(
        address[] calldata _whitelists
    )
        external
        onlyRole(AdminRole)
    {
        uint total = _whitelists.length;

        for (uint i = 0; i < total; ++i) {
            bool success = whitelists.add(_whitelists[i]);
            if (success) emit WhitelistAdded(msg.sender, _whitelists[i]);
        }
    }

    function removeWhitelist(
        address[] calldata _whitelists
    )
        external
        onlyRole(AdminRole)
    {
        uint total = _whitelists.length;

        for (uint i = 0; i < total; ++i) {
            bool success = whitelists.remove(_whitelists[i]);
            if (success) emit WhitelistRemoved(msg.sender, _whitelists[i]);
        }
    }

    function releaseTreasure(
        address receiver,
        uint256 amount
    )
        external
        onlyRole(AdminRole)
    {
        require(whitelists.contains(receiver), "receiver not whitelist");
        require(address(this).balance >= amount, "not enougt balance");

        payable(receiver).transfer(amount);

        emit TreasureReleased(msg.sender, receiver, amount);
    }

    function getWhitelists() external view returns(address[] memory) {
        return whitelists.values();
    }
}