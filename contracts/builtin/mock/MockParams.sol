// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

// for testcase only
contract Params {

    // The enlarge enlarge multiples for the accRewardsPerStake
    uint internal constant COEFFICIENT = 1e18;
    // System params
    uint8 public constant MaxValidators = 21;
    uint8 public constant MaxBackups = 79;

    uint public constant MaxStakes = 24_000_000 ether; //  max total stakes for a validator
    // min total stakes for a validator to be a valid candidate.
    // Note: set it to MinSelfStakes so we can disable this requirement without changing the code.
    uint public constant ThresholdStakes = 50_000 ether;
    uint public constant MinSelfStakes = 50_000 ether; // min self stakes for a user to register a validator
    uint public constant StakeUnit = 1; // ether

    uint public constant JailPeriod = 86400; //
    uint public constant UnboundLockPeriod = 0; // Seconds delay when a validator unbound staking.
    uint256 public constant PunishBase = 1000;
    uint256 public constant LazyPunishFactor = 1; // the punish factor when validator failed to propose blocks for specific times
    uint256 public constant LazyPunishThreshold = 3; // accumulate amount of missing blocks for a validator to be punished
    uint256 public constant DecreaseRate = 1; // the allowable amount of missing blocks in one epoch for each validator


    modifier onlyMiner() {
        require(msg.sender == block.coinbase, "E40");
        _;
    }

    modifier onlyValidAddress(address _address) {
        require(_address != address(0), "E09");
        _;
    }
}
