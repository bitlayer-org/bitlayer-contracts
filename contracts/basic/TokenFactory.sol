// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CustomERC20 is ERC20 {

    address public factory;
    uint8 private _decimals;

    modifier onlyFactory() {
        require(msg.sender == factory, "only factory");
        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        uint8         decimal,
        address       _factory
    ) ERC20(name, symbol) {
        _decimals = decimal;
        factory = _factory;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint amount) external onlyFactory {
        _mint(to, amount);
    }
}

contract TokenFactory is AccessControl {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    bytes32 constant public OwnerRole = keccak256("bitlayer.factory.owner");
    bytes32 constant public AdminRole = keccak256("bitlayer.factory.admin");

    error TokenAlreadyDeployed(string symbol, address account);

    event TokenDeployed(string symbol, address account);
    event TokenMinted(string symbol, address to, uint256 amount);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    mapping(bytes32 => address) public deployedTokens;
    EnumerableSet.Bytes32Set           totalDeployed;

    constructor(address owner, address[] memory admins) {
        for (uint i = 0; i < admins.length; ++i) {
            _grantRole(AdminRole, admins[i]);
        }
        _grantRole(OwnerRole, owner);
        _setRoleAdmin(AdminRole, OwnerRole);
    }

    function transferOwnership(
        address newOwner
    )
        external
        onlyRole(OwnerRole)
    {
        require(newOwner != msg.sender, "can not transfer to self");

        _grantRole(OwnerRole, newOwner);
        _revokeRole(OwnerRole, msg.sender);

        emit OwnershipTransferred(msg.sender, newOwner);
    }

    function createErc20Token(
        string memory name,
        string memory symbol,
        uint8 decimal
    )
        external
        onlyRole(AdminRole)
    {
        bytes32 salt = keccak256(abi.encodePacked(symbol));
        require(deployedTokens[salt] == address(0), "symbol deployed already");

        address account = address(new CustomERC20{salt: salt}(name, symbol, decimal, address(this)));

        deployedTokens[salt] = account;
        totalDeployed.add(salt);

        emit TokenDeployed(symbol, account);
    }

    function mintTo(
        string memory symbol,
        address       to,
        uint256       amount
    )
        external
        onlyRole(AdminRole)
    {
        bytes32 salt = keccak256(abi.encodePacked(symbol));
        require(deployedTokens[salt] != address(0), "token not deployed");

        CustomERC20(deployedTokens[salt]).mint(to, amount);

        emit TokenMinted(symbol, to, amount);
    }

    function getTokenAddress(
        string memory name,
        string memory symbol,
        uint8 decimal
    )
        external
        view
        returns(address)
    {
        bytes32 salt = keccak256(abi.encodePacked(symbol));
        bytes memory args = abi.encode(name, symbol, decimal, address(this));
        bytes32 codeHash = keccak256(abi.encodePacked(type(CustomERC20).creationCode, args));

        return Create2.computeAddress(salt, codeHash);
    }

    function getTotalDeployed() external view returns(uint256) {
        return totalDeployed.length();
    }

    function getTokenSalt(string memory symbol) external pure returns(bytes32) {
        return keccak256(abi.encodePacked(symbol));
    }

    struct TokenInfo {
        string  symbol;
        address account;
    }
    function getDeployedTokens(uint256 offset, uint256 limit) external view returns(TokenInfo[] memory) {
        uint256 len = totalDeployed.length();
        uint256 start;
        uint256 end;
        if (offset >= len) { start = 0; end = 0; }
        else if (offset + limit >= len) {
            start = offset;
            end = len;
        } else {
            start = offset;
            end = offset + limit;
        }

        TokenInfo[] memory tokens = new TokenInfo[](end - start);
        for (uint256 i = start; i < end; ++i) {
            address addr = deployedTokens[totalDeployed.at(i)];

            tokens[i] = TokenInfo({
                symbol: CustomERC20(addr).symbol(),
                account: addr
            });
        }

        return tokens;
    }
}