# revert error code in contracts


| Code |  Message  |
| :----: | :---------- |
| E01 | only owner |
| E02 | only admin |
| E03 | only pending admin |
| E04 | Address: insufficient balance |
| E05 | Address: unable to send value, recipient may have reverted |
| E06 | Already operated |
| E07 | Validator already exists |
| E08 | Validator not exists |
| E09 | invalid address |
| E10 | zero epoch |
| E13 | only on genesis |
| E14 | invalid stake |
| E16 | already permission-less |
| E17 | only block epoch |
| E18 | empty validators set |
| E20 | need minimal self stakes on permission-less stage |
| E21 | admin only on permission stage |
| E23 | the input _amount should not be zero |
| E24 | no enough stake to subtract/unbind |
| E25 | staking amount must >= 1 StakeUnit |
| E26 | staking amount must be an integer multiples of ether |
| E27 | A valid commission rate must in the range [ 0 , 100 ] |
| E28 | can't do staking at current state |
| E29 | total stakes will break max limit |
| E30 | slash amount from pending is not correct |
| E31 | Break minSelfStakes limit, try exitStaking |
| E32 | already on the exit state |
| E33 | validator do not accept delegation |
| E34 | no delegation |
| E35 | For validator, the staking rewards greater then zero, but the totalStake is zero, it should be a bug |
| E40 | Engine only |
| E41 | already initialized |
| E42 | not initialized |
| E43 | not enough allowance |
| E44 | not enough balance |
