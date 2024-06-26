// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;
/*
    Provides support and utilities for contract administration
*/
contract WithAdmin {
    address public admin; // Administrator. It's better a DAO (or a multiSigWallet).

    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "E02");
        _;
    }

    function changeAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0),"E09");
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminChanged(oldAdmin, newAdmin);
    }
}
