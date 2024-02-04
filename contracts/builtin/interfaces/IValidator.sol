// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "./types.sol";

interface IValidator {
    function state() external view returns (State);

    function validator() external view returns (address);

    function manager() external view returns (address);

    function totalStake() external view returns (uint);
    function totalUnWithdrawn() external view returns (uint);

    function addStake(uint256 _amount) external returns (RankingOp);

    function subStake(uint256 _amount, bool _isUnbound) external returns (RankingOp);

    // @return RankingOp
    // @return amount of stakes need to be subtracted from total stakes.
    function exitStaking() external returns (RankingOp, uint256);

    // validator receive fee rewards
    function receiveFee() external payable;

    // @dev validatorClaimAny will sends any rewards to the manager,
    //  and returns an amount of token that the Staking contract should send back to the manager.
    // @return an amount of token that the Staking contract should send back to the manager.
    function validatorClaimAny(address payable _recipient) external returns (uint256 _releasedStake);

    function addDelegation(uint256 _amount, address _delegator) external returns (RankingOp);

    function subDelegation(uint256 _amount, address _delegator, bool _isUnbound) external returns (RankingOp);

    function exitDelegation(address _delegator) external returns (RankingOp, uint256);

    function delegatorClaimAny(
        address payable _delegator
    ) external returns (uint256 _releasedStake, uint256 _forceUnbound);

    /**
     * @notice query the claimable unbound stakes and the claimable rewards.
     */
    function anyClaimable(address _stakeOwner) external view returns (uint claimableUnbound, uint claimableRewards);

    function punish(uint _factor) external;
}
