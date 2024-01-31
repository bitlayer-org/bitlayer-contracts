// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

// #if Mainnet
import "./Params.sol";
// #else
import "./mock/MockParams.sol";
// #endif
import "./interfaces/IValidator.sol";
import "./interfaces/types.sol";
import "./WithAdmin.sol";
import "./library/SafeSend.sol";

/**
About punish:
    When the validator was punished, all delegator will also be punished,
    and the punishment will be done when a delegator do any action.
*/
contract Validator is Params, WithAdmin, SafeSend, IValidator {
    // Delegation records all information about a delegation
    struct Delegation {
        bool exists; // indicates whether the delegator already exist
        uint stake; // stake amount
        uint settled; // settled rewards
        uint debt; // debt for the calculation of staking rewards, wei
        uint punishFree; // factor that this delegator free to be punished. For a new delegator or a delegator that already punished, this value will equal to accPunishFactor.
    }

    struct PendingUnbound {
        uint amount;
        uint lockEnd;
    }
    // UnboundRecord records all pending unbound for a user
    struct UnboundRecord {
        uint count; // total pending unbound number;
        uint startIdx; // start index of the first pending record. unless the count is zero, otherwise the startIdx will only just increase.
        uint pendingAmount; // total pending stakes
        mapping(uint => PendingUnbound) pending;
    }

    address public owner; // It must be the Staking contract address. For convenient.
    address public override validator; // the address that represents a validator and will be used to take part in the consensus.
    uint256 public commissionRate; // base 100
    uint256 public selfStake; // self stake
    uint256 public override totalStake; // total stakes, = selfStake + allOtherDelegation
    bool public acceptDelegation; // Does this validator accepts delegation
    State public override state;
    uint256 public totalUnWithdrawn;

    // these values are all enlarged by COEFFICIENT times.
    uint256 private currCommission; // current withdraw-able commission
    uint256 private accRewardsPerStake; // accumulative rewards per stake
    uint256 private selfSettledRewards;
    uint256 private selfDebt; // debt for the calculation of inner staking rewards

    uint256 public exitLockEnd;

    // the block number that this validator was punished
    uint256 public punishBlk;
    // accumulative punish factor base on PunishBase
    uint256 public accPunishFactor;

    address[] public allDelegatorAddrs; // all delegator address, for traversal purpose
    mapping(address => Delegation) public delegators; // delegator address => delegation
    mapping(address => UnboundRecord) public unboundRecords;

    event StateChanged(address indexed val, address indexed changer, State oldSt, State newSt);
    event StakesChanged(address indexed val, address indexed changer, uint indexed stake);

    event RewardsWithdrawn(address indexed val, address indexed recipient, uint amount);

    // A valid commission rate must in the range [0,100]
    modifier onlyValidRate(uint _rate) {
        require(_rate <= 100, "E27");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "E01");
        _;
    }

    modifier onlyCanDoStaking() {
        // can't do staking at current state
        require(canDoStaking() == true, "E28");
        _;
    }

    // @param _stake, the staking amount of ether
    constructor(
        address _validator,
        address _manager,
        uint _rate,
        uint _stake,
        bool _acceptDlg,
        State _state
    ) onlyValidAddress(_validator) onlyValidAddress(_manager) onlyValidRate(_rate) {
        require(_stake <= MaxStakes, "E29");
        owner = msg.sender;
        validator = _validator;
        admin = _manager;
        commissionRate = _rate;
        selfStake = _stake;
        totalStake = _stake;
        totalUnWithdrawn = _stake;
        acceptDelegation = _acceptDlg;
        state = _state;
    }

    function manager() external view override returns (address) {
        return admin;
    }

    // @notice The founder locking rule is handled by Staking contract, not in here.
    // @return an operation enum about the ranking
    function addStake(uint256 _amount) external override onlyOwner onlyCanDoStaking returns (RankingOp) {
        // total stakes hit max limit
        require(totalStake + _amount <= MaxStakes, "E29");

        // update stakes and innerDebt
        selfDebt += _amount * accRewardsPerStake;
        selfStake += _amount;
        return addTotalStake(_amount, admin);
    }

    function subStake(
        uint256 _amount,
        bool _isUnbound
    ) external override onlyOwner onlyCanDoStaking returns (RankingOp) {
        // Break minSelfStakes limit, try exitStaking
        require(selfStake >= _amount + MinSelfStakes, "E31");

        //
        selfSettledRewards += _amount * accRewardsPerStake;
        selfStake -= _amount;
        RankingOp op = subTotalStake(_amount, admin);

        if (_isUnbound) {
            // pending unbound stake, use `validator` as the stakeOwner, because the manager can be changed.
            addUnboundRecord(validator, _amount);
        } else {
            // for reStaking, the token is no longer belong to the validator, so we need to subtract it from the totalUnWithdrawn.
            totalUnWithdrawn -= _amount;
        }
        return op;
    }

    function exitStaking() external override onlyOwner returns (RankingOp, uint256) {
        // already on the exit state
        require(state != State.Exit, "E32");
        State oldSt = state;
        state = State.Exit;
        exitLockEnd = block.timestamp + UnboundLockPeriod;

        RankingOp op = RankingOp.Noop;
        if (oldSt == State.Ready) {
            op = RankingOp.Remove;
        }
        // subtract the selfStake from totalStake, settle rewards, and add unbound record.
        selfSettledRewards += selfStake * accRewardsPerStake;
        totalStake -= selfStake;
        addUnboundRecord(validator, selfStake);
        uint deltaStake = selfStake;
        selfStake = 0;

        emit StateChanged(validator, admin, oldSt, State.Exit);
        return (op, deltaStake);
    }

    function receiveFee() external payable override onlyOwner {
        if (msg.value > 0) {
            // take commission and update rewards record
            uint rewards = msg.value * COEFFICIENT;
            if (totalStake == 0) {
                // for genesis validator, if currently there's no stake, all rewards are belong to validator itself.
                selfSettledRewards += rewards;
            } else {
                uint c = (rewards * commissionRate) / 100;
                uint newRewards = rewards - c;
                // update accRewardsPerStake
                uint rps = newRewards / totalStake;
                accRewardsPerStake += rps;
                currCommission += rewards - (rps * totalStake);
            }
        }
    }

    function validatorClaimAny(address payable _recipient) external override onlyOwner returns (uint256) {
        // staking rewards
        uint stakingRewards = accRewardsPerStake * selfStake + selfSettledRewards - selfDebt;
        // reset something
        selfDebt = accRewardsPerStake * selfStake;
        selfSettledRewards = 0;

        // rewards = stakingRewards + commission + feeRewards
        uint rewards = stakingRewards + currCommission;
        currCommission = 0;
        uint actualRewards = rewards / COEFFICIENT;
        if (actualRewards > 0) {
            sendValue(_recipient, actualRewards);
            emit RewardsWithdrawn(validator, _recipient, actualRewards);
        }

        // calculates withdraw-able stakes
        uint unboundAmount = processClaimableUnbound(validator);
        totalUnWithdrawn -= unboundAmount;
        return unboundAmount;
    }

    function addDelegation(
        uint256 _amount,
        address _delegator
    ) external override onlyOwner onlyCanDoStaking returns (RankingOp) {
        // validator do not accept delegation
        require(acceptDelegation, "E33");
        require(totalStake + _amount <= MaxStakes, "E29");
        // if the delegator is new, add it to the array
        if (delegators[_delegator].exists == false) {
            delegators[_delegator].exists = true;
            allDelegatorAddrs.push(_delegator);
        }
        // first handle punishment
        handleDelegatorPunishment(_delegator);

        Delegation storage dlg = delegators[_delegator];
        // update stakes and debt
        dlg.debt += _amount * accRewardsPerStake;
        dlg.stake += _amount;
        return addTotalStake(_amount, _delegator);
    }

    function subDelegation(
        uint256 _amount,
        address _delegator,
        bool _isUnbound
    ) external override onlyOwner onlyCanDoStaking returns (RankingOp) {
        handleDelegatorPunishment(_delegator);
        return innerSubDelegation(_amount, _delegator, _isUnbound);
    }

    function exitDelegation(address _delegator) external override onlyOwner onlyCanDoStaking returns (RankingOp, uint) {
        Delegation memory dlg = delegators[_delegator];
        // no delegation
        require(dlg.stake > 0, "E34");

        handleDelegatorPunishment(_delegator);

        uint oldStake = dlg.stake;
        RankingOp op = innerSubDelegation(oldStake, _delegator, true);
        return (op, oldStake);
    }

    function innerSubDelegation(uint256 _amount, address _delegator, bool _isUnbound) private returns (RankingOp) {
        Delegation storage dlg = delegators[_delegator];
        // no enough stake to subtract
        require(dlg.stake >= _amount, "E24");

        //
        dlg.settled += _amount * accRewardsPerStake;
        dlg.stake -= _amount;

        if (_isUnbound) {
            addUnboundRecord(_delegator, _amount);
        } else {
            // for reStaking, the token is no longer belong to the validator, so we need to subtract it from the totalUnWithdrawn.
            totalUnWithdrawn -= _amount;
        }

        RankingOp op = subTotalStake(_amount, _delegator);

        return op;
    }

    function delegatorClaimAny(
        address payable _delegator
    ) external override onlyOwner returns (uint256 _unboundAmount, uint256 _forceUnbound) {
        handleDelegatorPunishment(_delegator);

        Delegation storage dlg = delegators[_delegator];

        // staking rewards
        uint rewards = accRewardsPerStake * dlg.stake + dlg.settled - dlg.debt;
        // reset something
        dlg.debt = accRewardsPerStake * dlg.stake;
        dlg.settled = 0;

        uint actualRewards = rewards / COEFFICIENT;
        if (actualRewards > 0) {
            sendValue(_delegator, actualRewards);
            emit RewardsWithdrawn(validator, _delegator, actualRewards);
        }

        // calculates withdraw-able stakes
        _unboundAmount = processClaimableUnbound(_delegator);

        if (state == State.Exit && exitLockEnd <= block.timestamp) {
            _unboundAmount += dlg.stake;
            totalStake -= dlg.stake;
            _forceUnbound = dlg.stake;
            dlg.stake = 0;
            // notice: must clear debt
            dlg.debt = 0;
        }
        totalUnWithdrawn -= _unboundAmount;
        return (_unboundAmount, _forceUnbound);
    }

    function handleDelegatorPunishment(address _delegator) private {
        uint amount = calcDelegatorPunishment(_delegator);
        // update punishFree
        Delegation storage dlg = delegators[_delegator];
        dlg.punishFree = accPunishFactor;
        if (amount > 0) {
            // first try slashing from staking, and then from pendingUnbound.
            if (dlg.stake >= amount) {
                dlg.stake -= amount;
            } else {
                uint restAmount = amount - dlg.stake;
                dlg.stake = 0;
                slashFromUnbound(_delegator, restAmount);
            }
        }
    }

    function calcDelegatorPunishment(address _delegator) private view returns (uint) {
        if (accPunishFactor == 0) {
            return 0;
        }
        Delegation memory dlg = delegators[_delegator];
        if (accPunishFactor == dlg.punishFree) {
            return 0;
        }
        // execute punishment
        uint deltaFactor = accPunishFactor - dlg.punishFree;
        uint amount = 0;
        uint pendingAmount = unboundRecords[_delegator].pendingAmount;
        if (dlg.stake > 0 || pendingAmount > 0) {
            // total stake
            uint totalDelegation = dlg.stake + pendingAmount;
            // A rare case: the validator was punished multiple times,
            // but during this period the delegator did not perform any operations,
            // and then the deltaFactor exceeded the PunishBase.
            if (deltaFactor >= PunishBase) {
                amount = totalDelegation;
            } else {
                amount = (totalDelegation * deltaFactor) / PunishBase;
            }
        }
        return amount;
    }

    function canDoStaking() private view returns (bool) {
        return
            state == State.Idle ||
            state == State.Ready ||
            (state == State.Jail && (block.number - punishBlk) > JailPeriod);
    }

    // @dev add a new unbound record for user
    function addUnboundRecord(address _owner, uint _amount) private {
        UnboundRecord storage rec = unboundRecords[_owner];
        rec.pending[rec.count] = PendingUnbound(_amount, block.timestamp + UnboundLockPeriod);
        rec.count++;
        rec.pendingAmount += _amount;
    }

    function processClaimableUnbound(address _owner) private returns (uint) {
        uint amount = 0;
        UnboundRecord storage rec = unboundRecords[_owner];
        // startIdx == count will indicates that there's no unbound records.
        if (rec.startIdx < rec.count) {
            for (uint i = rec.startIdx; i < rec.count; i++) {
                PendingUnbound memory r = rec.pending[i];
                if (r.lockEnd <= block.timestamp) {
                    amount += r.amount;
                    // clear the released record
                    delete rec.pending[i];
                    rec.startIdx++;
                } else {
                    // pending unbound are ascending ordered by lockEnd, so if one record is not releasable, the later ones will certainly not releasable.
                    break;
                }
            }
            if (rec.startIdx == rec.count) {
                // all cleaned
                delete unboundRecords[_owner];
            } else {
                if (amount > 0) {
                    rec.pendingAmount -= amount;
                }
            }
        }
        return amount;
    }

    function slashFromUnbound(address _owner, uint _amount) private {
        uint restAmount = _amount;
        UnboundRecord storage rec = unboundRecords[_owner];
        // require there's enough pendingAmount
        require(rec.pendingAmount >= _amount, "E30");
        for (uint i = rec.startIdx; i < rec.count; i++) {
            PendingUnbound storage r = rec.pending[i];
            if (r.amount >= restAmount) {
                r.amount -= restAmount;
                restAmount = 0;
                if (r.amount == 0) {
                    r.lockEnd = 0;
                    rec.startIdx++;
                }
                break;
            } else {
                restAmount -= r.amount;
                delete rec.pending[i];
                rec.startIdx++;
            }
        }
        //
        if (rec.startIdx == rec.count) {
            // all cleaned
            delete unboundRecords[_owner];
        } else {
            rec.pendingAmount -= _amount;
        }
    }

    function addTotalStake(uint _amount, address _changer) private returns (RankingOp) {
        totalStake += _amount;
        totalUnWithdrawn += _amount;

        // 1. Idle => Idle, Noop
        RankingOp op = RankingOp.Noop;
        // 2. Idle => Ready, or Jail => Ready, or Ready => Ready, Up
        if (totalStake >= ThresholdStakes && selfStake >= MinSelfStakes) {
            if (state != State.Ready) {
                emit StateChanged(validator, _changer, state, State.Ready);
                state = State.Ready;
            }
            op = RankingOp.Up;
        } else {
            // 3. Jail => Idle, Noop
            if (state == State.Jail) {
                emit StateChanged(validator, _changer, state, State.Idle);
                state = State.Idle;
            }
        }
        emit StakesChanged(validator, _changer, totalStake);
        return op;
    }

    function subTotalStake(uint _amount, address _changer) private returns (RankingOp) {
        totalStake -= _amount;

        // 1. Idle => Idle, Noop
        RankingOp op = RankingOp.Noop;
        // 2. Ready => Ready, Down; Ready => Idle, Remove;
        if (state == State.Ready) {
            if (totalStake < ThresholdStakes) {
                emit StateChanged(validator, _changer, state, State.Idle);
                state = State.Idle;
                op = RankingOp.Remove;
            } else {
                op = RankingOp.Down;
            }
        }
        // 3. Jail => Idle, Noop; Jail => Ready, Up.
        if (state == State.Jail) {
            // We also need to check whether the selfStake is less than MinSelfStakes or not.
            // It may happen due to stakes slashing.
            if (totalStake < ThresholdStakes || selfStake < MinSelfStakes) {
                emit StateChanged(validator, _changer, state, State.Idle);
                state = State.Idle;
            } else {
                emit StateChanged(validator, _changer, state, State.Ready);
                state = State.Ready;
                op = RankingOp.Up;
            }
        }
        emit StakesChanged(validator, _changer, totalStake);
        return op;
    }

    function punish(uint _factor) external override onlyOwner {
        // punish according to totalUnWithdrawn
        uint slashAmount = (totalUnWithdrawn * _factor) / PunishBase;
        if (totalStake >= slashAmount) {
            totalStake -= slashAmount;
        } else {
            totalStake = 0;
        }
        uint selfUnWithdrawn = selfStake + unboundRecords[validator].pendingAmount;
        uint selfSlashAmount = (selfUnWithdrawn * _factor) / PunishBase;
        if (selfStake >= selfSlashAmount) {
            selfStake -= selfSlashAmount;
        } else {
            uint fromPending = selfSlashAmount - selfStake;
            selfStake = 0;
            slashFromUnbound(validator, fromPending);
        }
        totalUnWithdrawn -= slashAmount;

        accPunishFactor += _factor;

        punishBlk = block.number;
        State oldSt = state;
        state = State.Jail;
        emit StateChanged(validator, block.coinbase, oldSt, state);
    }

    function anyClaimable(address _stakeOwner) external view override onlyOwner returns (uint, uint) {
        if (_stakeOwner == admin) {
            return validatorClaimable(currCommission, accRewardsPerStake);
        } else {
            return delegatorClaimable(accRewardsPerStake, _stakeOwner);
        }
    }

    function validatorClaimable(uint _expectedCommission, uint _expectedAccRPS) private view returns (uint, uint) {
        uint claimableRewards = _expectedAccRPS * selfStake + selfSettledRewards - selfDebt;
        claimableRewards = claimableRewards + _expectedCommission;
        // actual value
        claimableRewards /= COEFFICIENT;
        // calculates claimable stakes
        uint claimableUnbound = getClaimableUnbound(validator);

        return (claimableUnbound, claimableRewards);
    }

    function delegatorClaimable(uint _expectedAccRPS, address _stakeOwner) private view returns (uint, uint) {
        Delegation memory dlg = delegators[_stakeOwner];

        // handle punishment
        uint slashAmount = calcDelegatorPunishment(_stakeOwner);
        uint slashAmountFromPending = 0;
        if (slashAmount > 0) {
            // first try slashing from staking, and then from pendingUnbound.
            if (dlg.stake >= slashAmount) {
                dlg.stake -= slashAmount;
            } else {
                slashAmountFromPending = slashAmount - dlg.stake;
                dlg.stake = 0;
            }
        }
        // staking rewards
        uint claimableRewards = _expectedAccRPS * dlg.stake + dlg.settled - dlg.debt;
        // actual value
        claimableRewards /= COEFFICIENT;

        // calculates withdraw-able stakes
        uint claimableUnbound = getClaimableUnbound(_stakeOwner);
        if (slashAmountFromPending > 0) {
            if (slashAmountFromPending > claimableUnbound) {
                claimableUnbound = 0;
            } else {
                claimableUnbound -= slashAmountFromPending;
            }
        }

        if (state == State.Exit && exitLockEnd <= block.timestamp) {
            claimableUnbound += dlg.stake;
        }

        return (claimableUnbound, claimableRewards);
    }

    function getClaimableUnbound(address _owner) private view returns (uint) {
        uint amount = 0;
        UnboundRecord storage rec = unboundRecords[_owner];
        // startIdx == count will indicates that there's no unbound records.
        if (rec.startIdx < rec.count) {
            for (uint i = rec.startIdx; i < rec.count; i++) {
                PendingUnbound memory r = rec.pending[i];
                if (r.lockEnd <= block.timestamp) {
                    amount += r.amount;
                } else {
                    // pending unbound are ascending ordered by lockEnd, so if one record is not releasable, the later ones will certainly not releasable.
                    break;
                }
            }
        }
        return amount;
    }

    function getPendingUnboundRecord(address _owner, uint _index) public view returns (uint _amount, uint _lockEnd) {
        PendingUnbound memory r = unboundRecords[_owner].pending[_index];
        return (r.amount, r.lockEnd);
    }

    function getAllDelegatorsLength() public view returns (uint) {
        return allDelegatorAddrs.length;
    }

    // #if !Mainnet
    function getSelfDebt() public view returns (uint256) {
        return selfDebt;
    }

    function getSelfSettledRewards() public view returns (uint256) {
        return selfSettledRewards;
    }

    function setState(State s) external onlyOwner {
        state = s;
    }

    function testCalcDelegatorPunishment(address _delegator) public view returns (uint) {
        return calcDelegatorPunishment(_delegator);
    }

    // You need to query before them「validatorClaimAny delegatorClaimAny」,
    // otherwise the data will be cleared by the processclaimableunbound executed in the middle
    function testGetClaimableUnbound(address _owner) public view returns (uint) {
        return getClaimableUnbound(_owner);
    }

    function testSlashFromUnbound(address _owner, uint _amount) public {
        slashFromUnbound(_owner, _amount);
    }
    // #endif
}
