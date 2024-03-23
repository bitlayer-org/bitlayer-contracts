// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

// #if Mainnet
import "./Params.sol";
// #else
import "./mock/MockParams.sol";
// #endif
import "./interfaces/IValidator.sol";
import "./library/SortedList.sol";
import "./Validator.sol";
import "./WithAdmin.sol";
import "./interfaces/types.sol";
import "./library/initializable.sol";
import "./library/ReentrancyGuard.sol";
import "./library/SafeERC20.sol";
import "../interfaces/IERC20.sol";

contract Staking is Initializable, Params, SafeSend, WithAdmin, ReentrancyGuard {
    using SortedLinkedList for SortedLinkedList.List;

    struct LazyPunishRecord {
        uint256 missedBlocksCounter;
        uint256 index;
        bool exist;
    }

    enum Operation {
        DistributeFee,
        UpdateValidators,
        UpdateRewardsPerBlock,
        LazyPunish,
        DecreaseMissingBlockCounter
    }

    IValidator private constant EMPTY_ADDRESS = IValidator(address(0));
    uint256 public constant BackupValidatorFeePercent = 24; // 80% * 30%
    uint256 public constant ActiveValidatorFeePercent = 56; // 80% * 70%

    // BRC token address.
    // Note: The decimals MUST BE 18, this Staking contract just take it 18 without validation.
    IERC20 public brcToken;

    bool public isOpened; // true means any one can register to be a validator without permission. default: false

    // validators that can take part in the consensus
    address[] activeValidators;
    address[] backupValidators;
    mapping(address => uint8) actives;

    address[] public allValidatorAddrs; // all validator addresses, for traversal purpose
    mapping(address => IValidator) public valMaps; // mapping from validator address to validator contract.
    // A sorted linked list of all valid validators
    SortedLinkedList.List topValidators;

    // staking rewards relative fields
    uint256 public totalStakes; // Total stakes

    // necessary restriction for the miner to update some consensus relative value
    uint public blockEpoch; //set on initialize,
    mapping(uint256 => mapping(Operation => bool)) operationsDone;

    address payable public foundationPool;

    mapping(address => LazyPunishRecord) lazyPunishRecords;
    address[] public lazyPunishedValidators;

    event LogDecreaseMissedBlocksCounter();
    event LogLazyPunishValidator(address indexed val, uint256 time);

    event PermissionLess(bool indexed opened);

    // ValidatorRegistered event emits when a new validator registered
    event ValidatorRegistered(
        address indexed val,
        address indexed manager,
        uint256 commissionRate,
        uint256 stake,
        State st
    );
    event TotalStakesChanged(address indexed changer, uint oldStake, uint newStake);
    // emits when a user do a claim and with unbound stake be withdrawn.
    event StakeWithdrawn(address indexed val, address indexed recipient, uint amount);
    // emits when a user do a claim and there's no unbound stake need to return.
    event ClaimWithoutUnboundStake(address indexed val);

    modifier onlyNotExists(address _val) {
        require(valMaps[_val] == EMPTY_ADDRESS, "E07");
        _;
    }

    modifier onlyExists(address _val) {
        require(valMaps[_val] != EMPTY_ADDRESS, "E08");
        _;
    }

    modifier onlyExistsAndByManager(address _val) {
        IValidator val = valMaps[_val];
        require(val != EMPTY_ADDRESS, "E08");
        require(val.manager() == msg.sender, "E02");
        _;
    }

    modifier onlyOperateOnce(Operation operation) {
        require(!operationsDone[block.number][operation], "E06");
        operationsDone[block.number][operation] = true;
        _;
    }

    modifier onlyBlockEpoch() {
        require(block.number % blockEpoch == 0, "E17");
        _;
    }

    // initialize the staking contract, mainly for the convenient purpose to init different chains
    function initialize(
        address _admin,
        address _brcAddress,
        uint256 _epoch,
        address payable _foundationPool
    ) external initializer onlyValidAddress(_admin) onlyValidAddress(_brcAddress) {
        require(_epoch > 0, "E10");
        require(_admin != address(0) && _brcAddress != address(0) && _foundationPool != address(0),"args should not be address 0");
        admin = _admin;
        brcToken = IERC20(_brcAddress);
        blockEpoch = _epoch;
        foundationPool = _foundationPool;
    }

    // @param _stakes, the staking amount in ether.
    function initValidator(
        address _val,
        address _manager,
        uint _rate,
        bool _acceptDelegation
    ) external onlyInitialized onlyNotExists(_val) {
        // only on genesis block for the chain initialize code to execute
        // #if Mainnet
        require(block.number == 0, "E13");
        // #endif
        // invalid initial params
        // create a funder validator with state of Ready
        IValidator val = new Validator(_val, _manager, _rate, 0, _acceptDelegation, State.Ready);
        allValidatorAddrs.push(_val);
        valMaps[_val] = val;

        topValidators.improveRanking(val);
    }

    //** basic management **

    // @dev removePermission will make the register of new validator become permission-less.
    // can be run only once.
    function removePermission() external onlyAdmin {
        //already permission-less
        require(!isOpened, "E16");
        isOpened = true;
        emit PermissionLess(isOpened);
    }

    function changeFoundationPool(address payable _foundationPool) external onlyAdmin {
        require(_foundationPool != address(0),"foundationPool should not be address 0");
        foundationPool = _foundationPool;
    }

    // ** end of basic management **

    // ** functions that will be called by the chain-code **

    // @dev the chain-code can call this to get top n validators by totalStakes
    function getTopValidators(uint8 _count) external view returns (address[] memory) {
        // Use default MaxValidators if _count is not provided.
        if (_count == 0) {
            _count = MaxValidators;
        }
        // set max limit: min(_count, list.length)
        if (_count > topValidators.length) {
            _count = topValidators.length;
        }

        address[] memory _topValidators = new address[](_count);

        IValidator _cur = topValidators.head;
        for (uint8 i = 0; i < _count; i++) {
            _topValidators[i] = _cur.validator();
            _cur = topValidators.next[_cur];
        }

        return _topValidators;
    }

    function updateActiveValidatorSet(
        address[] memory _newSet
    )
        external
        // #if Mainnet
        onlyEngine
        // #endif
        onlyOperateOnce(Operation.UpdateValidators)
        onlyBlockEpoch
    {
        // empty validators set
        require(_newSet.length > 0, "E18");
        uint256 activeValidatorsLen = activeValidators.length;
        for (uint8 i = 0; i < activeValidatorsLen; i++) {
            actives[activeValidators[i]] = 0;
        }

        activeValidators = _newSet;
        uint256 activeValidatorsLenNew = _newSet.length;
        for (uint8 i = 0; i < activeValidatorsLenNew; i++) {
            actives[activeValidators[i]] = 1;
            IValidator _pool = valMaps[activeValidators[i]];
            if (_pool == EMPTY_ADDRESS) {
                revert();
            }
        }

        delete backupValidators;
        uint8 _size = MaxBackups;
        IValidator _cur = topValidators.head;
        while (_size > 0 && _cur != EMPTY_ADDRESS) {
            if (actives[_cur.validator()] == 0) {
                backupValidators.push(_cur.validator());
                _size--;
            }
            _cur = topValidators.next[_cur];
        }
    }

    // distributeBlockFee distributes block fees to all active validators
    function distributeBlockFee()
        external
        payable
        // #if Mainnet
        onlyEngine
        // #endif
        onlyOperateOnce(Operation.DistributeFee)
    {
        // distribute the fees at the end of a epoch
        if ((block.number + 1) % blockEpoch == 0) {
            uint256 fees = address(this).balance;
            if (fees > 0) {
                /**+
                 * 1. 80% * 30% to backup validators(if any), distribute by staking
                 * 2. 80% * 70% (or if there's no backup validators, then just 80%) to active validators.
                 * 3. the left(about 20%) to foundationPool;
                 */
                uint allFee = fees * COEFFICIENT;
                uint left = fees;

                uint activeRewards = (allFee * ActiveValidatorFeePercent) / 100;
                uint backupRewards = (allFee * BackupValidatorFeePercent) / 100;
                if (backupValidators.length > 0) {
                    left = distributeFeeToVals(left, backupRewards, backupValidators);
                } else {
                    activeRewards += backupRewards;
                }

                left = distributeFeeToVals(left, activeRewards, activeValidators);

                // the left should be around 20%
                sendValue(foundationPool, left);
            }
        }
    }

    function distributeFeeToVals(
        uint left,
        uint totalRewardsEnlarged,
        address[] memory validators
    ) internal returns (uint) {
        uint256 currTotal = 0;
        uint cnt = validators.length;
        for (uint i = 0; i < cnt; i++) {
            IValidator ival = valMaps[validators[i]];
            currTotal += ival.totalStake();
        }
        // On the chain launch stage, the initial validators have no stakes
        if (currTotal == 0) {
            uint reward = (totalRewardsEnlarged / cnt) / COEFFICIENT;
            for (uint i = 0; i < cnt; i++) {
                IValidator val = valMaps[validators[i]];
                val.receiveFee{value: reward}();
            }
            left -= reward * cnt;
        } else {
            // rewards per stake
            uint rps = totalRewardsEnlarged / currTotal;
            for (uint i = 0; i < cnt; i++) {
                IValidator ival = valMaps[validators[i]];
                uint reward = (rps * ival.totalStake()) / COEFFICIENT;
                ival.receiveFee{value: reward}();
                left -= reward;
            }
        }
        return left;
    }

    function getActiveValidators() external view returns (address[] memory) {
        return activeValidators;
    }

    function getBackupValidators() external view returns (address[] memory) {
        return backupValidators;
    }

    // @dev punish do a lazy punish to the validator that missing propose a block.
    function lazyPunish(
        address _val
    )
        external
        // #if Mainnet
        onlyEngine
        // #endif
        onlyExists(_val)
        onlyOperateOnce(Operation.LazyPunish)
    {
        if (!lazyPunishRecords[_val].exist) {
            lazyPunishRecords[_val].index = lazyPunishedValidators.length;
            lazyPunishedValidators.push(_val);
            lazyPunishRecords[_val].exist = true;
        }
        lazyPunishRecords[_val].missedBlocksCounter++;

        if (lazyPunishRecords[_val].missedBlocksCounter % LazyPunishThreshold == 0) {
            doSlash(_val, LazyPunishFactor);
            // reset validator's missed blocks counter
            lazyPunishRecords[_val].missedBlocksCounter = 0;
        }

        emit LogLazyPunishValidator(_val, block.timestamp);
    }

    // @dev decreaseMissedBlocksCounter will decrease the missedBlocksCounter at DecreaseRate at each epoch.
    function decreaseMissedBlocksCounter()
        external
        // #if Mainnet
        onlyEngine
        // #endif
        onlyBlockEpoch
        onlyOperateOnce(Operation.DecreaseMissingBlockCounter)
    {
        if (lazyPunishedValidators.length == 0) {
            return;
        }

        uint cnt = lazyPunishedValidators.length;
        for (uint256 i = cnt; i > 0; i--) {
            address _val = lazyPunishedValidators[i - 1];

            if (lazyPunishRecords[_val].missedBlocksCounter > DecreaseRate) {
                lazyPunishRecords[_val].missedBlocksCounter -= DecreaseRate;
            } else {
                if (i != cnt) {
                    // not the last one, swap
                    address tail = lazyPunishedValidators[cnt - 1];
                    lazyPunishedValidators[i - 1] = tail;
                    lazyPunishRecords[tail].index = i - 1;
                }
                // delete the last one
                lazyPunishedValidators.pop();
                lazyPunishRecords[_val].missedBlocksCounter = 0;
                lazyPunishRecords[_val].index = 0;
                lazyPunishRecords[_val].exist = false;
                cnt -= 1;
            }
        }

        emit LogDecreaseMissedBlocksCounter();
    }

    function doSlash(address _val, uint _factor) private {
        IValidator val = valMaps[_val];
        // the slash amount will calculate from unWithdrawn stakes,
        // and then slash immediately, and first try subtracting the slash amount from staking record.
        // If there's no enough stake, it means some of the slash amount will come from the pending unbound staking.
        uint slashAmount = (val.totalUnWithdrawn() * _factor) / PunishBase;
        uint amountFromCurrStakes = slashAmount;
        if (val.totalStake() < slashAmount) {
            amountFromCurrStakes = val.totalStake();
        }
        totalStakes -= amountFromCurrStakes;
        emit TotalStakesChanged(_val, totalStakes + amountFromCurrStakes, totalStakes);

        val.punish(_factor);
        // remove from ranking immediately
        topValidators.removeRanking(val);
    }

    // ** END of functions that will be called by the chain-code **

    // *** Functions of staking and delegating ***

    /**
     * @dev register a new validator by user ( on permission-less stage) or by admin (on permission stage)
     */
    function registerValidator(
        address _val,
        address _manager,
        uint _rate,
        uint _stakeAmount,
        bool _acceptDelegation
    ) external onlyNotExists(_val) {
        if (isOpened) {
            // need minimal self stakes on permission-less stage
            require(_stakeAmount >= MinSelfStakes, "E20");
        } else {
            // admin only on permission stage
            require(msg.sender == admin, "E21");
        }
        takeStakedToken(_manager, _stakeAmount);
        // Default state is Idle, when the stakes >= ThresholdStakes, then the validator will be Ready immediately.
        State vState = State.Idle;
        if (_stakeAmount >= ThresholdStakes) {
            vState = State.Ready;
        }
        // Create a validator with given info, and updates allValAddrs, valMaps, totalStake
        IValidator val = new Validator(_val, _manager, _rate, _stakeAmount, _acceptDelegation, vState);
        allValidatorAddrs.push(_val);
        valMaps[_val] = val;

        totalStakes += _stakeAmount;
        // If the validator is Ready, add it to the topValidators and sort
        if (vState == State.Ready) {
            topValidators.improveRanking(val);
        }
        emit ValidatorRegistered(_val, _manager, _rate, _stakeAmount, vState);
        emit TotalStakesChanged(_val, totalStakes - _stakeAmount, totalStakes);
    }

    function takeStakedToken(address _tokenOwner, uint256 _amount) internal {
        if (_amount > 0) {
            mustConvertStake(_amount);
            uint currAllowance = brcToken.allowance(_tokenOwner, address(this));
            uint balance = brcToken.balanceOf(_tokenOwner);
            require(currAllowance >= _amount, "E43"); //not enough allowance
            require(balance >= _amount, "E44"); //not enough balance
            SafeERC20.safeTransferFrom(brcToken, _tokenOwner, address(this), _amount);
        }
    }

    /**
     * @dev addStake is used for a validator to add it's self stake
     * @param _val the validator address
     * @param _amount the stake amount
     */
    function addStake(address _val, uint256 _amount) external onlyExistsAndByManager(_val) {
        addStakeOrDelegation(_val, msg.sender, _amount, true, false);
    }

    /**
     * @dev addDelegation is used for user to delegate its token to a specific validator
     * @param _val the validator address
     * @param _amount the stake amount
     */
    function addDelegation(address _val, uint256 _amount) external onlyExists(_val) {
        addStakeOrDelegation(_val, msg.sender, _amount, false, false);
    }

    function addStakeOrDelegation(address _val, address _tokenOwner, uint256 _amount, bool _byValidator, bool _reStaking) private {
        require(_amount > 0, "E14");
        if(!_reStaking){
            takeStakedToken(_tokenOwner, _amount);
        }
    
        IValidator val = valMaps[_val];
        RankingOp op = RankingOp.Noop;
        if (_byValidator) {
            op = val.addStake(_amount);
        } else {
            op = val.addDelegation(_amount, _tokenOwner);
        }
        // add total stake
        totalStakes += _amount;

        updateRanking(val, op);

        emit TotalStakesChanged(_val, totalStakes - _amount, totalStakes);
    }

    // @dev subStake is used for a validator to subtract it's self stake.
    // @param _amount, the subtraction amount.
    function subStake(address _val, uint256 _amount) external onlyExistsAndByManager(_val) {
        subStakeOrDelegation(_val, _amount, true, true);
    }

    function subDelegation(address _val, uint256 _amount) external onlyExists(_val) {
        subStakeOrDelegation(_val, _amount, false, true);
    }

    function subStakeOrDelegation(address _val, uint256 _amount, bool _byValidator, bool _isUnbound) private {
        // the input _amount should not be zero
        require(_amount > 0, "E23");

        IValidator val = valMaps[_val];
        RankingOp op = RankingOp.Noop;
        if (_byValidator) {
            op = val.subStake(_amount, _isUnbound);
        } else {
            op = val.subDelegation(_amount, payable(msg.sender), _isUnbound);
        }
        afterLessStake(_val, val, _amount, op);
    }

    function exitStaking(address _val) external onlyExistsAndByManager(_val) {
        doExit(_val, true);
    }

    function exitDelegation(address _val) external onlyExists(_val) {
        doExit(_val, false);
    }

    function doExit(address _val, bool byValidator) private returns (uint256) {
        IValidator val = valMaps[_val];
        RankingOp op = RankingOp.Noop;
        uint amount = 0;
        if (byValidator) {
            (op, amount) = val.exitStaking();
        } else {
            (op, amount) = val.exitDelegation(msg.sender);
        }
        afterLessStake(_val, val, amount, op);
        return amount;
    }

    /**
     * @dev reStaking is used for a validator to move it's self stake.
     * @param _oldVal, the validitor moved from.
     * @param _newVal, the validitor moved to.
     **/

    function reStaking(
        address _oldVal,
        address _newVal,
        uint256 _amount
    ) external nonReentrant onlyExistsAndByManager(_oldVal) onlyExists(_newVal) {
        doReStake(_oldVal, _newVal, _amount, true);
    }

    /**
     * @dev reDelegation is used for a user to move it's self stake.
     * @param _oldVal, the validitor moved from.
     * @param _newVal, the validitor moved to.
     **/
    function reDelegation(
        address _oldVal,
        address _newVal,
        uint256 _amount
    ) external nonReentrant onlyExists(_oldVal) onlyExists(_newVal) {
        doReStake(_oldVal, _newVal, _amount, false);
    }

    function doReStake(address _oldVal, address _newVal, uint256 _amount, bool _byValidator) private {
        require(_amount > 0, "E23");

        IValidator oldVal = valMaps[_oldVal];
        RankingOp op = RankingOp.Noop;

        if (_byValidator) {
            doClaimAny(_oldVal, true);
            op = oldVal.subStake(_amount, false);
        } else {
            doClaimAny(_oldVal, false);
            op = oldVal.subDelegation(_amount, msg.sender, false);
        }
        afterLessStake(_oldVal, oldVal, _amount, op);
        addStakeOrDelegation(_newVal, msg.sender, _amount, false, true);
    }

    // @dev validatorClaimAny claims any token that can be send to the manager of the specific validator.
    function validatorClaimAny(address _val) external onlyExistsAndByManager(_val) nonReentrant {
        doClaimAny(_val, true);
    }

    function delegatorClaimAny(address _val) external onlyExists(_val) nonReentrant {
        doClaimAny(_val, false);
    }

    function doClaimAny(address _val, bool byValidator) private {
        // call IValidator function
        IValidator val = valMaps[_val];
        // the releaseAmount had been deducted from totalStake at the time doing subtract or exit staking,
        // so we don't need to update the totalStake in here, just send it back to the owner.
        uint releaseAmount = 0;
        address payable recipient = payable(msg.sender);
        if (byValidator) {
            releaseAmount = val.validatorClaimAny(recipient);
        } else {
            uint forceUnbound = 0;
            (releaseAmount, forceUnbound) = val.delegatorClaimAny(recipient);
            if (forceUnbound > 0) {
                totalStakes -= forceUnbound;
            }
        }
        if (releaseAmount > 0) {
            SafeERC20.safeTransfer(brcToken, msg.sender, releaseAmount);
            emit StakeWithdrawn(_val, msg.sender, releaseAmount);
        } else {
            emit ClaimWithoutUnboundStake(_val);
        }
    }

    // @dev mustConvertStake convert a value in wei to ether, and if the value is not an integer multiples of ether, it revert.
    function mustConvertStake(uint256 _value) private pure returns (uint256) {
        uint eth = _value / 1 ether;
        // staking amount must >= 1 StakeUnit
        require(eth >= StakeUnit, "E25");
        // the value must be an integer multiples of ether
        require((eth * 1 ether) == _value, "E26");
        return eth;
    }

    function afterLessStake(address _val, IValidator val, uint _amount, RankingOp op) private {
        totalStakes -= _amount;
        updateRanking(val, op);
        emit TotalStakesChanged(_val, totalStakes + _amount, totalStakes);
    }

    function updateRanking(IValidator val, RankingOp op) private {
        if (op == RankingOp.Up) {
            topValidators.improveRanking(val);
        } else if (op == RankingOp.Down) {
            topValidators.lowerRanking(val);
        } else if (op == RankingOp.Remove) {
            topValidators.removeRanking(val);
        }
        return;
    }

    // ** functions for query ***

    /**
     * @notice anyClaimable returns how much unbound stakes and rewards can be currently claimed
     * @param _val the validator address
     * @param _stakeOwner for delegator, this is the delegator address; for validator, this must be the manager(admin) address of the validator.
     * @return claimableUnbound
     * @return claimableRewards
     */
    function anyClaimable(
        address _val,
        address _stakeOwner
    ) external view returns (uint claimableUnbound, uint claimableRewards) {
        if (valMaps[_val] == EMPTY_ADDRESS) {
            return (0, 0);
        }
        IValidator val = valMaps[_val];
        return val.anyClaimable(_stakeOwner);
    }

    function getAllValidatorsLength() external view returns (uint) {
        return allValidatorAddrs.length;
    }

    function getPunishValidatorsLen() public view returns (uint256) {
        return lazyPunishedValidators.length;
    }

    function getPunishRecord(address _val) public view returns (uint256) {
        return lazyPunishRecords[_val].missedBlocksCounter;
    }
}
