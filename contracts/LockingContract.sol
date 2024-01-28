// SPDX-License-Identifier: MIT
import "./interfaces/IERC20.sol";

pragma solidity ^0.8.0;


contract LockingContract {

    struct VestingSchedule {
        uint256 totalStakingAmount;
        uint256 releasedAmount;
        bool isActive;
    }
   
    uint256 public cliffPeriods;
    uint256 public vestingPeriods;

    uint256 public periodTime;
    address public StakingToken;
    uint256 public startTimestamp;

    mapping(address => VestingSchedule) public vestingSchedules;

    event BeneficiaryChanged(address indexed oldBeneficiary, address indexed newBeneficiary);
    event TokensReleased(address indexed beneficiary, uint256 amount);

    constructor(
        address[] memory beneficiaries,
        uint256[] memory totalStakingAmount,
        uint256 _cliffPeriods,
        uint256 _vestingPeriods,
        uint256 _periodTime,
        address _stakingToken
    ) {
        require(
            beneficiaries.length == totalStakingAmount.length,
            "Invalid input length"
        );

        for (uint256 i = 0; i < beneficiaries.length; i++) {
            require(totalStakingAmount[i] > 0, "Total tokens must be greater than zero");

            vestingSchedules[beneficiaries[i]] = VestingSchedule(
                totalStakingAmount[i],
                0,
                true
            );
        }
        cliffPeriods = _cliffPeriods;
        vestingPeriods = _vestingPeriods;
        periodTime = _periodTime;
        StakingToken = _stakingToken;

        startTimestamp = block.timestamp;

    }

    // change the beneficiary to a new account
    function changeBeneficiary(address newBeneficiary) external {
        VestingSchedule storage schedule = vestingSchedules[msg.sender];
        require(schedule.isActive, "No active vesting schedule found");
        require(!vestingSchedules[newBeneficiary].isActive,"NewBeneficiary is Active");

        vestingSchedules[newBeneficiary] = schedule;
        schedule.isActive = false;
        delete vestingSchedules[msg.sender];

        emit BeneficiaryChanged(msg.sender, newBeneficiary);
    }

    function getVestingAmount(address beneficiary) public view returns (uint256) {
        VestingSchedule memory schedule = vestingSchedules[beneficiary];
        require(schedule.isActive, "No active vesting schedule found");

        uint256 currentPeriod = getCurrentPeriod();
        uint256 totalVestingAmount = 0;
        if(currentPeriod <= cliffPeriods){
            return 0;
        }else{
            uint256 vestingPeriod = currentPeriod - cliffPeriods;
            totalVestingAmount = schedule.totalStakingAmount * vestingPeriod /vestingPeriods;
        }

        return totalVestingAmount;
    }

    function getCurrentPeriod() internal view returns (uint256) {
        uint256 currentTimestamp = block.timestamp;
        uint256 timePassed = currentTimestamp - startTimestamp;
        uint256 currentPeriod = timePassed / periodTime;

        if (currentPeriod >= (vestingPeriods + cliffPeriods)) {
            currentPeriod = vestingPeriods + cliffPeriods;
        }

        return currentPeriod;
    }

    function claim() external {
        VestingSchedule storage schedule = vestingSchedules[msg.sender];
        require(schedule.isActive, "No active vesting schedule found");

        uint256 currentPeriod = getCurrentPeriod();
        require(currentPeriod > cliffPeriods, "Cliff period has not ended yet");

        uint256 totalVestingAmount = getVestingAmount(msg.sender);
        uint256 tokensToRelease = totalVestingAmount - schedule.releasedAmount;
        require(tokensToRelease > 0, "No tokens available for release");

        schedule.releasedAmount += tokensToRelease;

        require(tokensToRelease <=  IERC20(StakingToken).balanceOf(address(this)),"Insufficient balance");
        
        require(schedule.releasedAmount <= schedule.totalStakingAmount,"Vesting ended");

        IERC20(StakingToken).transfer(msg.sender, tokensToRelease);

        emit TokensReleased(msg.sender, tokensToRelease);
    }
}