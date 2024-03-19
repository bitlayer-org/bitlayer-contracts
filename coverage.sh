#!/bin/bash -

set -o nounset # Treat unset variables as an error

# uncomment only-test
# change Staking to converage 
sed -i'.bak' '5d' contracts/builtin/Staking.sol 
sed -i'.bak1'  '/require(block.number == 0/d' contracts/builtin/Staking.sol 
sed -i'.bak2' 's/onlyEngine/\/\/onlyEngine/g' contracts/builtin/Staking.sol 

# change Validator to converage 
sed -i'.bak' '5d' contracts/builtin/Validator.sol 
# delete mock files
mv contracts/builtin/mock/MockList.sol contracts/builtin/mock/MockList.sol.bak
mv contracts/builtin/mock/MockValidator.sol  contracts/builtin/mock/MockValidator.sol.bak

npx hardhat coverage

mv contracts/builtin/mock/MockList.sol.bak contracts/builtin/mock/MockList.sol
mv contracts/builtin/mock/MockValidator.sol.bak  contracts/builtin/mock/MockValidator.sol
mv contracts/builtin/Staking.sol.bak contracts/builtin/Staking.sol 
rm contracts/builtin/Staking.sol.bak1
rm contracts/builtin/Staking.sol.bak2
mv contracts/builtin/Validator.sol.bak contracts/builtin/Validator.sol 