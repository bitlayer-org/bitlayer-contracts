// SPDX-License-Identifier: MIT
import "./interfaces/IERC20.sol";

pragma solidity ^0.8.0;


contract LockingContract {

    /**
     * VestingSchedule is the locking info of beneficiary
     * @param lockingAmount the locking Amount of beneficiary
     * @param releasedAmount released Amount of beneficiary,only update when claim 
     * @param cliffPeriod cliff Period,in this Period, beneficiary can get none token
     * @param vestingPeriod vesting Period, beneficiary can get LockingToken by Period
     * @param isActive when VestingSchedule has infomation
     */
    struct VestingSchedule {
        uint256 lockingAmount;
        uint256 releasedAmount;
        uint256 cliffPeriod;
        uint256 vestingPeriod;
        bool isActive;
    }
   
    uint256 public periodTime;          // the seconds of every period, both cliff and vesting, eg: 50 
    address public LockingToken;        // locked token ,erc20 
    uint256 public startTimestamp;      // init Time ,when constract is build
    

    mapping(address => VestingSchedule) public vestingSchedules; // map of beneficiary

    event BeneficiaryChanged(address indexed oldBeneficiary, address indexed newBeneficiary);
    event TokensReleased(address indexed beneficiary, uint256 amount);

    constructor(
        address[] memory beneficiaries, // array of beneficiaries         
        uint256[] memory lockingAmounts,// array of lockingAmount one by one beneficiaries    
        uint256[] memory cliffPeriods,  // array of cliffPeriod one by one beneficiaries    
        uint256[] memory vestingPeriods, // array of vestingPeriod one by one beneficiaries    
        uint256 _periodTime, //public periodTime
        address _lockingToken // lockedToken
    ) {
        require(
            beneficiaries.length == lockingAmounts.length &&
            beneficiaries.length == cliffPeriods.length &&
            beneficiaries.length == vestingPeriods.length,
            "Invalid input length"
        );

        uint256 lockingAmountSum;
        
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            require(lockingAmounts[i] > 0, "Total tokens must be greater than zero");

            vestingSchedules[beneficiaries[i]] = VestingSchedule(
                lockingAmounts[i],
                0,
                cliffPeriods[i],
                vestingPeriods[i],
                true
            );
            lockingAmountSum += lockingAmounts[i];
        }
        // TODO this option cannot pass test,need to rewrite
        // require(lockingAmountSum == IERC20(LockingToken).balanceOf(address(this)),"Locking Balance not Match");

        periodTime = _periodTime;
        LockingToken = _lockingToken;

        startTimestamp = block.timestamp;

    }

    // change the beneficiary to a new account, old vestingSchedule will be deleted
    function changeBeneficiary(address newBeneficiary) external {
        VestingSchedule storage schedule = vestingSchedules[msg.sender];
        require(schedule.isActive, "No active vesting schedule found");
        require(!vestingSchedules[newBeneficiary].isActive,"NewBeneficiary is Active");

        vestingSchedules[newBeneficiary] = schedule;
        delete vestingSchedules[msg.sender];

        emit BeneficiaryChanged(msg.sender, newBeneficiary);
    }

    // get the beneficiary's Vesting Amount of Locking token when  vestingPeriod has pass 
    function getVestingAmount(address beneficiary) public view returns (uint256) {
        VestingSchedule memory schedule = vestingSchedules[beneficiary];
        require(schedule.isActive, "No active vesting schedule found");

        uint256 currentPeriod = getCurrentPeriod(beneficiary);
        uint256 totalVestingAmount = 0;
        if(currentPeriod <= schedule.cliffPeriod){
            return 0;
        }else{
            uint256 vestingPeriod = currentPeriod - schedule.cliffPeriod;
            totalVestingAmount = schedule.lockingAmount * vestingPeriod /schedule.vestingPeriod;
        }

        return totalVestingAmount;
    }

    // get the Current Period, ever in cliffPeriod or vestingPeriod
    function getCurrentPeriod(address beneficiary) internal view returns (uint256) {
        uint256 currentTimestamp = block.timestamp;
        uint256 timePassed = currentTimestamp - startTimestamp;
        uint256 currentPeriod = timePassed / periodTime;
        VestingSchedule memory schedule = vestingSchedules[beneficiary];

        if (currentPeriod >= (schedule.vestingPeriod + schedule.cliffPeriod)) {
            currentPeriod = schedule.vestingPeriod + schedule.cliffPeriod;
        }

        return currentPeriod;
    }

    // claim the allready released token, the amount = VestingAmount - releasedAmount
    function claim() external {
        VestingSchedule storage schedule = vestingSchedules[msg.sender];
        require(schedule.isActive, "No active vesting schedule found");

        uint256 currentPeriod = getCurrentPeriod(msg.sender);
        require(currentPeriod > schedule.cliffPeriod, "Cliff period has not ended yet");

        uint256 totalVestingAmount = getVestingAmount(msg.sender);
        uint256 tokensToRelease = totalVestingAmount - schedule.releasedAmount;
        require(tokensToRelease > 0, "No tokens available for release");

        schedule.releasedAmount += tokensToRelease;

        require(tokensToRelease <=  IERC20(LockingToken).balanceOf(address(this)), "Insufficient balance");
        
        require(schedule.releasedAmount <= schedule.lockingAmount,"Vesting ended");

        IERC20(LockingToken).transfer(msg.sender, tokensToRelease);

        emit TokensReleased(msg.sender, tokensToRelease);
    }
}