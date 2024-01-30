// SPDX-License-Identifier: GPL-3.0

import "./interfaces/IERC20.sol";

pragma solidity ^0.8.0;


contract StandardToken is IERC20 {

    function transfer(address _to, uint256 _value) public override returns (bool ) {
        if (balances[msg.sender] >= _value && _value > 0) {
            balances[msg.sender] -= _value;
            balances[_to] += _value;
            emit Transfer(msg.sender, _to, _value);
            return true;
        } else { return false; }
    }

    function transferFrom(address _from, address _to, uint256 _value) public override returns (bool ) {
        if (balances[_from] >= _value && allowed[_from][msg.sender] >= _value && _value > 0) {
            balances[_to] += _value;
            balances[_from] -= _value;
            allowed[_from][msg.sender] -= _value;
            emit Transfer(_from, _to, _value);
            return true;
        } else { return false; }
    }

    function balanceOf(address _owner) public override  view returns (uint256 ) {
        return balances[_owner];
    }

    function approve(address _spender, uint256 _value) public override returns (bool ) {
        allowed[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    function allowance(address _owner, address _spender) public override view returns (uint256 a ) {
      return allowed[_owner][_spender];
    }

    mapping (address => uint256) balances;
    mapping (address => mapping (address => uint256)) allowed;
    uint256 public totalSupply;
}


contract BRC is StandardToken {

    string public constant name = "BRC Token";                             
    string public constant symbol = "BRC"; 
    uint8 public constant decimals = 18; 
    constructor (
        address[] memory accounts,
        uint256[] memory amounts
    ) public {
        totalSupply = 1000000000 ether;
        uint256 tokenAmount;
        require(accounts.length == amounts.length,"Length Not Match");
        for(uint256 i = 0 ; i < accounts.length; i++){
            tokenAmount += amounts[i];
            require(tokenAmount <= totalSupply, "TotalSupply OverFlow");
            balances[accounts[i]] = amounts[i];
        }
        require(totalSupply == tokenAmount, "TotalSupply is not Distributed");
    }    
}