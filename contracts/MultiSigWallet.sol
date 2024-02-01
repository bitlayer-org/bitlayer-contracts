// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract MultiSigWallet {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    struct Tx {
        address to;
        uint256 value;
        bytes   data;
        bytes32 salt;
    }

    event TxStarted(bytes32 txHash);
    event TxSigned(bytes32 txHash, address signer);
    event TxExecuted(bytes32 txHash, bool status, bytes returnData);
    event ThresholdChanged(uint256 oldThreshold, uint256 newThreshold);
    event SignerAdded(address[] signers);
    event SignerRemoved(address[] signers);
    event DepositReceive(address indexed sender, uint256 amount);

    modifier onlySelf() {
        require(msg.sender == address(this), "only self");
        _;
    }

    modifier onlySigner() {
        require(signers.contains(msg.sender), "only signer");
        _;
    }
    // tx hash => Tx
    mapping(bytes32 => Tx)   public txs;
    mapping(bytes32 => bool) public txFinished;
    // tx hash => signer array
    mapping(bytes32 => EnumerableSet.AddressSet) txSigners;
    EnumerableSet.AddressSet                     signers;
    EnumerableSet.Bytes32Set                     pendingTx;
    uint256 public                               threshold;

    constructor(address[] memory _signers, uint256 _threshold) {
        uint totalSigners = _signers.length;
        require(totalSigners >= _threshold, "not enough signers");

        for (uint i = 0; i < totalSigners; ++i) {
            signers.add(_signers[i]);
        }

        threshold = _threshold;
    }

    receive() external payable {
        emit DepositReceive(msg.sender, msg.value);
    }

    // to start a tx
    function startTx(Tx memory tX) external onlySigner {
        require(tX.to != address(0), "invalid to address");

        bytes32 txHash = getTxHash(tX);
        require(txs[txHash].to == address(0), "tx exist");

        txs[txHash] = tX;
        // if tx is started by a signer, so it means the starter sign it?
        txSigners[txHash].add(msg.sender);
        // list it to pending status for query
        pendingTx.add(txHash);

        emit TxStarted(txHash);
    }

    function signTx(bytes32 txHash) external onlySigner {
        require(!txSigners[txHash].contains(msg.sender), "already signed");
        require(txs[txHash].to != address(0), "tx not exist");
        require(!txFinished[txHash], "tx finished");

        txSigners[txHash].add(msg.sender);

        emit TxSigned(txHash, msg.sender);
    }

    function execute(
        bytes32 txHash
    )
        external
    {
        require(getTxSignedCount(txHash) >= threshold, "not enough signed");
        require(!txFinished[txHash], "tx finished");
        txFinished[txHash] = true;
        pendingTx.remove(txHash);

        bool success;
        bytes memory returnData;
        Tx memory tX = txs[txHash];
        if (tX.value > 0) {
            (success, returnData) = payable(tX.to).call{value: tX.value}(tX.data);
        } else {
            (success, returnData) = tX.to.call(tX.data);
        }
        // no matter the tX executed successed or failed, mark it as finished
        // require(success, string(returnData));

        emit TxExecuted(txHash, success, returnData);
    }

    function addSigner(
        address[] memory accounts
    )
        external
        onlySelf
    {
        uint count = accounts.length;
        for (uint i = 0; i < count; ++i) {
            signers.add(accounts[i]);
        }
        emit SignerAdded(accounts);
    }

    function removeSigner(
        address[] memory accounts
    )
        external
        onlySelf
    {
        uint count = accounts.length;
        require(signers.length() - count >= threshold, "remove too many signers");
        for (uint i = 0; i < count; ++i) {
            signers.remove(accounts[i]);
        }
        emit SignerRemoved(accounts);
    }

    function changeThreshold(
        uint256 newThreshold
    )
        external
        onlySelf
    {
        require(newThreshold <= signers.length(), "invalid threshold");
        uint256 oldThreshold = threshold;
        threshold = newThreshold;

        emit ThresholdChanged(oldThreshold, newThreshold);
    }

    function getTxHash(Tx memory tX) public view returns(bytes32) {
        return keccak256(abi.encode(tX.to, tX.value, keccak256(tX.data), tX.salt, block.chainid, address(this)));
    }

    function getTxSignedCount(bytes32 txHash) public view returns(uint256) {
        return txSigners[txHash].length();
    }

    function getPendingTx() public view returns(bytes32[] memory) {
        return pendingTx.values();
    }
    // to get the signer list who signed txHash
    function getTxSigners(bytes32 txHash) public view returns(address[] memory) {
        return txSigners[txHash].values();
    }
    // to get total signers of system
    function getSigners() public view returns(address[] memory) {
        return signers.values();
    }
}
