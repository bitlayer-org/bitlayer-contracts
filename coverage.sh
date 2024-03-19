#!/bin/bash -

set -o nounset # Treat unset variables as an error

rm -rf cache
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
# delete the solpp plugin fo hardhat.config.ts
sed -i '.bak' '3d' hardhat.config.ts
# adapt test scripts
sed -i '.bak' 's/cache\/solpp-generated-contracts\/builtin\/Validator.sol://g' test/staking-exit-and-claim.js

sed -i '.bak' 's/cache\/solpp-generated-contracts\/builtin\/Validator.sol://g' test/staking.js

sed -i '.bak' 's/cache\/solpp-generated-contracts\/builtin\/Validator.sol://g' test/validator.js

npx hardhat coverage

mv contracts/builtin/mock/MockList.sol.bak contracts/builtin/mock/MockList.sol
mv contracts/builtin/mock/MockValidator.sol.bak  contracts/builtin/mock/MockValidator.sol
mv contracts/builtin/Staking.sol.bak contracts/builtin/Staking.sol 
rm contracts/builtin/Staking.sol.bak1
rm contracts/builtin/Staking.sol.bak2
mv contracts/builtin/Validator.sol.bak contracts/builtin/Validator.sol 
mv hardhat.config.ts.bak hardhat.config.ts
mv test/staking-exit-and-claim.js.bak test/staking-exit-and-claim.js
mv test/staking.js.bak test/staking.js
mv test/validator.js.bak test/validator.js 

rm -rf coverage
rm -rf artifacts
rm -rf cache